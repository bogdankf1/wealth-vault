/**
 * Goals Analysis Page
 * Provides detailed analytics on financial goals and progress
 */
'use client';

import React from 'react';
import { Target, TrendingUp, CheckCircle2, Clock, DollarSign, TrendingDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useGetGoalStatsQuery } from '@/lib/api/goalsApi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';

export default function GoalsAnalysisPage() {
  const tAnalysis = useTranslations('goals.analysis');

  const { data: stats, isLoading, error } = useGetGoalStatsQuery();

  // Loading state
  if (isLoading) {
    return <LoadingCards count={4} />;
  }

  // Error state
  if (error) {
    return <ApiErrorState error={error} />;
  }

  // Empty state
  if (!stats || stats.total_goals === 0) {
    return (
      <EmptyState
        icon={Target}
        title={tAnalysis('title')}
        description={tAnalysis('noData')}
      />
    );
  }

  // Sort goals by category (highest first)
  const goalsByCategory = Object.entries(stats.by_category || {})
    .sort(([, a], [, b]) => b - a);

  // Calculate progress metrics
  const progressPercentage = Number(stats.average_progress) || 0;
  const inProgressGoals = stats.active_goals - stats.completed_goals;

  return (
    <div className="space-y-6">
      {/* Goal Overview - Top Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Total Goals */}
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4 text-blue-600" />
              {tAnalysis('totalGoals')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-5xl font-bold text-blue-600">{stats.total_goals}</p>
              <p className="text-sm text-muted-foreground">
                {tAnalysis('goalsInPortfolio')}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Active Goals */}
        <Card className="border-orange-200 bg-orange-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-600" />
              {tAnalysis('inProgress')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-5xl font-bold text-orange-600">{inProgressGoals}</p>
              <p className="text-sm text-muted-foreground">
                {tAnalysis('goalsBeingPursued')}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Completed Goals */}
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              {tAnalysis('completed')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-baseline gap-3">
                <p className="text-5xl font-bold text-green-600">{stats.completed_goals}</p>
                <Badge variant="outline" className="text-green-600 border-green-300">
                  {stats.total_goals > 0
                    ? ((stats.completed_goals / stats.total_goals) * 100).toFixed(0)
                    : 0}%
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {tAnalysis('goalsSuccessfullyAchieved')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Financial Overview */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Total Target Amount */}
        <Card className="border-purple-200 bg-purple-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-purple-600" />
              {tAnalysis('totalTarget')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-4xl font-bold text-purple-600">
                <CurrencyDisplay
                  amount={stats.total_target_amount}
                  currency={stats.currency}
                  showSymbol={true}
                  showCode={false}
                />
              </p>
              <p className="text-sm text-muted-foreground">
                {tAnalysis('combinedTarget')}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Total Saved */}
        <Card className="border-indigo-200 bg-indigo-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-indigo-600" />
              {tAnalysis('totalSaved')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-4xl font-bold text-indigo-600">
                <CurrencyDisplay
                  amount={stats.total_saved}
                  currency={stats.currency}
                  showSymbol={true}
                  showCode={false}
                />
              </p>
              <p className="text-sm text-muted-foreground">
                {tAnalysis('amountSavedTowards')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress Overview */}
      <Card className={`${progressPercentage >= 50 ? 'border-green-200 bg-green-50/50' : 'border-yellow-200 bg-yellow-50/50'}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Target className="h-5 w-5" />
            {tAnalysis('overallProgress')}
          </CardTitle>
          <CardDescription>
            {tAnalysis('averageCompletionRate')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-baseline gap-3">
              <p className="text-4xl font-bold">
                {progressPercentage.toFixed(1)}%
              </p>
              <Badge variant={progressPercentage >= 50 ? 'default' : 'secondary'}>
                {progressPercentage >= 50 ? tAnalysis('onTrack') : tAnalysis('keepGoing')}
              </Badge>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{tAnalysis('saved')}</span>
                <span className="text-muted-foreground">
                  <CurrencyDisplay
                    amount={stats.total_saved}
                    currency={stats.currency}
                    showSymbol={true}
                    showCode={true}
                  />
                </span>
              </div>
              <div className="relative h-4 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${progressPercentage >= 50 ? 'bg-green-500' : 'bg-yellow-500'}`}
                  style={{ width: `${Math.min(progressPercentage, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{tAnalysis('remaining')}</span>
                <span className="text-muted-foreground">
                  <CurrencyDisplay
                    amount={stats.total_remaining}
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

      {/* Goal Performance Indicators */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* On Track Goals */}
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              {tAnalysis('goalsOnTrack')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-baseline gap-3">
                <p className="text-5xl font-bold text-green-600">{stats.goals_on_track}</p>
                <Badge variant="outline" className="text-green-600 border-green-300">
                  {stats.active_goals > 0
                    ? ((stats.goals_on_track / stats.active_goals) * 100).toFixed(0)
                    : 0}%
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {tAnalysis('goalsProgressingWell')}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Behind Schedule */}
        <Card className="border-red-200 bg-red-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600" />
              {tAnalysis('behindSchedule')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-baseline gap-3">
                <p className="text-5xl font-bold text-red-600">{stats.goals_behind}</p>
                <Badge variant="outline" className="text-red-600 border-red-300">
                  {stats.active_goals > 0
                    ? ((stats.goals_behind / stats.active_goals) * 100).toFixed(0)
                    : 0}%
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {tAnalysis('goalsNeedingAttention')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Goals by Category */}
      {goalsByCategory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{tAnalysis('goalsByCategory')}</CardTitle>
            <CardDescription>
              {tAnalysis('targetAcrossCategories')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {goalsByCategory.map(([category, amount]) => {
                const percentage = stats.total_target_amount > 0
                  ? (amount / stats.total_target_amount) * 100
                  : 0;

                return (
                  <div key={category} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4 text-muted-foreground" />
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
    </div>
  );
}
