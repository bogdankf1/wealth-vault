/**
 * Subscriptions Analysis Page
 * Provides detailed analytics on subscription costs and distribution
 */
'use client';

import React from 'react';
import { Repeat, DollarSign, CalendarDays, TrendingUp, Calendar } from 'lucide-react';
import { useGetSubscriptionStatsQuery } from '@/lib/api/subscriptionsApi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { MonthFilter } from '@/components/ui/month-filter';

export default function SubscriptionsAnalysisPage() {
  const [selectedMonth, setSelectedMonth] = React.useState<string | null>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Calculate date range from selectedMonth
  const statsParams = React.useMemo(() => {
    if (!selectedMonth) return undefined;

    const [year, month] = selectedMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    return {
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
    };
  }, [selectedMonth]);

  const { data: stats, isLoading, error } = useGetSubscriptionStatsQuery(statsParams);

  // Loading state
  if (isLoading) {
    return <LoadingCards count={4} />;
  }

  // Error state
  if (error) {
    return <ApiErrorState error={error} />;
  }

  // Sort by category (highest first) - only if we have stats
  const subscriptionsByCategory = stats ? Object.entries(stats.by_category || {})
    .sort(([, a], [, b]) => b - a) : [];

  // Sort by frequency (highest first) - only if we have stats
  const subscriptionsByFrequency = stats ? Object.entries(stats.by_frequency || {})
    .sort(([, a], [, b]) => b - a) : [];

  // Calculate daily cost
  const dailyCost = stats ? stats.monthly_cost / 30 : 0;

  // Check for empty state
  const isEmpty = !stats || stats.total_subscriptions === 0;

  return (
    <div className="space-y-6">
      {/* Month Filter */}
      <div className="flex justify-end">
        <MonthFilter
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
          label="Filter by month:"
        />
      </div>

      {/* Empty state */}
      {isEmpty && (
        <EmptyState
          icon={Repeat}
          title="No subscription data"
          description="Start adding subscriptions to see detailed analysis or select a different month."
        />
      )}

      {!isEmpty && (
        <>
          {/* Subscription Overview - Top Cards */}
          <div className="grid gap-4 md:grid-cols-2">
        {/* Total Subscriptions */}
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Repeat className="h-4 w-4 text-blue-600" />
              Total Subscriptions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-5xl font-bold text-blue-600">{stats.total_subscriptions}</p>
              <p className="text-sm text-muted-foreground">
                Subscriptions in your account
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Active Subscriptions */}
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              Active Subscriptions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-baseline gap-3">
                <p className="text-5xl font-bold text-green-600">{stats.active_subscriptions}</p>
                <Badge variant="outline" className="text-green-600 border-green-300">
                  {stats.total_subscriptions > 0
                    ? ((stats.active_subscriptions / stats.total_subscriptions) * 100).toFixed(0)
                    : 0}%
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Currently active subscriptions
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cost Breakdown */}
      <Card className="border-purple-200 bg-purple-50/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Subscription Costs
          </CardTitle>
          <CardDescription>
            Your recurring subscription expenses breakdown
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-3">
            {/* Daily Cost */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-purple-600" />
                <p className="text-sm font-medium text-muted-foreground">Daily</p>
              </div>
              <p className="text-2xl font-bold text-purple-600">
                <CurrencyDisplay
                  amount={dailyCost}
                  currency={stats.currency}
                  showSymbol={true}
                  showCode={false}
                />
              </p>
            </div>

            {/* Monthly Cost */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-purple-600" />
                <p className="text-sm font-medium text-muted-foreground">Monthly</p>
              </div>
              <p className="text-2xl font-bold text-purple-600">
                <CurrencyDisplay
                  amount={stats.monthly_cost}
                  currency={stats.currency}
                  showSymbol={true}
                  showCode={false}
                />
              </p>
            </div>

            {/* Annual Cost */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-purple-600" />
                <p className="text-sm font-medium text-muted-foreground">Annual</p>
              </div>
              <p className="text-2xl font-bold text-purple-600">
                <CurrencyDisplay
                  amount={stats.total_annual_cost}
                  currency={stats.currency}
                  showSymbol={true}
                  showCode={false}
                />
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cost by Category */}
      {subscriptionsByCategory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Cost by Category</CardTitle>
            <CardDescription>
              Monthly subscription costs across different categories
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {subscriptionsByCategory.map(([category, amount]) => {
                const percentage = stats.monthly_cost > 0
                  ? (amount / stats.monthly_cost) * 100
                  : 0;

                return (
                  <div key={category} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Repeat className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{category}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">
                          <CurrencyDisplay
                            amount={amount}
                            currency={stats.currency}
                            showSymbol={true}
                            showCode={true}
                          />
                          /mo
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

      {/* Subscriptions by Frequency */}
      {subscriptionsByFrequency.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Subscriptions by Frequency</CardTitle>
            <CardDescription>
              Distribution of subscriptions by billing cycle
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {subscriptionsByFrequency.map(([frequency, count]) => {
                const percentage = stats.total_subscriptions > 0
                  ? (count / stats.total_subscriptions) * 100
                  : 0;

                // Format frequency label
                const frequencyLabel = frequency.charAt(0).toUpperCase() + frequency.slice(1);

                return (
                  <div key={frequency} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{frequencyLabel}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">
                          {count} subscription{count !== 1 ? 's' : ''}
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

      {/* Annual Cost Impact */}
      <Card className="border-orange-200 bg-orange-50/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Calendar className="h-5 w-5 text-orange-600" />
            Annual Impact
          </CardTitle>
          <CardDescription>
            Total yearly cost of all active subscriptions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <p className="text-4xl font-bold text-orange-600">
              <CurrencyDisplay
                amount={stats.total_annual_cost}
                currency={stats.currency}
                showSymbol={true}
                showCode={false}
              />
            </p>
            <p className="text-sm text-muted-foreground">
              Your total annual subscription spending
            </p>
          </div>
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );
}
