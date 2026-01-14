/**
 * Goals API endpoints using RTK Query
 */
import { apiSlice } from './apiSlice';

// ============================================
// Account Link Types
// ============================================

export interface LinkedAccountInfo {
  id: string;
  name: string;
  current_balance: number;
  currency: string;
  account_type: string;
}

export interface GoalAccountLink {
  id: string;
  goal_id: string;
  account_id: string;
  allocation_type: 'full' | 'percentage' | 'fixed';
  allocation_percentage?: number;
  allocation_amount?: number;
  allocated_amount?: number; // Calculated from account balance
  account?: LinkedAccountInfo;
  created_at: string;
}

export interface GoalAccountLinkCreate {
  account_id: string;
  allocation_type: 'full' | 'percentage' | 'fixed';
  allocation_percentage?: number;
  allocation_amount?: number;
}

export interface GoalAccountLinkUpdate {
  allocation_type?: 'full' | 'percentage' | 'fixed';
  allocation_percentage?: number;
  allocation_amount?: number;
}

// ============================================
// Progress History Types
// ============================================

export interface GoalProgressHistory {
  id: string;
  goal_id: string;
  recorded_date: string;
  current_amount: number;
  target_amount: number;
  progress_percentage: number;
  linked_accounts_snapshot?: Record<string, {
    account_name: string;
    account_balance: number;
    allocation_type: string;
    allocated_amount: number;
  }>;
  trigger_type: 'manual' | 'scheduled' | 'transaction' | 'milestone';
  notes?: string;
  created_at: string;
}

export interface GoalProgressHistoryListResponse {
  items: GoalProgressHistory[];
  total: number;
  page: number;
  page_size: number;
}

export interface RecordProgressRequest {
  current_amount: number;
  notes?: string;
}

// ============================================
// Goal Types
// ============================================

export interface Goal {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  category?: string;
  target_amount: number;
  current_amount: number;
  currency: string;
  monthly_contribution?: number;
  start_date: string;
  target_date?: string;
  is_active: boolean;
  is_completed: boolean;
  completed_at?: string;
  progress_percentage?: number;
  auto_track_progress: boolean;
  created_at: string;
  updated_at: string;
  // Display currency fields
  display_target_amount?: number;
  display_current_amount?: number;
  display_monthly_contribution?: number;
  display_currency?: string;
  // Linked accounts info
  linked_accounts?: GoalAccountLink[];
  linked_accounts_total?: number;
}

export interface GoalCreate {
  name: string;
  description?: string;
  category?: string;
  target_amount: number;
  current_amount?: number;
  currency?: string;
  monthly_contribution?: number;
  start_date: string;
  target_date?: string;
  is_active?: boolean;
  auto_track_progress?: boolean;
}

export interface GoalUpdate {
  name?: string;
  description?: string;
  category?: string;
  target_amount?: number;
  current_amount?: number;
  currency?: string;
  monthly_contribution?: number;
  start_date?: string;
  target_date?: string;
  is_active?: boolean;
  is_completed?: boolean;
  auto_track_progress?: boolean;
}

export interface GoalListResponse {
  items: Goal[];
  total: number;
  page: number;
  page_size: number;
}

export interface GoalStats {
  total_goals: number;
  active_goals: number;
  completed_goals: number;
  total_target_amount: number;
  total_saved: number;
  total_remaining: number;
  average_progress: number;
  currency: string;
  by_category: Record<string, number>;
  goals_on_track: number;
  goals_behind: number;
}

export interface ListGoalsParams {
  page?: number;
  page_size?: number;
  category?: string;
  is_active?: boolean;
  is_completed?: boolean;
}

export interface GoalBatchDeleteRequest {
  ids: string[];
}

export interface GoalBatchDeleteResponse {
  deleted_count: number;
  failed_ids: string[];
}

export const goalsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // ============================================
    // Goal CRUD Endpoints
    // ============================================

    // List goals with pagination and filters
    listGoals: builder.query<GoalListResponse, ListGoalsParams | void>({
      query: (params) => ({
        url: '/api/v1/goals',
        params: params || undefined,
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map(({ id }) => ({ type: 'Goals' as const, id })),
              { type: 'Goals', id: 'LIST' },
            ]
          : [{ type: 'Goals', id: 'LIST' }],
    }),

    // Get single goal
    getGoal: builder.query<Goal, string>({
      query: (id) => `/api/v1/goals/${id}`,
      providesTags: (result, error, id) => [
        { type: 'Goals', id },
        { type: 'Goals', id: `${id}-LINKS` },
      ],
    }),

    // Create goal
    createGoal: builder.mutation<Goal, GoalCreate>({
      query: (data) => ({
        url: '/api/v1/goals',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: [
        { type: 'Goals', id: 'LIST' },
        { type: 'Goals', id: 'STATS' },
        'Dashboard',
      ],
    }),

    // Update goal
    updateGoal: builder.mutation<Goal, { id: string; data: GoalUpdate }>({
      query: ({ id, data }) => ({
        url: `/api/v1/goals/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: 'Goals', id },
        { type: 'Goals', id: 'LIST' },
        { type: 'Goals', id: 'STATS' },
        'Dashboard',
      ],
    }),

    // Delete goal
    deleteGoal: builder.mutation<void, string>({
      query: (id) => ({
        url: `/api/v1/goals/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, id) => [
        { type: 'Goals', id },
        { type: 'Goals', id: 'LIST' },
        { type: 'Goals', id: 'STATS' },
        'Dashboard',
      ],
    }),

    // Get goal statistics
    getGoalStats: builder.query<GoalStats, void>({
      query: () => '/api/v1/goals/stats',
      providesTags: [{ type: 'Goals', id: 'STATS' }],
    }),

    // Batch delete goals
    batchDeleteGoals: builder.mutation<GoalBatchDeleteResponse, GoalBatchDeleteRequest>({
      query: (data) => ({
        url: '/api/v1/goals/batch-delete',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (result) => {
        const tags = [
          { type: 'Goals' as const, id: 'LIST' },
          { type: 'Goals' as const, id: 'STATS' },
          'Dashboard' as const,
        ];
        if (result && result.deleted_count > 0) {
          result.failed_ids.forEach(id => tags.push({ type: 'Goals' as const, id }));
        }
        return tags;
      },
    }),

    // ============================================
    // Account Linking Endpoints
    // ============================================

    // Link account to goal
    linkAccountToGoal: builder.mutation<GoalAccountLink, { goalId: string; data: GoalAccountLinkCreate }>({
      query: ({ goalId, data }) => ({
        url: `/api/v1/goals/${goalId}/link-account`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (result, error, { goalId }) => [
        { type: 'Goals', id: goalId },
        { type: 'Goals', id: `${goalId}-LINKS` },
        { type: 'Goals', id: 'STATS' },
      ],
    }),

    // Get linked accounts for a goal
    getLinkedAccounts: builder.query<GoalAccountLink[], string>({
      query: (goalId) => `/api/v1/goals/${goalId}/linked-accounts`,
      providesTags: (result, error, goalId) => [
        { type: 'Goals', id: `${goalId}-LINKS` },
      ],
    }),

    // Update account link
    updateAccountLink: builder.mutation<GoalAccountLink, { goalId: string; accountId: string; data: GoalAccountLinkUpdate }>({
      query: ({ goalId, accountId, data }) => ({
        url: `/api/v1/goals/${goalId}/link-account/${accountId}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (result, error, { goalId }) => [
        { type: 'Goals', id: goalId },
        { type: 'Goals', id: `${goalId}-LINKS` },
      ],
    }),

    // Unlink account from goal
    unlinkAccountFromGoal: builder.mutation<void, { goalId: string; accountId: string }>({
      query: ({ goalId, accountId }) => ({
        url: `/api/v1/goals/${goalId}/unlink-account/${accountId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, { goalId }) => [
        { type: 'Goals', id: goalId },
        { type: 'Goals', id: `${goalId}-LINKS` },
        { type: 'Goals', id: 'STATS' },
      ],
    }),

    // ============================================
    // Progress Tracking Endpoints
    // ============================================

    // Refresh goal progress from linked accounts
    refreshGoalProgress: builder.mutation<Goal, string>({
      query: (goalId) => ({
        url: `/api/v1/goals/${goalId}/refresh-progress`,
        method: 'POST',
      }),
      invalidatesTags: (result, error, goalId) => [
        { type: 'Goals', id: goalId },
        { type: 'Goals', id: 'LIST' },
        { type: 'Goals', id: 'STATS' },
        { type: 'Goals', id: `${goalId}-HISTORY` },
        'Dashboard',
      ],
    }),

    // Record manual progress
    recordProgress: builder.mutation<GoalProgressHistory, { goalId: string; data: RecordProgressRequest }>({
      query: ({ goalId, data }) => ({
        url: `/api/v1/goals/${goalId}/record-progress`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (result, error, { goalId }) => [
        { type: 'Goals', id: goalId },
        { type: 'Goals', id: 'LIST' },
        { type: 'Goals', id: 'STATS' },
        { type: 'Goals', id: `${goalId}-HISTORY` },
        'Dashboard',
      ],
    }),

    // Get progress history
    getProgressHistory: builder.query<GoalProgressHistoryListResponse, { goalId: string; page?: number; pageSize?: number }>({
      query: ({ goalId, page = 1, pageSize = 50 }) => ({
        url: `/api/v1/goals/${goalId}/progress-history`,
        params: { page, page_size: pageSize },
      }),
      providesTags: (result, error, { goalId }) => [
        { type: 'Goals', id: `${goalId}-HISTORY` },
      ],
    }),
  }),
  overrideExisting: true,
});

export const {
  // Goal CRUD
  useListGoalsQuery,
  useGetGoalQuery,
  useCreateGoalMutation,
  useUpdateGoalMutation,
  useDeleteGoalMutation,
  useGetGoalStatsQuery,
  useBatchDeleteGoalsMutation,
  // Account linking
  useLinkAccountToGoalMutation,
  useGetLinkedAccountsQuery,
  useUpdateAccountLinkMutation,
  useUnlinkAccountFromGoalMutation,
  // Progress tracking
  useRefreshGoalProgressMutation,
  useRecordProgressMutation,
  useGetProgressHistoryQuery,
} = goalsApi;
