/**
 * Component to gate features based on tier
 */
'use client';

import React from 'react';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { Lock } from 'lucide-react';

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

interface FeatureGateProps {
  feature: FeatureKey;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  showUpgrade?: boolean;
}

export function FeatureGate({
  feature,
  children,
  fallback,
  showUpgrade = true,
}: FeatureGateProps) {
  const { hasAccess, requiredTier } = useFeatureAccess(feature);

  if (hasAccess) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  if (showUpgrade) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center border border-dashed rounded-lg bg-muted/50">
        <Lock className="w-12 h-12 mb-4 text-muted-foreground" />
        <h3 className="mb-2 text-lg font-semibold">Premium Feature</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          This feature requires{' '}
          <span className="font-medium capitalize">{requiredTier}</span> tier or
          higher
        </p>
        <button className="px-4 py-2 text-sm font-medium text-white transition-colors bg-blue-600 rounded-md hover:bg-blue-700">
          Upgrade Now
        </button>
      </div>
    );
  }

  return null;
}
