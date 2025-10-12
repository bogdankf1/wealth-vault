/**
 * Analytics page - detailed platform statistics and charts
 */
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ModuleHeader } from '@/components/ui/module-header';
import { LoadingCards } from '@/components/ui/loading-state';
import { Tooltip as UiTooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useGetPlatformStatsQuery,
  useGetUserAcquisitionQuery,
  useGetEngagementMetricsQuery,
} from '@/lib/api/adminApi';
import { Users, UserCheck, DollarSign, TrendingUp, TrendingDown, Activity, Target, Info } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Bar, BarChart } from 'recharts';
import { format } from 'date-fns';

export default function AnalyticsPage() {
  const { data: platformStats, isLoading: statsLoading } = useGetPlatformStatsQuery();
  const { data: userAcquisition30, isLoading: acquisition30Loading } = useGetUserAcquisitionQuery(30);
  const { data: userAcquisition90, isLoading: acquisition90Loading } = useGetUserAcquisitionQuery(90);
  const { data: engagement, isLoading: engagementLoading } = useGetEngagementMetricsQuery();

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

  // Format acquisition data for charts
  const acquisitionChart30 = userAcquisition30?.map((item) => ({
    date: format(new Date(item.date), 'MMM dd'),
    users: item.count,
  })) || [];

  const acquisitionChart90 = userAcquisition90?.map((item) => ({
    date: format(new Date(item.date), 'MMM dd'),
    users: item.count,
  })) || [];


  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <ModuleHeader
        title="Analytics"
        description="Detailed platform metrics, charts, and insights"
      />

      {/* Key Metrics */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Key Metrics</h2>
          <UiTooltip>
            <TooltipTrigger>
              <Info className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">Core platform performance indicators including users, revenue, and churn</p>
            </TooltipContent>
          </UiTooltip>
        </div>
        {statsLoading ? (
          <LoadingCards count={4} />
        ) : platformStats ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Total Users
                </CardTitle>
                <Users className="h-5 w-5 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatNumber(platformStats.total_users)}
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {formatNumber(platformStats.new_users_today)} new today
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Active Users
                </CardTitle>
                <UserCheck className="h-5 w-5 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatNumber(platformStats.active_users)}
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {formatPercent(platformStats.active_users / platformStats.total_users)} of total
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Monthly Revenue
                </CardTitle>
                <DollarSign className="h-5 w-5 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatCurrency(platformStats.mrr)}
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {formatCurrency(platformStats.arr)} annual
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Churn Rate
                </CardTitle>
                {platformStats.churn_rate < 0.05 ? (
                  <TrendingDown className="h-5 w-5 text-green-600" />
                ) : (
                  <TrendingUp className="h-5 w-5 text-red-600" />
                )}
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatPercent(platformStats.churn_rate)}
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {platformStats.churn_rate < 0.05 ? 'Healthy' : 'Needs attention'}
                </p>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>

      {/* User Acquisition Charts */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">User Acquisition</h2>
          <UiTooltip>
            <TooltipTrigger>
              <Info className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">New user signups tracked over time to identify growth trends</p>
            </TooltipContent>
          </UiTooltip>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Last 30 Days */}
          <Card>
            <CardHeader>
              <CardTitle>Last 30 Days</CardTitle>
              <CardDescription>New user signups per day</CardDescription>
            </CardHeader>
            <CardContent>
              {acquisition30Loading ? (
                <div className="h-[300px] flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : acquisitionChart30.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={acquisitionChart30}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                    <XAxis
                      dataKey="date"
                      className="text-xs text-gray-600 dark:text-gray-400"
                      tick={{ fontSize: 10 }}
                      interval={4}
                    />
                    <YAxis className="text-xs text-gray-600 dark:text-gray-400" tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="users"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={{ fill: '#3b82f6', r: 3 }}
                      activeDot={{ r: 5 }}
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

          {/* Last 90 Days */}
          <Card>
            <CardHeader>
              <CardTitle>Last 90 Days</CardTitle>
              <CardDescription>Long-term acquisition trend</CardDescription>
            </CardHeader>
            <CardContent>
              {acquisition90Loading ? (
                <div className="h-[300px] flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : acquisitionChart90.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={acquisitionChart90}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                    <XAxis
                      dataKey="date"
                      className="text-xs text-gray-600 dark:text-gray-400"
                      tick={{ fontSize: 10 }}
                      interval={14}
                    />
                    <YAxis className="text-xs text-gray-600 dark:text-gray-400" tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar dataKey="users" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-gray-500">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Engagement Metrics */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">User Engagement</h2>
          <UiTooltip>
            <TooltipTrigger>
              <Info className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">User activity metrics including DAU, WAU, MAU, retention, and session duration</p>
            </TooltipContent>
          </UiTooltip>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Active Users</CardTitle>
              <CardDescription>Daily, weekly, and monthly active users</CardDescription>
            </CardHeader>
            <CardContent>
              {engagementLoading ? (
                <div className="h-[300px] flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : engagement ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <div className="text-3xl font-bold text-blue-600">{formatNumber(engagement.dau)}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Daily Active</div>
                    </div>
                    <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <div className="text-3xl font-bold text-green-600">{formatNumber(engagement.wau)}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Weekly Active</div>
                    </div>
                    <div className="text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                      <div className="text-3xl font-bold text-purple-600">{formatNumber(engagement.mau)}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Monthly Active</div>
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t dark:border-gray-700">
                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <Activity className="h-5 w-5 text-blue-600" />
                        <span className="text-sm font-medium">DAU/MAU Ratio</span>
                      </div>
                      <span className="text-lg font-semibold">
                        {engagement.mau > 0 ? formatPercent(engagement.dau / engagement.mau) : 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <Target className="h-5 w-5 text-green-600" />
                        <span className="text-sm font-medium">30-Day Retention</span>
                      </div>
                      <span className="text-lg font-semibold">
                        {formatPercent(engagement.retention_rate_30d)}
                      </span>
                    </div>
                    {engagement.avg_session_duration && (
                      <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <TrendingUp className="h-5 w-5 text-purple-600" />
                          <span className="text-sm font-medium">Avg Session Duration</span>
                        </div>
                        <span className="text-lg font-semibold">
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

          <Card>
            <CardHeader>
              <CardTitle>Revenue Breakdown</CardTitle>
              <CardDescription>Monthly and annual recurring revenue</CardDescription>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="h-[300px] flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : platformStats ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-6 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <div className="text-3xl font-bold text-green-600">
                        {formatCurrency(platformStats.mrr)}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">Monthly Recurring</div>
                    </div>
                    <div className="text-center p-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <div className="text-3xl font-bold text-blue-600">
                        {formatCurrency(platformStats.arr)}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">Annual Recurring</div>
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t dark:border-gray-700">
                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <span className="text-sm font-medium">Active Subscriptions</span>
                      <span className="text-lg font-semibold">
                        {formatNumber(platformStats.active_subscriptions)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <span className="text-sm font-medium">Total Subscriptions</span>
                      <span className="text-lg font-semibold">
                        {formatNumber(platformStats.total_subscriptions)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <span className="text-sm font-medium">Conversion Rate</span>
                      <span className="text-lg font-semibold">
                        {platformStats.total_users > 0
                          ? formatPercent(platformStats.active_subscriptions / platformStats.total_users)
                          : 'N/A'}
                      </span>
                    </div>
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
    </div>
  );
}
