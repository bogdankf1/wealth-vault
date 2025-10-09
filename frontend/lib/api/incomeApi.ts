/**
 * Income API endpoints
 */
import { apiSlice } from './apiSlice';

// ============================================================================
// Types
// ============================================================================

export type IncomeFrequency =
  | 'one_time'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'annually';

export interface IncomeSource {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  amount: number;
  currency: string;
  frequency: IncomeFrequency;
  is_active: boolean;
  date: string;
  start_date?: string | null;
  end_date?: string | null;
  created_at: string;
  updated_at: string;
  monthly_equivalent?: number;
}

export interface IncomeTransaction {
  id: string;
  user_id: string;
  source_id?: string | null;
  description?: string | null;
  amount: number;
  currency: string;
  date: string;
  category?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface IncomeStats {
  total_sources: number;
  active_sources: number;
  total_monthly_income: number;
  total_annual_income: number;
  total_transactions: number;
  total_transactions_amount: number;
  transactions_current_month: number;
  transactions_current_month_amount: number;
  transactions_last_month: number;
  transactions_last_month_amount: number;
  currency: string;
}

export interface IncomeSourceCreate {
  name: string;
  description?: string | null;
  category?: string | null;
  amount: number;
  currency?: string;
  frequency?: IncomeFrequency;
  is_active?: boolean;
  start_date?: string | null;
  end_date?: string | null;
}

export interface IncomeSourceUpdate {
  name?: string;
  description?: string | null;
  category?: string | null;
  amount?: number;
  currency?: string;
  frequency?: IncomeFrequency;
  is_active?: boolean;
  start_date?: string | null;
  end_date?: string | null;
}

export interface IncomeTransactionCreate {
  source_id?: string | null;
  description?: string | null;
  amount: number;
  currency?: string;
  date: string;
  category?: string | null;
  notes?: string | null;
}

export interface IncomeSourceListResponse {
  items: IncomeSource[];
  total: number;
  page: number;
  page_size: number;
}

export interface IncomeTransactionListResponse {
  items: IncomeTransaction[];
  total: number;
  page: number;
  page_size: number;
}

// ============================================================================
// Query Parameters
// ============================================================================

export interface ListIncomeSourcesParams {
  page?: number;
  page_size?: number;
  is_active?: boolean;
}

export interface ListIncomeTransactionsParams {
  page?: number;
  page_size?: number;
  source_id?: string;
  start_date?: string;
  end_date?: string;
}

// ============================================================================
// API Endpoints
// ============================================================================

export const incomeApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Income Sources
    listIncomeSources: builder.query<IncomeSourceListResponse, ListIncomeSourcesParams | void>({
      query: (params) => ({
        url: '/api/v1/income/sources',
        params: params || undefined,
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map(({ id }) => ({ type: 'Income' as const, id })),
              { type: 'Income', id: 'LIST' },
            ]
          : [{ type: 'Income', id: 'LIST' }],
    }),

    getIncomeSource: builder.query<IncomeSource, string>({
      query: (id) => `/api/v1/income/sources/${id}`,
      providesTags: (result, error, id) => [{ type: 'Income', id }],
    }),

    createIncomeSource: builder.mutation<IncomeSource, IncomeSourceCreate>({
      query: (data) => ({
        url: '/api/v1/income/sources',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: [
        { type: 'Income', id: 'LIST' },
        { type: 'Income', id: 'STATS' },
        'Dashboard',
      ],
    }),

    updateIncomeSource: builder.mutation<IncomeSource, { id: string; data: IncomeSourceUpdate }>({
      query: ({ id, data }) => ({
        url: `/api/v1/income/sources/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: 'Income', id },
        { type: 'Income', id: 'LIST' },
        { type: 'Income', id: 'STATS' },
        'Dashboard',
      ],
    }),

    deleteIncomeSource: builder.mutation<void, string>({
      query: (id) => ({
        url: `/api/v1/income/sources/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: [
        { type: 'Income', id: 'LIST' },
        { type: 'Income', id: 'STATS' },
        'Dashboard',
      ],
    }),

    // Income Transactions
    listIncomeTransactions: builder.query<IncomeTransactionListResponse, ListIncomeTransactionsParams | void>({
      query: (params) => ({
        url: '/api/v1/income/transactions',
        params: params || undefined,
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map(({ id }) => ({ type: 'Income' as const, id: `transaction-${id}` })),
              { type: 'Income', id: 'TRANSACTION_LIST' },
            ]
          : [{ type: 'Income', id: 'TRANSACTION_LIST' }],
    }),

    createIncomeTransaction: builder.mutation<IncomeTransaction, IncomeTransactionCreate>({
      query: (data) => ({
        url: '/api/v1/income/transactions',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: [{ type: 'Income', id: 'TRANSACTION_LIST' }],
    }),

    // Statistics
    getIncomeStats: builder.query<IncomeStats, void>({
      query: () => '/api/v1/income/stats',
      providesTags: [{ type: 'Income', id: 'STATS' }],
    }),
  }),
});

export const {
  useListIncomeSourcesQuery,
  useGetIncomeSourceQuery,
  useCreateIncomeSourceMutation,
  useUpdateIncomeSourceMutation,
  useDeleteIncomeSourceMutation,
  useListIncomeTransactionsQuery,
  useCreateIncomeTransactionMutation,
  useGetIncomeStatsQuery,
} = incomeApi;
