/**
 * Expenses API using RTK Query
 */
import { apiSlice } from './apiSlice';

// Types
export type ExpenseFrequency =
  | 'one_time'
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'annually';

export interface Expense {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  amount: number;
  currency: string;
  frequency: ExpenseFrequency;
  date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_active: boolean;
  tags?: string[] | null;
  monthly_equivalent?: number | null;
  created_at: string;
  updated_at: string;
  // Display values (converted to user's preferred currency)
  display_amount?: number | null;
  display_currency?: string | null;
  display_monthly_equivalent?: number | null;
}

export interface ExpenseCreate {
  name: string;
  description?: string;
  category?: string;
  amount: number;
  currency: string;
  frequency: ExpenseFrequency;
  date?: string;
  start_date?: string;
  end_date?: string;
  is_active: boolean;
  tags?: string[];
}

export interface ExpenseUpdate {
  name?: string;
  description?: string;
  category?: string;
  amount?: number;
  currency?: string;
  frequency?: ExpenseFrequency;
  date?: string;
  start_date?: string;
  end_date?: string;
  is_active?: boolean;
  tags?: string[];
}

export interface ExpenseListResponse {
  items: Expense[];
  total: number;
  page: number;
  page_size: number;
}

export interface ExpenseStats {
  total_expenses: number;
  active_expenses: number;
  total_daily_expense: number;
  total_weekly_expense: number;
  total_monthly_expense: number;
  total_annual_expense: number;
  expenses_by_category: Record<string, number>;
  currency: string;
}

export interface MonthlyExpenseHistory {
  month: string; // YYYY-MM format
  total: number;
  count: number;
  currency: string;
}

export interface ExpenseHistoryResponse {
  history: MonthlyExpenseHistory[];
  total_months: number;
  overall_average: number;
  currency: string;
}

export interface ListExpensesParams {
  page?: number;
  page_size?: number;
  category?: string;
  is_active?: boolean;
}

export interface ExpenseBatchDeleteRequest {
  expense_ids: string[];
}

export interface ExpenseBatchDeleteResponse {
  deleted_count: number;
  failed_ids: string[];
}

export interface ExpenseBatchCreateRequest {
  expenses: ExpenseCreate[];
}

export interface ExpenseBatchCreateResponse {
  created_count: number;
  created_expenses: Expense[];
  failed_count: number;
  errors: Array<{
    index: number;
    error: string;
  }>;
}

export const expensesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Expense CRUD
    listExpenses: builder.query<ExpenseListResponse, ListExpensesParams | void>({
      query: (params) => ({
        url: '/api/v1/expenses',
        params: params || undefined,
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map(({ id }) => ({ type: 'Expense' as const, id })),
              { type: 'Expense', id: 'LIST' },
            ]
          : [{ type: 'Expense', id: 'LIST' }],
    }),

    getExpense: builder.query<Expense, string>({
      query: (id) => `/api/v1/expenses/${id}`,
      providesTags: (result, error, id) => [{ type: 'Expense', id }],
    }),

    createExpense: builder.mutation<Expense, ExpenseCreate>({
      query: (data) => ({
        url: '/api/v1/expenses',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: [
        { type: 'Expense', id: 'LIST' },
        { type: 'Expense', id: 'STATS' },
        { type: 'Expense', id: 'HISTORY' },
        'Dashboard',
      ],
    }),

    updateExpense: builder.mutation<Expense, { id: string; data: ExpenseUpdate }>({
      query: ({ id, data }) => ({
        url: `/api/v1/expenses/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: 'Expense', id },
        { type: 'Expense', id: 'LIST' },
        { type: 'Expense', id: 'STATS' },
        { type: 'Expense', id: 'HISTORY' },
        'Dashboard',
      ],
    }),

    deleteExpense: builder.mutation<void, string>({
      query: (id) => ({
        url: `/api/v1/expenses/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, id) => [
        { type: 'Expense', id },
        { type: 'Expense', id: 'LIST' },
        { type: 'Expense', id: 'STATS' },
        { type: 'Expense', id: 'HISTORY' },
        'Dashboard',
      ],
    }),

    batchDeleteExpenses: builder.mutation<ExpenseBatchDeleteResponse, ExpenseBatchDeleteRequest>({
      query: (data) => ({
        url: '/api/v1/expenses/batch-delete',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (result) => {
        const tags = [
          { type: 'Expense' as const, id: 'LIST' },
          { type: 'Expense' as const, id: 'STATS' },
          { type: 'Expense' as const, id: 'HISTORY' },
          'Dashboard' as const,
        ];
        if (result && result.deleted_count > 0) {
          result.failed_ids.forEach(id => tags.push({ type: 'Expense' as const, id }));
        }
        return tags;
      },
    }),

    batchCreateExpenses: builder.mutation<ExpenseBatchCreateResponse, ExpenseBatchCreateRequest>({
      query: (data) => ({
        url: '/api/v1/expenses/batch-create',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: [
        { type: 'Expense', id: 'LIST' },
        { type: 'Expense', id: 'STATS' },
        { type: 'Expense', id: 'HISTORY' },
        'Dashboard',
      ],
    }),

    // Expense Stats
    getExpenseStats: builder.query<ExpenseStats, { start_date?: string; end_date?: string } | void>({
      query: (params) => ({
        url: '/api/v1/expenses/stats',
        params: params || undefined,
      }),
      providesTags: [{ type: 'Expense', id: 'STATS' }],
    }),

    // Expense History
    getExpenseHistory: builder.query<ExpenseHistoryResponse, { start_date?: string; end_date?: string } | void>({
      query: (params) => ({
        url: '/api/v1/expenses/history',
        params: params || undefined,
      }),
      providesTags: [{ type: 'Expense', id: 'HISTORY' }],
    }),
  }),
});

export const {
  useListExpensesQuery,
  useGetExpenseQuery,
  useCreateExpenseMutation,
  useUpdateExpenseMutation,
  useDeleteExpenseMutation,
  useBatchDeleteExpensesMutation,
  useBatchCreateExpensesMutation,
  useGetExpenseStatsQuery,
  useGetExpenseHistoryQuery,
} = expensesApi;
