import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TierFeature } from '../../tiers/entities/tier-feature.entity';
import { User } from '../../users/entities/user.entity';

export interface UsageCapacity {
  hasCapacity: boolean;
  limit: number | null;
}

/**
 * Port of check_usage_limit (backend/app/core/permissions.py). Admins and tiers with no limit_value
 * are unlimited; a user with no tier, or whose tier does not enable the feature, has capacity 0.
 */
@Injectable()
export class UsageLimitService {
  constructor(
    @InjectRepository(TierFeature)
    private readonly tierFeatures: Repository<TierFeature>,
  ) {}

  async check(
    user: User,
    featureKey: string,
    currentCount: number,
  ): Promise<UsageCapacity> {
    if (user.isAdmin()) return { hasCapacity: true, limit: null };
    if (!user.tierId) return { hasCapacity: false, limit: 0 };

    const tierFeature = await this.tierFeatures.findOne({
      where: {
        tierId: user.tierId,
        enabled: true,
        feature: { key: featureKey },
      },
      relations: { feature: true },
    });
    if (!tierFeature) return { hasCapacity: false, limit: 0 };
    if (tierFeature.limitValue === null)
      return { hasCapacity: true, limit: null };

    return {
      hasCapacity: currentCount < tierFeature.limitValue,
      limit: tierFeature.limitValue,
    };
  }
}
