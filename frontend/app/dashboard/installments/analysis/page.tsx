/**
 * Installments Analysis Page
 * Provides detailed analytics on installment payments and debt
 */
'use client';

import React from 'react';
import { CreditCard, DollarSign, CalendarDays, TrendingUp, Percent, Calendar } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useGetInstallmentStatsQuery } from '@/lib/api/installmentsApi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { MonthFilter } from '@/components/ui/month-filter';

export default function InstallmentsAnalysisPage() {
  // Translation hooks
  const tAnalysis = useTranslations('installments.analysis');
  const tCommon = useTranslations('common');

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

  const { data: stats, isLoading, error } = useGetInstallmentStatsQuery(statsParams);

  // Loading state
  if (isLoading) {
    return <LoadingCards count={4} />;
  }

  // Error state
  if (error) {
    return <ApiErrorState error={error} />;
  }

  // Sort by category (highest first) - only if we have stats
  const installmentsByCategory = stats ? Object.entries(stats.by_category || {})
    .sort(([, a], [, b]) => b - a) : [];

  // Sort by frequency (highest first) - only if we have stats
  const installmentsByFrequency = stats ? Object.entries(stats.by_frequency || {})
    .sort(([, a], [, b]) => b - a) : [];

  // Calculate progress percentage
  const progressPercentage = stats && stats.total_debt > 0
    ? (stats.total_paid / stats.total_debt) * 100
    : 0;

  const remainingDebt = stats ? stats.total_debt - stats.total_paid : 0;

  // Check for empty state
  const isEmpty = !stats || stats.total_installments === 0;

  return (
    <div className="space-y-6">
      {/* Month Filter */}
      <div className="flex justify-end">
        <MonthFilter
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
          label={tCommon('common.filterByMonth')}
          clearLabel={tCommon('common.clear')}
        />
      </div>

      {/* Empty state */}
      {isEmpty && (
        <EmptyState
          icon={CreditCard}
          title={tAnalysis('noData')}
          description={tAnalysis('noDataDescription')}
        />
      )}

      {!isEmpty && (
        <>
          {/* Installments Overview - Top Cards */}
          <div className="grid gap-4 md:grid-cols-2">
        {/* Total Installments */}
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-blue-600" />
              {tAnalysis('totalInstallments')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-5xl font-bold text-blue-600">{stats.total_installments}</p>
              <p className="text-sm text-muted-foreground">
                {tAnalysis('installmentPlansInAccount')}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Active Installments */}
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              {tAnalysis('activeInstallments')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-baseline gap-3">
                <p className="text-5xl font-bold text-green-600">{stats.active_installments}</p>
                <Badge variant="outline" className="text-green-600 border-green-300">
                  {stats.total_installments > 0
                    ? ((stats.active_installments / stats.total_installments) * 100).toFixed(0)
                    : 0}%
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {tAnalysis('currentlyActivePlans')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Debt Overview */}
      <Card className="border-purple-200 bg-purple-50/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            {tAnalysis('totalDebtOverview')}
          </CardTitle>
          <CardDescription>
            {tAnalysis('totalDebtDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-baseline gap-3">
              <p className="text-4xl font-bold text-purple-600">
                <CurrencyDisplay
                  amount={stats.total_debt}
                  currency={stats.currency}
                  showSymbol={true}
                  showCode={false}
                />
              </p>
              <Badge variant={progressPercentage >= 50 ? 'default' : 'secondary'}>
                {progressPercentage.toFixed(1)}% {tAnalysis('paid')}
              </Badge>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{tAnalysis('paid')}</span>
                <span className="text-muted-foreground">
                  <CurrencyDisplay
                    amount={stats.total_paid}
                    currency={stats.currency}
                    showSymbol={true}
                    showCode={true}
                  />
                </span>
              </div>
              <div className="relative h-4 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 transition-all duration-300"
                  style={{ width: `${Math.min(progressPercentage, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{tAnalysis('remaining')}</span>
                <span className="text-muted-foreground">
                  <CurrencyDisplay
                    amount={remainingDebt}
                    currency={stats.currency}
                    showSymbol={true}
                    showCode={true}
                  />
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Information */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Monthly Payment */}
        <Card className="border-indigo-200 bg-indigo-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-indigo-600" />
              {tAnalysis('monthlyPayment')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-4xl font-bold text-indigo-600">
                <CurrencyDisplay
                  amount={stats.monthly_payment}
                  currency={stats.currency}
                  showSymbol={true}
                  showCode={false}
                />
              </p>
              <p className="text-sm text-muted-foreground">
                {tAnalysis('totalMonthlyPayments')}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Average Interest Rate */}
        {stats.average_interest_rate !== undefined && stats.average_interest_rate > 0 && (
          <Card className="border-orange-200 bg-orange-50/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Percent className="h-4 w-4 text-orange-600" />
                {tAnalysis('averageInterestRate')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-4xl font-bold text-orange-600">
                  {stats.average_interest_rate.toFixed(2)}%
                </p>
                <p className="text-sm text-muted-foreground">
                  {tAnalysis('acrossAllActive')}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Debt Free Date */}
        {stats.debt_free_date && (
          <Card className="border-green-200 bg-green-50/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4 text-green-600" />
                {tAnalysis('projectedDebtFreeDate')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-2xl font-bold text-green-600">
                  {new Date(stats.debt_free_date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
                <p className="text-sm text-muted-foreground">
                  {tAnalysis('expectedCompletion')}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Installments by Category */}
      {installmentsByCategory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{tAnalysis('debtByCategory')}</CardTitle>
            <CardDescription>
              {tAnalysis('debtByCategoryDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {installmentsByCategory.map(([category, amount]) => {
                const percentage = stats.total_debt > 0
                  ? (amount / stats.total_debt) * 100
                  : 0;

                return (
                  <div key={category} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
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

      {/* Installments by Frequency */}
      {installmentsByFrequency.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{tAnalysis('installmentsByFrequency')}</CardTitle>
            <CardDescription>
              {tAnalysis('installmentsByFrequencyDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {installmentsByFrequency.map(([frequency, count]) => {
                const percentage = stats.total_installments > 0
                  ? (count / stats.total_installments) * 100
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
                          {count} {count === 1 ? tAnalysis('installment') : tAnalysis('installments')}
                        </span>
                        <Badge variant="secondary">{percentage.toFixed(1)}%</Badge>
                      </div>
                    </div>
                    <div className="relative h-3 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 transition-all duration-300"
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
        </>
      )}
    </div>
  );
}
