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
  }),
});

export const {
  useGetDashboardOverviewQuery,
  useGetNetWorthQuery,
  useGetCashFlowQuery,
  useGetFinancialHealthQuery,
  useGetRecentActivityQuery,
  useGetUpcomingPaymentsQuery,
} = dashboardApi;
