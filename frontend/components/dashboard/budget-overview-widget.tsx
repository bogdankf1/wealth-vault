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

export function BudgetOverviewWidget() {
  const { data: overview, isLoading, error } = useGetBudgetOverviewQuery();

  if (isLoading) {
    return (
      <Card className="col-span-full lg:col-span-2">
        <CardHeader>
          <CardTitle>Budget Overview</CardTitle>
          <CardDescription>All active budgets (each tracked within its own period)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !overview) {
    return (
      <Card className="col-span-full lg:col-span-2">
        <CardHeader>
          <CardTitle>Budget Overview</CardTitle>
          <CardDescription>All active budgets (each tracked within its own period)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <p>Failed to load budget overview</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // If no budgets, show empty state
  if (overview.stats.total_budgets === 0) {
    return (
      <Card className="col-span-full lg:col-span-2">
        <CardHeader>
          <CardTitle>Budget Overview</CardTitle>
          <CardDescription>All active budgets (each tracked within its own period)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">No budgets set up yet</p>
            <Link href="/dashboard/budgets">
              <Button>Create Your First Budget</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { stats, by_category, alerts } = overview;
  const topCategories = by_category.slice(0, 3);

  return (
    <TooltipProvider>
      <Card className="col-span-full lg:col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>Budget Overview</CardTitle>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-gray-400 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">How it works:</p>
                  <p className="text-sm">Shows all currently active budgets aggregated together.</p>
                  <p className="text-sm mt-2">Each budget tracks expenses within its own time period (monthly, quarterly, or yearly).</p>
                  <p className="text-sm mt-2">• Green: Under 80% of budget used</p>
                  <p className="text-sm">• Amber: 80%+ used but not over</p>
                  <p className="text-sm">• Red: Budget exceeded</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Link href="/dashboard/budgets">
              <Button variant="outline" size="sm">
                View All
              </Button>
            </Link>
          </div>
          <CardDescription>All active budgets (each tracked within its own period)</CardDescription>
        </CardHeader>
      <CardContent className="space-y-4">
        {/* Info Note */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/30">
          <div className="text-xs text-blue-900 dark:text-blue-100">
            Showing {stats.active_budgets} active {stats.active_budgets === 1 ? 'budget' : 'budgets'}. Each budget tracks expenses within its own defined time period.
          </div>
        </div>

        {/* Overall Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Budgeted</p>
            <p className="text-lg font-semibold">
              <CurrencyDisplay
                amount={stats.total_budgeted}
                currency={stats.currency}
                showSymbol={true}
                showCode={false}
              />
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Spent</p>
            <p className="text-lg font-semibold">
              <CurrencyDisplay
                amount={stats.total_spent}
                currency={stats.currency}
                showSymbol={true}
                showCode={false}
              />
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Remaining</p>
            <p className={`text-lg font-semibold ${stats.total_remaining < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
              <CurrencyDisplay
                amount={stats.total_remaining}
                currency={stats.currency}
                showSymbol={true}
                showCode={false}
              />
            </p>
          </div>
        </div>

        {/* Overall Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Overall Progress</span>
            <span className="font-medium">{stats.overall_percentage_used.toFixed(1)}%</span>
          </div>
          <div className="relative h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
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

        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                  Budget Alerts
                </p>
                {alerts.slice(0, 2).map((alert, index) => (
                  <p key={index} className="text-xs text-muted-foreground">
                    {alert}
                  </p>
                ))}
                {alerts.length > 2 && (
                  <Link href="/dashboard/budgets">
                    <p className="text-xs text-amber-600 dark:text-amber-400 hover:underline">
                      +{alerts.length - 2} more alerts
                    </p>
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Top Categories */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Top Categories</p>
          {topCategories.map((category) => (
            <div key={category.category} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{category.category}</span>
                <span className="text-muted-foreground">
                  <CurrencyDisplay
                    amount={category.spent}
                    currency={stats.currency}
                    showSymbol={true}
                    showCode={false}
                  /> / <CurrencyDisplay
                    amount={category.budgeted}
                    currency={stats.currency}
                    showSymbol={true}
                    showCode={false}
                  />
                </span>
              </div>
              <div className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    category.is_overspent
                      ? 'bg-red-500'
                      : category.percentage_used >= 80
                      ? 'bg-amber-500'
                      : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(category.percentage_used, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {category.percentage_used.toFixed(1)}% used
                </span>
                <span className={category.remaining >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                  {category.remaining >= 0 ? (
                    <span className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      <CurrencyDisplay
                        amount={category.remaining}
                        currency={stats.currency}
                        showSymbol={true}
                        showCode={false}
                      />
                      <span>left</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <TrendingDown className="h-3 w-3" />
                      <CurrencyDisplay
                        amount={Math.abs(category.remaining)}
                        currency={stats.currency}
                        showSymbol={true}
                        showCode={false}
                      />
                      <span>over</span>
                    </span>
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
    </TooltipProvider>
  );
}
