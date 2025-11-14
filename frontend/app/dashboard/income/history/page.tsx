/**
 * Income History Page
 * Displays income trends over time with charts and tables
 */
'use client';

import React, { useState } from 'react';
import { TrendingUp, Calendar, BarChart3, Grid3x3, Rows3 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useGetIncomeHistoryQuery } from '@/lib/api/incomeApi';
import { CurrencyDisplay } from '@/components/currency';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { INCOME_COLOR } from '@/lib/utils/chart-colors';
import { Button } from '@/components/ui/button';
import { StatsCards, StatCard } from '@/components/ui/stats-cards';
import { useViewPreferences } from '@/lib/hooks/use-view-preferences';
import type { HistoryTimeRange } from '@/types/module-layout';

export default function IncomeHistoryPage() {
  // Default to last 12 months
  const [monthRange, setMonthRange] = useState<HistoryTimeRange>('12');

  // Use stats view preferences
  const { statsViewMode, setStatsViewMode } = useViewPreferences();

  // Calculate date range based on selected range
  const historyParams = React.useMemo(() => {
    if (monthRange === 'all') return undefined;

    const now = new Date();
    // Use UTC dates to avoid timezone issues
    const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999)); // Last day of PREVIOUS month in UTC
    const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - parseInt(monthRange), 1, 0, 0, 0, 0)); // First day of month X months ago in UTC

    return {
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
    };
  }, [monthRange]);

  const {
    data: historyData,
    isLoading,
    error,
    refetch,
  } = useGetIncomeHistoryQuery(historyParams);

  // Format chart data
  const chartData = React.useMemo(() => {
    if (!historyData?.history) return [];

    return historyData.history.map((item) => ({
      month: new Date(item.month + '-01').toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      }),
      total: item.total,
      count: item.count,
      average: historyData.overall_average,
    }));
  }, [historyData]);

  interface TooltipPayload {
    value: number;
    payload: {
      count: number;
      month: string;
      total: number;
      average: number;
    };
  }

  interface CustomTooltipProps {
    active?: boolean;
    payload?: TooltipPayload[];
    label?: string;
  }

  const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border bg-background p-2 shadow-sm">
          <p className="font-semibold">{label}</p>
          <p className="text-sm text-muted-foreground">
            Total: <CurrencyDisplay amount={payload[0].value} currency={historyData?.currency || 'USD'} />
          </p>
          {payload[0].payload.count && (
            <p className="text-xs text-muted-foreground">
              {payload[0].payload.count} source{payload[0].payload.count !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  // Prepare stats cards data
  const statsCards: StatCard[] = historyData
    ? [
        {
          title: 'Total Months',
          value: historyData.total_months,
          description: `${monthRange === 'all' ? 'All time' : `Last ${monthRange} months`}`,
          icon: Calendar,
        },
        {
          title: 'Monthly Average',
          value: <CurrencyDisplay amount={historyData.overall_average} currency={historyData.currency} decimals={0} />,
          description: 'Average income per month',
          icon: TrendingUp,
        },
        {
          title: 'Total Income',
          value: <CurrencyDisplay amount={historyData.history.reduce((sum, item) => sum + Number(item.total), 0)} currency={historyData.currency} decimals={0} />,
          description: 'Total for selected period',
          icon: BarChart3,
        },
      ]
    : [];

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Time Range Filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Show:</span>
        <div className="inline-flex rounded-md border">
          <Button
            variant={monthRange === '3' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setMonthRange('3')}
            className="rounded-r-none"
          >
            Last 3 months
          </Button>
          <Button
            variant={monthRange === '6' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setMonthRange('6')}
            className="rounded-none border-x"
          >
            Last 6 months
          </Button>
          <Button
            variant={monthRange === '12' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setMonthRange('12')}
            className="rounded-none border-x"
          >
            Last 12 months
          </Button>
          <Button
            variant={monthRange === '24' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setMonthRange('24')}
            className="rounded-none border-x"
          >
            Last 24 months
          </Button>
          <Button
            variant={monthRange === 'all' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setMonthRange('all')}
            className="rounded-l-none"
          >
            All time
          </Button>
        </div>
      </div>

      {isLoading ? (
        <LoadingCards count={2} />
      ) : error ? (
        <ApiErrorState error={error} onRetry={refetch} />
      ) : !historyData?.history || historyData.history.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No income history"
          description="Start tracking your income sources to see trends and patterns over time."
        />
      ) : (
        <div className="space-y-6">
          {/* Summary Cards with View Toggle */}
          <div className="space-y-3">
            <div className="flex items-center justify-end">
              <div className="inline-flex items-center gap-1 border rounded-md p-0.5 w-fit" style={{ height: '36px' }}>
                <Button
                  variant={statsViewMode === 'cards' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setStatsViewMode('cards')}
                  className="h-[32px] w-[32px] p-0"
                  title="Cards View"
                >
                  <Grid3x3 className="h-4 w-4" />
                </Button>
                <Button
                  variant={statsViewMode === 'compact' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setStatsViewMode('compact')}
                  className="h-[32px] w-[32px] p-0"
                  title="Compact View"
                >
                  <Rows3 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {statsViewMode === 'cards' ? (
              <StatsCards stats={statsCards} />
            ) : (
              <div className="border rounded-lg overflow-hidden bg-card">
                <div className="divide-y">
                  {statsCards.map((stat, index) => {
                    const Icon = stat.icon;
                    return (
                      <div key={index} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm font-medium truncate">{stat.title}</span>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-lg font-bold">{stat.value}</span>
                          <span className="text-xs text-muted-foreground hidden sm:inline-block w-32 truncate text-right">{stat.description}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Monthly Income Trends
              </CardTitle>
              <CardDescription>
                Total income per month with average reference line
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis
                      dataKey="month"
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="total" fill={INCOME_COLOR} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Monthly Breakdown
              </CardTitle>
              <CardDescription>
                Detailed monthly income totals
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead className="text-right">Total Income</TableHead>
                        <TableHead className="text-right">Number of Sources</TableHead>
                        <TableHead className="text-right">vs. Average</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historyData.history.map((item) => {
                        const monthDate = new Date(item.month + '-01');
                        const monthLabel = monthDate.toLocaleDateString('en-US', {
                          month: 'long',
                          year: 'numeric',
                        });
                        const difference = item.total - historyData.overall_average;
                        const percentDiff = ((difference / historyData.overall_average) * 100).toFixed(1);

                        return (
                          <TableRow key={item.month}>
                            <TableCell className="font-medium">{monthLabel}</TableCell>
                            <TableCell className="text-right font-semibold">
                              <CurrencyDisplay amount={item.total} currency={item.currency} />
                            </TableCell>
                            <TableCell className="text-right">{item.count}</TableCell>
                            <TableCell className="text-right">
                              <span className={difference > 0 ? 'text-green-600' : 'text-red-600'}>
                                {difference > 0 ? '+' : ''}
                                <CurrencyDisplay amount={difference} currency={item.currency} showSymbol={false} />
                                {' '}({percentDiff}%)
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
