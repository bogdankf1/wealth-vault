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
import { useGetGoalStatsQuery, useListGoalsQuery } from '@/lib/api/goalsApi';
import { useGetCurrencyQuery } from '@/lib/api/currenciesApi';

export function GoalsOverviewWidget() {
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
          <span className="text-sm">Failed to load goal statistics</span>
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

  // Calculate savings rate and parse numeric values
  const totalTarget = parseFloat(stats.total_target_amount);
  const totalSaved = parseFloat(stats.total_saved);
  const averageProgress = parseFloat(stats.average_progress.toString());
  const savingsRate = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;

  return (
    <Card className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <h3 className="text-base md:text-lg font-semibold">Goals Overview</h3>
        </div>
        <Link href="/dashboard/goals">
          <Button variant="ghost" size="sm" className="text-xs md:text-sm">
            View All
          </Button>
        </Link>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-3 gap-2 md:gap-4 mb-4 md:mb-6">
        {/* Total Goals */}
        <div className="bg-muted/50 rounded-lg p-2 md:p-3">
          <p className="text-xs text-muted-foreground mb-1">Total Goals</p>
          <p className="text-lg md:text-2xl font-bold">{stats.total_goals}</p>
          <div className="flex gap-1 mt-1">
            <Badge variant="outline" className="text-xs px-1">
              {stats.active_goals} active
            </Badge>
          </div>
        </div>

        {/* Total Saved */}
        <div className="bg-muted/50 rounded-lg p-2 md:p-3">
          <p className="text-xs text-muted-foreground mb-1">Total Saved</p>
          <p className="text-lg md:text-2xl font-bold">{formatCurrency(stats.total_saved)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {averageProgress.toFixed(0)}% avg
          </p>
        </div>

        {/* Remaining */}
        <div className="bg-muted/50 rounded-lg p-2 md:p-3">
          <p className="text-xs text-muted-foreground mb-1">Remaining</p>
          <p className="text-lg md:text-2xl font-bold">{formatCurrency(stats.total_remaining)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            of {formatCurrency(stats.total_target_amount)}
          </p>
        </div>
      </div>

      {/* Overall Progress */}
      <div className="mb-4 md:mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Overall Progress</span>
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
                    {formatCurrency(targetAmount - currentAmount)} remaining of {formatCurrency(targetAmount)}
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
              <span>{stats.goals_on_track} on track</span>
            </div>
          )}
          {stats.goals_behind > 0 && (
            <div className="flex items-center gap-2 text-xs md:text-sm text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-4 w-4" />
              <span>{stats.goals_behind} behind</span>
            </div>
          )}
        </div>
      )}

      {/* Top Categories */}
      {stats.by_category && stats.by_category.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">Top Categories</h4>
          {stats.by_category.slice(0, 3).map((category) => {
            const categoryTarget = parseFloat(category.total_target);
            const categorySaved = parseFloat(category.total_saved);
            const categoryProgress = categoryTarget > 0 ? (categorySaved / categoryTarget) * 100 : 0;

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
                  {formatCurrency(category.total_remaining)} remaining of {formatCurrency(categoryTarget)}
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
          <p className="text-sm text-muted-foreground mb-3">No goals created yet</p>
          <Link href="/dashboard/goals">
            <Button size="sm">Create Your First Goal</Button>
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
                {stats.goals_behind} {stats.goals_behind === 1 ? 'goal is' : 'goals are'} behind schedule
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                Review your goals and consider adjusting contributions
              </p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
