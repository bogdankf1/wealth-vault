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
  total_debt: string;
  currency: string;
}

export interface CashFlowResponse {
  monthly_income: string;
  monthly_expenses: string;
  monthly_subscriptions: string;
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

export interface AnalyticsParams {
  start_date: string;
  end_date: string;
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

// API endpoints
export const dashboardApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getDashboardOverview: builder.query<DashboardOverviewResponse, void>({
      query: () => '/api/v1/dashboard/overview',
      providesTags: ['Dashboard'],
    }),

    getNetWorth: builder.query<NetWorthResponse, void>({
      query: () => '/api/v1/dashboard/net-worth',
      providesTags: ['Dashboard'],
    }),

    getCashFlow: builder.query<CashFlowResponse, { month?: number; year?: number } | void>({
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

    getExpenseByCategoryChart: builder.query<ExpenseByCategoryChartResponse, AnalyticsParams>({
      query: (params) => ({
        url: '/api/v1/dashboard/analytics/expense-by-category',
        params,
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
  useGetExpenseByCategoryChartQuery,
  useGetMonthlySpendingChartQuery,
  useGetNetWorthTrendChartQuery,
} = dashboardApi;
