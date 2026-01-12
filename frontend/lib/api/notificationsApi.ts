/**
 * Notifications API endpoints using RTK Query
 */
import { apiSlice } from './apiSlice';

// Types
export type NotificationType = 'alert' | 'reminder' | 'achievement' | 'warning' | 'info';
export type NotificationCategory =
  | 'budget'
  | 'goal'
  | 'subscription'
  | 'installment'
  | 'debt'
  | 'savings'
  | 'portfolio'
  | 'income'
  | 'expense'
  | 'billing'
  | 'system';

export interface Notification {
  id: string;
  user_id: string;
  notification_type: NotificationType;
  category: NotificationCategory;
  title: string;
  message: string;
  priority: number;
  is_read: boolean;
  read_at: string | null;
  action_url: string | null;
  extra_data: Record<string, unknown> | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationListResponse {
  items: Notification[];
  total: number;
  unread_count: number;
  page: number;
  page_size: number;
}

export interface UnreadCountResponse {
  unread_count: number;
  has_urgent: boolean;
}

export interface NotificationStatsResponse {
  total: number;
  unread: number;
  by_type: Record<string, number>;
  by_category: Record<string, number>;
  by_priority: Record<number, number>;
}

export interface NotificationBatchResponse {
  success_count: number;
  failed_count: number;
  failed_ids: string[];
}

export interface ListNotificationsParams {
  page?: number;
  page_size?: number;
  notification_type?: NotificationType;
  category?: NotificationCategory;
  is_read?: boolean;
  priority?: number;
}

export interface MarkReadRequest {
  notification_ids: string[];
}

export interface MarkAllReadRequest {
  category?: NotificationCategory;
}

export interface BatchDeleteRequest {
  notification_ids: string[];
}

export const notificationsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // List notifications with pagination and filters
    listNotifications: builder.query<NotificationListResponse, ListNotificationsParams | void>({
      query: (params) => ({
        url: '/api/v1/notifications',
        params: params || undefined,
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map(({ id }) => ({ type: 'Notification' as const, id })),
              { type: 'Notification', id: 'LIST' },
            ]
          : [{ type: 'Notification', id: 'LIST' }],
    }),

    // Get unread count (for badge)
    getUnreadCount: builder.query<UnreadCountResponse, void>({
      query: () => '/api/v1/notifications/unread-count',
      providesTags: [{ type: 'Notification', id: 'UNREAD_COUNT' }],
    }),

    // Get notification statistics
    getNotificationStats: builder.query<NotificationStatsResponse, void>({
      query: () => '/api/v1/notifications/stats',
      providesTags: [{ type: 'Notification', id: 'STATS' }],
    }),

    // Get single notification
    getNotification: builder.query<Notification, string>({
      query: (id) => `/api/v1/notifications/${id}`,
      providesTags: (result, error, id) => [{ type: 'Notification', id }],
    }),

    // Mark specific notifications as read
    markNotificationsRead: builder.mutation<NotificationBatchResponse, MarkReadRequest>({
      query: (data) => ({
        url: '/api/v1/notifications/mark-read',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (result, error, { notification_ids }) => [
        { type: 'Notification', id: 'LIST' },
        { type: 'Notification', id: 'UNREAD_COUNT' },
        { type: 'Notification', id: 'STATS' },
        ...notification_ids.map((id) => ({ type: 'Notification' as const, id })),
      ],
    }),

    // Mark all notifications as read
    markAllNotificationsRead: builder.mutation<NotificationBatchResponse, MarkAllReadRequest | void>({
      query: (data) => ({
        url: '/api/v1/notifications/mark-all-read',
        method: 'POST',
        body: data || {},
      }),
      invalidatesTags: [
        { type: 'Notification', id: 'LIST' },
        { type: 'Notification', id: 'UNREAD_COUNT' },
        { type: 'Notification', id: 'STATS' },
      ],
    }),

    // Delete specific notifications
    deleteNotifications: builder.mutation<NotificationBatchResponse, BatchDeleteRequest>({
      query: (data) => ({
        url: '/api/v1/notifications/delete',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (result, error, { notification_ids }) => [
        { type: 'Notification', id: 'LIST' },
        { type: 'Notification', id: 'UNREAD_COUNT' },
        { type: 'Notification', id: 'STATS' },
        ...notification_ids.map((id) => ({ type: 'Notification' as const, id })),
      ],
    }),

    // Delete single notification
    deleteNotification: builder.mutation<void, string>({
      query: (id) => ({
        url: `/api/v1/notifications/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, id) => [
        { type: 'Notification', id },
        { type: 'Notification', id: 'LIST' },
        { type: 'Notification', id: 'UNREAD_COUNT' },
        { type: 'Notification', id: 'STATS' },
      ],
    }),
  }),
  overrideExisting: true,
});

export const {
  useListNotificationsQuery,
  useGetUnreadCountQuery,
  useGetNotificationStatsQuery,
  useGetNotificationQuery,
  useMarkNotificationsReadMutation,
  useMarkAllNotificationsReadMutation,
  useDeleteNotificationsMutation,
  useDeleteNotificationMutation,
} = notificationsApi;
