/**
 * Debts Analysis Page
 * Provides detailed analytics on debts owed to you and collection progress
 */
'use client';

import React from 'react';
import { HandCoins, DollarSign, CheckCircle2, Clock, AlertCircle, TrendingUp } from 'lucide-react';
import { useGetDebtStatsQuery } from '@/lib/api/debtsApi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';

export default function DebtsAnalysisPage() {
  const { data: stats, isLoading, error } = useGetDebtStatsQuery();

  // Loading state
  if (isLoading) {
    return <LoadingCards count={4} />;
  }

  // Error state
  if (error) {
    return <ApiErrorState error={error} />;
  }

  // Empty state
  if (!stats || stats.total_debts === 0) {
    return (
      <EmptyState
        icon={HandCoins}
        title="No debt data"
        description="Start tracking money owed to you to see detailed analysis."
      />
    );
  }

  // Calculate progress percentage
  const progressPercentage = stats.total_amount_owed > 0
    ? (stats.total_amount_paid / stats.total_amount_owed) * 100
    : 0;

  const remainingAmount = stats.total_amount_owed - stats.total_amount_paid;

  return (
    <div className="space-y-6">
      {/* Debts Overview - Top Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Total Debts */}
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <HandCoins className="h-4 w-4 text-blue-600" />
              Total Debts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-5xl font-bold text-blue-600">{stats.total_debts}</p>
              <p className="text-sm text-muted-foreground">
                Debts being tracked
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Active Debts */}
        <Card className="border-orange-200 bg-orange-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-600" />
              Active Debts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-baseline gap-3">
                <p className="text-5xl font-bold text-orange-600">{stats.active_debts}</p>
                <Badge variant="outline" className="text-orange-600 border-orange-300">
                  {stats.total_debts > 0
                    ? ((stats.active_debts / stats.total_debts) * 100).toFixed(0)
                    : 0}%
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Outstanding debts
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Paid Debts */}
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Paid Debts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-baseline gap-3">
                <p className="text-5xl font-bold text-green-600">{stats.paid_debts}</p>
                <Badge variant="outline" className="text-green-600 border-green-300">
                  {stats.total_debts > 0
                    ? ((stats.paid_debts / stats.total_debts) * 100).toFixed(0)
                    : 0}%
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Fully collected debts
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Total Amount Overview */}
      <Card className="border-purple-200 bg-purple-50/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Total Debt Overview
          </CardTitle>
          <CardDescription>
            Total amount owed to you and collection progress
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-baseline gap-3">
              <p className="text-4xl font-bold text-purple-600">
                <CurrencyDisplay
                  amount={stats.total_amount_owed}
                  currency={stats.currency}
                  showSymbol={true}
                  showCode={false}
                />
              </p>
              <Badge variant={progressPercentage >= 50 ? 'default' : 'secondary'}>
                {progressPercentage.toFixed(1)}% collected
              </Badge>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Collected</span>
                <span className="text-muted-foreground">
                  <CurrencyDisplay
                    amount={stats.total_amount_paid}
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
                <span className="font-medium">Outstanding</span>
                <span className="text-muted-foreground">
                  <CurrencyDisplay
                    amount={remainingAmount}
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

      {/* Amount Breakdown */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Total Owed */}
        <Card className="border-indigo-200 bg-indigo-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-indigo-600" />
              Total Amount Owed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-4xl font-bold text-indigo-600">
                <CurrencyDisplay
                  amount={stats.total_amount_owed}
                  currency={stats.currency}
                  showSymbol={true}
                  showCode={false}
                />
              </p>
              <p className="text-sm text-muted-foreground">
                Total amount to be collected
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Total Paid */}
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Total Collected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-4xl font-bold text-green-600">
                <CurrencyDisplay
                  amount={stats.total_amount_paid}
                  currency={stats.currency}
                  showSymbol={true}
                  showCode={false}
                />
              </p>
              <p className="text-sm text-muted-foreground">
                Amount successfully collected
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Overdue Debts Alert */}
      {stats.overdue_debts > 0 && (
        <Card className="border-red-200 bg-red-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              Overdue Debts
            </CardTitle>
            <CardDescription>
              Debts that have passed their due date
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-baseline gap-3">
                <p className="text-4xl font-bold text-red-600">{stats.overdue_debts}</p>
                <Badge variant="destructive">
                  Require attention
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {stats.overdue_debts} debt{stats.overdue_debts !== 1 ? 's' : ''} past due date
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Collection Progress Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Collection Progress</CardTitle>
          <CardDescription>
            Overview of debt collection status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Active Debts Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Active Debts</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">
                    {stats.active_debts} debt{stats.active_debts !== 1 ? 's' : ''}
                  </span>
                  <Badge variant="secondary">
                    {stats.total_debts > 0
                      ? ((stats.active_debts / stats.total_debts) * 100).toFixed(1)
                      : 0}%
                  </Badge>
                </div>
              </div>
              <div className="relative h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 transition-all duration-300"
                  style={{
                    width: `${stats.total_debts > 0
                      ? (stats.active_debts / stats.total_debts) * 100
                      : 0}%`
                  }}
                />
              </div>
            </div>

            {/* Paid Debts Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Paid Debts</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">
                    {stats.paid_debts} debt{stats.paid_debts !== 1 ? 's' : ''}
                  </span>
                  <Badge variant="secondary">
                    {stats.total_debts > 0
                      ? ((stats.paid_debts / stats.total_debts) * 100).toFixed(1)
                      : 0}%
                  </Badge>
                </div>
              </div>
              <div className="relative h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all duration-300"
                  style={{
                    width: `${stats.total_debts > 0
                      ? (stats.paid_debts / stats.total_debts) * 100
                      : 0}%`
                  }}
                />
              </div>
            </div>

            {/* Overdue Debts Bar */}
            {stats.overdue_debts > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Overdue Debts</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">
                      {stats.overdue_debts} debt{stats.overdue_debts !== 1 ? 's' : ''}
                    </span>
                    <Badge variant="destructive">
                      {stats.total_debts > 0
                        ? ((stats.overdue_debts / stats.total_debts) * 100).toFixed(1)
                        : 0}%
                    </Badge>
                  </div>
                </div>
                <div className="relative h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500 transition-all duration-300"
                    style={{
                      width: `${stats.total_debts > 0
                        ? (stats.overdue_debts / stats.total_debts) * 100
                        : 0}%`
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
