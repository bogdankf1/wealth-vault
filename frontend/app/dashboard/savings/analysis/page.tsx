/**
 * Savings Analysis Page
 * Provides detailed analytics on savings accounts and balances
 */
'use client';

import React from 'react';
import { Wallet, TrendingUp, Coins, PiggyBank, DollarSign } from 'lucide-react';
import { useGetSavingsStatsQuery } from '@/lib/api/savingsApi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';

export default function SavingsAnalysisPage() {
  const { data: stats, isLoading, error } = useGetSavingsStatsQuery();

  // Loading state
  if (isLoading) {
    return <LoadingCards count={4} />;
  }

  // Error state
  if (error) {
    return <ApiErrorState error={error} />;
  }

  // Empty state
  if (!stats || stats.total_accounts === 0) {
    return (
      <EmptyState
        icon={PiggyBank}
        title="No savings data"
        description="Start adding savings accounts to see detailed analysis."
      />
    );
  }

  // Sort balance by type (highest first)
  const balanceByType = Object.entries(stats.total_balance_by_type || {})
    .sort(([, a], [, b]) => b - a);

  // Sort balance by currency (highest first)
  const balanceByCurrency = Object.entries(stats.total_balance_by_currency || {})
    .sort(([, a], [, b]) => b - a);

  return (
    <div className="space-y-6">
      {/* Account Summary - Top Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Total Accounts */}
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Wallet className="h-4 w-4 text-blue-600" />
              Total Accounts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-baseline gap-3">
                <p className="text-5xl font-bold text-blue-600">{stats.total_accounts}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Savings accounts in your portfolio
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Active Accounts */}
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              Active Accounts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-baseline gap-3">
                <p className="text-5xl font-bold text-green-600">{stats.active_accounts}</p>
                <Badge variant="outline" className="text-green-600 border-green-300">
                  {stats.total_accounts > 0
                    ? ((stats.active_accounts / stats.total_accounts) * 100).toFixed(0)
                    : 0}%
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {stats.active_accounts} of {stats.total_accounts} accounts actively tracked
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Total Balance Overview */}
      <Card className="border-purple-200 bg-purple-50/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Total Balance
          </CardTitle>
          <CardDescription>
            Combined value of all your savings accounts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <p className="text-4xl font-bold text-purple-600">
              <CurrencyDisplay
                amount={stats.total_balance_usd}
                currency={stats.currency}
                showSymbol={true}
                showCode={false}
              />
            </p>
            <p className="text-sm text-muted-foreground">
              Your total net worth in savings
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Balance by Account Type */}
      {balanceByType.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Balance by Account Type</CardTitle>
            <CardDescription>
              Distribution of your savings across different account types
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {balanceByType.map(([type, amount]) => {
                const percentage = stats.total_balance_usd > 0
                  ? (amount / stats.total_balance_usd) * 100
                  : 0;

                // Format account type label
                const typeLabel = type
                  .split('_')
                  .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                  .join(' ');

                return (
                  <div key={type} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Coins className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{typeLabel}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">
                          <CurrencyDisplay
                            amount={amount}
                            currency={stats.currency}
                            showSymbol={true}
                            showCode={true}
                          />
                        </span>
                        <Badge variant="secondary">{percentage.toFixed(1)}%</Badge>
                      </div>
                    </div>
                    <div className="relative h-3 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all duration-300"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Balance by Currency */}
      {balanceByCurrency.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Balance by Currency</CardTitle>
            <CardDescription>
              Your savings across different currencies
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {balanceByCurrency.map(([currency, amount]) => {
                const percentage = stats.total_balance_usd > 0
                  ? (amount / stats.total_balance_usd) * 100
                  : 0;

                return (
                  <div key={currency} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{currency}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">
                          <CurrencyDisplay
                            amount={amount}
                            currency={currency}
                            showSymbol={true}
                            showCode={true}
                          />
                        </span>
                        <Badge variant="secondary">{percentage.toFixed(1)}%</Badge>
                      </div>
                    </div>
                    <div className="relative h-3 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500 transition-all duration-300"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
