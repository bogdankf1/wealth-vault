/**
 * Expense History Page
 * Displays expense trends over time with charts and tables
 */
'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { TrendingDown, Calendar, BarChart3 } from 'lucide-react';
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
  ReferenceLine,
} from 'recharts';
import { useGetExpenseHistoryQuery } from '@/lib/api/expensesApi';
import { CurrencyDisplay } from '@/components/currency';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { getChartColor } from '@/lib/utils/chart-colors';
import { HistoryTimeRangeFilter } from '@/components/ui/history-time-range-filter';
import type { HistoryTimeRange } from '@/types/module-layout';

export default function ExpenseHistoryPage() {
  const tHistory = useTranslations('expenses.history');

  // Default to last 12 months
  const [monthRange, setMonthRange] = useState<HistoryTimeRange>('12');

  // Calculate date range based on selected range
  const historyParams = React.useMemo(() => {
    if (monthRange === 'all') return undefined;

    const now = new Date();
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999); // Last day of current month
    const startDate = new Date(now.getFullYear(), now.getMonth() - parseInt(monthRange) + 1, 1); // First day of month X months ago

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
  } = useGetExpenseHistoryQuery(historyParams);

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
            {tHistory('totalLabel')} <CurrencyDisplay amount={payload[0].value} currency={historyData?.currency || 'USD'} />
          </p>
          {payload[0].payload.count && (
            <p className="text-xs text-muted-foreground">
              {payload[0].payload.count} {payload[0].payload.count !== 1 ? tHistory('expenses') : tHistory('expense')}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Time Range Filter with Inline Stats */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <HistoryTimeRangeFilter
          value={monthRange}
          onChange={setMonthRange}
          showLabel={tHistory('show')}
          options={[
            { value: '3', label: tHistory('last3Months') },
            { value: '6', label: tHistory('last6Months') },
            { value: '12', label: tHistory('last12Months') },
            { value: '24', label: tHistory('last24Months') },
            { value: 'all', label: tHistory('allTime') },
          ]}
        />

        {/* Inline stats */}
        {historyData && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground flex-shrink-0">
            <span><span className="font-semibold text-foreground">{historyData.total_months}</span> months</span>
            <span>·</span>
            <span><span className="font-semibold text-foreground"><CurrencyDisplay amount={historyData.overall_average} currency={historyData.currency} decimals={0} /></span> avg</span>
            <span>·</span>
            <span><span className="font-semibold text-foreground"><CurrencyDisplay amount={historyData.history.reduce((sum, item) => sum + Number(item.total), 0)} currency={historyData.currency} decimals={0} /></span> total</span>
          </div>
        )}
      </div>

      {isLoading ? (
        <LoadingCards count={2} />
      ) : error ? (
        <ApiErrorState error={error} onRetry={refetch} />
      ) : !historyData?.history || historyData.history.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title={tHistory('noData')}
          description={tHistory('noDataDescription')}
        />
      ) : (
        <div className="space-y-6">
          {/* Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5" />
                {tHistory('monthlyTrends')}
              </CardTitle>
              <CardDescription>
                {tHistory('monthlyTrendsDescription')}
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
                    <ReferenceLine
                      y={historyData.overall_average}
                      stroke="#888"
                      strokeDasharray="3 3"
                    />
                    <Bar dataKey="total" fill={getChartColor(1)} radius={[4, 4, 0, 0]} />
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
                {tHistory('monthlyBreakdown')}
              </CardTitle>
              <CardDescription>
                {tHistory('monthlyBreakdownDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{tHistory('month')}</TableHead>
                        <TableHead className="text-right">{tHistory('totalExpensesColumn')}</TableHead>
                        <TableHead className="text-right">{tHistory('numberOfExpenses')}</TableHead>
                        <TableHead className="text-right">{tHistory('vsAverage')}</TableHead>
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
                              <span className={difference > 0 ? 'text-red-600' : 'text-green-600'}>
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
