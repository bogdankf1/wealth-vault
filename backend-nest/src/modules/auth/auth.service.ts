import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DetailException } from '../../common/exceptions/app.exception';
import { Tier } from '../tiers/entities/tier.entity';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { GoogleOAuthService } from './google-oauth.service';
import { TokenResponse, toUserResponse } from './mappers/user-response.mapper';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly googleOAuthService: GoogleOAuthService,
    private readonly jwtService: JwtService,
    @InjectRepository(Tier) private readonly tiersRepo: Repository<Tier>,
  ) {}

  async googleLogin(googleToken: string): Promise<TokenResponse> {
    const info = await this.googleOAuthService.verifyIdToken(googleToken);

    let user = await this.usersService.findByGoogleId(info.sub);
    if (!user) {
      const wealthTier = await this.tiersRepo.findOne({
        where: { name: 'wealth' },
      });
      if (!wealthTier) {
        throw new DetailException(
          500,
          'Wealth tier not found. Please run database migrations.',
        );
      }
      // Deviation from FastAPI: trial-subscription creation (TrialService.create_trial_subscription
      // in auth.py's new-user branch) is skipped — billing is deferred to a later phase.
      const created = await this.usersService.createFromGoogle({
        email: info.email,
        name: info.name,
        avatarUrl: info.picture,
        googleId: info.sub,
        tier: wealthTier,
      });
      user = await this.usersService.findByIdWithTier(created.id);
    }

    return this.buildTokenResponse(user!);
  }

  buildTokenResponse(user: User): TokenResponse {
    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      tier: user.tier?.name ?? null,
    });
    return {
      access_token: accessToken,
      token_type: 'bearer',
      user: toUserResponse(user),
    };
  }

  /** Mirrors GET /auth/me/features. */
  async getFeatures(
    userId: string,
  ): Promise<{ features: Record<string, unknown> }> {
    const user = await this.usersService.findByIdWithFeatures(userId);
    if (!user?.tier) return { features: {} };

    const features: Record<string, unknown> = {};
    for (const tf of user.tier.tierFeatures) {
      if (tf.feature && tf.enabled && !tf.deletedAt && !tf.feature.deletedAt) {
        features[tf.feature.key] = {
          enabled: true,
          limit: tf.limitValue,
          name: tf.feature.name,
          module: tf.feature.module,
        };
      }
    }
    return { features };
  }
}
