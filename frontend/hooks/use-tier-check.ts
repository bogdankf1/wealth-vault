/**
 * Hook for checking tier limits and showing upgrade prompts
 */
import { useGetCurrentUserQuery } from '@/lib/api/authApi';

interface TierLimits {
  incomeSources: number;
  expenses: number;
  savingsGoals: number;
  subscriptions: number;
  installments: number;
  portfolioAssets: number;
  budgets: number;
}

const TIER_LIMITS: Record<string, TierLimits> = {
  starter: {
    incomeSources: 5,
    expenses: 10,
    savingsGoals: 3,
    subscriptions: 5,
    installments: 3,
    portfolioAssets: 0,
    budgets: 2,
  },
  growth: {
    incomeSources: 20,
    expenses: 30,
    savingsGoals: 10,
    subscriptions: 20,
    installments: 15,
    portfolioAssets: 50,
    budgets: 10,
  },
  wealth: {
    incomeSources: Infinity,
    expenses: Infinity,
    savingsGoals: Infinity,
    subscriptions: Infinity,
    installments: Infinity,
    portfolioAssets: Infinity,
    budgets: Infinity,
  },
};

export type FeatureType = keyof TierLimits;

interface TierCheckResult {
  canAdd: boolean;
  limit: number;
  currentTier: string;
  requiredTier?: string;
  isLoading: boolean;
}

export function useTierCheck(feature: FeatureType, currentCount: number): TierCheckResult {
  const { data: user, isLoading } = useGetCurrentUserQuery();

  const currentTier = user?.tier?.name || 'starter';
  const limit = TIER_LIMITS[currentTier]?.[feature] ?? 0;
  const canAdd = currentCount < limit;

  // Determine required tier if limit is reached
  let requiredTier: string | undefined;
  if (!canAdd) {
    if (currentTier === 'starter') {
      requiredTier = 'growth';
    } else if (currentTier === 'growth') {
      requiredTier = 'wealth';
    }
  }

  return {
    canAdd,
    limit,
    currentTier,
    requiredTier,
    isLoading,
  };
}

export function getTierLimit(tierName: string, feature: FeatureType): number {
  return TIER_LIMITS[tierName]?.[feature] ?? 0;
}

export function getFeatureDisplayName(feature: FeatureType): string {
  const displayNames: Record<FeatureType, string> = {
    incomeSources: 'Income Sources',
    expenses: 'Expense Categories',
    savingsGoals: 'Savings Goals',
    subscriptions: 'Subscriptions',
    installments: 'Installment Plans',
    portfolioAssets: 'Portfolio Assets',
    budgets: 'Budgets',
  };

  return displayNames[feature];
}

export function hasFeatureAccess(tierName: string, feature: string): boolean {
  // Features available only on certain tiers
  const featureAccess: Record<string, string[]> = {
    'advanced-analytics': ['growth', 'wealth'],
    'ai-insights': ['growth', 'wealth'],
    'portfolio-tracking': ['growth', 'wealth'],
    'priority-support': ['wealth'],
    'advanced-ai': ['wealth'],
  };

  return featureAccess[feature]?.includes(tierName) ?? true;
}
