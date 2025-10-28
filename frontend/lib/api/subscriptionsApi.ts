/**
 * Subscriptions API endpoints using RTK Query
 */
import { apiSlice } from './apiSlice';

// Types
export type SubscriptionFrequency = 'monthly' | 'quarterly' | 'annually' | 'biannually';

export interface Subscription {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  category?: string;
  amount: number;
  currency: string;
  frequency: SubscriptionFrequency;
  start_date: string;
  end_date?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Display values (converted to user's preferred currency)
  display_amount?: number | null;
  display_currency?: string | null;
  display_monthly_equivalent?: number | null;
}

export interface SubscriptionCreate {
  name: string;
  description?: string;
  category?: string;
  amount: number;
  currency?: string;
  frequency: SubscriptionFrequency;
  start_date: string;
  end_date?: string;
  is_active?: boolean;
}

export interface SubscriptionUpdate {
  name?: string;
  description?: string;
  category?: string;
  amount?: number;
  currency?: string;
  frequency?: SubscriptionFrequency;
  start_date?: string;
  end_date?: string;
  is_active?: boolean;
}

export interface SubscriptionListResponse {
  items: Subscription[];
  total: number;
  page: number;
  page_size: number;
}

export interface SubscriptionStats {
  total_subscriptions: number;
  active_subscriptions: number;
  monthly_cost: number;
  total_annual_cost: number;
  currency: string;
  by_category: Record<string, number>;
  by_frequency: Record<string, number>;
}

export interface ListSubscriptionsParams {
  page?: number;
  page_size?: number;
  category?: string;
  frequency?: SubscriptionFrequency;
  is_active?: boolean;
}

export const subscriptionsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // List subscriptions with pagination and filters
    listSubscriptions: builder.query<SubscriptionListResponse, ListSubscriptionsParams | void>({
      query: (params) => ({
        url: '/api/v1/subscriptions',
        params: params || undefined,
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map(({ id }) => ({ type: 'Subscriptions' as const, id })),
              { type: 'Subscriptions', id: 'LIST' },
            ]
          : [{ type: 'Subscriptions', id: 'LIST' }],
    }),

    // Get single subscription
    getSubscription: builder.query<Subscription, string>({
      query: (id) => `/api/v1/subscriptions/${id}`,
      providesTags: (result, error, id) => [{ type: 'Subscriptions', id }],
    }),

    // Create subscription
    createSubscription: builder.mutation<Subscription, SubscriptionCreate>({
      query: (data) => ({
        url: '/api/v1/subscriptions',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: [
        { type: 'Subscriptions', id: 'LIST' },
        { type: 'Subscriptions', id: 'STATS' },
        'Dashboard',
      ],
    }),

    // Update subscription
    updateSubscription: builder.mutation<Subscription, { id: string; data: SubscriptionUpdate }>({
      query: ({ id, data }) => ({
        url: `/api/v1/subscriptions/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: 'Subscriptions', id },
        { type: 'Subscriptions', id: 'LIST' },
        { type: 'Subscriptions', id: 'STATS' },
        'Dashboard',
      ],
    }),

    // Delete subscription
    deleteSubscription: builder.mutation<void, string>({
      query: (id) => ({
        url: `/api/v1/subscriptions/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, id) => [
        { type: 'Subscriptions', id },
        { type: 'Subscriptions', id: 'LIST' },
        { type: 'Subscriptions', id: 'STATS' },
        'Dashboard',
      ],
    }),

    // Get subscription statistics
    getSubscriptionStats: builder.query<SubscriptionStats, { start_date?: string; end_date?: string } | void>({
      query: (params) => ({
        url: '/api/v1/subscriptions/stats',
        params: params || undefined,
      }),
      providesTags: [{ type: 'Subscriptions', id: 'STATS' }],
    }),
  }),
  overrideExisting: true,
});

export const {
  useListSubscriptionsQuery,
  useGetSubscriptionQuery,
  useCreateSubscriptionMutation,
  useUpdateSubscriptionMutation,
  useDeleteSubscriptionMutation,
  useGetSubscriptionStatsQuery,
} = subscriptionsApi;
