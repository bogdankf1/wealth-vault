import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { getSession } from 'next-auth/react';

const baseQuery = fetchBaseQuery({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  prepareHeaders: async (headers) => {
    const session = await getSession();
    if (session?.accessToken) {
      headers.set('Authorization', `Bearer ${session.accessToken}`);
    }
    return headers;
  },
});

export interface EmailNotifications {
  marketing: boolean;
  product_updates: boolean;
  security_alerts: boolean;
  billing: boolean;
  weekly_summary: boolean;
}

export interface PushNotifications {
  budget_alerts: boolean;
  goal_milestones: boolean;
  subscription_reminders: boolean;
  income_notifications: boolean;
}

export interface AnalyticsOptOut {
  usage_analytics: boolean;
  error_reporting: boolean;
  performance_monitoring: boolean;
}

export interface DashboardLayout {
  widgets: string[];
  widget_order: string[] | null;
}

export interface UserPreferences {
  id: string;
  user_id: string;
  theme: 'light' | 'dark' | 'system';
  accent_color: 'blue' | 'purple' | 'green' | 'orange' | 'red' | 'pink' | 'indigo' | 'teal';
  font_size: 'small' | 'medium' | 'large';
  language: string;
  timezone: string;
  currency: string;
  date_format: string;
  email_notifications: EmailNotifications;
  push_notifications: PushNotifications;
  analytics_opt_out: AnalyticsOptOut;
  data_visibility: 'private' | 'anonymous';
  dashboard_layout: DashboardLayout;
  created_at: string;
  updated_at: string;
}

export interface UserPreferencesUpdate {
  theme?: 'light' | 'dark' | 'system';
  accent_color?: 'blue' | 'purple' | 'green' | 'orange' | 'red' | 'pink' | 'indigo' | 'teal';
  font_size?: 'small' | 'medium' | 'large';
  language?: string;
  timezone?: string;
  currency?: string;
  date_format?: string;
  email_notifications?: EmailNotifications;
  push_notifications?: PushNotifications;
  analytics_opt_out?: AnalyticsOptOut;
  data_visibility?: 'private' | 'anonymous';
  dashboard_layout?: DashboardLayout;
}

export const preferencesApi = createApi({
  reducerPath: 'preferencesApi',
  baseQuery: baseQuery,
  tagTypes: ['Preferences'],
  endpoints: (builder) => ({
    getMyPreferences: builder.query<UserPreferences, void>({
      query: () => '/api/v1/preferences/me',
      providesTags: ['Preferences'],
    }),
    updateMyPreferences: builder.mutation<UserPreferences, UserPreferencesUpdate>({
      query: (preferences) => ({
        url: '/api/v1/preferences/me',
        method: 'PUT',
        body: preferences,
      }),
      invalidatesTags: ['Preferences'],
    }),
    resetMyPreferences: builder.mutation<UserPreferences, void>({
      query: () => ({
        url: '/api/v1/preferences/me/reset',
        method: 'POST',
      }),
      invalidatesTags: ['Preferences'],
    }),
  }),
});

export const {
  useGetMyPreferencesQuery,
  useUpdateMyPreferencesMutation,
  useResetMyPreferencesMutation,
} = preferencesApi;
