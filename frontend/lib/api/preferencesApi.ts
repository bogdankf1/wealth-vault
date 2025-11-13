import { apiSlice } from './apiSlice';

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
  default_content_view: 'card' | 'list' | 'calendar';
  default_stats_view: 'cards' | 'compact';
  language: string;
  timezone: string;
  currency: string;
  display_currency?: string;
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
  default_content_view?: 'card' | 'list' | 'calendar';
  default_stats_view?: 'cards' | 'compact';
  language?: string;
  timezone?: string;
  currency?: string;
  display_currency?: string;
  date_format?: string;
  email_notifications?: EmailNotifications;
  push_notifications?: PushNotifications;
  analytics_opt_out?: AnalyticsOptOut;
  data_visibility?: 'private' | 'anonymous';
  dashboard_layout?: DashboardLayout;
}

export const preferencesApi = apiSlice.injectEndpoints({
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
      invalidatesTags: ['Preferences', { type: 'Expense', id: 'STATS' }, { type: 'Expense', id: 'LIST' }, { type: 'Income', id: 'STATS' }, { type: 'Income', id: 'LIST' }, { type: 'Subscriptions', id: 'STATS' }, { type: 'Subscriptions', id: 'LIST' }, { type: 'Installments', id: 'STATS' }, { type: 'Installments', id: 'LIST' }, { type: 'Goals', id: 'STATS' }, { type: 'Goals', id: 'LIST' }, { type: 'Saving', id: 'STATS' }, { type: 'Saving', id: 'LIST' }, { type: 'Budget', id: 'OVERVIEW' }, { type: 'Budget', id: 'LIST' }, { type: 'Portfolio', id: 'STATS' }, { type: 'Portfolio', id: 'LIST' }, { type: 'Tax', id: 'STATS' }, { type: 'Tax', id: 'LIST' }, { type: 'Debt', id: 'STATS' }, { type: 'Debt', id: 'LIST' }, 'Dashboard'],
    }),
    resetMyPreferences: builder.mutation<UserPreferences, void>({
      query: () => ({
        url: '/api/v1/preferences/me/reset',
        method: 'POST',
      }),
      invalidatesTags: ['Preferences', { type: 'Expense', id: 'STATS' }, { type: 'Expense', id: 'LIST' }, { type: 'Income', id: 'STATS' }, { type: 'Income', id: 'LIST' }, { type: 'Subscriptions', id: 'STATS' }, { type: 'Subscriptions', id: 'LIST' }, { type: 'Installments', id: 'STATS' }, { type: 'Installments', id: 'LIST' }, { type: 'Goals', id: 'STATS' }, { type: 'Goals', id: 'LIST' }, { type: 'Saving', id: 'STATS' }, { type: 'Saving', id: 'LIST' }, { type: 'Budget', id: 'OVERVIEW' }, { type: 'Budget', id: 'LIST' }, { type: 'Portfolio', id: 'STATS' }, { type: 'Portfolio', id: 'LIST' }, { type: 'Tax', id: 'STATS' }, { type: 'Tax', id: 'LIST' }, { type: 'Debt', id: 'STATS' }, { type: 'Debt', id: 'LIST' }, 'Dashboard'],
    }),
  }),
});

export const {
  useGetMyPreferencesQuery,
  useUpdateMyPreferencesMutation,
  useResetMyPreferencesMutation,
} = preferencesApi;
