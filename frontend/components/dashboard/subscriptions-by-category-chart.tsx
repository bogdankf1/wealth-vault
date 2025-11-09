/**
 * Subscriptions by Category Chart Widget
 * Shows subscription breakdown by category using pie/donut chart
 */
'use client';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip as ChartTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  PieLabelRenderProps,
} from 'recharts';
import { PieChartIcon, Info } from 'lucide-react';
import { useGetCurrencyQuery } from '@/lib/api/currenciesApi';
import { getChartColors } from '@/lib/utils/chart-colors';

interface CategoryData {
  category: string;
  amount: number;
  percentage: number;
  [key: string]: string | number; // Index signature for Recharts compatibility
}

interface TooltipPayload {
  payload: CategoryData;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
}

interface SubscriptionsByCategoryChartProps {
  data: CategoryData[];
  isLoading?: boolean;
  chartType?: 'pie' | 'donut';
  currency?: string;
}

// Get theme-aware colors that work in both light and dark modes
const COLORS = getChartColors(12);

export function SubscriptionsByCategoryChart({
  data,
  isLoading = false,
  chartType = 'donut',
  currency = 'USD',
}: SubscriptionsByCategoryChartProps) {
  // Get currency data - must be called before any returns
  const { data: currencyData } = useGetCurrencyQuery(currency);
  const currencySymbol = currencyData?.symbol || '$';

  if (isLoading) {
    return (
      <Card className="p-4 md:p-6">
        <Skeleton className="h-[300px] md:h-[400px] w-full" />
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="p-4 md:p-6">
        <div className="flex flex-col items-center justify-center h-[300px] md:h-[400px] text-gray-500">
          <PieChartIcon className="h-12 w-12 mb-4 opacity-50" />
          <p className="text-sm md:text-base">No subscription data available</p>
        </div>
      </Card>
    );
  }

  // Calculate total
  const total = data.reduce((sum, item) => sum + item.amount, 0);

  // Format currency
  const formatCurrency = (value: number) => {
    const formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
    return `${currencySymbol}${formatted}`;
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
          <p className="font-semibold mb-2">{data.category}</p>
          <div className="space-y-1">
            <p className="text-sm">
              Amount: <span className="font-semibold">{formatCurrency(data.amount)}</span>
            </p>
            <p className="text-sm">
              Percentage: <span className="font-semibold">{data.percentage.toFixed(1)}%</span>
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  // Custom label for pie slices
  const renderCustomLabel = (props: PieLabelRenderProps) => {
    const { cx, cy, midAngle, innerRadius, outerRadius, payload } = props;

    // Type guards
    if (
      typeof cx !== 'number' ||
      typeof cy !== 'number' ||
      typeof midAngle !== 'number' ||
      typeof innerRadius !== 'number' ||
      typeof outerRadius !== 'number' ||
      !payload
    ) {
      return null;
    }

    const percentage = (payload as CategoryData).percentage;

    if (percentage < 5) return null; // Don't show label for small slices

    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="white"
        stroke="black"
        strokeWidth="3"
        paintOrder="stroke"
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        className="text-xs font-semibold"
      >
        {`${percentage.toFixed(0)}%`}
      </text>
    );
  };

  return (
    <TooltipProvider>
      <Card className="p-4 md:p-6">
        <div className="mb-4 md:mb-6">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base md:text-lg font-semibold">Subscriptions by Category</h3>
            <ChartTooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-gray-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">Shows all active subscriptions grouped by category. Amounts are monthly equivalents regardless of billing frequency.</p>
              </TooltipContent>
            </ChartTooltip>
          </div>
          <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400">
            Monthly subscription spending by category
          </p>
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart */}
        <div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomLabel}
                outerRadius={chartType === 'donut' ? 100 : 110}
                innerRadius={chartType === 'donut' ? 60 : 0}
                fill="#8884d8"
                dataKey="amount"
                animationDuration={800}
              >
                {data.map((entry) => (
                  <Cell
                    key={`cell-${entry.category}`}
                    fill={COLORS[data.indexOf(entry) % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          {/* Total in center for donut chart */}
          {chartType === 'donut' && (
            <div className="text-center -mt-48 mb-32 pointer-events-none">
              <p className="text-xs text-gray-600 dark:text-gray-400">Total</p>
              <p className="text-2xl font-bold">{formatCurrency(total)}</p>
            </div>
          )}
        </div>

        {/* Legend and breakdown */}
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {[...data]
            .sort((a, b) => b.amount - a.amount)
            .map((item) => (
              <div
                key={item.category}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: COLORS[data.findIndex(d => d.category === item.category) % COLORS.length],
                    }}
                  />
                  <span className="text-sm font-medium truncate">
                    {item.category}
                  </span>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <p className="text-sm font-semibold">
                    {formatCurrency(item.amount)}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {item.percentage.toFixed(1)}%
                  </p>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Top 3 categories summary */}
      {data.length >= 3 && (
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Top subscription categories
          </p>
          <div className="grid grid-cols-3 gap-4">
            {[...data]
              .sort((a, b) => b.amount - a.amount)
              .slice(0, 3)
              .map((item, index) => (
                <div
                  key={item.category}
                  className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
                >
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{
                        backgroundColor: COLORS[data.findIndex(d => d.category === item.category) % COLORS.length],
                      }}
                    />
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                      #{index + 1}
                    </span>
                  </div>
                  <p className="text-xs font-medium mb-1 truncate">
                    {item.category}
                  </p>
                  <p className="text-sm font-bold">
                    {formatCurrency(item.amount)}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {item.percentage.toFixed(1)}%
                  </p>
                </div>
              ))}
          </div>
        </div>
      )}
      </Card>
    </TooltipProvider>
  );
}
