/**
 * Goals API endpoints using RTK Query
 */
import { apiSlice } from './apiSlice';

// Types
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
  created_at: string;
  updated_at: string;
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

export const goalsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
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
      providesTags: (result, error, id) => [{ type: 'Goals', id }],
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
  }),
  overrideExisting: true,
});

export const {
  useListGoalsQuery,
  useGetGoalQuery,
  useCreateGoalMutation,
  useUpdateGoalMutation,
  useDeleteGoalMutation,
  useGetGoalStatsQuery,
} = goalsApi;
