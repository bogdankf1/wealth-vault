import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { TierFeature } from '../../modules/tiers/entities/tier-feature.entity';
import { User } from '../../modules/users/entities/user.entity';
import { FEATURE_KEY } from '../decorators/require-feature.decorator';
import { TierLimitException } from '../exceptions/app.exception';

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

    const { user } = context.switchToHttp().getRequest<{ user: User }>();
    if (user.isAdmin()) return true;

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
