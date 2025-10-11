/**
 * Dashboard Overview Page - Aggregates all financial data
 */
'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  useGetDashboardOverviewQuery,
  useGetIncomeVsExpensesChartQuery,
  useGetExpenseByCategoryChartQuery,
  useGetMonthlySpendingChartQuery,
  useGetNetWorthTrendChartQuery,
} from '@/lib/api/dashboardApi';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Target,
  PiggyBank,
  CreditCard,
  TrendingUpIcon,
  Calendar,
  Info,
  Plus,
  Minus,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  XCircle,
  ArrowRight,
} from 'lucide-react';
import { IncomeSourceForm } from '@/components/income/income-source-form';
import { ExpenseForm } from '@/components/expenses/expense-form';
import { GoalForm } from '@/components/goals/goal-form';
import { SubscriptionForm } from '@/components/subscriptions/subscription-form';
import { InstallmentForm } from '@/components/installments/installment-form';
import { AIInsightsWidget } from '@/components/dashboard/ai-insights-widget';
import { TimeRangeFilter, TimeRange } from '@/components/dashboard/time-range-filter';
import { IncomeVsExpensesChart } from '@/components/dashboard/income-vs-expenses-chart';
import { ExpenseByCategoryChart } from '@/components/dashboard/expense-by-category-chart';
import { MonthlySpendingChart } from '@/components/dashboard/monthly-spending-chart';
import { NetWorthTrendChart } from '@/components/dashboard/net-worth-trend-chart';

export default function DashboardPage() {
  const { data, isLoading, error } = useGetDashboardOverviewQuery();

  // Dialog states for Quick Actions
  const [isIncomeFormOpen, setIsIncomeFormOpen] = useState(false);
  const [isExpenseFormOpen, setIsExpenseFormOpen] = useState(false);
  const [isGoalFormOpen, setIsGoalFormOpen] = useState(false);
  const [isSubscriptionFormOpen, setIsSubscriptionFormOpen] = useState(false);
  const [isInstallmentFormOpen, setIsInstallmentFormOpen] = useState(false);

  // Time range state for analytics
  const [timeRange, setTimeRange] = useState<TimeRange>(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return { start, end: now, label: 'Last 3 Months' };
  });

  // Analytics params
  const analyticsParams = useMemo(() => ({
    start_date: timeRange.start.toISOString(),
    end_date: timeRange.end.toISOString(),
  }), [timeRange]);

  // Analytics queries
  const { data: incomeVsExpensesData, isLoading: isLoadingIncomeVsExpenses } =
    useGetIncomeVsExpensesChartQuery(analyticsParams);

  const { data: expenseByCategoryData, isLoading: isLoadingExpenseByCategory } =
    useGetExpenseByCategoryChartQuery(analyticsParams);

  const { data: monthlySpendingData, isLoading: isLoadingMonthlySpending } =
    useGetMonthlySpendingChartQuery(analyticsParams);

  const { data: netWorthTrendData, isLoading: isLoadingNetWorthTrend } =
    useGetNetWorthTrendChartQuery(analyticsParams);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="container mx-auto space-y-6 p-6">
        <Card className="p-6 border-red-200 bg-red-50 dark:bg-red-900/10">
          <p className="text-red-600 dark:text-red-400">
            Failed to load dashboard data. Please try again.
          </p>
        </Card>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { net_worth, cash_flow, financial_health, recent_activity } = data;

  // Format currency
  const formatCurrency = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  // Format percentage
  const formatPercentage = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return `${num.toFixed(1)}%`;
  };

  // Get health rating color
  const getHealthColor = (rating: string) => {
    switch (rating) {
      case 'Excellent':
        return 'text-green-600 dark:text-green-400';
      case 'Good':
        return 'text-blue-600 dark:text-blue-400';
      case 'Fair':
        return 'text-yellow-600 dark:text-yellow-400';
      default:
        return 'text-red-600 dark:text-red-400';
    }
  };

  // Get alert styling based on type
  const getAlertStyle = (type: string) => {
    switch (type) {
      case 'success':
        return {
          bg: 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/30',
          icon: <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />,
          textColor: 'text-green-900 dark:text-green-100',
        };
      case 'warning':
        return {
          bg: 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-900/30',
          icon: <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />,
          textColor: 'text-yellow-900 dark:text-yellow-100',
        };
      case 'danger':
        return {
          bg: 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30',
          icon: <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />,
          textColor: 'text-red-900 dark:text-red-100',
        };
      default: // info
        return {
          bg: 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/30',
          icon: <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />,
          textColor: 'text-blue-900 dark:text-blue-100',
        };
    }
  };

  return (
    <TooltipProvider>
      <div className="container mx-auto space-y-6 p-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Your complete financial overview
          </p>
        </div>

        {/* Quick Actions */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Quick Actions</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Add new financial entries quickly
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <Button
              onClick={() => setIsIncomeFormOpen(true)}
              className="h-auto py-4 flex flex-col gap-2"
              variant="outline"
            >
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-green-600 dark:text-green-400" />
                <span className="font-medium">Add Income</span>
              </div>
              <span className="text-xs text-gray-600 dark:text-gray-400">
                Record income source
              </span>
            </Button>

            <Button
              onClick={() => setIsExpenseFormOpen(true)}
              className="h-auto py-4 flex flex-col gap-2"
              variant="outline"
            >
              <div className="flex items-center gap-2">
                <Minus className="h-5 w-5 text-red-600 dark:text-red-400" />
                <span className="font-medium">Add Expense</span>
              </div>
              <span className="text-xs text-gray-600 dark:text-gray-400">
                Track expense
              </span>
            </Button>

            <Button
              onClick={() => setIsSubscriptionFormOpen(true)}
              className="h-auto py-4 flex flex-col gap-2"
              variant="outline"
            >
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                <span className="font-medium">Add Subscription</span>
              </div>
              <span className="text-xs text-gray-600 dark:text-gray-400">
                Recurring payment
              </span>
            </Button>

            <Button
              onClick={() => setIsInstallmentFormOpen(true)}
              className="h-auto py-4 flex flex-col gap-2"
              variant="outline"
            >
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                <span className="font-medium">Add Installment</span>
              </div>
              <span className="text-xs text-gray-600 dark:text-gray-400">
                Payment plan
              </span>
            </Button>

            <Button
              onClick={() => setIsGoalFormOpen(true)}
              className="h-auto py-4 flex flex-col gap-2"
              variant="outline"
            >
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <span className="font-medium">Create Goal</span>
              </div>
              <span className="text-xs text-gray-600 dark:text-gray-400">
                Set target
              </span>
            </Button>
          </div>
        </Card>

        {/* AI Insights Widget */}
        <AIInsightsWidget />

        {/* Financial Alerts & Notifications */}
        {data.alerts && data.alerts.length > 0 && (
          <Card className="p-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Insights & Alerts</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Important financial notifications
              </p>
            </div>
            <div className="space-y-3">
              {data.alerts.map((alert) => {
                const style = getAlertStyle(alert.type);
                return (
                  <div
                    key={alert.id}
                    className={`p-4 rounded-lg border ${style.bg} transition-all hover:shadow-sm`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {style.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className={`font-semibold mb-1 ${style.textColor}`}>
                          {alert.title}
                        </h3>
                        <p className={`text-sm ${style.textColor} opacity-90`}>
                          {alert.message}
                        </p>
                      </div>
                      {alert.actionable && alert.action_url && (
                        <Link href={alert.action_url}>
                          <Button variant="ghost" size="sm" className="flex-shrink-0">
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

      {/* Top Stats Grid - Net Worth & Cash Flow */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Net Worth Card */}
        <Card className="p-6 col-span-1 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Net Worth</h2>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-gray-400 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">How it is calculated:</p>
                  <p className="text-sm">Net Worth = Assets - Liabilities</p>
                  <p className="text-sm mt-2">Assets = Portfolio Value + Savings Balance</p>
                  <p className="text-sm">Liabilities = Total Debt from Installments</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Wallet className="h-5 w-5 text-gray-500" />
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-3xl font-bold">
                {formatCurrency(net_worth.net_worth)}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Total net worth
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <ArrowUpRight className="h-4 w-4" />
                  <span className="text-sm font-medium">Assets</span>
                </div>
                <p className="text-xl font-semibold mt-1">
                  {formatCurrency(net_worth.total_assets)}
                </p>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-2 space-y-1">
                  <div>Portfolio: {formatCurrency(net_worth.portfolio_value)}</div>
                  <div>Savings: {formatCurrency(net_worth.savings_balance)}</div>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <ArrowDownRight className="h-4 w-4" />
                  <span className="text-sm font-medium">Liabilities</span>
                </div>
                <p className="text-xl font-semibold mt-1">
                  {formatCurrency(net_worth.total_liabilities)}
                </p>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                  <div>Debt: {formatCurrency(net_worth.total_debt)}</div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Financial Health Score */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Financial Health</h2>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-gray-400 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">How it is calculated:</p>
                  <p className="text-sm">Score = 5 components × 20 points each (0-100)</p>
                  <p className="text-sm mt-2">1. Emergency Fund: Savings ≥ 3 months expenses</p>
                  <p className="text-sm">2. Debt-to-Income: Total debt / income &lt; 36%</p>
                  <p className="text-sm">3. Savings Rate: % of income saved (20%+ excellent)</p>
                  <p className="text-sm">4. Investment Diversity: Multiple asset types</p>
                  <p className="text-sm">5. Goals Progress: Average goal completion</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Activity className="h-5 w-5 text-gray-500" />
          </div>
          <div className="text-center">
            <div className="text-5xl font-bold mb-2">
              {financial_health.score}
            </div>
            <div className={`text-sm font-medium ${getHealthColor(financial_health.rating)}`}>
              {financial_health.rating}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              out of 100
            </div>
          </div>
          <div className="mt-6 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Emergency Fund</span>
              <span className="font-medium">{financial_health.emergency_fund_score}/20</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Debt-to-Income</span>
              <span className="font-medium">{financial_health.debt_to_income_score}/20</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Savings Rate</span>
              <span className="font-medium">{financial_health.savings_rate_score}/20</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Investments</span>
              <span className="font-medium">{financial_health.investment_diversity_score}/20</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Goals Progress</span>
              <span className="font-medium">{financial_health.goals_progress_score}/20</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Cash Flow Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
                <TrendingUpIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Income</p>
                <p className="text-xl font-bold">{formatCurrency(cash_flow.monthly_income)}</p>
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-gray-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-semibold mb-1">How it is calculated:</p>
                <p className="text-sm">Sum of all active recurring income sources (monthly, weekly, biweekly, annual)</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-xs text-gray-500">Monthly</p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/20 rounded-lg">
                <CreditCard className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Expenses</p>
                <p className="text-xl font-bold">{formatCurrency(cash_flow.monthly_expenses)}</p>
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-gray-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-semibold mb-1">How it is calculated:</p>
                <p className="text-sm">Sum of all expenses for the current month from the Expenses module</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-xs text-gray-500">Monthly</p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                <Calendar className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Subscriptions</p>
                <p className="text-xl font-bold">{formatCurrency(cash_flow.monthly_subscriptions)}</p>
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-gray-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-semibold mb-1">How it is calculated:</p>
                <p className="text-sm">Sum of all active monthly and annual subscriptions</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-xs text-gray-500">Monthly</p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                <PiggyBank className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Net Cash Flow</p>
                <p className="text-xl font-bold">{formatCurrency(cash_flow.net_cash_flow)}</p>
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-gray-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-semibold mb-1">How it is calculated:</p>
                <p className="text-sm">Net Cash Flow = Income - Expenses - Subscriptions</p>
                <p className="text-sm mt-2">Savings Rate = (Net Cash Flow / Income) × 100%</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-xs text-gray-500">
            Savings Rate: {formatPercentage(cash_flow.savings_rate)}
          </p>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
        {recent_activity.length === 0 ? (
          <p className="text-center text-gray-500 py-8">
            No recent activity
          </p>
        ) : (
          <div className="space-y-3">
            {recent_activity.map((activity) => (
              <div
                key={activity.id}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${
                    activity.is_positive
                      ? 'bg-green-100 dark:bg-green-900/20'
                      : 'bg-red-100 dark:bg-red-900/20'
                  }`}>
                    {activity.is_positive ? (
                      <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">{activity.name}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 capitalize">
                      {activity.module} • {new Date(activity.date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className={`text-right ${
                  activity.is_positive
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  <p className="font-semibold">
                    {activity.is_positive ? '+' : '-'}{formatCurrency(activity.amount)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Analytics Section */}
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold mb-2">Financial Analytics</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Visualize your financial trends and patterns
          </p>
        </div>

        {/* Time Range Filter */}
        <TimeRangeFilter
          onRangeChange={setTimeRange}
          defaultPeriod="last_3_months"
        />

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Income vs Expenses Chart */}
          <IncomeVsExpensesChart
            data={incomeVsExpensesData?.data || []}
            isLoading={isLoadingIncomeVsExpenses}
            chartType="area"
          />

          {/* Expense by Category Chart */}
          <ExpenseByCategoryChart
            data={expenseByCategoryData?.data || []}
            isLoading={isLoadingExpenseByCategory}
            chartType="donut"
          />

          {/* Monthly Spending Chart */}
          <MonthlySpendingChart
            data={monthlySpendingData?.data || []}
            isLoading={isLoadingMonthlySpending}
            showAverage={true}
          />

          {/* Net Worth Trend Chart */}
          <NetWorthTrendChart
            data={netWorthTrendData?.data || []}
            isLoading={isLoadingNetWorthTrend}
            chartType="area"
          />
        </div>
      </div>

      {/* Quick Action Dialogs */}
      <IncomeSourceForm
        isOpen={isIncomeFormOpen}
        onClose={() => setIsIncomeFormOpen(false)}
        sourceId={null}
      />
      <ExpenseForm
        isOpen={isExpenseFormOpen}
        onClose={() => setIsExpenseFormOpen(false)}
        expenseId={null}
      />
      <SubscriptionForm
        isOpen={isSubscriptionFormOpen}
        onClose={() => setIsSubscriptionFormOpen(false)}
        subscriptionId={null}
      />
      <InstallmentForm
        isOpen={isInstallmentFormOpen}
        onClose={() => setIsInstallmentFormOpen(false)}
        installmentId={null}
      />
      <GoalForm
        isOpen={isGoalFormOpen}
        onClose={() => setIsGoalFormOpen(false)}
        goalId={null}
      />
      </div>
    </TooltipProvider>
  );
}

function DashboardSkeleton() {
  return (
    <div className="container mx-auto space-y-6 p-6">
      <div>
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-5 w-64 mt-2" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Skeleton className="h-64 col-span-1 lg:col-span-2" />
        <Skeleton className="h-64" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>

      <Skeleton className="h-96" />
    </div>
  );
}
