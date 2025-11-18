/**
 * Portfolio Analysis Page
 * Provides detailed analytics on portfolio performance, allocation, and trends
 */
'use client';

import React from 'react';
import { TrendingUp, TrendingDown, Award, AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useGetPortfolioStatsQuery } from '@/lib/api/portfolioApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';

const formatPercentage = (value: number): string => {
  const formatted = Math.abs(value).toFixed(2);
  return value >= 0 ? `+${formatted}%` : `-${formatted}%`;
};

export default function PortfolioAnalysisPage() {
  const tAnalysis = useTranslations('portfolio.analysis');
  const tOverview = useTranslations('portfolio.overview');

  const { data: stats, isLoading, error } = useGetPortfolioStatsQuery();

  // Loading state
  if (isLoading) {
    return <LoadingCards count={4} />;
  }

  // Error state
  if (error) {
    return <ApiErrorState error={error} />;
  }

  // Empty state
  if (!stats || stats.total_assets === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title={tAnalysis('noData')}
        description={tAnalysis('noData')}
      />
    );
  }

  // Calculate totals for asset allocation
  const assetTypeEntries = Object.entries(stats.by_asset_type)
    .sort(([, valueA], [, valueB]) => Number(valueB) - Number(valueA));

  const isPositiveReturn = stats.total_return >= 0;
  const winnersPercentage = stats.total_assets > 0
    ? ((stats.winners / stats.total_assets) * 100).toFixed(1)
    : '0.0';
  const losersPercentage = stats.total_assets > 0
    ? ((stats.losers / stats.total_assets) * 100).toFixed(1)
    : '0.0';

  // Color palette for asset types
  const assetTypeColors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-purple-500',
    'bg-orange-500',
    'bg-pink-500',
    'bg-teal-500',
    'bg-indigo-500',
    'bg-amber-500',
  ];

  return (
    <div className="space-y-6">
      {/* Performance Overview Card */}
      <Card className={`${isPositiveReturn ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            {isPositiveReturn ? (
              <TrendingUp className="h-5 w-5 text-green-600" />
            ) : (
              <TrendingDown className="h-5 w-5 text-red-600" />
            )}
            {tAnalysis('performanceOverview')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">{tAnalysis('totalReturn')}</p>
                <p className={`text-4xl font-bold ${isPositiveReturn ? 'text-green-600' : 'text-red-600'}`}>
                  <CurrencyDisplay
                    amount={stats.total_return}
                    currency={stats.currency}
                    showSymbol={true}
                    showCode={false}
                  />
                </p>
              </div>
              <div className="text-right">
                <Badge
                  variant={isPositiveReturn ? 'default' : 'destructive'}
                  className="text-lg px-3 py-1"
                >
                  {formatPercentage(stats.total_return_percentage)}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2 border-t">
              <div>
                <p className="text-sm text-muted-foreground mb-1">{tAnalysis('totalInvested')}</p>
                <p className="text-xl font-semibold">
                  <CurrencyDisplay
                    amount={stats.total_invested}
                    currency={stats.currency}
                    showSymbol={true}
                    showCode={false}
                  />
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">{tAnalysis('currentValue')}</p>
                <p className="text-xl font-semibold">
                  <CurrencyDisplay
                    amount={stats.current_value}
                    currency={stats.currency}
                    showSymbol={true}
                    showCode={false}
                  />
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Best/Worst Performers Grid */}
      {(stats.best_performer || stats.worst_performer) && (
        <div className="grid gap-4 md:grid-cols-2">
          {stats.best_performer && (
            <Card className="border-green-200 bg-green-50/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Award className="h-4 w-4 text-green-600" />
                  {tAnalysis('bestPerformer')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-lg">{stats.best_performer.asset_name}</p>
                    {stats.best_performer.symbol && (
                      <p className="text-sm text-muted-foreground font-mono">
                        {stats.best_performer.symbol}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-green-600" />
                      <p className="text-2xl font-bold text-green-600">
                        {formatPercentage(stats.best_performer.return_percentage)}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {stats.worst_performer && (
            <Card className="border-red-200 bg-red-50/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  {tAnalysis('worstPerformer')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-lg">{stats.worst_performer.asset_name}</p>
                    {stats.worst_performer.symbol && (
                      <p className="text-sm text-muted-foreground font-mono">
                        {stats.worst_performer.symbol}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2">
                      <TrendingDown className="h-5 w-5 text-red-600" />
                      <p className="text-2xl font-bold text-red-600">
                        {formatPercentage(stats.worst_performer.return_percentage)}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Winners vs Losers Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-green-200 bg-green-50/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              {tAnalysis('profitableAssets')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <p className="text-5xl font-bold text-green-600">{stats.winners}</p>
                <Badge variant="outline" className="text-green-600 border-green-300">
                  {winnersPercentage}%
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {stats.winners} {tAnalysis('assetsShowingPositiveReturns')}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600" />
              {tAnalysis('losingAssets')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <p className="text-5xl font-bold text-red-600">{stats.losers}</p>
                <Badge variant="outline" className="text-red-600 border-red-300">
                  {losersPercentage}%
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {stats.losers} {tAnalysis('assetsShowingNegativeReturns')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Asset Allocation by Type */}
      {assetTypeEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{tAnalysis('assetAllocationByType')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {assetTypeEntries.map(([type, value], index) => {
                const numValue = Number(value);
                const percentage = stats.current_value > 0
                  ? ((numValue / stats.current_value) * 100).toFixed(1)
                  : '0.0';
                const colorClass = assetTypeColors[index % assetTypeColors.length];

                return (
                  <div key={type} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${colorClass}`} />
                        <span className="font-medium capitalize">{type || tAnalysis('unknown')}</span>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">
                            <CurrencyDisplay
                              amount={numValue}
                              currency={stats.currency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </span>
                          <Badge variant="secondary" className="min-w-[60px] justify-center">
                            {percentage}%
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                      <div
                        className={`h-full ${colorClass} transition-all duration-300`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary */}
            <div className="mt-6 pt-4 border-t">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{tAnalysis('totalPortfolioValue')}</span>
                <span className="font-bold text-lg">
                  <CurrencyDisplay
                    amount={stats.current_value}
                    currency={stats.currency}
                    showSymbol={true}
                    showCode={false}
                  />
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
