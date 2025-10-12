/**
 * Installments API endpoints using RTK Query
 */
import { apiSlice } from './apiSlice';

// Types
export type InstallmentFrequency = 'weekly' | 'biweekly' | 'monthly';

export interface Installment {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  category?: string;
  total_amount: number;
  amount_per_payment: number;
  currency: string;
  interest_rate?: number;
  frequency: InstallmentFrequency;
  number_of_payments: number;
  payments_made: number;
  start_date: string;
  first_payment_date: string;
  end_date?: string;
  is_active: boolean;
  remaining_balance?: number;
  created_at: string;
  updated_at: string;
}

export interface InstallmentCreate {
  name: string;
  description?: string;
  category?: string;
  total_amount: number;
  amount_per_payment: number;
  currency?: string;
  interest_rate?: number;
  frequency: InstallmentFrequency;
  number_of_payments: number;
  payments_made?: number;
  start_date: string;
  first_payment_date: string;
  end_date?: string;
  is_active?: boolean;
}

export interface InstallmentUpdate {
  name?: string;
  description?: string;
  category?: string;
  total_amount?: number;
  amount_per_payment?: number;
  currency?: string;
  interest_rate?: number;
  frequency?: InstallmentFrequency;
  number_of_payments?: number;
  payments_made?: number;
  start_date?: string;
  first_payment_date?: string;
  end_date?: string;
  is_active?: boolean;
}

export interface InstallmentListResponse {
  items: Installment[];
  total: number;
  page: number;
  page_size: number;
}

export interface InstallmentStats {
  total_installments: number;
  active_installments: number;
  total_debt: number;
  monthly_payment: number;
  total_paid: number;
  currency: string;
  by_category: Record<string, number>;
  by_frequency: Record<string, number>;
  average_interest_rate?: number;
  debt_free_date?: string;
}

export interface ListInstallmentsParams {
  page?: number;
  page_size?: number;
  category?: string;
  frequency?: InstallmentFrequency;
  is_active?: boolean;
}

export const installmentsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // List installments with pagination and filters
    listInstallments: builder.query<InstallmentListResponse, ListInstallmentsParams | void>({
      query: (params) => ({
        url: '/api/v1/installments',
        params: params || undefined,
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map(({ id }) => ({ type: 'Installments' as const, id })),
              { type: 'Installments', id: 'LIST' },
            ]
          : [{ type: 'Installments', id: 'LIST' }],
    }),

    // Get single installment
    getInstallment: builder.query<Installment, string>({
      query: (id) => `/api/v1/installments/${id}`,
      providesTags: (result, error, id) => [{ type: 'Installments', id }],
    }),

    // Create installment
    createInstallment: builder.mutation<Installment, InstallmentCreate>({
      query: (data) => ({
        url: '/api/v1/installments',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: [
        { type: 'Installments', id: 'LIST' },
        { type: 'Installments', id: 'STATS' },
        'Dashboard',
      ],
    }),

    // Update installment
    updateInstallment: builder.mutation<Installment, { id: string; data: InstallmentUpdate }>({
      query: ({ id, data }) => ({
        url: `/api/v1/installments/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: 'Installments', id },
        { type: 'Installments', id: 'LIST' },
        { type: 'Installments', id: 'STATS' },
        'Dashboard',
      ],
    }),

    // Delete installment
    deleteInstallment: builder.mutation<void, string>({
      query: (id) => ({
        url: `/api/v1/installments/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, id) => [
        { type: 'Installments', id },
        { type: 'Installments', id: 'LIST' },
        { type: 'Installments', id: 'STATS' },
        'Dashboard',
      ],
    }),

    // Get installment statistics
    getInstallmentStats: builder.query<InstallmentStats, void>({
      query: () => '/api/v1/installments/stats',
      providesTags: [{ type: 'Installments', id: 'STATS' }],
    }),
  }),
  overrideExisting: true,
});

export const {
  useListInstallmentsQuery,
  useGetInstallmentQuery,
  useCreateInstallmentMutation,
  useUpdateInstallmentMutation,
  useDeleteInstallmentMutation,
  useGetInstallmentStatsQuery,
} = installmentsApi;
