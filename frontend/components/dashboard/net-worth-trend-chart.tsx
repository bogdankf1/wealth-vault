/**
 * Net Worth Trend Chart Widget
 * Shows net worth progression over time
 */
'use client';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip as ChartTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, TrendingDown, Wallet, Info } from 'lucide-react';
import { useGetCurrencyQuery } from '@/lib/api/currenciesApi';
import { getChartColor, INCOME_COLOR, EXPENSE_COLOR } from '@/lib/utils/chart-colors';

interface NetWorthDataPoint {
  month: string;
  netWorth: number;
  assets: number;
  liabilities: number;
}

interface TooltipPayload {
  value?: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

interface NetWorthTrendChartProps {
  data: NetWorthDataPoint[];
  isLoading?: boolean;
  chartType?: 'line' | 'area';
  currency?: string;
}

export function NetWorthTrendChart({
  data,
  isLoading = false,
  chartType = 'area',
  currency = 'USD',
}: NetWorthTrendChartProps) {
  // Get currency data - must be called before any returns
  const { data: currencyData } = useGetCurrencyQuery(currency);
  const currencySymbol = currencyData?.symbol || '$';

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
          <Wallet className="h-12 w-12 mb-4 opacity-50" />
          <p>No net worth data available for the selected period</p>
        </div>
      </Card>
    );
  }

  // Calculate statistics
  const currentNetWorth = data[data.length - 1].netWorth;
  const startingNetWorth = data[0].netWorth;
  const change = currentNetWorth - startingNetWorth;
  const changePercentage = startingNetWorth !== 0
    ? ((change / Math.abs(startingNetWorth)) * 100)
    : 0;
  const isPositive = change >= 0;

  const highestNetWorth = Math.max(...data.map(d => d.netWorth));

  // Format currency
  const formatCurrency = (value: number) => {
    const formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
    return `${currencySymbol}${formatted}`;
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
          <p className="font-semibold mb-2">{label}</p>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getChartColor(1) }} />
              <span className="text-sm">Net Worth:</span>
              <span className="font-semibold text-blue-600 dark:text-blue-400">
                {formatCurrency(payload[0]?.value || 0)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: INCOME_COLOR }} />
              <span className="text-sm">Assets:</span>
              <span className="font-semibold text-green-600 dark:text-green-400">
                {formatCurrency(payload[1]?.value || 0)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: EXPENSE_COLOR }} />
              <span className="text-sm">Liabilities:</span>
              <span className="font-semibold text-red-600 dark:text-red-400">
                {formatCurrency(payload[2]?.value || 0)}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <TooltipProvider>
      <Card className="p-6">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-semibold">Net Worth Trend</h3>
            <ChartTooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-gray-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">Visualizes net worth changes over time. Net Worth = Assets (portfolio + savings) - Liabilities (debts). Helps track wealth building progress.</p>
              </TooltipContent>
            </ChartTooltip>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Track your wealth growth over time
          </p>
        </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-900/10">
          <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">
            Current Net Worth
          </p>
          <p className="text-lg font-bold text-blue-700 dark:text-blue-300">
            {formatCurrency(currentNetWorth)}
          </p>
        </div>

        <div className={`text-center p-3 rounded-lg ${
          isPositive
            ? 'bg-green-50 dark:bg-green-900/10'
            : 'bg-red-50 dark:bg-red-900/10'
        }`}>
          <div className={`flex items-center justify-center gap-1 mb-1 ${
            isPositive
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'
          }`}>
            {isPositive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            <p className="text-xs font-medium">Period Change</p>
          </div>
          <p className={`text-lg font-bold ${
            isPositive
              ? 'text-green-700 dark:text-green-300'
              : 'text-red-700 dark:text-red-300'
          }`}>
            {isPositive ? '+' : ''}{formatCurrency(change)}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {isPositive ? '+' : ''}{changePercentage.toFixed(1)}%
          </p>
        </div>

        <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
          <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-1">
            Peak Net Worth
          </p>
          <p className="text-lg font-bold">
            {formatCurrency(highestNetWorth)}
          </p>
        </div>

        <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
          <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-1">
            Starting Point
          </p>
          <p className="text-lg font-bold">
            {formatCurrency(startingNetWorth)}
          </p>
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={350}>
        {chartType === 'area' ? (
          <AreaChart data={data}>
            <defs>
              <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={getChartColor(1)} stopOpacity={0.3} />
                <stop offset="95%" stopColor={getChartColor(1)} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
            <XAxis
              dataKey="month"
              className="text-xs text-gray-600 dark:text-gray-400"
              tick={{ fill: 'currentColor' }}
            />
            <YAxis
              className="text-xs text-gray-600 dark:text-gray-400"
              tick={{ fill: 'currentColor' }}
              tickFormatter={(value) => {
                const absValue = Math.abs(value);
                if (absValue >= 1000000) {
                  return `${currencySymbol}${(value / 1000000).toFixed(1)}M`;
                }
                return `${currencySymbol}${(value / 1000).toFixed(0)}k`;
              }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="circle"
            />
            <ReferenceLine
              y={0}
              stroke="#9ca3af"
              strokeDasharray="3 3"
              label={{
                value: '$0',
                position: 'right',
                fill: '#9ca3af',
                fontSize: 12,
              }}
            />
            <Area
              type="monotone"
              dataKey="netWorth"
              stroke={getChartColor(1)}
              strokeWidth={3}
              fill="url(#netWorthGradient)"
              name="Net Worth"
            />
            <Line
              type="monotone"
              dataKey="assets"
              stroke={INCOME_COLOR}
              strokeWidth={1.5}
              strokeDasharray="5 5"
              dot={false}
              name="Assets"
            />
            <Line
              type="monotone"
              dataKey="liabilities"
              stroke={EXPENSE_COLOR}
              strokeWidth={1.5}
              strokeDasharray="5 5"
              dot={false}
              name="Liabilities"
            />
          </AreaChart>
        ) : (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
            <XAxis
              dataKey="month"
              className="text-xs text-gray-600 dark:text-gray-400"
              tick={{ fill: 'currentColor' }}
            />
            <YAxis
              className="text-xs text-gray-600 dark:text-gray-400"
              tick={{ fill: 'currentColor' }}
              tickFormatter={(value) => {
                const absValue = Math.abs(value);
                if (absValue >= 1000000) {
                  return `${currencySymbol}${(value / 1000000).toFixed(1)}M`;
                }
                return `${currencySymbol}${(value / 1000).toFixed(0)}k`;
              }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="circle"
            />
            <ReferenceLine
              y={0}
              stroke="#9ca3af"
              strokeDasharray="3 3"
              label={{
                value: '$0',
                position: 'right',
                fill: '#9ca3af',
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="netWorth"
              stroke={getChartColor(1)}
              strokeWidth={3}
              dot={{ fill: getChartColor(1), r: 4 }}
              activeDot={{ r: 6 }}
              name="Net Worth"
            />
            <Line
              type="monotone"
              dataKey="assets"
              stroke={INCOME_COLOR}
              strokeWidth={1.5}
              strokeDasharray="5 5"
              dot={false}
              name="Assets"
            />
            <Line
              type="monotone"
              dataKey="liabilities"
              stroke={EXPENSE_COLOR}
              strokeWidth={1.5}
              strokeDasharray="5 5"
              dot={false}
              name="Liabilities"
            />
          </LineChart>
        )}
      </ResponsiveContainer>

      {/* Growth Insights */}
      <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          Growth Analysis
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
            <div className={`p-2 rounded-lg ${
              isPositive
                ? 'bg-green-100 dark:bg-green-900/20'
                : 'bg-red-100 dark:bg-red-900/20'
            }`}>
              {isPositive ? (
                <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Overall Trend
              </p>
              <p className="text-sm font-semibold">
                {isPositive ? 'Growing' : 'Declining'} ({changePercentage.toFixed(1)}%)
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
              <Wallet className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Average Monthly Change
              </p>
              <p className="text-sm font-semibold">
                {formatCurrency(data.length > 1 ? change / (data.length - 1) : 0)}/mo
              </p>
            </div>
          </div>
        </div>
      </div>
      </Card>
    </TooltipProvider>
  );
}
