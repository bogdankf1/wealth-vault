/**
 * Dashboard Overview Page - Aggregates all financial data
 */
'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  useGetDashboardOverviewQuery,
  useGetSubscriptionsByCategoryChartQuery,
  useGetInstallmentsByCategoryChartQuery,
  useGetExpensesByCategoryChartQuery,
  useGetBudgetsByCategoryChartQuery,
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
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  PiggyBank,
  CreditCard,
  TrendingUpIcon,
  Calendar,
  Plus,
  Minus,
  AlertTriangle,
  AlertCircle,
  ArrowRight,
  UserMinus,
  FileText,
  Landmark,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { IncomeSourceForm } from '@/components/income/income-source-form';
import { ExpenseForm } from '@/components/expenses/expense-form';
import { SubscriptionForm } from '@/components/subscriptions/subscription-form';
import { InstallmentForm } from '@/components/installments/installment-form';
import { SavingsAccountForm } from '@/components/savings/savings-account-form';
import { AIInsightsWidget } from '@/components/dashboard/ai-insights-widget';
import { BudgetOverviewWidget } from '@/components/dashboard/budget-overview-widget';
import { GoalsOverviewWidget } from '@/components/dashboard/goals-overview-widget';
import { PlannedSubscriptionsWidget } from '@/components/dashboard/planned-subscriptions-widget';
import { PlannedExpensesWidget } from '@/components/dashboard/planned-expenses-widget';
import { PlannedInstallmentsWidget } from '@/components/dashboard/planned-installments-widget';
import { MonthFilter } from '@/components/ui/month-filter';
import { SubscriptionsByCategoryChart } from '@/components/dashboard/subscriptions-by-category-chart';
import { InstallmentsByCategoryChart } from '@/components/dashboard/installments-by-category-chart';
import { ExpensesByCategoryChart } from '@/components/dashboard/expenses-by-category-chart';
import { BudgetsByCategoryChart } from '@/components/dashboard/budgets-by-category-chart';
import { NetWorthTrendChart } from '@/components/dashboard/net-worth-trend-chart';
import { IncomeBreakdownChart } from '@/components/dashboard/income-breakdown-chart';
import { ExchangeRatesWidget } from '@/components/dashboard/exchange-rates-widget';
import { useGetCurrentUserQuery } from '@/lib/api/authApi';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { useGetMyPreferencesQuery } from '@/lib/api/preferencesApi';
import { useGetDebtStatsQuery } from '@/lib/api/debtsApi';
import { useGetActiveLayoutQuery } from '@/lib/api/dashboardLayoutsApi';
import { QuickLayoutSwitcher } from '@/components/dashboard/quick-layout-switcher';
import { useGetUserFeaturesQuery } from '@/lib/api/authApi';
import { WIDGET_FEATURES } from '@/lib/constants/feature-map';

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const tQuickActions = useTranslations('dashboard.quickActions');
  const tNetWorth = useTranslations('dashboard.netWorth');
  const tCashFlow = useTranslations('dashboard.cashFlow');
  const tAnalytics = useTranslations('dashboard.analytics');
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
  const [isAccountFormOpen, setIsAccountFormOpen] = useState(false);
  const [isIncomeFormOpen, setIsIncomeFormOpen] = useState(false);
  const [isExpenseFormOpen, setIsExpenseFormOpen] = useState(false);
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
  const { data: subscriptionsByCategoryData, isLoading: isLoadingSubscriptionsByCategory } =
    useGetSubscriptionsByCategoryChartQuery(dateParams);

  const { data: installmentsByCategoryData, isLoading: isLoadingInstallmentsByCategory } =
    useGetInstallmentsByCategoryChartQuery(dateParams);

  const { data: expensesByCategoryData, isLoading: isLoadingExpensesByCategory } =
    useGetExpensesByCategoryChartQuery(dateParams);

  const { data: budgetsByCategoryData, isLoading: isLoadingBudgetsByCategory } =
    useGetBudgetsByCategoryChartQuery(dateParams);

  const { data: netWorthTrendData, isLoading: isLoadingNetWorthTrend } =
    useGetNetWorthTrendChartQuery(dateParams);

  const { data: incomeBreakdownData, isLoading: isLoadingIncomeBreakdown } =
    useGetIncomeBreakdownChartQuery(dateParams);

  // Only fetch debt stats for Wealth tier users
  const isWealthTier = currentUser?.tier?.name === 'wealth';
  const { data: debtStats } = useGetDebtStatsQuery(undefined, { skip: !isWealthTier });

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

  const { net_worth, cash_flow } = data;

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
          <div className="hidden">
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

      {/* Cash Flow Stats - Compact (moved to top for quick overview) */}
      {(isWidgetVisible('income-vs-expenses') || isWidgetVisible('upcoming-bills') || isWidgetVisible('taxes') || isWidgetVisible('debts-owed') || isWidgetVisible('monthly-spending')) && (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-2">
        {isWidgetVisible('income-vs-expenses') && (
        <Card className="p-2.5 xl:p-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1 bg-green-100 dark:bg-green-900/20 rounded">
              <TrendingUpIcon className="h-3.5 w-3.5 xl:h-4 xl:w-4 text-green-600 dark:text-green-400" />
            </div>
            <p className="text-[10px] xl:text-xs text-gray-500 dark:text-gray-400">{tCashFlow('income.label')}</p>
          </div>
          <p className="text-sm xl:text-base font-bold">
            <CurrencyDisplay amount={parseFloat(cash_flow.monthly_income)} currency={cash_flow.currency} showSymbol={true} showCode={false} />
          </p>
        </Card>
        )}

        {isWidgetVisible('income-vs-expenses') && (
        <Card className="p-2.5 xl:p-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1 bg-red-100 dark:bg-red-900/20 rounded">
              <CreditCard className="h-3.5 w-3.5 xl:h-4 xl:w-4 text-red-600 dark:text-red-400" />
            </div>
            <p className="text-[10px] xl:text-xs text-gray-500 dark:text-gray-400">{tCashFlow('expenses.label')}</p>
          </div>
          <p className="text-sm xl:text-base font-bold">
            <CurrencyDisplay amount={parseFloat(cash_flow.monthly_expenses)} currency={cash_flow.currency} showSymbol={true} showCode={false} />
          </p>
        </Card>
        )}

        {isWidgetVisible('upcoming-bills') && (
        <Card className="p-2.5 xl:p-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1 bg-purple-100 dark:bg-purple-900/20 rounded">
              <Calendar className="h-3.5 w-3.5 xl:h-4 xl:w-4 text-purple-600 dark:text-purple-400" />
            </div>
            <p className="text-[10px] xl:text-xs text-gray-500 dark:text-gray-400">{tCashFlow('subscriptions.label')}</p>
          </div>
          <p className="text-sm xl:text-base font-bold">
            <CurrencyDisplay amount={parseFloat(cash_flow.monthly_subscriptions)} currency={cash_flow.currency} showSymbol={true} showCode={false} />
          </p>
        </Card>
        )}

        {isWidgetVisible('upcoming-bills') && (
        <Card className="p-2.5 xl:p-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1 bg-orange-100 dark:bg-orange-900/20 rounded">
              <CreditCard className="h-3.5 w-3.5 xl:h-4 xl:w-4 text-orange-600 dark:text-orange-400" />
            </div>
            <p className="text-[10px] xl:text-xs text-gray-500 dark:text-gray-400">{tCashFlow('installments.label')}</p>
          </div>
          <p className="text-sm xl:text-base font-bold">
            <CurrencyDisplay amount={parseFloat(cash_flow.monthly_installments)} currency={cash_flow.currency} showSymbol={true} showCode={false} />
          </p>
        </Card>
        )}

        {isWidgetVisible('taxes') && (
        <Card className="p-2.5 xl:p-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1 bg-amber-100 dark:bg-amber-900/20 rounded">
              <FileText className="h-3.5 w-3.5 xl:h-4 xl:w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <p className="text-[10px] xl:text-xs text-gray-500 dark:text-gray-400">{tCashFlow('taxes.label')}</p>
          </div>
          <p className="text-sm xl:text-base font-bold">
            <CurrencyDisplay amount={parseFloat(cash_flow.monthly_taxes) || 0} currency={cash_flow.currency} showSymbol={true} showCode={false} />
          </p>
        </Card>
        )}

        {isWidgetVisible('debts-owed') && (
        <Card className="p-2.5 xl:p-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1 bg-teal-100 dark:bg-teal-900/20 rounded">
              <UserMinus className="h-3.5 w-3.5 xl:h-4 xl:w-4 text-teal-600 dark:text-teal-400" />
            </div>
            <p className="text-[10px] xl:text-xs text-gray-500 dark:text-gray-400">{tCashFlow('debtsOwed.label')}</p>
          </div>
          <p className="text-sm xl:text-base font-bold">
            <CurrencyDisplay amount={debtStats?.total_amount_owed || 0} currency={debtStats?.currency || cash_flow.currency} showSymbol={true} showCode={false} />
          </p>
        </Card>
        )}

        {isWidgetVisible('monthly-spending') && (
        <Card className="p-2.5 xl:p-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1 bg-blue-100 dark:bg-blue-900/20 rounded">
              <PiggyBank className="h-3.5 w-3.5 xl:h-4 xl:w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-[10px] xl:text-xs text-gray-500 dark:text-gray-400">{tCashFlow('netCashFlow.label')}</p>
          </div>
          <p className="text-sm xl:text-base font-bold">
            <CurrencyDisplay amount={parseFloat(cash_flow.net_cash_flow)} currency={cash_flow.currency} showSymbol={true} showCode={false} />
          </p>
        </Card>
        )}
      </div>
      )}

        {/* Quick Actions & Alerts - Side by Side */}
        {(isWidgetVisible('quick-actions') || (isWidgetVisible('ai-insights') && data.alerts && data.alerts.length > 0)) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {/* Quick Actions - Compact */}
            {isWidgetVisible('quick-actions') && (
              <Card className="p-3 md:p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">{tQuickActions('title')}</h2>
                </div>
                <div className="grid grid-cols-3 lg:grid-cols-5 gap-1.5 md:gap-2">
                  <Button
                    onClick={() => setIsAccountFormOpen(true)}
                    className="h-auto py-2 md:py-2.5 px-1 md:px-2 flex flex-col items-center gap-1 md:gap-1.5"
                    variant="outline"
                  >
                    <Landmark className="h-4 w-4 md:h-5 md:w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                    <span className="text-[10px] lg:text-xs font-medium text-center">{tQuickActions('addAccount.label')}</span>
                  </Button>
                  <Button
                    onClick={() => setIsIncomeFormOpen(true)}
                    className="h-auto py-2 md:py-2.5 px-1 md:px-2 flex flex-col items-center gap-1 md:gap-1.5"
                    variant="outline"
                  >
                    <Plus className="h-4 w-4 md:h-5 md:w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                    <span className="text-[10px] lg:text-xs font-medium text-center">{tQuickActions('addIncome.label')}</span>
                  </Button>
                  <Button
                    onClick={() => setIsExpenseFormOpen(true)}
                    className="h-auto py-2 md:py-2.5 px-1 md:px-2 flex flex-col items-center gap-1 md:gap-1.5"
                    variant="outline"
                  >
                    <Minus className="h-4 w-4 md:h-5 md:w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                    <span className="text-[10px] lg:text-xs font-medium text-center">{tQuickActions('addExpense.label')}</span>
                  </Button>
                  <Button
                    onClick={() => setIsSubscriptionFormOpen(true)}
                    className="h-auto py-2 md:py-2.5 px-1 md:px-2 flex flex-col items-center gap-1 md:gap-1.5"
                    variant="outline"
                  >
                    <Calendar className="h-4 w-4 md:h-5 md:w-5 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                    <span className="text-[10px] lg:text-xs font-medium text-center">{tQuickActions('subscription.label')}</span>
                  </Button>
                  <Button
                    onClick={() => setIsInstallmentFormOpen(true)}
                    className="h-auto py-2 md:py-2.5 px-1 md:px-2 flex flex-col items-center gap-1 md:gap-1.5"
                    variant="outline"
                  >
                    <CreditCard className="h-4 w-4 md:h-5 md:w-5 text-orange-600 dark:text-orange-400 flex-shrink-0" />
                    <span className="text-[10px] lg:text-xs font-medium text-center">{tQuickActions('installment.label')}</span>
                  </Button>
                </div>
              </Card>
            )}

            {/* Financial Alerts - Compact */}
            {isWidgetVisible('ai-insights') && data.alerts && data.alerts.length > 0 && (
              <Card className="p-3 md:p-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold">{t('insightsAlerts.title')}</h2>
                  <span className="text-xs text-muted-foreground">{data.alerts.length}</span>
                </div>
                <div className="space-y-2">
                  {data.alerts.slice(0, 3).map((alert) => {
                    const style = getAlertStyle(alert.type);
                    return (
                      <div
                        key={alert.id}
                        className={`p-2 rounded-md border ${style.bg} flex items-center gap-2`}
                      >
                        <div className="flex-shrink-0 [&>svg]:h-3 [&>svg]:w-3">
                          {style.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium ${style.textColor} line-clamp-1`}>
                            {alert.title}
                          </p>
                        </div>
                        {alert.actionable && alert.action_url && (
                          <Link href={alert.action_url}>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* AI Insights & Budget Overview - Dynamic filling grid */}
        {(isWidgetVisible('ai-insights') || isWidgetVisible('budget-overview')) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 [&>*:only-child]:md:col-span-1">
            {/* AI Insights Widget - Only for Wealth tier */}
            {isWidgetVisible('ai-insights') && currentUser?.tier?.name === 'wealth' && <AIInsightsWidget />}

            {/* Budget Overview Widget */}
            {isWidgetVisible('budget-overview') && <BudgetOverviewWidget />}
          </div>
        )}

        {/* Goals Overview & Net Worth - Dynamic filling grid */}
        {(isWidgetVisible('goals-progress') || isWidgetVisible('net-worth')) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 [&>*:only-child]:md:col-span-1">
            {/* Goals Overview Widget */}
            {isWidgetVisible('goals-progress') && <GoalsOverviewWidget />}

            {/* Net Worth Card */}
            {isWidgetVisible('net-worth') && (
              <Card className="p-4 md:p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-gray-500" />
                    <h2 className="text-sm md:text-base font-semibold">{tNetWorth('title')}</h2>
                  </div>
                  <p className="text-xl md:text-2xl font-bold">
                    <CurrencyDisplay
                      amount={parseFloat(net_worth.net_worth)}
                      currency={net_worth.currency}
                      showSymbol={true}
                      showCode={false}
                    />
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                  <div>
                    <div className="flex items-center gap-1 text-green-600 dark:text-green-400 mb-1">
                      <ArrowUpRight className="h-3 w-3" />
                      <span className="text-xs font-medium">{tNetWorth('assets.label')}</span>
                    </div>
                    <p className="text-base md:text-lg font-semibold">
                      <CurrencyDisplay
                        amount={parseFloat(net_worth.total_assets)}
                        currency={net_worth.currency}
                        showSymbol={true}
                        showCode={false}
                      />
                    </p>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 space-y-0.5">
                      <div className="flex justify-between">
                        <span>{tNetWorth('assets.portfolio')}:</span>
                        <CurrencyDisplay
                          amount={parseFloat(net_worth.portfolio_value)}
                          currency={net_worth.currency}
                          showSymbol={true}
                          showCode={false}
                        />
                      </div>
                      <div className="flex justify-between">
                        <span>{tNetWorth('assets.accounts')}:</span>
                        <CurrencyDisplay
                          amount={parseFloat(net_worth.savings_balance)}
                          currency={net_worth.currency}
                          showSymbol={true}
                          showCode={false}
                        />
                      </div>
                      {parseFloat(net_worth.debts_receivable) > 0 && (
                        <div className="flex justify-between">
                          <span>{tNetWorth('assets.debtsReceivable')}:</span>
                          <CurrencyDisplay
                            amount={parseFloat(net_worth.debts_receivable)}
                            currency={net_worth.currency}
                            showSymbol={true}
                            showCode={false}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-red-600 dark:text-red-400 mb-1">
                      <ArrowDownRight className="h-3 w-3" />
                      <span className="text-xs font-medium">{tNetWorth('liabilities.label')}</span>
                    </div>
                    <p className="text-base md:text-lg font-semibold">
                      <CurrencyDisplay
                        amount={parseFloat(net_worth.total_liabilities)}
                        currency={net_worth.currency}
                        showSymbol={true}
                        showCode={false}
                      />
                    </p>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      <div className="flex justify-between">
                        <span>{tNetWorth('liabilities.debt')}:</span>
                        <CurrencyDisplay
                          amount={parseFloat(net_worth.total_debt)}
                          currency={net_worth.currency}
                          showSymbol={true}
                          showCode={false}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Planned Payments Widgets - Dynamic filling */}
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {/* 1. Subscriptions by Category Chart */}
          {isWidgetVisible('subscriptions-by-category') && (
            <SubscriptionsByCategoryChart
              data={subscriptionsByCategoryData?.data || []}
              isLoading={isLoadingSubscriptionsByCategory}
              chartType="donut"
              currency={preferences?.display_currency || preferences?.currency || 'USD'}
            />
          )}

          {/* 2. Installments by Category Chart */}
          {isWidgetVisible('installments-by-category') && (
            <InstallmentsByCategoryChart
              data={installmentsByCategoryData?.data || []}
              isLoading={isLoadingInstallmentsByCategory}
              chartType="donut"
              currency={preferences?.display_currency || preferences?.currency || 'USD'}
            />
          )}

          {/* 3. Expenses by Category Chart */}
          {isWidgetVisible('expenses-by-category') && (
            <ExpensesByCategoryChart
              data={expensesByCategoryData?.data || []}
              isLoading={isLoadingExpensesByCategory}
              chartType="donut"
              currency={preferences?.display_currency || preferences?.currency || 'USD'}
            />
          )}

          {/* 4. Budgets by Category Chart */}
          {isWidgetVisible('budgets-by-category') && (
            <BudgetsByCategoryChart
              data={budgetsByCategoryData?.data || []}
              isLoading={isLoadingBudgetsByCategory}
              chartType="donut"
              currency={preferences?.display_currency || preferences?.currency || 'USD'}
            />
          )}

          {/* 5. Income Allocation Chart */}
          {isWidgetVisible('income-allocation') && (
            <IncomeBreakdownChart
              data={incomeBreakdownData?.data || []}
              totalIncome={incomeBreakdownData?.total_income || 0}
              isLoading={isLoadingIncomeBreakdown}
              currency={preferences?.display_currency || preferences?.currency || 'USD'}
            />
          )}

          {/* 6. Net Worth Trend Chart */}
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
      <SavingsAccountForm
        isOpen={isAccountFormOpen}
        onClose={() => setIsAccountFormOpen(false)}
        accountId={null}
      />
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
      </div>
    </TooltipProvider>
  );
}

function DashboardSkeleton() {
  return (
    <div className="container mx-auto space-y-4 md:space-y-6 p-4 md:p-6">
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Skeleton className="h-8 md:h-9 w-40 md:w-48" />
          <Skeleton className="h-4 md:h-5 w-52 md:w-64 mt-1 md:mt-2" />
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Skeleton className="h-10 w-full sm:w-32" />
          <Skeleton className="h-10 w-full sm:w-40" />
        </div>
      </div>

      {/* Quick actions skeleton */}
      <Skeleton className="h-32 md:h-40" />

      {/* Top stats grid skeleton - matches xl:grid-cols-3 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
        <Skeleton className="h-56 md:h-64 col-span-1 md:col-span-2 xl:col-span-2" />
        <Skeleton className="h-56 md:h-64" />
      </div>

      {/* Cash flow stats skeleton - matches grid-cols-2 xl:grid-cols-3 */}
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-2 md:gap-6">
        <Skeleton className="h-20 md:h-28" />
        <Skeleton className="h-20 md:h-28" />
        <Skeleton className="h-20 md:h-28" />
        <Skeleton className="h-20 md:h-28" />
        <Skeleton className="h-20 md:h-28" />
        <Skeleton className="h-20 md:h-28" />
      </div>

      {/* Recent activity skeleton */}
      <Skeleton className="h-72 md:h-96" />
    </div>
  );
}
