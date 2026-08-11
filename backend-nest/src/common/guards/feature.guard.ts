import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { TierFeature } from '../../modules/tiers/entities/tier-feature.entity';
import { User } from '../../modules/users/entities/user.entity';
import { FEATURE_KEY } from '../decorators/require-feature.decorator';
import {
  DetailException,
  TierLimitException,
} from '../exceptions/app.exception';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const featureKey = this.reflector.getAllAndOverride<string | undefined>(
      FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!featureKey) return true;

    // request.user is only absent here if a route conflicts @Public() with @RequireFeature() —
    // global JwtAuthGuard runs first and either populates it or already threw a 401. Treat that
    // as unauthenticated (401), not a crash: see RolesGuard's identical handling for the same
    // decorator-conflict scenario.
    const { user } = context.switchToHttp().getRequest<{ user?: User }>();
    if (!user) throw new DetailException(401, 'Could not validate credentials');
    if (user.isAdmin()) return true;

    // No withDeleted here, so TypeORM auto-filters soft-deleted TierFeature/Feature rows.
    // Deliberate divergence from FastAPI: permissions.py's check_feature_access has no such
    // filter and would still grant access on a soft-deleted grant. Nest is intentionally
    // stricter (denies where FastAPI allows) — do not "fix" this back to match, and expect
    // Task 10's parity script to flag it.
    const tierFeature = user.tierId
      ? await this.dataSource.getRepository(TierFeature).findOne({
          where: {
            tierId: user.tierId,
            enabled: true,
            feature: { key: featureKey },
          },
          relations: { feature: true },
        })
      : null;

    if (!tierFeature) {
      throw new TierLimitException(
        'This feature requires a higher tier subscription',
        user.tier?.name ?? 'none',
        'growth',
      );
    }
    return true;
  }
}
