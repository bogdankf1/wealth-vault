/**
 * Savings API endpoints using RTK Query
 */
import { apiSlice } from './apiSlice';

// Types
export type AccountType = 'crypto' | 'cash' | 'business' | 'personal' | 'fixed_deposit' | 'other';
export type InterestFrequency = 'daily' | 'monthly' | 'quarterly' | 'annually';
export type InterestMethod = 'simple' | 'compound';
export type TransactionType = 'deposit' | 'withdrawal' | 'transfer_in' | 'transfer_out' | 'interest' | 'fee' | 'adjustment';
export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'reversed';

export interface SavingsAccount {
  id: string;
  user_id: string;
  name: string;
  account_type: AccountType;
  institution?: string;
  account_number_last4?: string;
  current_balance: number;
  currency: string;
  // Interest settings
  interest_rate?: number;
  interest_frequency: string;
  interest_accrual_method: string;
  last_interest_accrual?: string;
  accrued_interest: number;
  is_active: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Display currency fields
  display_current_balance?: number;
  display_currency?: string;
  // Account type display label
  account_type_label?: string;
  // Interest rate as percentage (computed)
  interest_rate_percent?: number;
}

export interface SavingsAccountCreate {
  name: string;
  account_type: AccountType;
  institution?: string;
  account_number_last4?: string;
  current_balance: number;
  currency?: string;
  // Interest settings
  interest_rate?: number;
  interest_frequency?: string;
  interest_accrual_method?: string;
  is_active?: boolean;
  notes?: string;
}

export interface SavingsAccountUpdate {
  name?: string;
  account_type?: AccountType;
  institution?: string;
  account_number_last4?: string;
  current_balance?: number;
  currency?: string;
  // Interest settings
  interest_rate?: number;
  interest_frequency?: string;
  interest_accrual_method?: string;
  is_active?: boolean;
  notes?: string;
}

// Transaction interfaces
export interface AccountTransaction {
  id: string;
  account_id: string;
  user_id: string;
  transaction_type: TransactionType;
  amount: number;
  currency: string;
  balance_before: number;
  balance_after: number;
  source_type?: string;
  source_id?: string;
  description?: string;
  category?: string;
  reference_number?: string;
  transaction_date: string;
  posted_date?: string;
  status: TransactionStatus;
  created_at: string;
  updated_at: string;
}

export interface TransactionListResponse {
  items: AccountTransaction[];
  total: number;
  page: number;
  page_size: number;
}

export interface DepositCreate {
  amount: number;
  description?: string;
  category?: string;
  reference_number?: string;
  transaction_date?: string;
  source_type?: string;
  source_id?: string;
}

export interface WithdrawalCreate {
  amount: number;
  description?: string;
  category?: string;
  reference_number?: string;
  transaction_date?: string;
  source_type?: string;
  source_id?: string;
}

// Transfer interfaces
export interface AccountTransfer {
  id: string;
  user_id: string;
  from_account_id: string;
  to_account_id: string;
  amount: number;
  from_currency: string;
  to_currency?: string;
  exchange_rate?: number;
  converted_amount?: number;
  from_transaction_id?: string;
  to_transaction_id?: string;
  description?: string;
  transfer_date: string;
  status: string;
  created_at: string;
  updated_at: string;
  from_account_name?: string;
  to_account_name?: string;
}

export interface TransferCreate {
  from_account_id: string;
  to_account_id: string;
  amount: number;
  description?: string;
  exchange_rate?: number;
  transfer_date?: string;
}

export interface TransferListResponse {
  items: AccountTransfer[];
  total: number;
  page: number;
  page_size: number;
}

// Interest interfaces
export interface InterestCalculation {
  account_id: string;
  has_interest: boolean;
  balance?: number;
  interest_rate?: number;
  accrual_method?: string;
  days_elapsed?: number;
  accrued_interest: number;
  pending_interest: number;
  total_after_posting?: number;
  last_accrual_date?: string;
  message?: string;
}

export interface PostInterestResponse {
  success: boolean;
  transaction?: AccountTransaction;
  message: string;
}

export interface SavingsAccountListResponse {
  items: SavingsAccount[];
  total: number;
  page: number;
  page_size: number;
}

export interface BalanceHistory {
  id: string;
  account_id: string;
  balance: number;
  date: string;
  change_amount?: number;
  change_reason?: string;
  created_at: string;
}

export interface BalanceHistoryListResponse {
  items: BalanceHistory[];
  total: number;
}

export interface SavingsStats {
  total_accounts: number;
  active_accounts: number;
  total_balance_usd: number;
  total_balance_by_currency: Record<string, number>;
  total_balance_by_type: Record<string, number>;
  net_worth: number;
  currency: string;
}

export interface ListAccountsParams {
  page?: number;
  page_size?: number;
  account_type?: AccountType;
  is_active?: boolean;
}

export type SourceType = 'manual' | 'subscription' | 'installment' | 'portfolio' | 'portfolio_dividend' | 'income' | 'expense' | 'debt' | 'transfer' | 'interest' | 'reversal';

export interface ListTransactionsParams {
  accountId: string;
  page?: number;
  page_size?: number;
  transaction_type?: TransactionType;
  source_type?: SourceType;
  search?: string;
  start_date?: string;
  end_date?: string;
}

export interface ListTransfersParams {
  account_id?: string;
  page?: number;
  page_size?: number;
}


export interface SavingsAccountBatchDeleteRequest {
  ids: string[];
}

export interface SavingsAccountBatchDeleteResponse {
  deleted_count: number;
  failed_ids: string[];
}

export const savingsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // List accounts with pagination and filters
    listAccounts: builder.query<SavingsAccountListResponse, ListAccountsParams | void>({
      query: (params) => ({
        url: '/api/v1/savings/accounts',
        params: params || undefined,
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map(({ id }) => ({ type: 'Saving' as const, id })),
              { type: 'Saving', id: 'LIST' },
            ]
          : [{ type: 'Saving', id: 'LIST' }],
    }),

    // Get single account
    getAccount: builder.query<SavingsAccount, string>({
      query: (id) => `/api/v1/savings/accounts/${id}`,
      providesTags: (result, error, id) => [{ type: 'Saving', id }],
    }),

    // Create account
    createAccount: builder.mutation<SavingsAccount, SavingsAccountCreate>({
      query: (data) => ({
        url: '/api/v1/savings/accounts',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: [
        { type: 'Saving', id: 'LIST' },
        { type: 'Saving', id: 'STATS' },
        'Dashboard',
      ],
    }),

    // Update account
    updateAccount: builder.mutation<SavingsAccount, { id: string; data: SavingsAccountUpdate }>({
      query: ({ id, data }) => ({
        url: `/api/v1/savings/accounts/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: 'Saving', id },
        { type: 'Saving', id: 'LIST' },
        { type: 'Saving', id: 'STATS' },
        'Dashboard',
      ],
    }),

    // Delete account
    deleteAccount: builder.mutation<void, string>({
      query: (id) => ({
        url: `/api/v1/savings/accounts/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, id) => [
        { type: 'Saving', id },
        { type: 'Saving', id: 'LIST' },
        { type: 'Saving', id: 'STATS' },
        'Dashboard',
      ],
    }),

    // Get balance history
    getBalanceHistory: builder.query<BalanceHistoryListResponse, { accountId: string; days?: number }>({
      query: ({ accountId, days = 30 }) => ({
        url: `/api/v1/savings/accounts/${accountId}/history`,
        params: { days },
      }),
    }),

    // Get savings statistics
    getSavingsStats: builder.query<SavingsStats, void>({
      query: () => '/api/v1/savings/stats',
      providesTags: [{ type: 'Saving', id: 'STATS' }],
    }),

    // Batch delete savings accounts
    batchDeleteSavingsAccounts: builder.mutation<SavingsAccountBatchDeleteResponse, SavingsAccountBatchDeleteRequest>({
      query: (data) => ({
        url: '/api/v1/savings/accounts/batch-delete',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (result) => {
        const tags = [
          { type: 'Saving' as const, id: 'LIST' },
          { type: 'Saving' as const, id: 'STATS' },
          'Dashboard' as const,
        ];
        if (result && result.deleted_count > 0) {
          result.failed_ids.forEach(id => tags.push({ type: 'Saving' as const, id }));
        }
        return tags;
      },
    }),

    // ================== Transactions ==================

    // Create deposit
    createDeposit: builder.mutation<AccountTransaction, { accountId: string; data: DepositCreate }>({
      query: ({ accountId, data }) => ({
        url: `/api/v1/savings/accounts/${accountId}/deposit`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (result, error, { accountId }) => [
        { type: 'Saving', id: accountId },
        { type: 'Saving', id: 'LIST' },
        { type: 'Saving', id: 'STATS' },
        { type: 'Saving', id: `TRANSACTIONS_${accountId}` },
        'Dashboard',
      ],
    }),

    // Create withdrawal
    createWithdrawal: builder.mutation<AccountTransaction, { accountId: string; data: WithdrawalCreate }>({
      query: ({ accountId, data }) => ({
        url: `/api/v1/savings/accounts/${accountId}/withdraw`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (result, error, { accountId }) => [
        { type: 'Saving', id: accountId },
        { type: 'Saving', id: 'LIST' },
        { type: 'Saving', id: 'STATS' },
        { type: 'Saving', id: `TRANSACTIONS_${accountId}` },
        'Dashboard',
      ],
    }),

    // List transactions for an account
    listTransactions: builder.query<TransactionListResponse, ListTransactionsParams>({
      query: ({ accountId, ...params }) => ({
        url: `/api/v1/savings/accounts/${accountId}/transactions`,
        params,
      }),
      providesTags: (result, error, { accountId }) => [
        { type: 'Saving', id: `TRANSACTIONS_${accountId}` },
      ],
    }),

    // ================== Transfers ==================

    // Create transfer between accounts
    createTransfer: builder.mutation<AccountTransfer, TransferCreate>({
      query: (data) => ({
        url: '/api/v1/savings/transfers',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (result) => [
        { type: 'Saving', id: result?.from_account_id },
        { type: 'Saving', id: result?.to_account_id },
        { type: 'Saving', id: 'LIST' },
        { type: 'Saving', id: 'STATS' },
        { type: 'Saving', id: 'TRANSFERS' },
        { type: 'Saving', id: `TRANSACTIONS_${result?.from_account_id}` },
        { type: 'Saving', id: `TRANSACTIONS_${result?.to_account_id}` },
        'Dashboard',
      ],
    }),

    // List transfers
    listTransfers: builder.query<TransferListResponse, ListTransfersParams | void>({
      query: (params) => ({
        url: '/api/v1/savings/transfers',
        params: params || undefined,
      }),
      providesTags: [{ type: 'Saving', id: 'TRANSFERS' }],
    }),

    // ================== Interest ==================

    // Calculate interest (preview)
    calculateInterest: builder.query<InterestCalculation, string>({
      query: (accountId) => `/api/v1/savings/accounts/${accountId}/interest`,
    }),

    // Accrue interest (add to pending)
    accrueInterest: builder.mutation<InterestCalculation, string>({
      query: (accountId) => ({
        url: `/api/v1/savings/accounts/${accountId}/interest/accrue`,
        method: 'POST',
      }),
      invalidatesTags: (result, error, accountId) => [
        { type: 'Saving', id: accountId },
      ],
    }),

    // Post interest (add to balance as transaction)
    postInterest: builder.mutation<PostInterestResponse, string>({
      query: (accountId) => ({
        url: `/api/v1/savings/accounts/${accountId}/interest/post`,
        method: 'POST',
      }),
      invalidatesTags: (result, error, accountId) => [
        { type: 'Saving', id: accountId },
        { type: 'Saving', id: 'LIST' },
        { type: 'Saving', id: 'STATS' },
        { type: 'Saving', id: `TRANSACTIONS_${accountId}` },
        'Dashboard',
      ],
    }),
  }),
  overrideExisting: true,
});

export const {
  useListAccountsQuery,
  useGetAccountQuery,
  useCreateAccountMutation,
  useUpdateAccountMutation,
  useDeleteAccountMutation,
  useGetBalanceHistoryQuery,
  useGetSavingsStatsQuery,
  useBatchDeleteSavingsAccountsMutation,
  // Transactions
  useCreateDepositMutation,
  useCreateWithdrawalMutation,
  useListTransactionsQuery,
  // Transfers
  useCreateTransferMutation,
  useListTransfersQuery,
  // Interest
  useCalculateInterestQuery,
  useAccrueInterestMutation,
  usePostInterestMutation,
} = savingsApi;
