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
  is_active: boolean;
  due_date?: string;
  paid_date?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Payment integration fields
  deposit_account_id?: string;
  auto_deposit: boolean;
  interest_rate?: number;
  accrued_interest: number;
  reminder_days_before: number;
  next_payment_date?: string;
  payment_frequency?: string;
  expected_payment_amount?: number;
  // Display currency fields
  display_amount?: number;
  display_amount_paid?: number;
  display_currency?: string;
  // Computed fields
  is_overdue?: boolean;
  progress_percentage?: number;
  amount_remaining?: number;
  total_with_interest?: number;
}

export interface DebtCreate {
  debtor_name: string;
  description?: string;
  amount: number;
  amount_paid?: number;
  currency?: string;
  is_paid?: boolean;
  is_active?: boolean;
  due_date?: string;
  paid_date?: string;
  notes?: string;
  // Payment integration fields
  deposit_account_id?: string;
  auto_deposit?: boolean;
  interest_rate?: number;
  reminder_days_before?: number;
  next_payment_date?: string;
  payment_frequency?: string;
  expected_payment_amount?: number;
  sync_historical?: boolean;
}

export interface DebtUpdate {
  debtor_name?: string;
  description?: string;
  amount?: number;
  amount_paid?: number;
  currency?: string;
  is_paid?: boolean;
  is_active?: boolean;
  due_date?: string;
  paid_date?: string;
  notes?: string;
  // Payment integration fields
  deposit_account_id?: string;
  auto_deposit?: boolean;
  interest_rate?: number;
  reminder_days_before?: number;
  next_payment_date?: string;
  payment_frequency?: string;
  expected_payment_amount?: number;
  sync_historical?: boolean;
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
  is_active?: boolean;
}


export interface DebtBatchDeleteRequest {
  ids: string[];
}

export interface DebtBatchDeleteResponse {
  deleted_count: number;
  failed_ids: string[];
}

// Payment types
export interface DebtPayment {
  id: string;
  debt_id: string;
  user_id: string;
  amount: number;
  currency: string;
  payment_date: string;
  principal_amount?: number;
  interest_amount?: number;
  balance_before: number;
  balance_after: number;
  account_transaction_id?: string;
  status: string;
  notes?: string;
  created_at: string;
}

export interface DebtPaymentListResponse {
  items: DebtPayment[];
  total: number;
}

export interface RecordDebtPayment {
  amount: number;
  payment_date?: string;
  notes?: string;
  deposit_to_account?: boolean;
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
        { type: 'Saving', id: 'LIST' },
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
        { type: 'Saving', id: 'LIST' },
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

    // Batch delete debts
    batchDeleteDebts: builder.mutation<DebtBatchDeleteResponse, DebtBatchDeleteRequest>({
      query: (data) => ({
        url: '/api/v1/debts/batch-delete',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (result) => {
        const tags = [
          { type: 'Debt' as const, id: 'LIST' },
          { type: 'Debt' as const, id: 'STATS' },
        ];
        if (result && result.deleted_count > 0) {
          result.failed_ids.forEach(id => tags.push({ type: 'Debt' as const, id }));
        }
        return tags;
      },
    }),

    // ============================================================================
    // Payment Endpoints
    // ============================================================================

    // Record a payment received
    recordDebtPayment: builder.mutation<DebtPayment, { debtId: string; data: RecordDebtPayment }>({
      query: ({ debtId, data }) => ({
        url: `/api/v1/debts/${debtId}/payments`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (result, error, { debtId }) => [
        { type: 'Debt', id: debtId },
        { type: 'Debt', id: 'LIST' },
        { type: 'Debt', id: 'STATS' },
        { type: 'Debt', id: `PAYMENTS-${debtId}` },
        { type: 'Saving', id: 'LIST' },
      ],
    }),

    // Get payments for a debt
    getDebtPayments: builder.query<DebtPaymentListResponse, string>({
      query: (debtId) => `/api/v1/debts/${debtId}/payments`,
      providesTags: (result, error, debtId) => [{ type: 'Debt', id: `PAYMENTS-${debtId}` }],
    }),

    // Mark debt as fully paid
    markDebtPaid: builder.mutation<Debt, string>({
      query: (debtId) => ({
        url: `/api/v1/debts/${debtId}/mark-paid`,
        method: 'POST',
      }),
      invalidatesTags: (result, error, debtId) => [
        { type: 'Debt', id: debtId },
        { type: 'Debt', id: 'LIST' },
        { type: 'Debt', id: 'STATS' },
      ],
    }),

    // Forgive debt (write off remaining balance)
    forgiveDebt: builder.mutation<Debt, string>({
      query: (debtId) => ({
        url: `/api/v1/debts/${debtId}/forgive`,
        method: 'POST',
      }),
      invalidatesTags: (result, error, debtId) => [
        { type: 'Debt', id: debtId },
        { type: 'Debt', id: 'LIST' },
        { type: 'Debt', id: 'STATS' },
      ],
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
  useBatchDeleteDebtsMutation,
  // Payment hooks
  useRecordDebtPaymentMutation,
  useGetDebtPaymentsQuery,
  useMarkDebtPaidMutation,
  useForgiveDebtMutation,
} = debtsApi;
