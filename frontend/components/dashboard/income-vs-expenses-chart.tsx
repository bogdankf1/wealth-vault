/**
 * Income vs Expenses Chart Widget
 * Shows income and expenses trend over time
 */
'use client';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip as ChartTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
} from 'recharts';
import { TrendingUp, TrendingDown, Info } from 'lucide-react';
import { useGetCurrencyQuery } from '@/lib/api/currenciesApi';
import { INCOME_COLOR, EXPENSE_COLOR } from '@/lib/utils/chart-colors';

interface ChartDataPoint {
  month: string;
  income: number;
  expenses: number;
}

interface TooltipPayload {
  value: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

interface IncomeVsExpensesChartProps {
  data: ChartDataPoint[];
  isLoading?: boolean;
  chartType?: 'line' | 'area';
  currency?: string;
}

export function IncomeVsExpensesChart({
  data,
  isLoading = false,
  chartType = 'area',
  currency = 'USD',
}: IncomeVsExpensesChartProps) {
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
          <TrendingUp className="h-12 w-12 mb-4 opacity-50" />
          <p className="text-sm md:text-base">No data available for the selected period</p>
        </div>
      </Card>
    );
  }

  // Calculate totals and net
  const totalIncome = data.reduce((sum, item) => sum + item.income, 0);
  const totalExpenses = data.reduce((sum, item) => sum + item.expenses, 0);
  const netCashFlow = totalIncome - totalExpenses;

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
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: INCOME_COLOR }} />
              <span className="text-sm">Income:</span>
              <span className="font-semibold text-green-600 dark:text-green-400">
                {formatCurrency(payload[0].value)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: EXPENSE_COLOR }} />
              <span className="text-sm">Expenses:</span>
              <span className="font-semibold text-red-600 dark:text-red-400">
                {formatCurrency(payload[1].value)}
              </span>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-1 mt-1">
              <div className="flex items-center gap-2">
                <span className="text-sm">Net:</span>
                <span className={`font-semibold ${
                  payload[0].value - payload[1].value >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {formatCurrency(payload[0].value - payload[1].value)}
                </span>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <TooltipProvider>
      <Card className="p-4 md:p-6">
        <div className="mb-4 md:mb-6">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base md:text-lg font-semibold">Income vs Expenses</h3>
            <ChartTooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-gray-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-semibold mb-1">How it works:</p>
                <p className="text-sm">Visualizes your cash flow by comparing total income against total expenses over time.</p>
                <p className="text-sm mt-2">• Green line: Income from all sources</p>
                <p className="text-sm">• Red line: All expenses</p>
                <p className="text-sm">• Net: Difference between income and expenses</p>
              </TooltipContent>
            </ChartTooltip>
          </div>
          <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400">
            Cash flow trend over time
          </p>
        </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-2 md:gap-4 mb-4 md:mb-6">
        <div className="text-center p-2 md:p-3 rounded-lg bg-green-50 dark:bg-green-900/10">
          <div className="flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-1 text-green-600 dark:text-green-400 mb-1">
            <TrendingUp className="h-3 w-3 md:h-4 md:w-4" />
            <span className="text-[10px] md:text-xs font-medium">Income</span>
          </div>
          <p className="text-sm md:text-xl font-bold text-green-700 dark:text-green-300">
            {formatCurrency(totalIncome)}
          </p>
        </div>

        <div className="text-center p-2 md:p-3 rounded-lg bg-red-50 dark:bg-red-900/10">
          <div className="flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-1 text-red-600 dark:text-red-400 mb-1">
            <TrendingDown className="h-3 w-3 md:h-4 md:w-4" />
            <span className="text-[10px] md:text-xs font-medium">Expenses</span>
          </div>
          <p className="text-sm md:text-xl font-bold text-red-700 dark:text-red-300">
            {formatCurrency(totalExpenses)}
          </p>
        </div>

        <div className="text-center p-2 md:p-3 rounded-lg bg-blue-50 dark:bg-blue-900/10">
          <div className="flex items-center justify-center gap-0.5 md:gap-1 text-blue-600 dark:text-blue-400 mb-1">
            <span className="text-[10px] md:text-xs font-medium">Net Flow</span>
          </div>
          <p className={`text-sm md:text-xl font-bold ${
            netCashFlow >= 0
              ? 'text-green-700 dark:text-green-300'
              : 'text-red-700 dark:text-red-300'
          }`}>
            {formatCurrency(netCashFlow)}
          </p>
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={250} className="md:!h-[350px]">
        {chartType === 'area' ? (
          <AreaChart data={data}>
            <defs>
              <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={INCOME_COLOR} stopOpacity={0.3} />
                <stop offset="95%" stopColor={INCOME_COLOR} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="expensesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={EXPENSE_COLOR} stopOpacity={0.3} />
                <stop offset="95%" stopColor={EXPENSE_COLOR} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
            <XAxis
              dataKey="month"
              className="text-xs text-gray-600 dark:text-gray-400"
              tick={{ fill: 'currentColor', fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis
              className="text-xs text-gray-600 dark:text-gray-400"
              tick={{ fill: 'currentColor', fontSize: 11 }}
              tickFormatter={(value) => `${currencySymbol}${(value / 1000).toFixed(0)}k`}
              width={45}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }}
              iconType="circle"
              iconSize={10}
            />
            <Area
              type="monotone"
              dataKey="income"
              stroke={INCOME_COLOR}
              strokeWidth={2}
              fill="url(#incomeGradient)"
              name="Income"
            />
            <Area
              type="monotone"
              dataKey="expenses"
              stroke={EXPENSE_COLOR}
              strokeWidth={2}
              fill="url(#expensesGradient)"
              name="Expenses"
            />
          </AreaChart>
        ) : (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
            <XAxis
              dataKey="month"
              className="text-xs text-gray-600 dark:text-gray-400"
              tick={{ fill: 'currentColor', fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis
              className="text-xs text-gray-600 dark:text-gray-400"
              tick={{ fill: 'currentColor', fontSize: 11 }}
              tickFormatter={(value) => `${currencySymbol}${(value / 1000).toFixed(0)}k`}
              width={45}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }}
              iconType="circle"
              iconSize={10}
            />
            <Line
              type="monotone"
              dataKey="income"
              stroke={INCOME_COLOR}
              strokeWidth={2}
              dot={{ fill: INCOME_COLOR, r: 4 }}
              activeDot={{ r: 6 }}
              name="Income"
            />
            <Line
              type="monotone"
              dataKey="expenses"
              stroke={EXPENSE_COLOR}
              strokeWidth={2}
              dot={{ fill: EXPENSE_COLOR, r: 4 }}
              activeDot={{ r: 6 }}
              name="Expenses"
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </Card>
    </TooltipProvider>
  );
}
