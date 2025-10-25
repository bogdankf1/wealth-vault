/**
 * Debts API endpoints using RTK Query
 */
import { apiSlice } from './apiSlice';

// Types
export interface Debt {
  id: string;
  user_id: string;
  debtor_name: string;
  description?: string;
  amount: number;
  amount_paid: number;
  currency: string;
  is_paid: boolean;
  due_date?: string;
  paid_date?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Display currency fields
  display_amount?: number;
  display_amount_paid?: number;
  display_currency?: string;
  // Computed fields
  is_overdue?: boolean;
  progress_percentage?: number;
  amount_remaining?: number;
}

export interface DebtCreate {
  debtor_name: string;
  description?: string;
  amount: number;
  amount_paid?: number;
  currency?: string;
  is_paid?: boolean;
  due_date?: string;
  paid_date?: string;
  notes?: string;
}

export interface DebtUpdate {
  debtor_name?: string;
  description?: string;
  amount?: number;
  amount_paid?: number;
  currency?: string;
  is_paid?: boolean;
  due_date?: string;
  paid_date?: string;
  notes?: string;
}

export interface DebtListResponse {
  items: Debt[];
  total: number;
  page: number;
  page_size: number;
}

export interface DebtStats {
  total_debts: number;
  active_debts: number;
  paid_debts: number;
  total_amount_owed: number;
  total_amount_paid: number;
  overdue_debts: number;
  currency: string;
}

export interface ListDebtsParams {
  page?: number;
  page_size?: number;
  is_paid?: boolean;
}

export const debtsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // List debts with pagination and filters
    listDebts: builder.query<DebtListResponse, ListDebtsParams | void>({
      query: (params) => ({
        url: '/api/v1/debts',
        params: params || undefined,
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map(({ id }) => ({ type: 'Debt' as const, id })),
              { type: 'Debt', id: 'LIST' },
            ]
          : [{ type: 'Debt', id: 'LIST' }],
    }),

    // Get single debt
    getDebt: builder.query<Debt, string>({
      query: (id) => `/api/v1/debts/${id}`,
      providesTags: (result, error, id) => [{ type: 'Debt', id }],
    }),

    // Create debt
    createDebt: builder.mutation<Debt, DebtCreate>({
      query: (data) => ({
        url: '/api/v1/debts',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: [
        { type: 'Debt', id: 'LIST' },
        { type: 'Debt', id: 'STATS' },
      ],
    }),

    // Update debt
    updateDebt: builder.mutation<Debt, { id: string; data: DebtUpdate }>({
      query: ({ id, data }) => ({
        url: `/api/v1/debts/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: 'Debt', id },
        { type: 'Debt', id: 'LIST' },
        { type: 'Debt', id: 'STATS' },
      ],
    }),

    // Delete debt
    deleteDebt: builder.mutation<void, string>({
      query: (id) => ({
        url: `/api/v1/debts/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, id) => [
        { type: 'Debt', id },
        { type: 'Debt', id: 'LIST' },
        { type: 'Debt', id: 'STATS' },
      ],
    }),

    // Get debt statistics
    getDebtStats: builder.query<DebtStats, void>({
      query: () => '/api/v1/debts/stats',
      providesTags: [{ type: 'Debt', id: 'STATS' }],
    }),
  }),
  overrideExisting: true,
});

export const {
  useListDebtsQuery,
  useGetDebtQuery,
  useCreateDebtMutation,
  useUpdateDebtMutation,
  useDeleteDebtMutation,
  useGetDebtStatsQuery,
} = debtsApi;
