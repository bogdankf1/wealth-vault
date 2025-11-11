import { apiSlice } from './apiSlice';

export type ModuleType =
  | 'income'
  | 'expenses'
  | 'subscriptions'
  | 'installments'
  | 'budgets'
  | 'savings'
  | 'portfolio'
  | 'goals'
  | 'debts'
  | 'taxes';

export interface BackupCreate {
  module_type: ModuleType;
}

export interface Backup {
  id: string;
  user_id: string;
  module_type: ModuleType;
  created_at: string;
  item_count: number;
}

export interface BackupRestoreResponse {
  success: boolean;
  message: string;
  restored_count: number;
}

// Map module types to their RTK Query cache tags
const MODULE_TAG_MAP: Record<ModuleType, string[]> = {
  income: ['Income'],
  expenses: ['Expense'],
  subscriptions: ['Subscriptions'],
  installments: ['Installments'],
  budgets: ['Budget'],
  savings: ['Saving'],
  portfolio: ['Portfolio'],
  goals: ['Goals'],
  debts: ['Debt'],
  taxes: ['Tax'],
};

export const backupsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    createBackup: builder.mutation<Backup, BackupCreate>({
      query: (data) => ({
        url: '/api/v1/backups',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Backup'],
    }),
    getBackups: builder.query<Backup[], void>({
      query: () => '/api/v1/backups',
      providesTags: ['Backup'],
    }),
    restoreBackup: builder.mutation<BackupRestoreResponse, { backupId: string; moduleType: ModuleType }>({
      query: ({ backupId }) => ({
        url: `/api/v1/backups/${backupId}/restore`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, { moduleType }) => {
        // Invalidate the cache for the restored module so data refreshes automatically
        const tags = MODULE_TAG_MAP[moduleType] || [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return [...tags, 'Dashboard'] as any;
      },
    }),
    deleteBackup: builder.mutation<void, string>({
      query: (backupId) => ({
        url: `/api/v1/backups/${backupId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Backup'],
    }),
  }),
});

export const {
  useCreateBackupMutation,
  useGetBackupsQuery,
  useRestoreBackupMutation,
  useDeleteBackupMutation,
} = backupsApi;
