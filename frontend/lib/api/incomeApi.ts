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

export type IncomeTransactionStatus = 'expected' | 'received' | 'deposited';

export type DistributionType = 'percentage' | 'fixed_amount' | 'remainder';

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
  // Display values (converted to user's preferred currency)
  display_amount?: number | null;
  display_currency?: string | null;
  display_monthly_equivalent?: number | null;
  // Account integration fields
  target_account_id?: string | null;
  auto_deposit: boolean;
  target_account_name?: string | null;
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
  // Account integration fields
  deposited_to_account_id?: string | null;
  account_transaction_id?: string | null;
  status: IncomeTransactionStatus;
  deposited_to_account_name?: string | null;
}

export interface IncomeDistributionRule {
  id: string;
  user_id: string;
  income_source_id?: string | null;
  target_account_id?: string | null;
  target_goal_id?: string | null;
  distribution_type: DistributionType;
  amount?: number | null;
  percentage?: number | null;
  priority: number;
  name?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Related entity names for display
  income_source_name?: string | null;
  target_account_name?: string | null;
  target_goal_name?: string | null;
}

export interface DistributionPreview {
  rule_id: string;
  rule_name?: string | null;
  target_type: 'account' | 'goal';
  target_id: string;
  target_name: string;
  amount: number;
  currency: string;
}

export interface IncomeDistributionPreviewResponse {
  income_amount: number;
  currency: string;
  distributions: DistributionPreview[];
  remaining_amount: number;
  total_distributed: number;
}

export interface IncomeDepositRequest {
  account_id: string;
  description?: string | null;
}

export interface IncomeDepositResponse {
  income_transaction_id: string;
  account_transaction_id: string;
  deposited_to_account_id: string;
  amount: number;
  currency: string;
  message: string;
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

export interface MonthlyIncomeHistory {
  month: string; // YYYY-MM format
  total: number;
  count: number;
  currency: string;
}

export interface IncomeHistoryResponse {
  history: MonthlyIncomeHistory[];
  total_months: number;
  overall_average: number;
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
  target_account_id?: string | null;
  auto_deposit?: boolean;
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
  target_account_id?: string | null;
  auto_deposit?: boolean;
  // When true, deletes existing income transactions and deposits,
  // then recreates them with the new values
  sync_historical?: boolean;
}

export interface IncomeDistributionRuleCreate {
  income_source_id?: string | null;
  target_account_id?: string | null;
  target_goal_id?: string | null;
  distribution_type: DistributionType;
  amount?: number | null;
  percentage?: number | null;
  priority?: number;
  name?: string | null;
  is_active?: boolean;
}

export interface IncomeDistributionRuleUpdate {
  income_source_id?: string | null;
  target_account_id?: string | null;
  target_goal_id?: string | null;
  distribution_type?: DistributionType;
  amount?: number | null;
  percentage?: number | null;
  priority?: number;
  name?: string | null;
  is_active?: boolean;
}

export interface IncomeDistributionRuleListResponse {
  items: IncomeDistributionRule[];
  total: number;
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

export interface IncomeSourceBatchDeleteRequest {
  source_ids: string[];
}

export interface IncomeSourceBatchDeleteResponse {
  deleted_count: number;
  failed_ids: string[];
}

export interface ListDistributionRulesParams {
  income_source_id?: string;
  is_active?: boolean;
}

export interface DistributionPreviewParams {
  income_amount: number;
  currency?: string;
  income_source_id?: string;
}

export interface ApplyDistributionResponse {
  message: string;
  deposits: Array<{
    account_transaction_id: string;
    amount: number;
  }>;
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
        { type: 'Income', id: 'HISTORY' },
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
        { type: 'Income', id: 'HISTORY' },
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
        { type: 'Income', id: 'HISTORY' },
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
    getIncomeStats: builder.query<IncomeStats, { start_date?: string; end_date?: string } | void>({
      query: (params) => ({
        url: '/api/v1/income/stats',
        params: params || undefined,
      }),
      providesTags: [{ type: 'Income', id: 'STATS' }],
    }),

    // Income History
    getIncomeHistory: builder.query<IncomeHistoryResponse, { start_date?: string; end_date?: string } | void>({
      query: (params) => ({
        url: '/api/v1/income/history',
        params: params || undefined,
      }),
      providesTags: [{ type: 'Income', id: 'HISTORY' }],
    }),

    // Batch Delete
    batchDeleteIncomeSources: builder.mutation<IncomeSourceBatchDeleteResponse, IncomeSourceBatchDeleteRequest>({
      query: (data) => ({
        url: '/api/v1/income/sources/batch-delete',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: [{ type: 'Income', id: 'LIST' }, { type: 'Income', id: 'STATS' }, { type: 'Income', id: 'HISTORY' }, 'Dashboard'],
    }),

    // Income Deposit
    depositIncomeToAccount: builder.mutation<IncomeDepositResponse, { transactionId: string; data: IncomeDepositRequest }>({
      query: ({ transactionId, data }) => ({
        url: `/api/v1/income/transactions/${transactionId}/deposit`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: [
        { type: 'Income', id: 'TRANSACTION_LIST' },
        { type: 'Saving', id: 'LIST' },
        { type: 'Saving', id: 'TRANSACTIONS' },
        'Dashboard',
      ],
    }),

    // Distribution Rules
    listDistributionRules: builder.query<IncomeDistributionRuleListResponse, ListDistributionRulesParams | void>({
      query: (params) => ({
        url: '/api/v1/income/distribution-rules',
        params: params || undefined,
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map(({ id }) => ({ type: 'Income' as const, id: `rule-${id}` })),
              { type: 'Income', id: 'RULE_LIST' },
            ]
          : [{ type: 'Income', id: 'RULE_LIST' }],
    }),

    getDistributionRule: builder.query<IncomeDistributionRule, string>({
      query: (id) => `/api/v1/income/distribution-rules/${id}`,
      providesTags: (result, error, id) => [{ type: 'Income', id: `rule-${id}` }],
    }),

    createDistributionRule: builder.mutation<IncomeDistributionRule, IncomeDistributionRuleCreate>({
      query: (data) => ({
        url: '/api/v1/income/distribution-rules',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: [{ type: 'Income', id: 'RULE_LIST' }],
    }),

    updateDistributionRule: builder.mutation<IncomeDistributionRule, { id: string; data: IncomeDistributionRuleUpdate }>({
      query: ({ id, data }) => ({
        url: `/api/v1/income/distribution-rules/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: 'Income', id: `rule-${id}` },
        { type: 'Income', id: 'RULE_LIST' },
      ],
    }),

    deleteDistributionRule: builder.mutation<void, string>({
      query: (id) => ({
        url: `/api/v1/income/distribution-rules/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'Income', id: 'RULE_LIST' }],
    }),

    // Distribution Preview
    previewDistribution: builder.query<IncomeDistributionPreviewResponse, DistributionPreviewParams>({
      query: (params) => ({
        url: '/api/v1/income/distribution-preview',
        params,
      }),
    }),

    // Apply Distribution
    applyDistribution: builder.mutation<ApplyDistributionResponse, string>({
      query: (transactionId) => ({
        url: `/api/v1/income/transactions/${transactionId}/distribute`,
        method: 'POST',
      }),
      invalidatesTags: [
        { type: 'Income', id: 'TRANSACTION_LIST' },
        { type: 'Saving', id: 'LIST' },
        { type: 'Saving', id: 'TRANSACTIONS' },
        'Dashboard',
      ],
    }),
  }),
});

export const {
  useListIncomeSourcesQuery,
  useGetIncomeSourceQuery,
  useCreateIncomeSourceMutation,
  useUpdateIncomeSourceMutation,
  useDeleteIncomeSourceMutation,
  useBatchDeleteIncomeSourcesMutation,
  useListIncomeTransactionsQuery,
  useCreateIncomeTransactionMutation,
  useGetIncomeStatsQuery,
  useGetIncomeHistoryQuery,
  // Income Deposit
  useDepositIncomeToAccountMutation,
  // Distribution Rules
  useListDistributionRulesQuery,
  useGetDistributionRuleQuery,
  useCreateDistributionRuleMutation,
  useUpdateDistributionRuleMutation,
  useDeleteDistributionRuleMutation,
  // Distribution Preview
  usePreviewDistributionQuery,
  useLazyPreviewDistributionQuery,
  // Apply Distribution
  useApplyDistributionMutation,
} = incomeApi;
