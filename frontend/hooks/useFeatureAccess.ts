/**
 * Hook to check feature access based on user tier
 */
'use client';

import { useSession } from 'next-auth/react';

type FeatureKey =
  | 'income_tracking'
  | 'expense_tracking'
  | 'ai_categorization'
  | 'bank_statement_upload'
  | 'savings_tracking'
  | 'multi_currency'
  | 'portfolio_tracking'
  | 'realtime_prices'
  | 'financial_goals'
  | 'subscription_tracking'
  | 'installment_tracking';

interface FeatureAccess {
  hasAccess: boolean;
  tier: string;
  requiredTier?: string;
}

// Feature access map based on tier
const FEATURE_TIER_MAP: Record<FeatureKey, string[]> = {
  income_tracking: ['starter', 'growth', 'wealth'],
  expense_tracking: ['starter', 'growth', 'wealth'],
  ai_categorization: ['growth', 'wealth'],
  bank_statement_upload: ['starter', 'growth', 'wealth'],
  savings_tracking: ['starter', 'growth', 'wealth'],
  multi_currency: ['growth', 'wealth'],
  portfolio_tracking: ['growth', 'wealth'],
  realtime_prices: ['wealth'],
  financial_goals: ['growth', 'wealth'],
  subscription_tracking: ['starter', 'growth', 'wealth'],
  installment_tracking: ['starter', 'growth', 'wealth'],
};

const TIER_HIERARCHY = ['starter', 'growth', 'wealth'];

export function useFeatureAccess(featureKey: FeatureKey): FeatureAccess {
  const { data: session } = useSession();
  const userTier = session?.user?.tier || 'starter';

  const allowedTiers = FEATURE_TIER_MAP[featureKey] || [];
  const hasAccess = allowedTiers.includes(userTier);

  // Find minimum required tier
  const requiredTier = allowedTiers.sort(
    (a, b) => TIER_HIERARCHY.indexOf(a) - TIER_HIERARCHY.indexOf(b)
  )[0];

  return {
    hasAccess,
    tier: userTier,
    requiredTier: hasAccess ? undefined : requiredTier,
  };
}

export function useIsAdmin(): boolean {
  const { data: session } = useSession();
  return session?.user?.role === 'ADMIN';
}
