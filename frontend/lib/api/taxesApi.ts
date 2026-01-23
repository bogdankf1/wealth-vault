/**
 * Taxes API endpoints using RTK Query
 */
import { apiSlice } from './apiSlice';

// Types
export type TaxFrequency = 'monthly' | 'quarterly' | 'annually';

export interface LinkedIncomeSourceInfo {
  id: string;
  name: string;
  amount: number;
  currency: string;
  frequency: string;
}

export interface LinkedPaymentAccountInfo {
  id: string;
  name: string;
  current_balance: number;
  currency: string;
}

export interface Tax {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  tax_type: 'fixed' | 'percentage';
  frequency: TaxFrequency;
  fixed_amount?: number;
  currency: string;
  percentage?: number;
  income_source_id?: string;
  income_source?: LinkedIncomeSourceInfo;
  // Payment account for auto-pay
  payment_account_id?: string;
  payment_account?: LinkedPaymentAccountInfo;
  // Auto-pay settings
  auto_pay: boolean;
  next_payment_date?: string;
  is_active: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Display currency fields
  display_fixed_amount?: number;
  display_currency?: string;
  // Computed field
  calculated_amount?: number;
  // Payment status for current period
  is_paid_current_period?: boolean;
  current_period_start?: string;
  current_period_end?: string;
  last_payment_date?: string;
  last_payment_amount?: number;
}

export interface TaxCreate {
  name: string;
  description?: string;
  tax_type: 'fixed' | 'percentage';
  frequency?: TaxFrequency;
  fixed_amount?: number;
  currency?: string;
  percentage?: number;
  income_source_id?: string | null;
  payment_account_id?: string | null;
  auto_pay?: boolean;
  next_payment_date?: string | null;
  is_active?: boolean;
  notes?: string;
}

export interface TaxUpdate {
  name?: string;
  description?: string;
  tax_type?: 'fixed' | 'percentage';
  frequency?: TaxFrequency;
  fixed_amount?: number;
  currency?: string;
  percentage?: number;
  income_source_id?: string | null;
  payment_account_id?: string | null;
  auto_pay?: boolean;
  next_payment_date?: string | null;
  is_active?: boolean;
  notes?: string;
}

export interface TaxListResponse {
  items: Tax[];
  total: number;
  page: number;
  page_size: number;
}

export interface TaxStats {
  total_taxes: number;
  active_taxes: number;
  total_tax_amount: number;
  total_fixed_taxes: number;
  total_percentage_taxes: number;
  currency: string;
}

export interface ListTaxesParams {
  page?: number;
  page_size?: number;
  is_active?: boolean;
  income_source_id?: string;
}


export interface TaxRecordBatchDeleteRequest {
  ids: string[];
}

export interface TaxRecordBatchDeleteResponse {
  deleted_count: number;
  failed_ids: string[];
}

// Tax Payment types
export interface TaxPayment {
  id: string;
  tax_id: string;
  user_id: string;
  amount: number;
  currency: string;
  payment_date: string;
  period_start?: string;
  period_end?: string;
  account_transaction_id?: string;
  status: 'pending' | 'completed' | 'failed';
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface TaxPaymentCreate {
  tax_id: string;
  amount: number;
  currency: string;
  payment_date: string;
  period_start?: string;
  period_end?: string;
  notes?: string;
}

export interface TaxPaymentListResponse {
  items: TaxPayment[];
  total: number;
  page: number;
  page_size: number;
}

export interface ListTaxPaymentsParams {
  page?: number;
  page_size?: number;
  tax_id?: string;
}

// Income-Tax Summary types
export interface IncomeTaxBreakdown {
  tax_id: string;
  tax_name: string;
  tax_type: 'fixed' | 'percentage';
  percentage?: number;
  fixed_amount?: number;
  amount: number;
  is_global: boolean;
}

export interface IncomeTaxSummary {
  income_source_id: string;
  income_source_name: string;
  monthly_income: number;
  currency: string;
  taxes: IncomeTaxBreakdown[];
  total_tax: number;
  net_income: number;
}

// Pay Tax types
export interface PayTaxRequest {
  account_id?: string;
  amount?: number;
  notes?: string;
}

export interface PayTaxResponse {
  payment: TaxPayment;
  transaction_id?: string;
  message: string;
}

export interface ProcessDueTaxPaymentsResponse {
  status: string;
  due_count: number;
  processed: number;
  auto_paid: number;
  failed_payments: Array<{
    tax_id: string;
    tax_name: string;
    reason: string;
    amount: number;
    currency: string;
  }>;
  errors: Array<{
    tax_id: string;
    tax_name: string;
    error: string;
  }>;
  timestamp: string;
}

export const taxesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // List taxes with pagination and filters
    listTaxes: builder.query<TaxListResponse, ListTaxesParams | void>({
      query: (params) => ({
        url: '/api/v1/taxes',
        params: params || undefined,
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map(({ id }) => ({ type: 'Tax' as const, id })),
              { type: 'Tax', id: 'LIST' },
            ]
          : [{ type: 'Tax', id: 'LIST' }],
    }),

    // Get single tax
    getTax: builder.query<Tax, string>({
      query: (id) => `/api/v1/taxes/${id}`,
      providesTags: (result, error, id) => [{ type: 'Tax', id }],
    }),

    // Create tax
    createTax: builder.mutation<Tax, TaxCreate>({
      query: (data) => ({
        url: '/api/v1/taxes',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: [
        { type: 'Tax', id: 'LIST' },
        { type: 'Tax', id: 'STATS' },
      ],
    }),

    // Update tax
    updateTax: builder.mutation<Tax, { id: string; data: TaxUpdate }>({
      query: ({ id, data }) => ({
        url: `/api/v1/taxes/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: 'Tax', id },
        { type: 'Tax', id: 'LIST' },
        { type: 'Tax', id: 'STATS' },
      ],
    }),

    // Delete tax
    deleteTax: builder.mutation<void, string>({
      query: (id) => ({
        url: `/api/v1/taxes/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, id) => [
        { type: 'Tax', id },
        { type: 'Tax', id: 'LIST' },
        { type: 'Tax', id: 'STATS' },
      ],
    }),

    // Get tax statistics
    getTaxStats: builder.query<TaxStats, void>({
      query: () => '/api/v1/taxes/stats',
      providesTags: [{ type: 'Tax', id: 'STATS' }],
    }),

    // Batch delete tax records
    batchDeleteTaxRecords: builder.mutation<TaxRecordBatchDeleteResponse, TaxRecordBatchDeleteRequest>({
      query: (data) => ({
        url: '/api/v1/taxes/batch-delete',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (result) => {
        const tags = [
          { type: 'Tax' as const, id: 'LIST' },
          { type: 'Tax' as const, id: 'STATS' },
        ];
        if (result && result.deleted_count > 0) {
          result.failed_ids.forEach(id => tags.push({ type: 'Tax' as const, id }));
        }
        return tags;
      },
    }),

    // Pay a tax manually
    payTax: builder.mutation<PayTaxResponse, { taxId: string; request?: PayTaxRequest }>({
      query: ({ taxId, request }) => ({
        url: `/api/v1/taxes/${taxId}/pay`,
        method: 'POST',
        body: request || {},
      }),
      invalidatesTags: (result, error, { taxId }) => [
        { type: 'Tax', id: taxId },
        { type: 'Tax', id: 'LIST' },
        { type: 'Tax', id: 'STATS' },
        { type: 'TaxPayment', id: 'LIST' },
        { type: 'TaxPayment', id: `TAX_${taxId}` },
        { type: 'Account', id: 'LIST' },
      ],
    }),

    // Get income-tax summary
    getIncomeTaxSummary: builder.query<IncomeTaxSummary[], void>({
      query: () => '/api/v1/taxes/income-summary',
      providesTags: [{ type: 'Tax', id: 'INCOME_SUMMARY' }],
    }),

    // Tax Payments
    listTaxPayments: builder.query<TaxPaymentListResponse, ListTaxPaymentsParams | void>({
      query: (params) => ({
        url: '/api/v1/taxes/payments',
        params: params || undefined,
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map(({ id }) => ({ type: 'TaxPayment' as const, id })),
              { type: 'TaxPayment', id: 'LIST' },
            ]
          : [{ type: 'TaxPayment', id: 'LIST' }],
    }),

    getTaxPayment: builder.query<TaxPayment, string>({
      query: (id) => `/api/v1/taxes/payments/${id}`,
      providesTags: (result, error, id) => [{ type: 'TaxPayment', id }],
    }),

    createTaxPayment: builder.mutation<TaxPayment, TaxPaymentCreate>({
      query: (data) => ({
        url: '/api/v1/taxes/payments',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: [
        { type: 'TaxPayment', id: 'LIST' },
        { type: 'Tax', id: 'STATS' },
      ],
    }),

    deleteTaxPayment: builder.mutation<void, string>({
      query: (id) => ({
        url: `/api/v1/taxes/payments/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, id) => [
        { type: 'TaxPayment', id },
        { type: 'TaxPayment', id: 'LIST' },
        { type: 'Tax', id: 'STATS' },
      ],
    }),

    // Get payments for a specific tax
    getPaymentsForTax: builder.query<TaxPaymentListResponse, { taxId: string; page?: number; page_size?: number }>({
      query: ({ taxId, page = 1, page_size = 50 }) => ({
        url: `/api/v1/taxes/${taxId}/payments`,
        params: { page, page_size },
      }),
      providesTags: (result, error, { taxId }) => [
        { type: 'TaxPayment', id: `TAX_${taxId}` },
        { type: 'TaxPayment', id: 'LIST' },
      ],
    }),

    // Process all due tax payments (manual trigger for auto-pay)
    processTaxDuePayments: builder.mutation<ProcessDueTaxPaymentsResponse, void>({
      query: () => ({
        url: '/api/v1/taxes/process-due-payments',
        method: 'POST',
      }),
      invalidatesTags: [
        { type: 'Tax', id: 'LIST' },
        { type: 'Tax', id: 'STATS' },
        { type: 'TaxPayment', id: 'LIST' },
        'Dashboard',
        'Saving',
      ],
    }),
  }),
  overrideExisting: true,
});

export const {
  useListTaxesQuery,
  useGetTaxQuery,
  useCreateTaxMutation,
  useUpdateTaxMutation,
  useDeleteTaxMutation,
  useGetTaxStatsQuery,
  useBatchDeleteTaxRecordsMutation,
  usePayTaxMutation,
  useGetIncomeTaxSummaryQuery,
  useListTaxPaymentsQuery,
  useGetTaxPaymentQuery,
  useCreateTaxPaymentMutation,
  useDeleteTaxPaymentMutation,
  useGetPaymentsForTaxQuery,
  useProcessTaxDuePaymentsMutation,
} = taxesApi;
