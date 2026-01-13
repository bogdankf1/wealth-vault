/**
 * Installments API endpoints using RTK Query
 */
import { apiSlice } from './apiSlice';

// Types
export type InstallmentFrequency = 'weekly' | 'biweekly' | 'monthly';
export type InstallmentStatus = 'active' | 'completed' | 'defaulted';
export type InstallmentPaymentStatus = 'pending' | 'completed' | 'failed' | 'skipped';

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
  status: InstallmentStatus;
  remaining_balance?: number;
  created_at: string;
  updated_at: string;
  // Payment integration fields
  payment_account_id?: string | null;
  auto_pay: boolean;
  next_payment_date?: string | null;
  last_payment_date?: string | null;
  reminder_days_before: number;
  // Display values (converted to user's preferred currency)
  display_total_amount?: number | null;
  display_amount_per_payment?: number | null;
  display_remaining_balance?: number | null;
  display_currency?: string | null;
}

export interface InstallmentPayment {
  id: string;
  installment_id: string;
  user_id: string;
  payment_number: number;
  scheduled_date: string;
  actual_payment_date?: string | null;
  scheduled_amount: number;
  actual_amount?: number | null;
  principal_amount?: number | null;
  interest_amount?: number | null;
  currency: string;
  expense_id?: string | null;
  account_transaction_id?: string | null;
  status: InstallmentPaymentStatus;
  is_late: boolean;
  days_late?: number | null;
  notes?: string | null;
  created_at: string;
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
  // Payment integration fields
  payment_account_id?: string | null;
  auto_pay?: boolean;
  reminder_days_before?: number;
  sync_historical?: boolean;
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
  // Payment integration fields
  payment_account_id?: string | null;
  auto_pay?: boolean;
  reminder_days_before?: number;
  sync_historical?: boolean;
}

export interface InstallmentPaymentCreate {
  amount?: number;
  payment_date?: string;
  payment_number?: number;
  principal_amount?: number;
  interest_amount?: number;
  notes?: string;
}

export interface InstallmentPaymentListResponse {
  items: InstallmentPayment[];
  total: number;
}

export interface InstallmentMarkDefaultedRequest {
  reason?: string;
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


export interface MonthlyInstallmentHistory {
  month: string; // YYYY-MM format
  total: number;
  count: number;
  currency: string;
}

export interface InstallmentHistoryResponse {
  history: MonthlyInstallmentHistory[];
  total_months: number;
  overall_average: number;
  currency: string;
}

export interface InstallmentBatchDeleteRequest {
  ids: string[];
}

export interface InstallmentBatchDeleteResponse {
  deleted_count: number;
  failed_ids: string[];
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
        { type: 'Installments', id: 'HISTORY' },
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
        { type: 'Installments', id: 'HISTORY' },
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
        { type: 'Installments', id: 'HISTORY' },
        'Dashboard',
      ],
    }),

    // Get installment statistics
    getInstallmentStats: builder.query<InstallmentStats, { start_date?: string; end_date?: string } | void>({
      query: (params) => ({
        url: '/api/v1/installments/stats',
        params: params || undefined,
      }),
      providesTags: [{ type: 'Installments', id: 'STATS' }],
    }),

    // Installment History
    getInstallmentHistory: builder.query<InstallmentHistoryResponse, { start_date?: string; end_date?: string } | void>({
      query: (params) => ({
        url: '/api/v1/installments/history',
        params: params || undefined,
      }),
      providesTags: [{ type: 'Installments', id: 'HISTORY' }],
    }),

    // Batch delete installments
    batchDeleteInstallments: builder.mutation<InstallmentBatchDeleteResponse, InstallmentBatchDeleteRequest>({
      query: (data) => ({
        url: '/api/v1/installments/batch-delete',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (result) => {
        const tags = [
          { type: 'Installments' as const, id: 'LIST' },
          { type: 'Installments' as const, id: 'STATS' },
          { type: 'Installments' as const, id: 'HISTORY' },
          'Dashboard' as const,
        ];
        if (result && result.deleted_count > 0) {
          result.failed_ids.forEach(id => tags.push({ type: 'Installments' as const, id }));
        }
        return tags;
      },
    }),

    // ============== Payment Integration Endpoints ==============

    // Mark installment as completed
    completeInstallment: builder.mutation<Installment, string>({
      query: (id) => ({
        url: `/api/v1/installments/${id}/complete`,
        method: 'POST',
      }),
      invalidatesTags: (result, error, id) => [
        { type: 'Installments', id },
        { type: 'Installments', id: 'LIST' },
        { type: 'Installments', id: 'STATS' },
        'Dashboard',
        'Saving',
      ],
    }),

    // Mark installment as defaulted
    defaultInstallment: builder.mutation<Installment, { id: string; reason?: string }>({
      query: ({ id, reason }) => ({
        url: `/api/v1/installments/${id}/default`,
        method: 'POST',
        body: reason ? { reason } : undefined,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: 'Installments', id },
        { type: 'Installments', id: 'LIST' },
        { type: 'Installments', id: 'STATS' },
        'Dashboard',
      ],
    }),

    // Reactivate a completed or defaulted installment
    reactivateInstallment: builder.mutation<Installment, string>({
      query: (id) => ({
        url: `/api/v1/installments/${id}/reactivate`,
        method: 'POST',
      }),
      invalidatesTags: (result, error, id) => [
        { type: 'Installments', id },
        { type: 'Installments', id: 'LIST' },
        { type: 'Installments', id: 'STATS' },
        'Dashboard',
      ],
    }),

    // Get payment history for an installment
    getInstallmentPayments: builder.query<InstallmentPaymentListResponse, { installmentId: string; page?: number; page_size?: number }>({
      query: ({ installmentId, page = 1, page_size = 50 }) => ({
        url: `/api/v1/installments/${installmentId}/payments`,
        params: { page, page_size },
      }),
      providesTags: (result, error, { installmentId }) => [
        { type: 'Installments', id: `${installmentId}-PAYMENTS` },
      ],
    }),

    // Record a payment for an installment
    recordInstallmentPayment: builder.mutation<InstallmentPayment, { installmentId: string; data?: InstallmentPaymentCreate }>({
      query: ({ installmentId, data }) => ({
        url: `/api/v1/installments/${installmentId}/pay`,
        method: 'POST',
        body: data || {},
      }),
      invalidatesTags: (result, error, { installmentId }) => [
        { type: 'Installments', id: installmentId },
        { type: 'Installments', id: `${installmentId}-PAYMENTS` },
        { type: 'Installments', id: 'LIST' },
        { type: 'Installments', id: 'STATS' },
        { type: 'Installments', id: 'HISTORY' },
        'Dashboard',
        'Saving',
      ],
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
  useGetInstallmentHistoryQuery,
  useBatchDeleteInstallmentsMutation,
  // Payment integration hooks
  useCompleteInstallmentMutation,
  useDefaultInstallmentMutation,
  useReactivateInstallmentMutation,
  useGetInstallmentPaymentsQuery,
  useRecordInstallmentPaymentMutation,
} = installmentsApi;
