'use client';

import React, { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useGetBudgetOverviewQuery } from '@/lib/api/budgetsApi';
import { BudgetProgressChart } from '@/components/budgets/budget-progress-chart';
import { MonthFilter } from '@/components/ui/month-filter';

export default function BudgetsAnalysisPage() {
  // Translation hooks
  const tAnalysis = useTranslations('budgets.analysis');
  const tCommon = useTranslations('common');

  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  // Calculate date range from selectedMonth for overview stats
  const overviewParams = useMemo(() => {
    if (!selectedMonth) return undefined;

    const [year, month] = selectedMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    return {
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
    };
  }, [selectedMonth]);

  const { data: overview, isLoading } = useGetBudgetOverviewQuery(overviewParams);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-end">
          <div className="h-9 w-40 animate-pulse rounded bg-muted" />
        </div>
        <div className="text-center py-8 text-muted-foreground">{tAnalysis('loading')}</div>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="space-y-6">
        <div className="flex justify-end">
          <MonthFilter
            selectedMonth={selectedMonth}
            onMonthChange={setSelectedMonth}
            label={tCommon('common.filterBy')}
            clearLabel={tCommon('common.clear')}
          />
        </div>
        <div className="text-center py-8 text-muted-foreground">
          <p>{tAnalysis('noData')}</p>
        </div>
      </div>
    );
  }

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

      {/* Alerts Section */}
      {overview.alerts.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader>
            <CardTitle className="flex items-center text-amber-600 dark:text-amber-400">
              <AlertCircle className="mr-2 h-5 w-5" />
              {tAnalysis('budgetAlerts')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overview.alerts.map((alert, index) => (
                <div
                  key={index}
                  className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-sm"
                >
                  {alert}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Budget Progress Chart */}
      {overview.by_category.length > 0 && (
        <BudgetProgressChart data={overview.by_category} currency={overview.stats.currency} />
      )}

      {/* Budget by Category */}
      <Card>
        <CardHeader>
          <CardTitle>{tAnalysis('budgetByCategory')}</CardTitle>
          <CardDescription>{tAnalysis('spendingByCategory')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {overview.by_category.map((category) => (
              <div key={category.category} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{category.category}</span>
                    {category.is_overspent && (
                      <span className="text-xs px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400">
                        {tAnalysis('overspent')}
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    <CurrencyDisplay
                      amount={category.spent}
                      currency={overview.stats.currency}
                      showSymbol={false}
                      showCode={false}
                    /> / <CurrencyDisplay
                      amount={category.budgeted}
                      currency={overview.stats.currency}
                      showSymbol={false}
                      showCode={true}
                    />
                  </span>
                </div>
                <div className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      category.is_overspent
                        ? 'bg-red-500'
                        : Number(category.percentage_used) >= 80
                        ? 'bg-amber-500'
                        : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(Number(category.percentage_used), 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {Number(category.percentage_used).toFixed(1)}% {tAnalysis('used')}
                  </span>
                  <span className={Number(category.remaining) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                    {Number(category.remaining) >= 0 ? (
                      <span className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        <CurrencyDisplay
                          amount={category.remaining}
                          currency={overview.stats.currency}
                          showSymbol={false}
                          showCode={false}
                        />
                        <span>{tAnalysis('left')}</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <TrendingDown className="h-3 w-3" />
                        <CurrencyDisplay
                          amount={Math.abs(Number(category.remaining))}
                          currency={overview.stats.currency}
                          showSymbol={false}
                          showCode={false}
                        />
                        <span>{tAnalysis('over')}</span>
                      </span>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
