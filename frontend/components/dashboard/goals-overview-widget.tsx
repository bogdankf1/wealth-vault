/**
 * Goals Overview Widget
 * Shows a summary of financial goals, progress, and key statistics
 */
'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Target, TrendingUp, AlertCircle, CheckCircle2, Trophy } from 'lucide-react';
import Link from 'next/link';
import { useGetGoalStatsQuery, useListGoalsQuery, type Goal } from '@/lib/api/goalsApi';
import { useGetCurrencyQuery } from '@/lib/api/currenciesApi';
import { useTranslations } from 'next-intl';

// Helper function to format category from snake_case to Title Case
const formatCategory = (category: string): string => {
  return category
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

export function GoalsOverviewWidget() {
  const t = useTranslations('dashboard.widgets.goalsOverview');
  const tCommon = useTranslations('dashboard.widgets.common');
  const { data: stats, isLoading, error } = useGetGoalStatsQuery();
  const { data: goalsData } = useListGoalsQuery({ is_active: true, page_size: 10 });
  const { data: currencyData } = useGetCurrencyQuery(stats?.currency || 'USD');
  const currencySymbol = currencyData?.symbol || '$';

  if (isLoading) {
    return (
      <Card className="p-4 md:p-6">
        <div className="space-y-4">
          <Skeleton className="h-6 w-32" />
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
          <Skeleton className="h-32" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-3 md:p-6">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4 md:h-5 md:w-5" />
          <span className="text-sm">{t('error')}</span>
        </div>
      </Card>
    );
  }

  if (!stats) {
    return null;
  }

  // Format currency
  const formatCurrency = (value: number | string) => {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    const formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(numValue);
    return `${currencySymbol}${formatted}`;
  };

  // Calculate savings rate (ensure numeric values)
  const totalTarget = typeof stats.total_target_amount === 'number' ? stats.total_target_amount : parseFloat(String(stats.total_target_amount));
  const totalSaved = typeof stats.total_saved === 'number' ? stats.total_saved : parseFloat(String(stats.total_saved));
  const averageProgress = typeof stats.average_progress === 'number' ? stats.average_progress : parseFloat(String(stats.average_progress));
  const savingsRate = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;

  // Compute category statistics from goals data
  type CategoryStat = {
    category: string;
    total_target: number;
    total_saved: number;
    count: number;
  };

  const categoryStats = goalsData?.items.reduce<Record<string, CategoryStat>>((acc, goal: Goal) => {
    if (goal.category) {
      if (!acc[goal.category]) {
        acc[goal.category] = {
          category: goal.category,
          total_target: 0,
          total_saved: 0,
          count: 0,
        };
      }
      acc[goal.category].total_target += parseFloat(String(goal.target_amount));
      acc[goal.category].total_saved += parseFloat(String(goal.current_amount));
      acc[goal.category].count += 1;
    }
    return acc;
  }, {});

  // Convert to array and sort by total target (descending)
  const topCategories = categoryStats
    ? Object.values(categoryStats).sort((a: CategoryStat, b: CategoryStat) => b.total_target - a.total_target).slice(0, 3)
    : [];

  return (
    <Card className="p-3 md:p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <h3 className="text-sm md:text-base font-semibold">{t('title')}</h3>
        </div>
        <Link href="/dashboard/goals">
          <Button variant="ghost" size="sm" className="text-xs h-7 px-2">
            {tCommon('viewAll')}
          </Button>
        </Link>
      </div>

      {/* Key Metrics - Compact */}
      <div className="flex items-center justify-between gap-4 mb-3 text-sm">
        <div>
          <span className="text-muted-foreground">{t('stats.totalSaved')}:</span>
          <span className="font-semibold ml-1">{formatCurrency(stats.total_saved)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">{t('stats.remaining')}:</span>
          <span className="font-semibold ml-1">{formatCurrency(stats.total_remaining)}</span>
        </div>
      </div>

      {/* Overall Progress */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">{t('overallProgress')}</span>
          <span className="text-xs font-medium">{savingsRate.toFixed(0)}%</span>
        </div>
        <Progress value={savingsRate} className="h-1.5" />
      </div>

      {/* Individual Goals Progress - Show only 2 */}
      {goalsData?.items && goalsData.items.length > 0 && (
        <div className="space-y-2">
          {goalsData.items
            .slice(0, 2)
            .map((goal) => {
              const targetAmount = typeof goal.target_amount === 'string'
                ? parseFloat(goal.target_amount)
                : goal.target_amount;
              const currentAmount = typeof goal.current_amount === 'string'
                ? parseFloat(goal.current_amount)
                : goal.current_amount;

              const progress = goal.progress_percentage
                ? (typeof goal.progress_percentage === 'string'
                    ? parseFloat(goal.progress_percentage)
                    : goal.progress_percentage)
                : (targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0);

              return (
                <div key={goal.id} className="flex items-center gap-2">
                  <Trophy className="h-3 w-3 text-primary flex-shrink-0" />
                  <span className="text-xs truncate flex-1">{goal.name}</span>
                  <Progress value={Math.min(progress, 100)} className="h-1 w-16" />
                  <span className="text-xs text-muted-foreground w-8 text-right">
                    {progress.toFixed(0)}%
                  </span>
                </div>
              );
            })}
        </div>
      )}

      {/* Empty State */}
      {stats.total_goals === 0 && (
        <div className="text-center py-4">
          <Target className="h-6 w-6 mx-auto text-muted-foreground mb-2 opacity-50" />
          <p className="text-xs text-muted-foreground mb-2">{t('emptyState.title')}</p>
          <Link href="/dashboard/goals">
            <Button size="sm" className="h-7 text-xs">{t('emptyState.button')}</Button>
          </Link>
        </div>
      )}
    </Card>
  );
}
