'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useGetBudgetOverviewQuery } from '@/lib/api/budgetsApi';
import { TrendingUp, TrendingDown, AlertCircle, Info } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { useTranslations } from 'next-intl';

// Helper function to format category from snake_case to Title Case
const formatCategory = (category: string): string => {
  return category
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

export function BudgetOverviewWidget() {
  const t = useTranslations('dashboard.widgets.budgetOverview');
  const tCommon = useTranslations('dashboard.widgets.common');
  const { data: overview, isLoading, error } = useGetBudgetOverviewQuery();

  if (isLoading) {
    return (
      <Card className="p-3 md:p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold">{t('title')}</span>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      </Card>
    );
  }

  if (error || !overview) {
    return (
      <Card className="p-3 md:p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold">{t('title')}</span>
        </div>
        <p className="text-xs text-muted-foreground">{t('error')}</p>
      </Card>
    );
  }

  // If no budgets, show empty state
  if (overview.stats.total_budgets === 0) {
    return (
      <Card className="p-3 md:p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold">{t('title')}</span>
          <Link href="/dashboard/budgets">
            <Button variant="ghost" size="sm" className="text-xs h-7 px-2">
              {tCommon('viewAll')}
            </Button>
          </Link>
        </div>
        <div className="text-center py-4">
          <p className="text-xs text-muted-foreground mb-2">{t('emptyState.title')}</p>
          <Link href="/dashboard/budgets">
            <Button size="sm" className="h-7 text-xs">{t('emptyState.button')}</Button>
          </Link>
        </div>
      </Card>
    );
  }

  const { stats, by_category, alerts } = overview;
  const topCategories = by_category.slice(0, 2);

  return (
    <TooltipProvider>
      <Card className="p-3 md:p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{t('title')}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-gray-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-semibold mb-1">{t('tooltip.heading')}</p>
                <p className="text-sm">{t('tooltip.description')}</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <Link href="/dashboard/budgets">
            <Button variant="ghost" size="sm" className="text-xs h-7 px-2">
              {tCommon('viewAll')}
            </Button>
          </Link>
        </div>

        {/* Overall Stats - Compact */}
        <div className="flex items-center justify-between gap-4 mb-3 text-sm">
          <div>
            <span className="text-muted-foreground">{t('stats.spent')}:</span>
            <span className="font-semibold ml-1">
              <CurrencyDisplay amount={stats.total_spent} currency={stats.currency} showSymbol={true} showCode={false} />
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">{t('stats.remaining')}:</span>
            <span className={`font-semibold ml-1 ${stats.total_remaining < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
              <CurrencyDisplay amount={stats.total_remaining} currency={stats.currency} showSymbol={true} showCode={false} />
            </span>
          </div>
        </div>

        {/* Overall Progress Bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">{t('overallProgress')}</span>
            <span className="text-xs font-medium">{stats.overall_percentage_used.toFixed(0)}%</span>
          </div>
          <div className="relative h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                stats.overall_percentage_used > 100
                  ? 'bg-red-500'
                  : stats.overall_percentage_used >= 80
                  ? 'bg-amber-500'
                  : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(stats.overall_percentage_used, 100)}%` }}
            />
          </div>
        </div>

        {/* Alerts - Compact */}
        {alerts.length > 0 && (
          <div className="flex items-center gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 mb-3">
            <AlertCircle className="h-3 w-3 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <p className="text-xs text-amber-900 dark:text-amber-100 line-clamp-1">{alerts[0]}</p>
          </div>
        )}

        {/* Top Categories - Compact */}
        <div className="space-y-2">
          {topCategories.map((category) => (
            <div key={category.category} className="flex items-center gap-2">
              <span className="text-xs truncate flex-1">{formatCategory(category.category)}</span>
              <div className="relative h-1 w-16 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    category.is_overspent ? 'bg-red-500' : category.percentage_used >= 80 ? 'bg-amber-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(category.percentage_used, 100)}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground w-8 text-right">{category.percentage_used.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </Card>
    </TooltipProvider>
  );
}
