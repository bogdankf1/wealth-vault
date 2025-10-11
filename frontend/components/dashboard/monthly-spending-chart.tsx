/**
 * Monthly Spending Chart Widget
 * Shows monthly spending patterns with bar chart
 */
'use client';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip as ChartTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import { BarChart3, TrendingUp, TrendingDown, Info } from 'lucide-react';

interface MonthlySpendingData {
  month: string;
  amount: number;
  average?: number;
}

interface TooltipPayload {
  value: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

interface MonthlySpendingChartProps {
  data: MonthlySpendingData[];
  isLoading?: boolean;
  showAverage?: boolean;
}

export function MonthlySpendingChart({
  data,
  isLoading = false,
  showAverage = true,
}: MonthlySpendingChartProps) {
  if (isLoading) {
    return (
      <Card className="p-6">
        <Skeleton className="h-[400px] w-full" />
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center justify-center h-[400px] text-gray-500">
          <BarChart3 className="h-12 w-12 mb-4 opacity-50" />
          <p>No spending data available for the selected period</p>
        </div>
      </Card>
    );
  }

  // Calculate statistics (exclude months with zero spending)
  const nonZeroData = data.filter(item => item.amount > 0);
  const total = data.reduce((sum, item) => sum + item.amount, 0);
  const average = nonZeroData.length > 0 ? total / nonZeroData.length : 0;
  const highest = nonZeroData.length > 0 ? Math.max(...nonZeroData.map(item => item.amount)) : 0;
  const lowest = nonZeroData.length > 0 ? Math.min(...nonZeroData.map(item => item.amount)) : 0;
  const highestMonth = nonZeroData.find(item => item.amount === highest)?.month || '';
  const lowestMonth = nonZeroData.find(item => item.amount === lowest)?.month || '';

  // Add average to each data point
  const dataWithAverage = data.map(item => ({
    ...item,
    average: showAverage ? average : undefined,
  }));

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
      const amount = payload[0].value;
      const difference = amount - average;
      const percentDiff = ((difference / average) * 100);

      return (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
          <p className="font-semibold mb-2">{label}</p>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm">Spending:</span>
              <span className="font-semibold">{formatCurrency(amount)}</span>
            </div>
            {showAverage && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-sm">Average:</span>
                  <span className="font-semibold text-gray-600 dark:text-gray-400">
                    {formatCurrency(average)}
                  </span>
                </div>
                <div className="border-t border-gray-200 dark:border-gray-700 pt-1 mt-1">
                  <div className="flex items-center gap-2">
                    {difference >= 0 ? (
                      <TrendingUp className="h-3 w-3 text-red-600" />
                    ) : (
                      <TrendingDown className="h-3 w-3 text-green-600" />
                    )}
                    <span className={`text-sm font-semibold ${
                      difference >= 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-green-600 dark:text-green-400'
                    }`}>
                      {difference >= 0 ? '+' : ''}{formatCurrency(difference)}
                      {' '}
                      ({percentDiff >= 0 ? '+' : ''}{percentDiff.toFixed(1)}%)
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  // Custom bar color based on amount vs average
  const getBarColor = (amount: number) => {
    if (!showAverage) return '#3b82f6'; // blue
    return amount > average ? '#ef4444' : '#10b981'; // red if above, green if below
  };

  return (
    <TooltipProvider>
      <Card className="p-6">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-semibold">Monthly Spending Patterns</h3>
            <ChartTooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-gray-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">Tracks total monthly spending over time. Shows spending trends and patterns. Includes average spending line for comparison.</p>
              </TooltipContent>
            </ChartTooltip>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Track your spending habits over time
          </p>
        </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-900/10">
          <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">
            Total Spent
          </p>
          <p className="text-lg font-bold text-blue-700 dark:text-blue-300">
            {formatCurrency(total)}
          </p>
        </div>

        <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
          <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-1">
            Average
          </p>
          <p className="text-lg font-bold">
            {formatCurrency(average)}
          </p>
        </div>

        <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-900/10">
          <p className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">
            Highest
          </p>
          <p className="text-lg font-bold text-red-700 dark:text-red-300">
            {formatCurrency(highest)}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
            {highestMonth}
          </p>
        </div>

        <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-900/10">
          <p className="text-xs text-green-600 dark:text-green-400 font-medium mb-1">
            Lowest
          </p>
          <p className="text-lg font-bold text-green-700 dark:text-green-300">
            {formatCurrency(lowest)}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
            {lowestMonth}
          </p>
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={dataWithAverage}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
          <XAxis
            dataKey="month"
            className="text-xs text-gray-600 dark:text-gray-400"
            tick={{ fill: 'currentColor' }}
          />
          <YAxis
            className="text-xs text-gray-600 dark:text-gray-400"
            tick={{ fill: 'currentColor' }}
            tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip content={<CustomTooltip />} />
          {showAverage && (
            <ReferenceLine
              y={average}
              stroke="#6b7280"
              strokeDasharray="3 3"
              label={{
                value: 'Average',
                position: 'right',
                fill: '#6b7280',
                fontSize: 12,
              }}
            />
          )}
          <Bar
            dataKey="amount"
            name="Spending"
            radius={[8, 8, 0, 0]}
            animationDuration={800}
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={getBarColor(entry.amount)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Insights */}
      {showAverage && (
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Spending Insights
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
              <div className="p-2 bg-red-100 dark:bg-red-900/20 rounded-lg">
                <TrendingUp className="h-4 w-4 text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Above Average
                </p>
                <p className="text-sm font-semibold">
                  {data.filter(d => d.amount > average).length} month(s)
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
              <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
                <TrendingDown className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Below Average
                </p>
                <p className="text-sm font-semibold">
                  {data.filter(d => d.amount <= average).length} month(s)
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      </Card>
    </TooltipProvider>
  );
}
