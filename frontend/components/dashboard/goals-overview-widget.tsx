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
      <Card className="p-4 md:p-6">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
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
    <Card className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <h3 className="text-base md:text-lg font-semibold">{t('title')}</h3>
        </div>
        <Link href="/dashboard/goals">
          <Button variant="ghost" size="sm" className="text-xs md:text-sm">
            {tCommon('viewAll')}
          </Button>
        </Link>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-3 gap-2 md:gap-4 mb-4 md:mb-6">
        {/* Total Goals */}
        <div className="bg-muted/50 rounded-lg p-2 md:p-3">
          <p className="text-xs text-muted-foreground mb-1">{t('stats.totalGoals')}</p>
          <p className="text-lg md:text-2xl font-bold">{stats.total_goals}</p>
          <div className="flex gap-1 mt-1">
            <Badge variant="outline" className="text-xs px-1">
              {stats.active_goals} {t('stats.active')}
            </Badge>
          </div>
        </div>

        {/* Total Saved */}
        <div className="bg-muted/50 rounded-lg p-2 md:p-3">
          <p className="text-xs text-muted-foreground mb-1">{t('stats.totalSaved')}</p>
          <p className="text-lg md:text-2xl font-bold">{formatCurrency(stats.total_saved)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t('stats.avgProgress', { percent: averageProgress.toFixed(0) })}
          </p>
        </div>

        {/* Remaining */}
        <div className="bg-muted/50 rounded-lg p-2 md:p-3">
          <p className="text-xs text-muted-foreground mb-1">{t('stats.remaining')}</p>
          <p className="text-lg md:text-2xl font-bold">{formatCurrency(stats.total_remaining)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t('stats.of')} {formatCurrency(stats.total_target_amount)}
          </p>
        </div>
      </div>

      {/* Overall Progress */}
      <div className="mb-4 md:mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">{t('overallProgress')}</span>
          <span className="text-sm font-semibold">{savingsRate.toFixed(1)}%</span>
        </div>
        <Progress value={savingsRate} className="h-2" />
      </div>

      {/* Individual Goals Progress */}
      {goalsData?.items && goalsData.items.length > 0 && (
        <div className="space-y-3 mb-4 md:mb-6">
          {goalsData.items
            .slice(0, 3)
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
                <div key={goal.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Trophy className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="text-sm font-medium truncate">{goal.name}</span>
                      {goal.category && (
                        <Badge variant="outline" className="text-xs">
                          {goal.category}
                        </Badge>
                      )}
                    </div>
                    <span className="text-sm font-semibold ml-2">
                      {formatCurrency(currentAmount)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress value={Math.min(progress, 100)} className="h-1.5 flex-1" />
                    <span className="text-xs text-muted-foreground w-12 text-right">
                      {progress.toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('remainingOf', {
                      remaining: formatCurrency(targetAmount - currentAmount),
                      total: formatCurrency(targetAmount)
                    })}
                  </p>
                </div>
              );
            })}
        </div>
      )}

      {/* Goal Status Summary */}
      {(stats.goals_on_track > 0 || stats.goals_behind > 0) && (
        <div className="flex gap-2 mb-4 md:mb-6">
          {stats.goals_on_track > 0 && (
            <div className="flex items-center gap-2 text-xs md:text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              <span>{t('status.onTrack', { count: stats.goals_on_track })}</span>
            </div>
          )}
          {stats.goals_behind > 0 && (
            <div className="flex items-center gap-2 text-xs md:text-sm text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-4 w-4" />
              <span>{t('status.behind', { count: stats.goals_behind })}</span>
            </div>
          )}
        </div>
      )}

      {/* Top Categories */}
      {topCategories.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">{t('topCategories')}</h4>
          {topCategories.map((category) => {
            const categoryTarget = category.total_target;
            const categorySaved = category.total_saved;
            const categoryProgress = categoryTarget > 0 ? (categorySaved / categoryTarget) * 100 : 0;
            const categoryRemaining = categoryTarget - categorySaved;

            return (
              <div key={category.category} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <TrendingUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm font-medium truncate">{category.category}</span>
                    <Badge variant="secondary" className="text-xs">
                      {category.count}
                    </Badge>
                  </div>
                  <span className="text-sm font-semibold ml-2">
                    {formatCurrency(categorySaved)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Progress value={categoryProgress} className="h-1.5 flex-1" />
                  <span className="text-xs text-muted-foreground w-12 text-right">
                    {categoryProgress.toFixed(0)}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('remainingOf', {
                    remaining: formatCurrency(categoryRemaining),
                    total: formatCurrency(categoryTarget)
                  })}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {stats.total_goals === 0 && (
        <div className="text-center py-8">
          <Target className="h-12 w-12 mx-auto text-muted-foreground mb-3 opacity-50" />
          <p className="text-sm text-muted-foreground mb-3">{t('emptyState.title')}</p>
          <Link href="/dashboard/goals">
            <Button size="sm">{t('emptyState.button')}</Button>
          </Link>
        </div>
      )}

      {/* Alerts for behind goals */}
      {stats.goals_behind > 0 && stats.total_goals > 0 && (
        <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs md:text-sm font-medium text-amber-900 dark:text-amber-100">
                {t('status.behindAlert', {
                  count: stats.goals_behind,
                  goalText: stats.goals_behind === 1 ? t('status.goal') : t('status.goals')
                })}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                {t('status.reviewGoals')}
              </p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
