/**
 * Savings API endpoints using RTK Query
 */
import { apiSlice } from './apiSlice';

// Types
export type AccountType = 'checking' | 'savings' | 'investment' | 'cash' | 'crypto' | 'other';

export interface SavingsAccount {
  id: string;
  user_id: string;
  name: string;
  account_type: AccountType;
  institution?: string;
  account_number_last4?: string;
  current_balance: number;
  currency: string;
  is_active: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface SavingsAccountCreate {
  name: string;
  account_type: AccountType;
  institution?: string;
  account_number_last4?: string;
  current_balance: number;
  currency?: string;
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
  is_active?: boolean;
  notes?: string;
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
} = savingsApi;
