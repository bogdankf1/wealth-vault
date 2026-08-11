import { SetMetadata } from '@nestjs/common';

export const FEATURE_KEY = 'requiredFeature';
export const RequireFeature = (featureKey: string) =>
  SetMetadata(FEATURE_KEY, featureKey);
