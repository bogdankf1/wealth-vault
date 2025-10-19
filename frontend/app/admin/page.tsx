/**
 * Admin dashboard with platform statistics and charts
 */
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ModuleHeader } from '@/components/ui/module-header';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useGetPlatformStatsQuery,
  useGetUserAcquisitionQuery,
  useGetEngagementMetricsQuery,
} from '@/lib/api/adminApi';
import { Users, UserCheck, UserPlus, DollarSign, TrendingUp, TrendingDown, Activity, Info } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { format } from 'date-fns';
import { getChartColor } from '@/lib/utils/chart-colors';

export default function AdminDashboard() {
  const { data: platformStats, isLoading: statsLoading, error: statsError } = useGetPlatformStatsQuery();
  const { data: userAcquisition, isLoading: acquisitionLoading, error: acquisitionError } = useGetUserAcquisitionQuery(30);
  const { data: engagement, isLoading: engagementLoading, error: engagementError } = useGetEngagementMetricsQuery();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US').format(value);
  };

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  // KPI Cards
  const kpiCards = platformStats
    ? [
        {
          title: 'Total Users',
          value: formatNumber(platformStats.total_users),
          description: `${formatNumber(platformStats.new_users_today)} new today`,
          icon: Users,
          iconClassName: 'text-blue-600',
          tooltip: 'Total number of registered users on the platform',
        },
        {
          title: 'Active Users',
          value: formatNumber(platformStats.active_users),
          description: `${formatPercent(platformStats.active_users / platformStats.total_users)} of total`,
          icon: UserCheck,
          iconClassName: platformStats.active_users > platformStats.total_users * 0.7 ? 'text-green-600' : 'text-orange-600',
          tooltip: 'Users who have logged in or performed actions recently',
        },
        {
          title: 'New This Month',
          value: formatNumber(platformStats.new_users_this_month),
          description: `${formatNumber(platformStats.new_users_this_week)} this week`,
          icon: UserPlus,
          iconClassName: 'text-purple-600',
          tooltip: 'New user registrations in the current month',
        },
        {
          title: 'Active Subscriptions',
          value: formatNumber(platformStats.active_subscriptions),
          description: `of ${formatNumber(platformStats.total_subscriptions)} total`,
          icon: Activity,
          iconClassName: 'text-indigo-600',
          tooltip: 'Currently active paid subscriptions',
        },
        {
          title: 'Monthly Recurring Revenue',
          value: formatCurrency(platformStats.mrr),
          description: `${formatCurrency(platformStats.arr)} ARR`,
          icon: DollarSign,
          iconClassName: 'text-green-600',
          tooltip: 'Monthly and annual recurring revenue from subscriptions',
        },
        {
          title: 'Churn Rate',
          value: formatPercent(platformStats.churn_rate),
          description: 'Monthly churn rate',
          icon: platformStats.churn_rate < 0.05 ? TrendingDown : TrendingUp,
          iconClassName: platformStats.churn_rate < 0.05 ? 'text-green-600' : 'text-red-600',
          tooltip: 'Percentage of users who cancel their subscription each month',
        },
      ]
    : [];

  // Format acquisition data for chart
  const acquisitionChartData = userAcquisition?.map((item) => ({
    date: format(new Date(item.date), 'MMM dd'),
    users: item.count,
  })) || [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <ModuleHeader
        title="Admin Dashboard"
        description="Platform overview and key performance indicators"
      />

      {/* KPI Cards */}
      {statsLoading ? (
        <LoadingCards count={6} />
      ) : statsError ? (
        <ApiErrorState error={statsError} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {kpiCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <Card key={index}>
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      {card.title}
                    </CardTitle>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">{card.tooltip}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Icon className={`h-5 w-5 ${card.iconClassName}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{card.value}</div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{card.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Acquisition Chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>User Acquisition (Last 30 Days)</CardTitle>
                <CardDescription className="mt-1">New user signups per day</CardDescription>
              </div>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">Daily breakdown of new user registrations over the past 30 days</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </CardHeader>
          <CardContent>
            {acquisitionLoading ? (
              <div className="h-[300px] flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : acquisitionError ? (
              <div className="h-[300px] flex items-center justify-center text-gray-500">
                Failed to load chart data
              </div>
            ) : acquisitionChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={acquisitionChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                  <XAxis
                    dataKey="date"
                    className="text-xs text-gray-600 dark:text-gray-400"
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    className="text-xs text-gray-600 dark:text-gray-400"
                    tick={{ fontSize: 12 }}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      color: 'hsl(var(--foreground))',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="users"
                    stroke={getChartColor(1)}
                    strokeWidth={2}
                    dot={{ fill: getChartColor(1), r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-gray-500">
                No data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Engagement Metrics */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>User Engagement</CardTitle>
                <CardDescription className="mt-1">Daily, weekly, and monthly active users</CardDescription>
              </div>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">Key engagement metrics including DAU, WAU, MAU, and retention rates</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </CardHeader>
          <CardContent>
            {engagementLoading ? (
              <div className="h-[300px] flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : engagementError ? (
              <div className="h-[300px] flex items-center justify-center text-gray-500">
                Failed to load engagement data
              </div>
            ) : engagement ? (
              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-600">{formatNumber(engagement.dau)}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">DAU</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-600">{formatNumber(engagement.wau)}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">WAU</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-purple-600">{formatNumber(engagement.mau)}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">MAU</div>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t dark:border-gray-700">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">DAU/MAU Ratio</span>
                    <span className="text-sm font-medium">
                      {engagement.mau > 0 ? formatPercent(engagement.dau / engagement.mau) : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">30-Day Retention</span>
                    <span className="text-sm font-medium">{formatPercent(engagement.retention_rate_30d)}</span>
                  </div>
                  {engagement.avg_session_duration && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Avg Session Duration</span>
                      <span className="text-sm font-medium">
                        {Math.round(engagement.avg_session_duration / 60)} min
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-gray-500">
                No data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
