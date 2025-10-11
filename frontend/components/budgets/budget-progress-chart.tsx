'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BudgetSummaryByCategory } from '@/lib/api/budgetsApi';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface BudgetProgressChartProps {
  data: BudgetSummaryByCategory[];
  currency: string;
}

interface TooltipPayload {
  value: number;
  name: string;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
        <p className="font-semibold mb-2">{label}</p>
        {payload.map((entry, index) => (
          <p key={`item-${index}`} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: {entry.value.toLocaleString()}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export function BudgetProgressChart({ data, currency }: BudgetProgressChartProps) {
  // Transform data for the chart
  const chartData = data.map((item) => ({
    category: item.category,
    Budgeted: item.budgeted,
    Spent: item.spent,
    Remaining: Math.max(0, item.remaining), // Only show positive remaining
  }));

  const getBarColor = (category: string) => {
    const item = data.find((d) => d.category === category);
    if (!item) return '#10b981';
    if (item.is_overspent) return '#ef4444';
    if (item.percentage_used >= 80) return '#f59e0b';
    return '#10b981';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Budget vs Actual Spending</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
            <XAxis
              dataKey="category"
              className="text-xs"
              tick={{ fill: 'currentColor' }}
              angle={-45}
              textAnchor="end"
              height={100}
            />
            <YAxis
              className="text-xs"
              tick={{ fill: 'currentColor' }}
              label={{
                value: `Amount (${currency})`,
                angle: -90,
                position: 'insideLeft',
                style: { textAnchor: 'middle', fill: 'currentColor' },
              }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="Budgeted" fill="#94a3b8" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Spent" radius={[4, 4, 0, 0]}>
              {chartData.map((entry) => (
                <Cell key={entry.category} fill={getBarColor(entry.category)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
