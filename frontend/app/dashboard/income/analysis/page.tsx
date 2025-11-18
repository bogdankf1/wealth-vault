/**
 * Income Analysis Page
 * Provides detailed analytics on income sources, transactions, and trends
 */
'use client';

import React from 'react';
import { TrendingUp, TrendingDown, DollarSign, CalendarDays, Wallet, Activity } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useGetIncomeStatsQuery } from '@/lib/api/incomeApi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';

const formatPercentage = (value: number): string => {
  const formatted = Math.abs(value).toFixed(1);
  return value >= 0 ? `+${formatted}%` : `-${formatted}%`;
};

export default function IncomeAnalysisPage() {
  const tAnalysis = useTranslations('income.analysis');
  const { data: stats, isLoading, error } = useGetIncomeStatsQuery();

  // Loading state
  if (isLoading) {
    return <LoadingCards count={4} />;
  }

  // Error state
  if (error) {
    return <ApiErrorState error={error} />;
  }

  // Empty state
  if (!stats || stats.total_sources === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title={tAnalysis('noData')}
        description={tAnalysis('noDataDescription')}
      />
    );
  }

  // Calculate month-over-month change
  const hasLastMonthData = stats.transactions_last_month > 0;
  const monthOverMonthChange = hasLastMonthData && stats.transactions_last_month_amount > 0
    ? ((stats.transactions_current_month_amount - stats.transactions_last_month_amount) / stats.transactions_last_month_amount) * 100
    : 0;
  const isPositiveChange = monthOverMonthChange >= 0;

  // Calculate percentages for transaction activity
  const transactionChangeAmount = stats.transactions_current_month_amount - stats.transactions_last_month_amount;
  const transactionChangeCount = stats.transactions_current_month - stats.transactions_last_month;

  return (
    <div className="space-y-6">
      {/* Monthly Income Trend - Top Card */}
      <Card className={`${isPositiveChange ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            {tAnalysis('monthlyIncomeTrend')}
          </CardTitle>
          <CardDescription>
            {tAnalysis('compareCurrentVsLast')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Current Month */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <p className="text-sm font-medium text-muted-foreground">{tAnalysis('currentMonth')}</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-bold">
                    <CurrencyDisplay
                      amount={stats.transactions_current_month_amount}
                      currency={stats.currency}
                      showSymbol={true}
                      showCode={false}
                    />
                  </p>
                  {hasLastMonthData && monthOverMonthChange !== 0 && (
                    <Badge variant={isPositiveChange ? 'default' : 'destructive'} className="text-sm">
                      {formatPercentage(monthOverMonthChange)}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Activity className="h-4 w-4" />
                  <span>{stats.transactions_current_month} {tAnalysis('transactions')}</span>
                  {hasLastMonthData && transactionChangeCount !== 0 && (
                    <span className={`flex items-center gap-1 ${transactionChangeCount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {transactionChangeCount >= 0 ? (
                        <>
                          <TrendingUp className="h-3 w-3" />
                          +{transactionChangeCount}
                        </>
                      ) : (
                        <>
                          <TrendingDown className="h-3 w-3" />
                          {transactionChangeCount}
                        </>
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Last Month */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-gray-400" />
                <p className="text-sm font-medium text-muted-foreground">{tAnalysis('lastMonth')}</p>
              </div>
              <div className="space-y-2">
                <p className="text-3xl font-bold text-muted-foreground">
                  <CurrencyDisplay
                    amount={stats.transactions_last_month_amount}
                    currency={stats.currency}
                    showSymbol={true}
                    showCode={false}
                  />
                </p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Activity className="h-4 w-4" />
                  <span>{stats.transactions_last_month} {tAnalysis('transactions')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Change Indicator */}
          {hasLastMonthData && transactionChangeAmount !== 0 && (
            <div className="mt-4 pt-4 border-t">
              <div className={`flex items-center gap-2 text-sm ${isPositiveChange ? 'text-green-600' : 'text-red-600'}`}>
                {isPositiveChange ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                <span className="font-medium">
                  {isPositiveChange ? tAnalysis('increased') : tAnalysis('decreased')} by{' '}
                  <CurrencyDisplay
                    amount={Math.abs(transactionChangeAmount)}
                    currency={stats.currency}
                    showSymbol={true}
                    showCode={false}
                  />{' '}
                  {tAnalysis('fromLastMonth')}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recurring Income Overview */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Monthly Income */}
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-blue-600" />
              {tAnalysis('expectedMonthlyIncome')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-4xl font-bold text-blue-600">
                <CurrencyDisplay
                  amount={stats.total_monthly_income}
                  currency={stats.currency}
                  showSymbol={true}
                  showCode={false}
                />
              </p>
              <p className="text-sm text-muted-foreground">
                {tAnalysis('fromRecurringSources')}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Annual Income */}
        <Card className="border-purple-200 bg-purple-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-purple-600" />
              {tAnalysis('expectedAnnualIncome')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-4xl font-bold text-purple-600">
                <CurrencyDisplay
                  amount={stats.total_annual_income}
                  currency={stats.currency}
                  showSymbol={true}
                  showCode={false}
                />
              </p>
              <p className="text-sm text-muted-foreground">
                {tAnalysis('projectedForYear')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transaction Activity - Full Width */}
      <Card>
        <CardHeader>
          <CardTitle>{tAnalysis('transactionActivity')}</CardTitle>
          <CardDescription>
            {tAnalysis('transactionActivityDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Total Transactions */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium">{tAnalysis('allTimeTotal')}</span>
                </div>
                <div className="text-right">
                  <div className="flex items-baseline gap-3">
                    <span className="text-2xl font-bold">
                      <CurrencyDisplay
                        amount={stats.total_transactions_amount}
                        currency={stats.currency}
                        showSymbol={true}
                        showCode={false}
                      />
                    </span>
                    <Badge variant="secondary">
                      {stats.total_transactions} {tAnalysis('transactions')}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* Comparison Bars */}
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{tAnalysis('currentMonth')}</span>
                  <span className="text-muted-foreground">
                    <CurrencyDisplay
                      amount={stats.transactions_current_month_amount}
                      currency={stats.currency}
                      showSymbol={true}
                      showCode={true}
                    />
                  </span>
                </div>
                <div className="relative h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{
                      width: `${stats.total_transactions_amount > 0
                        ? Math.min((stats.transactions_current_month_amount / stats.total_transactions_amount) * 100, 100)
                        : 0}%`
                    }}
                  />
                </div>
              </div>

              {hasLastMonthData && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{tAnalysis('lastMonth')}</span>
                    <span className="text-muted-foreground">
                      <CurrencyDisplay
                        amount={stats.transactions_last_month_amount}
                        currency={stats.currency}
                        showSymbol={true}
                        showCode={true}
                      />
                    </span>
                  </div>
                  <div className="relative h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gray-400 transition-all duration-300"
                      style={{
                        width: `${stats.total_transactions_amount > 0
                          ? Math.min((stats.transactions_last_month_amount / stats.total_transactions_amount) * 100, 100)
                          : 0}%`
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Income Sources Summary */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Total Sources */}
        <Card className="border-indigo-200 bg-indigo-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Wallet className="h-4 w-4 text-indigo-600" />
              {tAnalysis('totalIncome')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-baseline gap-3">
                <p className="text-5xl font-bold text-indigo-600">{stats.total_sources}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                {tAnalysis('sourcesConfigured')}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Active Sources */}
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              {tAnalysis('activeIncome')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-baseline gap-3">
                <p className="text-5xl font-bold text-green-600">{stats.active_sources}</p>
                <Badge variant="outline" className="text-green-600 border-green-300">
                  {stats.total_sources > 0
                    ? ((stats.active_sources / stats.total_sources) * 100).toFixed(0)
                    : 0}%
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {tAnalysis('sourcesActive', { count: stats.active_sources, total: stats.total_sources })}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
