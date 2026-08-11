import { SetMetadata } from '@nestjs/common';

export const FEATURE_KEY = 'requiredFeature';
export const RequireFeature = (featureKey: string) =>
  SetMetadata(FEATURE_KEY, featureKey);

/**
 * Cancels a controller-level @RequireFeature for one handler.
 *
 * FastAPI decorates each handler individually, so it can — and does — leave gaps: the batch-delete
 * routes on taxes and debts carry no require_feature while every sibling requires a Wealth-only
 * feature. A class-level gate cannot express that, and `getAllAndOverride` takes the first value
 * that is not undefined, so null at the handler wins and the guard's `if (!featureKey)` lets it
 * through.
 */
export const NoFeatureRequired = () => SetMetadata(FEATURE_KEY, null);
