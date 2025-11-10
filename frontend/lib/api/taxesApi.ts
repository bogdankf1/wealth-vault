/**
 * Taxes API endpoints using RTK Query
 */
import { apiSlice } from './apiSlice';

// Types
export type TaxFrequency = 'monthly' | 'quarterly' | 'annually';

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
  is_active: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Display currency fields
  display_fixed_amount?: number;
  display_currency?: string;
  // Computed field
  calculated_amount?: number;
}

export interface TaxCreate {
  name: string;
  description?: string;
  tax_type: 'fixed' | 'percentage';
  frequency?: TaxFrequency;
  fixed_amount?: number;
  currency?: string;
  percentage?: number;
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
}


export interface TaxRecordBatchDeleteRequest {
  ids: string[];
}

export interface TaxRecordBatchDeleteResponse {
  deleted_count: number;
  failed_ids: string[];
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
} = taxesApi;
