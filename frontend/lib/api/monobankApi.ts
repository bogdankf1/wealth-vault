/**
 * Monobank integration API endpoints.
 */
import { apiSlice } from './apiSlice';

export interface MonoAccount {
  mono_account_id: string;
  kind: 'account' | 'jar';
  type?: string | null;
  title?: string | null;
  iban?: string | null;
  masked_pan?: string | null;
  currency: string;
  balance: number;
  credit_limit: number;
  linked_savings_account_id?: string | null;
}

export interface MonoAccountList {
  accounts: MonoAccount[];
  jars: MonoAccount[];
}

export interface ConnectionStatus {
  connected: boolean;
  status?: string | null;
  mono_client_name?: string | null;
  last_full_sync_at?: string | null;
  last_webhook_at?: string | null;
  webhook_registered: boolean;
  last_error?: string | null;
}

export interface ConnectRequest {
  token: string;
}

export interface LinkAccountRequest {
  savings_account_id?: string | null;
  backfill_months?: number;
}

export interface LinkAccountResponse {
  savings_account_id: string;
  backfill_task_id?: string | null;
}

const BASE = '/api/v1/integrations/monobank';

export const monobankApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getMonobankStatus: builder.query<ConnectionStatus, void>({
      query: () => `${BASE}/status`,
      providesTags: [{ type: 'Monobank', id: 'STATUS' }],
    }),

    connectMonobank: builder.mutation<ConnectionStatus, ConnectRequest>({
      query: (body) => ({
        url: `${BASE}/connect`,
        method: 'POST',
        body,
      }),
      invalidatesTags: [
        { type: 'Monobank', id: 'STATUS' },
        { type: 'Monobank', id: 'ACCOUNTS' },
      ],
    }),

    disconnectMonobank: builder.mutation<{ removed: boolean }, void>({
      query: () => ({
        url: `${BASE}/connection`,
        method: 'DELETE',
      }),
      invalidatesTags: [
        { type: 'Monobank', id: 'STATUS' },
        { type: 'Monobank', id: 'ACCOUNTS' },
        { type: 'Saving', id: 'LIST' },
      ],
    }),

    listMonobankAccounts: builder.query<MonoAccountList, void>({
      query: () => `${BASE}/accounts`,
      providesTags: [{ type: 'Monobank', id: 'ACCOUNTS' }],
    }),

    linkMonobankAccount: builder.mutation<
      LinkAccountResponse,
      { monoAccountId: string; body: LinkAccountRequest }
    >({
      query: ({ monoAccountId, body }) => ({
        url: `${BASE}/accounts/${encodeURIComponent(monoAccountId)}/link`,
        method: 'POST',
        body,
      }),
      invalidatesTags: [
        { type: 'Monobank', id: 'ACCOUNTS' },
        { type: 'Saving', id: 'LIST' },
      ],
    }),
  }),
});

export const {
  useGetMonobankStatusQuery,
  useConnectMonobankMutation,
  useDisconnectMonobankMutation,
  useListMonobankAccountsQuery,
  useLinkMonobankAccountMutation,
} = monobankApi;
