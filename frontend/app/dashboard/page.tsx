/**
 * Dashboard Overview Page - Aggregates all financial data
 */
'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  useGetDashboardOverviewQuery,
  useGetIncomeVsExpensesChartQuery,
  useGetSubscriptionsByCategoryChartQuery,
  useGetInstallmentsByCategoryChartQuery,
  useGetExpensesByCategoryChartQuery,
  useGetBudgetsByCategoryChartQuery,
  useGetMonthlySpendingChartQuery,
  useGetNetWorthTrendChartQuery,
  useGetIncomeBreakdownChartQuery,
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
  UserMinus,
  FileText,
} from 'lucide-react';
import { IncomeSourceForm } from '@/components/income/income-source-form';
import { ExpenseForm } from '@/components/expenses/expense-form';
import { BudgetForm } from '@/components/budgets/budget-form';
import { GoalForm } from '@/components/goals/goal-form';
import { SubscriptionForm } from '@/components/subscriptions/subscription-form';
import { InstallmentForm } from '@/components/installments/installment-form';
import { AIInsightsWidget } from '@/components/dashboard/ai-insights-widget';
import { BudgetOverviewWidget } from '@/components/dashboard/budget-overview-widget';
import { GoalsOverviewWidget } from '@/components/dashboard/goals-overview-widget';
import { PlannedSubscriptionsWidget } from '@/components/dashboard/planned-subscriptions-widget';
import { PlannedExpensesWidget } from '@/components/dashboard/planned-expenses-widget';
import { PlannedInstallmentsWidget } from '@/components/dashboard/planned-installments-widget';
import { MonthFilter } from '@/components/ui/month-filter';
import { IncomeVsExpensesChart } from '@/components/dashboard/income-vs-expenses-chart';
import { SubscriptionsByCategoryChart } from '@/components/dashboard/subscriptions-by-category-chart';
import { InstallmentsByCategoryChart } from '@/components/dashboard/installments-by-category-chart';
import { ExpensesByCategoryChart } from '@/components/dashboard/expenses-by-category-chart';
import { BudgetsByCategoryChart } from '@/components/dashboard/budgets-by-category-chart';
import { MonthlySpendingChart } from '@/components/dashboard/monthly-spending-chart';
import { NetWorthTrendChart } from '@/components/dashboard/net-worth-trend-chart';
import { IncomeBreakdownChart } from '@/components/dashboard/income-breakdown-chart';
import { ExchangeRatesWidget } from '@/components/dashboard/exchange-rates-widget';
import { useGetCurrentUserQuery } from '@/lib/api/authApi';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { useGetMyPreferencesQuery } from '@/lib/api/preferencesApi';
import { useGetDebtStatsQuery } from '@/lib/api/debtsApi';
import { useGetTaxStatsQuery } from '@/lib/api/taxesApi';
import { useGetActiveLayoutQuery } from '@/lib/api/dashboardLayoutsApi';
import { QuickLayoutSwitcher } from '@/components/dashboard/quick-layout-switcher';
import { useGetUserFeaturesQuery } from '@/lib/api/authApi';
import { WIDGET_FEATURES } from '@/lib/constants/feature-map';

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const tQuickActions = useTranslations('dashboard.quickActions');
  const tNetWorth = useTranslations('dashboard.netWorth');
  const tFinancialHealth = useTranslations('dashboard.financialHealth');
  const tCashFlow = useTranslations('dashboard.cashFlow');
  const tRecentActivity = useTranslations('dashboard.recentActivity');
  const tAnalytics = useTranslations('dashboard.analytics');
  const tTooltips = useTranslations('dashboard.tooltips');
  const tErrors = useTranslations('dashboard.errors');

  const { data: currentUser } = useGetCurrentUserQuery();
  const { data: preferences } = useGetMyPreferencesQuery();
  const { data: activeLayout } = useGetActiveLayoutQuery();
  const { data: userFeatures } = useGetUserFeaturesQuery();

  // Helper function to check if user has access to a widget feature
  const hasWidgetFeatureAccess = (widgetId: string): boolean => {
    const requiredFeature = WIDGET_FEATURES[widgetId];

    // If no feature is required, allow access
    if (!requiredFeature) return true;

    // If user features not loaded yet, default to denying access for safety
    if (!userFeatures) return false;

    // Check if user has the required feature enabled
    return requiredFeature in userFeatures.features;
  };

  // Helper function to check if a widget is visible
  const isWidgetVisible = (widgetId: string) => {
    // First check if user has access to the feature
    if (!hasWidgetFeatureAccess(widgetId)) return false;

    // Then check if widget is enabled in layout
    if (!activeLayout) return true; // Show all widgets if no layout configured
    const widget = activeLayout.configuration.widgets.find((w) => w.id === widgetId);
    return widget?.visible ?? true; // Default to visible if not found
  };

  // Check if any chart widgets are visible
  const hasVisibleCharts = () => {
    return isWidgetVisible('subscriptions-by-category') ||
           isWidgetVisible('installments-by-category') ||
           isWidgetVisible('expenses-by-category') ||
           isWidgetVisible('budgets-by-category') ||
           isWidgetVisible('income-allocation') ||
           isWidgetVisible('net-worth-trend');
  };

  // Dialog states for Quick Actions
  const [isIncomeFormOpen, setIsIncomeFormOpen] = useState(false);
  const [isExpenseFormOpen, setIsExpenseFormOpen] = useState(false);
  const [isBudgetFormOpen, setIsBudgetFormOpen] = useState(false);
  const [isGoalFormOpen, setIsGoalFormOpen] = useState(false);
  const [isSubscriptionFormOpen, setIsSubscriptionFormOpen] = useState(false);
  const [isInstallmentFormOpen, setIsInstallmentFormOpen] = useState(false);

  // Default to current month in YYYY-MM format
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);

  // Calculate date range from selectedMonth
  const dateParams = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    return {
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
    };
  }, [selectedMonth]);

  // Dashboard overview query with date params
  const { data, isLoading, error } = useGetDashboardOverviewQuery(dateParams);

  // Analytics queries
  const { data: incomeVsExpensesData, isLoading: isLoadingIncomeVsExpenses } =
    useGetIncomeVsExpensesChartQuery(dateParams);

  const { data: subscriptionsByCategoryData, isLoading: isLoadingSubscriptionsByCategory } =
    useGetSubscriptionsByCategoryChartQuery(dateParams);

  const { data: installmentsByCategoryData, isLoading: isLoadingInstallmentsByCategory } =
    useGetInstallmentsByCategoryChartQuery(dateParams);

  const { data: expensesByCategoryData, isLoading: isLoadingExpensesByCategory } =
    useGetExpensesByCategoryChartQuery(dateParams);

  const { data: budgetsByCategoryData, isLoading: isLoadingBudgetsByCategory } =
    useGetBudgetsByCategoryChartQuery(dateParams);

  const { data: monthlySpendingData, isLoading: isLoadingMonthlySpending } =
    useGetMonthlySpendingChartQuery(dateParams);

  const { data: netWorthTrendData, isLoading: isLoadingNetWorthTrend } =
    useGetNetWorthTrendChartQuery(dateParams);

  const { data: incomeBreakdownData, isLoading: isLoadingIncomeBreakdown } =
    useGetIncomeBreakdownChartQuery(dateParams);

  // Only fetch debt and tax stats for Wealth tier users
  const isWealthTier = currentUser?.tier?.name === 'wealth';
  const { data: debtStats } = useGetDebtStatsQuery(undefined, { skip: !isWealthTier });
  const { data: taxStats } = useGetTaxStatsQuery(undefined, { skip: !isWealthTier });

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="container mx-auto space-y-6 p-6">
        <Card className="p-6 border-red-200 bg-red-50 dark:bg-red-900/10">
          <p className="text-red-600 dark:text-red-400">
            {tErrors('loadFailed')}
          </p>
        </Card>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { net_worth, cash_flow, financial_health, recent_activity } = data;

  // Format percentage
  const formatPercentage = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return `${num.toFixed(1)}%`;
  };

  // Get period label for display
  const getPeriodLabel = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // Get period description for tooltips
  const getPeriodDescription = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const start = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const end = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${start} - ${end}`;
  };

  // Get health rating color
  const getHealthColor = (rating: string) => {
    // Normalize rating to lowercase for comparison
    const normalizedRating = rating.toLowerCase();

    if (normalizedRating === 'excellent' || normalizedRating === tFinancialHealth('ratings.excellent').toLowerCase()) {
      return 'text-green-600 dark:text-green-400';
    } else if (normalizedRating === 'good' || normalizedRating === tFinancialHealth('ratings.good').toLowerCase()) {
      return 'text-blue-600 dark:text-blue-400';
    } else if (normalizedRating === 'fair' || normalizedRating === tFinancialHealth('ratings.fair').toLowerCase()) {
      return 'text-yellow-600 dark:text-yellow-400';
    } else {
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
      <div className="container mx-auto space-y-4 md:space-y-6 p-4 md:p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">{t('title')}</h1>
            <p className="text-sm md:text-base text-gray-600 dark:text-gray-400 mt-1 md:mt-2">
              {t('description')}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {/* Quick Layout Switcher */}
            <QuickLayoutSwitcher />
            {/* Month Filter */}
            <MonthFilter
              selectedMonth={selectedMonth}
              onMonthChange={(month) => setSelectedMonth(month || currentMonth)}
              label={t('header.periodLabel')}
              clearLabel={t('header.clearButton')}
            />
          </div>
        </div>

        {/* Quick Actions */}
        {isWidgetVisible('quick-actions') && (
          <Card className="p-4 md:p-6">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <div>
                <h2 className="text-base md:text-lg font-semibold">{tQuickActions('title')}</h2>
                <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400">
                  {tQuickActions('description')}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-4">
            <Button
              onClick={() => setIsIncomeFormOpen(true)}
              className="h-auto py-3 md:py-4 flex flex-col gap-1 md:gap-2"
              variant="outline"
            >
              <div className="flex items-center gap-1 md:gap-2">
                <Plus className="h-4 w-4 md:h-5 md:w-5 text-green-600 dark:text-green-400" />
                <span className="text-xs md:text-sm font-medium">{tQuickActions('addIncome.label')}</span>
              </div>
              <span className="text-[10px] md:text-xs text-gray-600 dark:text-gray-400 hidden sm:block">
                {tQuickActions('addIncome.description')}
              </span>
            </Button>

            <Button
              onClick={() => setIsExpenseFormOpen(true)}
              className="h-auto py-3 md:py-4 flex flex-col gap-1 md:gap-2"
              variant="outline"
            >
              <div className="flex items-center gap-1 md:gap-2">
                <Minus className="h-4 w-4 md:h-5 md:w-5 text-red-600 dark:text-red-400" />
                <span className="text-xs md:text-sm font-medium">{tQuickActions('addExpense.label')}</span>
              </div>
              <span className="text-[10px] md:text-xs text-gray-600 dark:text-gray-400 hidden sm:block">
                {tQuickActions('addExpense.description')}
              </span>
            </Button>

            <Button
              onClick={() => setIsBudgetFormOpen(true)}
              className="h-auto py-3 md:py-4 flex flex-col gap-1 md:gap-2"
              variant="outline"
            >
              <div className="flex items-center gap-1 md:gap-2">
                <Wallet className="h-4 w-4 md:h-5 md:w-5 text-indigo-600 dark:text-indigo-400" />
                <span className="text-xs md:text-sm font-medium">{tQuickActions('addBudget.label')}</span>
              </div>
              <span className="text-[10px] md:text-xs text-gray-600 dark:text-gray-400 hidden sm:block">
                {tQuickActions('addBudget.description')}
              </span>
            </Button>

            <Button
              onClick={() => setIsSubscriptionFormOpen(true)}
              className="h-auto py-3 md:py-4 flex flex-col gap-1 md:gap-2"
              variant="outline"
            >
              <div className="flex items-center gap-1 md:gap-2">
                <Calendar className="h-4 w-4 md:h-5 md:w-5 text-purple-600 dark:text-purple-400" />
                <span className="text-xs md:text-sm font-medium">{tQuickActions('subscription.label')}</span>
              </div>
              <span className="text-[10px] md:text-xs text-gray-600 dark:text-gray-400 hidden sm:block">
                {tQuickActions('subscription.description')}
              </span>
            </Button>

            <Button
              onClick={() => setIsInstallmentFormOpen(true)}
              className="h-auto py-3 md:py-4 flex flex-col gap-1 md:gap-2"
              variant="outline"
            >
              <div className="flex items-center gap-1 md:gap-2">
                <CreditCard className="h-4 w-4 md:h-5 md:w-5 text-orange-600 dark:text-orange-400" />
                <span className="text-xs md:text-sm font-medium">{tQuickActions('installment.label')}</span>
              </div>
              <span className="text-[10px] md:text-xs text-gray-600 dark:text-gray-400 hidden sm:block">
                {tQuickActions('installment.description')}
              </span>
            </Button>

            <Button
              onClick={() => setIsGoalFormOpen(true)}
              className="h-auto py-3 md:py-4 flex flex-col gap-1 md:gap-2"
              variant="outline"
            >
              <div className="flex items-center gap-1 md:gap-2">
                <Target className="h-4 w-4 md:h-5 md:w-5 text-blue-600 dark:text-blue-400" />
                <span className="text-xs md:text-sm font-medium">{tQuickActions('createGoal.label')}</span>
              </div>
              <span className="text-[10px] md:text-xs text-gray-600 dark:text-gray-400 hidden sm:block">
                {tQuickActions('createGoal.description')}
              </span>
            </Button>
          </div>
        </Card>
        )}

        {/* AI Insights Widget - Only for Wealth tier */}
        {isWidgetVisible('ai-insights') && currentUser?.tier?.name === 'wealth' && <AIInsightsWidget />}

        {/* Budget Overview Widget */}
        {isWidgetVisible('budget-overview') && <BudgetOverviewWidget />}

        {/* Goals Overview Widget */}
        {isWidgetVisible('goals-progress') && <GoalsOverviewWidget />}

        {/* Planned Payments Widgets */}
        {(isWidgetVisible('planned-subscriptions') || isWidgetVisible('planned-expenses') || isWidgetVisible('planned-installments')) && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
            {isWidgetVisible('planned-subscriptions') && (
              <PlannedSubscriptionsWidget selectedMonth={selectedMonth} />
            )}
            {isWidgetVisible('planned-expenses') && (
              <PlannedExpensesWidget selectedMonth={selectedMonth} />
            )}
            {isWidgetVisible('planned-installments') && (
              <PlannedInstallmentsWidget selectedMonth={selectedMonth} />
            )}
          </div>
        )}

        {/* Financial Alerts & Notifications */}
        {isWidgetVisible('ai-insights') && data.alerts && data.alerts.length > 0 && (
          <Card className="p-4 md:p-6">
            <div className="mb-3 md:mb-4">
              <h2 className="text-base md:text-lg font-semibold">{t('insightsAlerts.title')}</h2>
              <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400">
                {t('insightsAlerts.description')}
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
      {(isWidgetVisible('net-worth') || isWidgetVisible('goals-progress')) && (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
        {/* Net Worth Card */}
        {isWidgetVisible('net-worth') && (
        <Card className="p-4 md:p-6 col-span-1 md:col-span-2 xl:col-span-2">
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-base md:text-lg font-semibold">{tNetWorth('title')}</h2>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-gray-400 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">{tTooltips('netWorth.heading')}</p>
                  <p className="text-sm">{tTooltips('netWorth.formula')}</p>
                  <p className="text-sm mt-2">{tTooltips('netWorth.assets')}</p>
                  <p className="text-sm">{tTooltips('netWorth.liabilities')}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Wallet className="h-5 w-5 text-gray-500" />
          </div>
          <div className="space-y-3 md:space-y-4">
            <div>
              <p className="text-2xl md:text-3xl font-bold">
                <CurrencyDisplay
                  amount={parseFloat(net_worth.net_worth)}
                  currency={net_worth.currency}
                  showSymbol={true}
                  showCode={false}


                />
              </p>
              <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400 mt-1">
                {tNetWorth('totalLabel')}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 md:gap-4 pt-3 md:pt-4 border-t">
              <div>
                <div className="flex items-center gap-1 md:gap-2 text-green-600 dark:text-green-400">
                  <ArrowUpRight className="h-3 w-3 md:h-4 md:w-4" />
                  <span className="text-xs md:text-sm font-medium">{tNetWorth('assets.label')}</span>
                </div>
                <p className="text-lg md:text-xl font-semibold mt-1">
                  <CurrencyDisplay
                    amount={parseFloat(net_worth.total_assets)}
                    currency={net_worth.currency}
                    showSymbol={true}
                    showCode={false}


                  />
                </p>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-2 space-y-1">
                  <div>{tNetWorth('assets.portfolio')}: <CurrencyDisplay
                    amount={parseFloat(net_worth.portfolio_value)}
                    currency={net_worth.currency}
                    showSymbol={true}
                    showCode={false}


                  /></div>
                  <div>{tNetWorth('assets.savings')}: <CurrencyDisplay
                    amount={parseFloat(net_worth.savings_balance)}
                    currency={net_worth.currency}
                    showSymbol={true}
                    showCode={false}


                  /></div>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1 md:gap-2 text-red-600 dark:text-red-400">
                  <ArrowDownRight className="h-3 w-3 md:h-4 md:w-4" />
                  <span className="text-xs md:text-sm font-medium">{tNetWorth('liabilities.label')}</span>
                </div>
                <p className="text-lg md:text-xl font-semibold mt-1">
                  <CurrencyDisplay
                    amount={parseFloat(net_worth.total_liabilities)}
                    currency={net_worth.currency}
                    showSymbol={true}
                    showCode={false}


                  />
                </p>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                  <div>{tNetWorth('liabilities.debt')}: <CurrencyDisplay
                    amount={parseFloat(net_worth.total_debt)}
                    currency={net_worth.currency}
                    showSymbol={true}
                    showCode={false}


                  /></div>
                </div>
              </div>
            </div>
          </div>
        </Card>
        )}

        {/* Financial Health Score */}
        {isWidgetVisible('goals-progress') && (
        <Card className="p-4 md:p-6">
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-base md:text-lg font-semibold">{tFinancialHealth('title')}</h2>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-gray-400 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">{tTooltips('financialHealth.heading')}</p>
                  <p className="text-sm">{tTooltips('financialHealth.formula')}</p>
                  <p className="text-sm mt-2">{tTooltips('financialHealth.emergencyFund')}</p>
                  <p className="text-sm">{tTooltips('financialHealth.debtToIncome')}</p>
                  <p className="text-sm">{tTooltips('financialHealth.savingsRate')}</p>
                  <p className="text-sm">{tTooltips('financialHealth.investmentDiversity')}</p>
                  <p className="text-sm">{tTooltips('financialHealth.goalsProgress')}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Activity className="h-5 w-5 text-gray-500" />
          </div>
          <div className="text-center">
            <div className="text-4xl md:text-5xl font-bold mb-2">
              {financial_health.score}
            </div>
            <div className={`text-xs md:text-sm font-medium ${getHealthColor(financial_health.rating)}`}>
              {financial_health.rating}
            </div>
            <div className="text-[10px] md:text-xs text-gray-600 dark:text-gray-400 mt-1">
              {tFinancialHealth('scoreLabel')}
            </div>
          </div>
          <div className="mt-4 md:mt-6 space-y-2 text-xs md:text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">{tFinancialHealth('components.emergencyFund')}</span>
              <span className="font-medium">{financial_health.emergency_fund_score}/20</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">{tFinancialHealth('components.debtToIncome')}</span>
              <span className="font-medium">{financial_health.debt_to_income_score}/20</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">{tFinancialHealth('components.savingsRate')}</span>
              <span className="font-medium">{financial_health.savings_rate_score}/20</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">{tFinancialHealth('components.investments')}</span>
              <span className="font-medium">{financial_health.investment_diversity_score}/20</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">{tFinancialHealth('components.goalsProgress')}</span>
              <span className="font-medium">{financial_health.goals_progress_score}/20</span>
            </div>
          </div>
        </Card>
        )}
      </div>
      )}

      {/* Cash Flow Stats */}
      {(isWidgetVisible('income-vs-expenses') || isWidgetVisible('upcoming-bills') || isWidgetVisible('taxes') || isWidgetVisible('debts-owed') || isWidgetVisible('monthly-spending')) && (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-6">
        {isWidgetVisible('income-vs-expenses') && (
        <Card className="p-4 md:p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="p-1.5 md:p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
                <TrendingUpIcon className="h-4 w-4 md:h-5 md:w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400">{tCashFlow('income.label')}</p>
                <p className="text-base md:text-xl font-bold">
                  <CurrencyDisplay
                    amount={parseFloat(cash_flow.monthly_income)}
                    currency={cash_flow.currency}
                    showSymbol={true}
                    showCode={false}


                  />
                </p>
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-gray-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-semibold mb-1">{tTooltips('income.heading')}</p>
                <p className="text-sm">{tTooltips('income.description')}</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-[10px] md:text-xs text-gray-500">{tCashFlow('income.period')}</p>
        </Card>
        )}

        {isWidgetVisible('income-vs-expenses') && (
        <Card className="p-4 md:p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="p-1.5 md:p-2 bg-red-100 dark:bg-red-900/20 rounded-lg">
                <CreditCard className="h-4 w-4 md:h-5 md:w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400">{tCashFlow('expenses.label')}</p>
                <p className="text-base md:text-xl font-bold">
                  <CurrencyDisplay
                    amount={parseFloat(cash_flow.monthly_expenses)}
                    currency={cash_flow.currency}
                    showSymbol={true}
                    showCode={false}


                  />
                </p>
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-gray-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-semibold mb-1">{tTooltips('expenses.heading')}</p>
                <p className="text-sm">{tTooltips('expenses.dateBased', { period: getPeriodLabel() })}</p>
                <p className="text-sm mt-1">{tTooltips('expenses.oneTime')}</p>
                <p className="text-sm">{tTooltips('expenses.recurring')}</p>
                <p className="text-xs text-gray-400 mt-2">{getPeriodDescription()}</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-[10px] md:text-xs text-gray-500">{getPeriodLabel()}</p>
        </Card>
        )}

        {isWidgetVisible('upcoming-bills') && (
        <Card className="p-4 md:p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="p-1.5 md:p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                <Calendar className="h-4 w-4 md:h-5 md:w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400">{tCashFlow('subscriptions.label')}</p>
                <p className="text-base md:text-xl font-bold">
                  <CurrencyDisplay
                    amount={parseFloat(cash_flow.monthly_subscriptions)}
                    currency={cash_flow.currency}
                    showSymbol={true}
                    showCode={false}


                  />
                </p>
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-gray-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-semibold mb-1">{tTooltips('subscriptions.heading')}</p>
                <p className="text-sm">{tTooltips('subscriptions.description')}</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-[10px] md:text-xs text-gray-500">{tCashFlow('subscriptions.period')}</p>
        </Card>
        )}

        {isWidgetVisible('upcoming-bills') && (
        <Card className="p-4 md:p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="p-1.5 md:p-2 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
                <CreditCard className="h-4 w-4 md:h-5 md:w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400">{tCashFlow('installments.label')}</p>
                <p className="text-base md:text-xl font-bold">
                  <CurrencyDisplay
                    amount={parseFloat(cash_flow.monthly_installments)}
                    currency={cash_flow.currency}
                    showSymbol={true}
                    showCode={false}


                  />
                </p>
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-gray-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-semibold mb-1">{tTooltips('installments.heading')}</p>
                <p className="text-sm">{tTooltips('installments.description')}</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-[10px] md:text-xs text-gray-500">{tCashFlow('installments.period')}</p>
        </Card>
        )}

        {isWidgetVisible('taxes') && (
        <Card className="p-4 md:p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="p-1.5 md:p-2 bg-amber-100 dark:bg-amber-900/20 rounded-lg">
                <FileText className="h-4 w-4 md:h-5 md:w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400">{tCashFlow('taxes.label')}</p>
                <p className="text-base md:text-xl font-bold">
                  <CurrencyDisplay
                    amount={parseFloat(cash_flow.monthly_taxes) || 0}
                    currency={cash_flow.currency}
                    showSymbol={true}
                    showCode={false}
                  />
                </p>
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-gray-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-semibold mb-1">{tTooltips('taxes.heading')}</p>
                <p className="text-sm">{tTooltips('taxes.description')}</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-[10px] md:text-xs text-gray-500">{taxStats?.active_taxes || 0} {tCashFlow('taxes.active')}</p>
        </Card>
        )}

        {isWidgetVisible('debts-owed') && (
        <Card className="p-4 md:p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="p-1.5 md:p-2 bg-teal-100 dark:bg-teal-900/20 rounded-lg">
                <UserMinus className="h-4 w-4 md:h-5 md:w-5 text-teal-600 dark:text-teal-400" />
              </div>
              <div>
                <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400">{tCashFlow('debtsOwed.label')}</p>
                <p className="text-base md:text-xl font-bold">
                  <CurrencyDisplay
                    amount={debtStats?.total_amount_owed || 0}
                    currency={debtStats?.currency || cash_flow.currency}
                    showSymbol={true}
                    showCode={false}
                  />
                </p>
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-gray-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-semibold mb-1">{tTooltips('debtsOwed.heading')}</p>
                <p className="text-sm">{tTooltips('debtsOwed.description')}</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-[10px] md:text-xs text-gray-500">{debtStats?.active_debts || 0} {tCashFlow('debtsOwed.active')}</p>
        </Card>
        )}

        {isWidgetVisible('monthly-spending') && (
        <Card className="p-4 md:p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="p-1.5 md:p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                <PiggyBank className="h-4 w-4 md:h-5 md:w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400">{tCashFlow('netCashFlow.label')}</p>
                <p className="text-base md:text-xl font-bold">
                  <CurrencyDisplay
                    amount={parseFloat(cash_flow.net_cash_flow)}
                    currency={cash_flow.currency}
                    showSymbol={true}
                    showCode={false}


                  />
                </p>
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-gray-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-semibold mb-1">{tTooltips('netCashFlow.heading')}</p>
                <p className="text-sm">{tTooltips('netCashFlow.formula')}</p>
                <p className="text-sm mt-2">{tTooltips('netCashFlow.expenses', { period: getPeriodLabel() })}</p>
                <p className="text-sm">{tTooltips('netCashFlow.others')}</p>
                <p className="text-sm mt-2">{tTooltips('netCashFlow.savingsRate')}</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-[10px] md:text-xs text-gray-500">
            {tCashFlow('netCashFlow.savingsRateLabel')}: {formatPercentage(cash_flow.savings_rate)}
          </p>
        </Card>
        )}
      </div>
      )}

      {/* Recent Activity */}
      {isWidgetVisible('recent-transactions') && (
      <Card className="p-4 md:p-6">
        <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">{tRecentActivity('title')}</h2>
        {recent_activity.length === 0 ? (
          <p className="text-center text-gray-500 py-8">
            {tRecentActivity('emptyState')}
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
                    {activity.is_positive ? '+' : '-'}
                    <CurrencyDisplay
                      amount={parseFloat(activity.amount)}
                      currency={activity.currency}
                      displayCurrency={preferences?.display_currency || preferences?.currency}
                      showSymbol={true}
                      showCode={false}
                      showConversionTooltip={true}
                    />
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      )}

      {/* Analytics Section */}
      <div className="space-y-4 md:space-y-6">
        {hasVisibleCharts() && (
          <div>
            <h2 className="text-xl md:text-2xl font-bold mb-1 md:mb-2">{tAnalytics('title')}</h2>
            <p className="text-sm md:text-base text-gray-600 dark:text-gray-400">
              {tAnalytics('description')}
            </p>
          </div>
        )}

        {/* Charts Grid */}
        {hasVisibleCharts() && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
          {/* 1. Income vs Expenses Chart - Hidden temporarily */}
          {/* <IncomeVsExpensesChart
            data={incomeVsExpensesData?.data || []}
            isLoading={isLoadingIncomeVsExpenses}
            chartType="area"
            currency={preferences?.display_currency || preferences?.currency || 'USD'}
          /> */}

          {/* 2. Monthly Spending Chart - Hidden temporarily */}
          {/* <MonthlySpendingChart
            data={monthlySpendingData?.data || []}
            isLoading={isLoadingMonthlySpending}
            showAverage={true}
            currency={preferences?.display_currency || preferences?.currency || 'USD'}
          /> */}

          {/* 3. Subscriptions by Category Chart */}
          {isWidgetVisible('subscriptions-by-category') && (
            <SubscriptionsByCategoryChart
              data={subscriptionsByCategoryData?.data || []}
              isLoading={isLoadingSubscriptionsByCategory}
              chartType="donut"
              currency={preferences?.display_currency || preferences?.currency || 'USD'}
            />
          )}

          {/* 4. Installments by Category Chart */}
          {isWidgetVisible('installments-by-category') && (
            <InstallmentsByCategoryChart
              data={installmentsByCategoryData?.data || []}
              isLoading={isLoadingInstallmentsByCategory}
              chartType="donut"
              currency={preferences?.display_currency || preferences?.currency || 'USD'}
            />
          )}

          {/* 5. Expenses by Category Chart */}
          {isWidgetVisible('expenses-by-category') && (
            <ExpensesByCategoryChart
              data={expensesByCategoryData?.data || []}
              isLoading={isLoadingExpensesByCategory}
              chartType="donut"
              currency={preferences?.display_currency || preferences?.currency || 'USD'}
            />
          )}

          {/* 6. Budgets by Category Chart */}
          {isWidgetVisible('budgets-by-category') && (
            <BudgetsByCategoryChart
              data={budgetsByCategoryData?.data || []}
              isLoading={isLoadingBudgetsByCategory}
              chartType="donut"
              currency={preferences?.display_currency || preferences?.currency || 'USD'}
            />
          )}

          {/* 7. Income Allocation Chart */}
          {isWidgetVisible('income-allocation') && (
            <IncomeBreakdownChart
              data={incomeBreakdownData?.data || []}
              totalIncome={incomeBreakdownData?.total_income || 0}
              isLoading={isLoadingIncomeBreakdown}
              currency={preferences?.display_currency || preferences?.currency || 'USD'}
            />
          )}

          {/* 8. Net Worth Trend Chart */}
          {isWidgetVisible('net-worth-trend') && (
            <NetWorthTrendChart
              data={netWorthTrendData?.data || []}
              currency={preferences?.display_currency || preferences?.currency || 'USD'}
              isLoading={isLoadingNetWorthTrend}
              chartType="area"
            />
          )}
        </div>
        )}

        {/* Exchange Rates Widget */}
        {isWidgetVisible('exchange-rates') && <ExchangeRatesWidget />}
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
      <BudgetForm
        open={isBudgetFormOpen}
        onClose={() => setIsBudgetFormOpen(false)}
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
