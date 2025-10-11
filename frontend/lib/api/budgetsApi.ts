/**
 * RTK Query API for budgets module
 */
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { getSession } from 'next-auth/react';

const baseQuery = fetchBaseQuery({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  prepareHeaders: async (headers) => {
    const session = await getSession();
    if (session?.accessToken) {
      headers.set('Authorization', `Bearer ${session.accessToken}`);
    }
    return headers;
  },
});

export interface Budget {
  id: string;
  user_id: string;
  name: string;
  category: string;
  description?: string;
  amount: number;
  currency: string;
  period: 'monthly' | 'quarterly' | 'yearly';
  start_date: string;
  end_date?: string;
  is_active: boolean;
  rollover_unused: boolean;
  alert_threshold: number;
  created_at: string;
  updated_at: string;
  // Calculated fields
  spent?: number;
  remaining?: number;
  percentage_used?: number;
  is_overspent?: boolean;
  should_alert?: boolean;
}

export interface BudgetWithProgress {
  budget: Budget;
  spent: number;
  remaining: number;
  percentage_used: number;
  is_overspent: boolean;
  should_alert: boolean;
  days_remaining?: number;
}

export interface BudgetStats {
  total_budgets: number;
  active_budgets: number;
  total_budgeted: number;
  total_spent: number;
  total_remaining: number;
  overall_percentage_used: number;
  budgets_overspent: number;
  budgets_near_limit: number;
  currency: string;
}

export interface BudgetSummaryByCategory {
  category: string;
  budgeted: number;
  spent: number;
  remaining: number;
  percentage_used: number;
  is_overspent: boolean;
}

export interface BudgetOverview {
  stats: BudgetStats;
  by_category: BudgetSummaryByCategory[];
  alerts: string[];
}

export interface CreateBudgetRequest {
  name: string;
  category: string;
  description?: string;
  amount: number;
  currency?: string;
  period?: 'monthly' | 'quarterly' | 'yearly';
  start_date: string;
  end_date?: string;
  is_active?: boolean;
  rollover_unused?: boolean;
  alert_threshold?: number;
}

export interface UpdateBudgetRequest {
  name?: string;
  category?: string;
  description?: string;
  amount?: number;
  currency?: string;
  period?: 'monthly' | 'quarterly' | 'yearly';
  start_date?: string;
  end_date?: string;
  is_active?: boolean;
  rollover_unused?: boolean;
  alert_threshold?: number;
}

export interface ListBudgetsParams {
  category?: string;
  period?: 'monthly' | 'quarterly' | 'yearly';
  is_active?: boolean;
  skip?: number;
  limit?: number;
}

export const budgetsApi = createApi({
  reducerPath: 'budgetsApi',
  baseQuery,
  tagTypes: ['Budget', 'BudgetOverview'],
  endpoints: (builder) => ({
    // Create budget
    createBudget: builder.mutation<Budget, CreateBudgetRequest>({
      query: (budget) => ({
        url: '/api/v1/budgets',
        method: 'POST',
        body: budget,
      }),
      invalidatesTags: ['Budget', 'BudgetOverview'],
    }),

    // List budgets
    listBudgets: builder.query<Budget[], ListBudgetsParams | void>({
      query: (params) => ({
        url: '/api/v1/budgets',
        params: params || {},
      }),
      providesTags: (result: Budget[] | undefined) =>
        result
          ? [
              ...result.map(({ id }: Budget) => ({ type: 'Budget' as const, id })),
              { type: 'Budget', id: 'LIST' },
            ]
          : [{ type: 'Budget', id: 'LIST' }],
    }),

    // Get budget overview
    getBudgetOverview: builder.query<BudgetOverview, { start_date?: string; end_date?: string } | void>({
      query: (params) => ({
        url: '/api/v1/budgets/overview',
        params: params || {},
      }),
      providesTags: ['BudgetOverview'],
    }),

    // Get budget by ID with progress
    getBudget: builder.query<BudgetWithProgress, string>({
      query: (id: string) => `/api/v1/budgets/${id}`,
      providesTags: (_result: BudgetWithProgress | undefined, _error, id: string) => [{ type: 'Budget', id }],
    }),

    // Update budget
    updateBudget: builder.mutation<Budget, { id: string; data: UpdateBudgetRequest }>({
      query: ({ id, data }: { id: string; data: UpdateBudgetRequest }) => ({
        url: `/api/v1/budgets/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (_result: Budget | undefined, _error, { id }: { id: string; data: UpdateBudgetRequest }) => [
        { type: 'Budget', id },
        { type: 'Budget', id: 'LIST' },
        'BudgetOverview',
      ],
    }),

    // Delete budget
    deleteBudget: builder.mutation<void, string>({
      query: (id: string) => ({
        url: `/api/v1/budgets/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result: void | undefined, _error, id: string) => [
        { type: 'Budget', id },
        { type: 'Budget', id: 'LIST' },
        'BudgetOverview',
      ],
    }),
  }),
});

export const {
  useCreateBudgetMutation,
  useListBudgetsQuery,
  useGetBudgetOverviewQuery,
  useGetBudgetQuery,
  useUpdateBudgetMutation,
  useDeleteBudgetMutation,
} = budgetsApi;
