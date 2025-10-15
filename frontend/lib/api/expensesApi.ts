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

export interface ListExpensesParams {
  page?: number;
  page_size?: number;
  category?: string;
  is_active?: boolean;
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
        'Dashboard',
      ],
    }),

    // Expense Stats
    getExpenseStats: builder.query<ExpenseStats, void>({
      query: () => '/api/v1/expenses/stats',
      providesTags: [{ type: 'Expense', id: 'STATS' }],
    }),
  }),
});

export const {
  useListExpensesQuery,
  useGetExpenseQuery,
  useCreateExpenseMutation,
  useUpdateExpenseMutation,
  useDeleteExpenseMutation,
  useGetExpenseStatsQuery,
} = expensesApi;
