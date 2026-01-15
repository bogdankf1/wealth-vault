/**
 * Dashboard API integration using RTK Query
 */
import { apiSlice } from './apiSlice';

// Types
export interface NetWorthResponse {
  total_assets: string;
  total_liabilities: string;
  net_worth: string;
  portfolio_value: string;
  savings_balance: string;
  debts_receivable: string;  // Debts owed TO user (assets)
  total_debt: string;
  currency: string;
  assets_breakdown?: {
    savings: Record<string, number>;
    portfolio: Record<string, number>;
    debts_receivable: Record<string, number>;
  };
  liabilities_breakdown?: {
    installments: Record<string, number>;
  };
}

export interface CashFlowResponse {
  monthly_income: string;
  monthly_expenses: string;
  monthly_subscriptions: string;
  monthly_installments: string;
  monthly_taxes: string;
  net_cash_flow: string;
  savings_rate: string;
  currency: string;
  month: number;
  year: number;
}

export interface FinancialHealthBreakdown {
  emergency_fund: {
    current_savings: number;
    target_fund: number;
    months_covered: number;
  };
  debt_to_income: {
    ratio: number;
    total_debt: number;
    monthly_income: number;
  };
  savings_rate: {
    rate: number;
    monthly_savings: number;
  };
  investment_diversity: {
    unique_asset_types: number;
    portfolio_value: number;
  };
  goals_progress: {
    average_progress: number;
  };
}

export interface FinancialHealthResponse {
  score: number;
  emergency_fund_score: number;
  debt_to_income_score: number;
  savings_rate_score: number;
  investment_diversity_score: number;
  goals_progress_score: number;
  breakdown: FinancialHealthBreakdown;
  rating: string;
}

export interface RecentActivityItem {
  id: string;
  module: string;
  type: string;
  name: string;
  amount: string;
  currency: string;
  date: string;
  icon: string;
  is_positive: boolean;
}

export interface UpcomingPayment {
  id: string;
  module: string;
  name: string;
  amount: string;
  currency: string;
  due_date: string;
  days_until_due: number;
  is_overdue: boolean;
}

export interface FinancialAlert {
  id: string;
  type: 'warning' | 'info' | 'success' | 'danger';
  category: string;
  title: string;
  message: string;
  priority: number;
  actionable: boolean;
  action_url?: string;
}

export interface DashboardOverviewResponse {
  net_worth: NetWorthResponse;
  cash_flow: CashFlowResponse;
  financial_health: FinancialHealthResponse;
  recent_activity: RecentActivityItem[];
  upcoming_payments: UpcomingPayment[];
  alerts: FinancialAlert[];
}

// Analytics types
export interface IncomeVsExpensesDataPoint {
  month: string;
  income: number;
  expenses: number;
}

export interface IncomeVsExpensesChartResponse {
  data: IncomeVsExpensesDataPoint[];
}

export interface ExpenseByCategoryDataPoint {
  category: string;
  amount: number;
  percentage: number;
  [key: string]: string | number; // Index signature for Recharts compatibility
}

export interface ExpenseByCategoryChartResponse {
  data: ExpenseByCategoryDataPoint[];
  total: number;
}

export interface MonthlySpendingDataPoint {
  month: string;
  amount: number;
}

export interface MonthlySpendingChartResponse {
  data: MonthlySpendingDataPoint[];
  average: number;
  total: number;
}

export interface NetWorthTrendDataPoint {
  month: string;
  netWorth: number;
  assets: number;
  liabilities: number;
}

export interface NetWorthTrendChartResponse {
  data: NetWorthTrendDataPoint[];
}

export interface IncomeBreakdownDataPoint {
  category: string;
  amount: number;
  percentage: number;
  [key: string]: string | number; // Index signature for Recharts compatibility
}

export interface IncomeBreakdownChartResponse {
  data: IncomeBreakdownDataPoint[];
  total_income: number;
  currency: string;
}

export interface AnalyticsParams {
  start_date: string;
  end_date: string;
}

export interface DateRangeParams {
  start_date?: string;
  end_date?: string;
  month?: number;
  year?: number;
}

// API response types for transformResponse
interface IncomeVsExpensesApiResponse {
  data: Array<{
    month: string;
    income: string;
    expenses: string;
  }>;
}

interface ExpenseByCategoryApiResponse {
  data: Array<{
    category: string;
    amount: string;
    percentage: string;
  }>;
  total: string;
}

interface MonthlySpendingApiResponse {
  data: Array<{
    month: string;
    amount: string;
  }>;
  average: string;
  total: string;
}

interface NetWorthTrendApiResponse {
  data: Array<{
    month: string;
    net_worth: string;
    assets: string;
    liabilities: string;
  }>;
}

interface IncomeBreakdownApiResponse {
  data: Array<{
    category: string;
    amount: string;
    percentage: string;
  }>;
  total_income: string;
  currency: string;
}

// Snapshot types
export interface NetWorthSnapshot {
  id: string;
  snapshot_date: string;
  snapshot_type: string;
  total_assets: string;
  savings_total: string;
  portfolio_total: string;
  debts_receivable_total: string;
  total_liabilities: string;
  installments_total: string;
  net_worth: string;
  change_from_previous?: string;
  percentage_change?: string;
  assets_breakdown?: {
    savings: Record<string, number>;
    portfolio: Record<string, number>;
    debts_receivable: Record<string, number>;
  };
  liabilities_breakdown?: {
    installments: Record<string, number>;
  };
  currency: string;
  created_at: string;
}

export interface NetWorthSnapshotListResponse {
  items: NetWorthSnapshot[];
  total: number;
}

// Projection types
export interface FinancialProjections {
  current_net_worth: string;
  current_monthly_savings: string;
  current_savings_rate: string;
  projected_net_worth_1_year: string;
  projected_net_worth_3_years: string;
  projected_net_worth_5_years: string;
  projected_net_worth_10_years: string;
  assumed_annual_return: string;
  assumed_monthly_savings: string;
  currency: string;
}

export interface GoalProjection {
  goal_id: string;
  goal_name: string;
  target_amount: string;
  current_amount: string;
  progress_percentage: string;
  monthly_contribution: string;
  projected_completion_date?: string;
  months_to_completion?: number;
  on_track: boolean;
}

export interface GoalProjectionsResponse {
  goals: GoalProjection[];
  total_goal_targets: string;
  total_current_progress: string;
  overall_progress_percentage: string;
}

export interface SnapshotParams {
  start_date: string;
  end_date: string;
  snapshot_type?: string;
}

// API endpoints
export const dashboardApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getDashboardOverview: builder.query<DashboardOverviewResponse, DateRangeParams | void>({
      query: (params) => ({
        url: '/api/v1/dashboard/overview',
        params: params || undefined,
      }),
      providesTags: ['Dashboard'],
    }),

    getNetWorth: builder.query<NetWorthResponse, void>({
      query: () => '/api/v1/dashboard/net-worth',
      providesTags: ['Dashboard'],
    }),

    getCashFlow: builder.query<CashFlowResponse, DateRangeParams | void>({
      query: (params) => ({
        url: '/api/v1/dashboard/cash-flow',
        params: params || undefined,
      }),
      providesTags: ['Dashboard'],
    }),

    getFinancialHealth: builder.query<FinancialHealthResponse, void>({
      query: () => '/api/v1/dashboard/financial-health',
      providesTags: ['Dashboard'],
    }),

    getRecentActivity: builder.query<RecentActivityItem[], { limit?: number } | void>({
      query: (params) => ({
        url: '/api/v1/dashboard/recent-activity',
        params: params || undefined,
      }),
      providesTags: ['Dashboard'],
    }),

    getUpcomingPayments: builder.query<UpcomingPayment[], { days?: number } | void>({
      query: (params) => ({
        url: '/api/v1/dashboard/upcoming-payments',
        params: params || undefined,
      }),
      providesTags: ['Dashboard'],
    }),

    // Analytics endpoints
    getIncomeVsExpensesChart: builder.query<IncomeVsExpensesChartResponse, AnalyticsParams>({
      query: (params) => ({
        url: '/api/v1/dashboard/analytics/income-vs-expenses',
        params,
      }),
      transformResponse: (response: IncomeVsExpensesApiResponse) => ({
        data: response.data.map((item) => ({
          month: item.month,
          income: parseFloat(item.income),
          expenses: parseFloat(item.expenses),
        })),
      }),
      providesTags: ['Dashboard', 'Analytics'],
    }),

    getSubscriptionsByCategoryChart: builder.query<ExpenseByCategoryChartResponse, AnalyticsParams | void>({
      query: (params) => ({
        url: '/api/v1/dashboard/analytics/subscriptions-by-category',
        params: params || undefined,
      }),
      transformResponse: (response: ExpenseByCategoryApiResponse) => ({
        data: response.data.map((item) => ({
          category: item.category,
          amount: parseFloat(item.amount),
          percentage: parseFloat(item.percentage),
        })),
        total: parseFloat(response.total),
      }),
      providesTags: ['Dashboard', 'Analytics'],
    }),

    getInstallmentsByCategoryChart: builder.query<ExpenseByCategoryChartResponse, AnalyticsParams | void>({
      query: (params) => ({
        url: '/api/v1/dashboard/analytics/installments-by-category',
        params: params || undefined,
      }),
      transformResponse: (response: ExpenseByCategoryApiResponse) => ({
        data: response.data.map((item) => ({
          category: item.category,
          amount: parseFloat(item.amount),
          percentage: parseFloat(item.percentage),
        })),
        total: parseFloat(response.total),
      }),
      providesTags: ['Dashboard', 'Analytics'],
    }),

    getExpensesByCategoryChart: builder.query<ExpenseByCategoryChartResponse, AnalyticsParams | void>({
      query: (params) => ({
        url: '/api/v1/dashboard/analytics/expenses-by-category',
        params: params || undefined,
      }),
      transformResponse: (response: ExpenseByCategoryApiResponse) => ({
        data: response.data.map((item) => ({
          category: item.category,
          amount: parseFloat(item.amount),
          percentage: parseFloat(item.percentage),
        })),
        total: parseFloat(response.total),
      }),
      providesTags: ['Dashboard', 'Analytics'],
    }),

    getBudgetsByCategoryChart: builder.query<ExpenseByCategoryChartResponse, AnalyticsParams | void>({
      query: (params) => ({
        url: '/api/v1/dashboard/analytics/budgets-by-category',
        params: params || undefined,
      }),
      transformResponse: (response: ExpenseByCategoryApiResponse) => ({
        data: response.data.map((item) => ({
          category: item.category,
          amount: parseFloat(item.amount),
          percentage: parseFloat(item.percentage),
        })),
        total: parseFloat(response.total),
      }),
      providesTags: ['Dashboard', 'Analytics'],
    }),

    getMonthlySpendingChart: builder.query<MonthlySpendingChartResponse, AnalyticsParams>({
      query: (params) => ({
        url: '/api/v1/dashboard/analytics/monthly-spending',
        params,
      }),
      transformResponse: (response: MonthlySpendingApiResponse) => ({
        data: response.data.map((item) => ({
          month: item.month,
          amount: parseFloat(item.amount),
        })),
        average: parseFloat(response.average),
        total: parseFloat(response.total),
      }),
      providesTags: ['Dashboard', 'Analytics'],
    }),

    getNetWorthTrendChart: builder.query<NetWorthTrendChartResponse, AnalyticsParams>({
      query: (params) => ({
        url: '/api/v1/dashboard/analytics/net-worth-trend',
        params,
      }),
      transformResponse: (response: NetWorthTrendApiResponse) => ({
        data: response.data.map((item) => ({
          month: item.month,
          netWorth: parseFloat(item.net_worth),
          assets: parseFloat(item.assets),
          liabilities: parseFloat(item.liabilities),
        })),
      }),
      providesTags: ['Dashboard', 'Analytics'],
    }),

    getIncomeBreakdownChart: builder.query<IncomeBreakdownChartResponse, AnalyticsParams | void>({
      query: (params) => ({
        url: '/api/v1/dashboard/analytics/income-breakdown',
        params: params || undefined,
      }),
      transformResponse: (response: IncomeBreakdownApiResponse) => ({
        data: response.data.map((item) => ({
          category: item.category,
          amount: parseFloat(item.amount),
          percentage: parseFloat(item.percentage),
        })),
        total_income: parseFloat(response.total_income),
        currency: response.currency,
      }),
      providesTags: ['Dashboard', 'Analytics'],
    }),

    // Snapshot endpoints
    getNetWorthSnapshots: builder.query<NetWorthSnapshotListResponse, SnapshotParams>({
      query: (params) => ({
        url: '/api/v1/dashboard/snapshots/net-worth',
        params,
      }),
      providesTags: ['Dashboard', 'Snapshots'],
    }),

    getLatestNetWorthSnapshot: builder.query<NetWorthSnapshot | null, void>({
      query: () => '/api/v1/dashboard/snapshots/net-worth/latest',
      providesTags: ['Dashboard', 'Snapshots'],
    }),

    createNetWorthSnapshot: builder.mutation<NetWorthSnapshot, { snapshot_type?: string } | void>({
      query: (body) => ({
        url: '/api/v1/dashboard/snapshots/net-worth',
        method: 'POST',
        body: body || { snapshot_type: 'manual' },
      }),
      invalidatesTags: ['Dashboard', 'Snapshots'],
    }),

    backfillNetWorthSnapshots: builder.mutation<NetWorthSnapshotListResponse, { months?: number } | void>({
      query: (params) => ({
        url: '/api/v1/dashboard/snapshots/net-worth/backfill',
        method: 'POST',
        params: params || { months: 6 },
      }),
      invalidatesTags: ['Dashboard', 'Snapshots'],
    }),

    // Projection endpoints
    getNetWorthProjections: builder.query<FinancialProjections, { annual_return_rate?: number } | void>({
      query: (params) => ({
        url: '/api/v1/dashboard/projections/net-worth',
        params: params || undefined,
      }),
      providesTags: ['Dashboard', 'Projections'],
    }),

    getGoalProjections: builder.query<GoalProjectionsResponse, void>({
      query: () => '/api/v1/dashboard/projections/goals',
      providesTags: ['Dashboard', 'Projections', 'Goal'],
    }),

    // Net worth breakdown (detailed)
    getNetWorthBreakdown: builder.query<{
      total_assets: string;
      savings_total: string;
      portfolio_total: string;
      debts_receivable_total: string;
      total_liabilities: string;
      installments_total: string;
      net_worth: string;
      assets_breakdown: {
        savings: Record<string, number>;
        portfolio: Record<string, number>;
        debts_receivable: Record<string, number>;
      };
      liabilities_breakdown: {
        installments: Record<string, number>;
      };
      currency: string;
    }, void>({
      query: () => '/api/v1/dashboard/net-worth/breakdown',
      providesTags: ['Dashboard'],
    }),
  }),
});

export const {
  useGetDashboardOverviewQuery,
  useGetNetWorthQuery,
  useGetCashFlowQuery,
  useGetFinancialHealthQuery,
  useGetRecentActivityQuery,
  useGetUpcomingPaymentsQuery,
  useGetIncomeVsExpensesChartQuery,
  useGetSubscriptionsByCategoryChartQuery,
  useGetInstallmentsByCategoryChartQuery,
  useGetExpensesByCategoryChartQuery,
  useGetBudgetsByCategoryChartQuery,
  useGetMonthlySpendingChartQuery,
  useGetNetWorthTrendChartQuery,
  useGetIncomeBreakdownChartQuery,
  // Snapshot hooks
  useGetNetWorthSnapshotsQuery,
  useGetLatestNetWorthSnapshotQuery,
  useCreateNetWorthSnapshotMutation,
  useBackfillNetWorthSnapshotsMutation,
  // Projection hooks
  useGetNetWorthProjectionsQuery,
  useGetGoalProjectionsQuery,
  // Net worth breakdown
  useGetNetWorthBreakdownQuery,
} = dashboardApi;
