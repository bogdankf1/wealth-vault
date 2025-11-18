/**
 * Expenses Analysis Page
 * Provides detailed analytics on expense patterns, categories, and frequency breakdown
 */
'use client';

import React from 'react';
import { DollarSign, TrendingDown, Calendar, CalendarDays, Wallet, Activity } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useGetExpenseStatsQuery } from '@/lib/api/expensesApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { MonthFilter } from '@/components/ui/month-filter';

export default function ExpensesAnalysisPage() {
  const t = useTranslations('expenses.analysis');
  const tOverview = useTranslations('expenses.overview');
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

  const { data: stats, isLoading, error } = useGetExpenseStatsQuery(statsParams);

  // Loading state
  if (isLoading) {
    return <LoadingCards count={4} />;
  }

  // Error state
  if (error) {
    return <ApiErrorState error={error} />;
  }

  // Empty state
  if (!stats || stats.total_expenses === 0) {
    return (
      <EmptyState
        icon={TrendingDown}
        title={t('noData')}
        description={t('noDataDescription')}
      />
    );
  }

  // Calculate total from expenses_by_category for percentage calculations
  const categoryEntries = Object.entries(stats.expenses_by_category)
    .sort(([, valueA], [, valueB]) => Number(valueB) - Number(valueA));

  const totalCategoryExpenses = categoryEntries.reduce(
    (sum, [, value]) => sum + Number(value),
    0
  );

  // Color palette for categories (8 colors)
  const categoryColors = [
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
      {/* Month Filter */}
      <div className="flex justify-end">
        <MonthFilter
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
          label={tCommon('common.filterBy')}
          clearLabel={tCommon('common.clear')}
        />
      </div>

      {/* Expense Frequency Breakdown - 4 Column Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Daily Expense */}
        <Card className="border-teal-200 bg-teal-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-teal-600" />
              {t('dailyExpense')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-3xl font-bold text-teal-600">
                <CurrencyDisplay
                  amount={stats.total_daily_expense}
                  currency={stats.currency}
                  showSymbol={true}
                  showCode={false}
                />
              </p>
              <p className="text-sm text-muted-foreground">
                {t('perDay')}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Weekly Expense */}
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-600" />
              {t('weeklyExpense')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-3xl font-bold text-blue-600">
                <CurrencyDisplay
                  amount={stats.total_weekly_expense}
                  currency={stats.currency}
                  showSymbol={true}
                  showCode={false}
                />
              </p>
              <p className="text-sm text-muted-foreground">
                {t('perWeek')}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Expense */}
        <Card className="border-purple-200 bg-purple-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-purple-600" />
              {t('monthlyExpense')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-3xl font-bold text-purple-600">
                <CurrencyDisplay
                  amount={stats.total_monthly_expense}
                  currency={stats.currency}
                  showSymbol={true}
                  showCode={false}
                />
              </p>
              <p className="text-sm text-muted-foreground">
                {t('perMonth')}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Annual Expense */}
        <Card className="border-indigo-200 bg-indigo-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-indigo-600" />
              {t('annualExpense')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-3xl font-bold text-indigo-600">
                <CurrencyDisplay
                  amount={stats.total_annual_expense}
                  currency={stats.currency}
                  showSymbol={true}
                  showCode={false}
                />
              </p>
              <p className="text-sm text-muted-foreground">
                {t('perYear')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Breakdown - Full Width */}
      {categoryEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('categoryBreakdown')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {categoryEntries.map(([category, value], index) => {
                const numValue = Number(value);
                const percentage = totalCategoryExpenses > 0
                  ? ((numValue / totalCategoryExpenses) * 100).toFixed(1)
                  : '0.0';
                const colorClass = categoryColors[index % categoryColors.length];

                return (
                  <div key={category} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${colorClass}`} />
                        <span className="font-medium capitalize">{category || 'Uncategorized'}</span>
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
                <span className="font-medium">{t('totalExpenses')}</span>
                <span className="font-bold text-lg">
                  <CurrencyDisplay
                    amount={totalCategoryExpenses}
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

      {/* Expense Sources Overview - 2 Column Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Total Expenses */}
        <Card className="border-gray-200 bg-gray-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Wallet className="h-4 w-4 text-gray-600" />
              {t('totalExpenses')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-baseline gap-3">
                <p className="text-5xl font-bold text-gray-600">{stats.total_expenses}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('sourcesConfigured')}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Active Expenses */}
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4 text-green-600" />
              {t('activeExpenses')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-baseline gap-3">
                <p className="text-5xl font-bold text-green-600">{stats.active_expenses}</p>
                <Badge variant="outline" className="text-green-600 border-green-300">
                  {stats.total_expenses > 0
                    ? ((stats.active_expenses / stats.total_expenses) * 100).toFixed(0)
                    : 0}%
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('sourcesActive', { count: stats.active_expenses, total: stats.total_expenses })}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
