/**
 * RTK Query API slice for admin endpoints
 */
import { apiSlice } from './apiSlice';

// Types
export interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  tier_name: string | null;
  tier_display_name: string | null;
  created_at: string;
  is_active: boolean;
}

export interface UserDetail {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  google_id: string | null;
  apple_id: string | null;
  role: string;
  tier_id: string | null;
  tier_name: string | null;
  tier_display_name: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface UserListResponse {
  users: User[];
  total: number;
  page: number;
  page_size: number;
}

export interface Tier {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  price_monthly: number;
  price_annual: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Feature {
  id: string;
  key: string;
  name: string;
  description: string | null;
  module: string | null;
  created_at: string;
}

export interface TierFeature {
  tier_id: string;
  feature_id: string;
  feature_key: string;
  feature_name: string;
  enabled: boolean;
  limit_value: number | null;
}

export interface Configuration {
  id: string;
  key: string;
  value: Record<string, unknown>;
  description: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  html_content: string;
  text_content: string | null;
  variables: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlatformStats {
  total_users: number;
  active_users: number;
  new_users_today: number;
  new_users_this_week: number;
  new_users_this_month: number;
  total_subscriptions: number;
  active_subscriptions: number;
  mrr: number;
  arr: number;
  churn_rate: number;
}

export interface UserAcquisition {
  date: string;
  count: number;
}

export interface EngagementMetrics {
  dau: number;
  wau: number;
  mau: number;
  avg_session_duration: number | null;
  retention_rate_30d: number;
}

export const adminApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // User Management
    getUsers: builder.query<UserListResponse, { page?: number; page_size?: number; search?: string; role?: string; tier_name?: string }>({
      query: (params) => ({
        url: '/api/v1/admin/users',
        params,
      }),
      providesTags: ['Users'],
    }),
    getUserById: builder.query<UserDetail, string>({
      query: (userId) => `/api/v1/admin/users/${userId}`,
      providesTags: (result, error, id) => [{ type: 'Users', id }],
    }),
    updateUser: builder.mutation<UserDetail, { userId: string; tier_id?: string; role?: string }>({
      query: ({ userId, ...body }) => ({
        url: `/api/v1/admin/users/${userId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (result, error, { userId }) => [{ type: 'Users', id: userId }, 'Users'],
    }),
    impersonateUser: builder.mutation<{ token: string; user: UserDetail }, string>({
      query: (userId) => ({
        url: `/api/v1/admin/users/${userId}/impersonate`,
        method: 'POST',
      }),
    }),
    suspendUser: builder.mutation<UserDetail, { userId: string; reason?: string }>({
      query: ({ userId, reason }) => ({
        url: `/api/v1/admin/users/${userId}/suspend`,
        method: 'POST',
        body: { reason },
      }),
      invalidatesTags: (result, error, { userId }) => [{ type: 'Users', id: userId }, 'Users'],
    }),
    unsuspendUser: builder.mutation<UserDetail, string>({
      query: (userId) => ({
        url: `/api/v1/admin/users/${userId}/unsuspend`,
        method: 'POST',
      }),
      invalidatesTags: (result, error, userId) => [{ type: 'Users', id: userId }, 'Users'],
    }),

    // Tier Management
    getAdminTiers: builder.query<Tier[], void>({
      query: () => '/api/v1/admin/tiers',
      providesTags: ['Tiers'],
    }),
    getTierById: builder.query<Tier, string>({
      query: (tierId) => `/api/v1/admin/tiers/${tierId}`,
      providesTags: (result, error, id) => [{ type: 'Tiers', id }],
    }),
    updateTier: builder.mutation<Tier, { tierId: string; display_name?: string; description?: string; price_monthly?: number; price_annual?: number; is_active?: boolean }>({
      query: ({ tierId, ...body }) => ({
        url: `/api/v1/admin/tiers/${tierId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (result, error, { tierId }) => [{ type: 'Tiers', id: tierId }, 'Tiers'],
    }),
    getTierFeatures: builder.query<TierFeature[], string>({
      query: (tierId) => `/api/v1/admin/tiers/${tierId}/features`,
      providesTags: (result, error, tierId) => [{ type: 'TierFeatures', id: tierId }],
    }),
    assignFeatureToTier: builder.mutation<TierFeature, { tierId: string; feature_id: string; enabled: boolean; limit_value?: number | null }>({
      query: ({ tierId, ...body }) => ({
        url: `/api/v1/admin/tiers/${tierId}/features`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (result, error, { tierId }) => [{ type: 'TierFeatures', id: tierId }],
    }),
    getAllFeatures: builder.query<Feature[], void>({
      query: () => '/api/v1/admin/tiers/features/all',
      providesTags: ['Features'],
    }),

    // Configuration
    getConfigurations: builder.query<Configuration[], void>({
      query: () => '/api/v1/admin/config/settings',
      providesTags: ['Configurations'],
    }),
    createConfiguration: builder.mutation<Configuration, { key: string; value: Record<string, unknown>; description?: string; is_system?: boolean }>({
      query: (body) => ({
        url: '/api/v1/admin/config/settings',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Configurations'],
    }),
    updateConfiguration: builder.mutation<Configuration, { configId: string; value?: Record<string, unknown>; description?: string }>({
      query: ({ configId, ...body }) => ({
        url: `/api/v1/admin/config/settings/${configId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (result, error, { configId }) => [{ type: 'Configurations', id: configId }, 'Configurations'],
    }),
    deleteConfiguration: builder.mutation<void, string>({
      query: (configId) => ({
        url: `/api/v1/admin/config/settings/${configId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Configurations'],
    }),

    // Email Templates
    getEmailTemplates: builder.query<EmailTemplate[], void>({
      query: () => '/api/v1/admin/config/email-templates',
      providesTags: ['EmailTemplates'],
    }),
    getEmailTemplateById: builder.query<EmailTemplate, string>({
      query: (templateId) => `/api/v1/admin/config/email-templates/${templateId}`,
      providesTags: (result, error, id) => [{ type: 'EmailTemplates', id }],
    }),
    createEmailTemplate: builder.mutation<EmailTemplate, { name: string; subject: string; html_content: string; text_content?: string; variables?: Record<string, unknown>; is_active?: boolean }>({
      query: (body) => ({
        url: '/api/v1/admin/config/email-templates',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['EmailTemplates'],
    }),
    updateEmailTemplate: builder.mutation<EmailTemplate, { templateId: string; subject?: string; html_content?: string; text_content?: string; variables?: Record<string, unknown>; is_active?: boolean }>({
      query: ({ templateId, ...body }) => ({
        url: `/api/v1/admin/config/email-templates/${templateId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (result, error, { templateId }) => [{ type: 'EmailTemplates', id: templateId }, 'EmailTemplates'],
    }),

    // Analytics
    getPlatformStats: builder.query<PlatformStats, void>({
      query: () => '/api/v1/admin/analytics/platform-stats',
    }),
    getUserAcquisition: builder.query<UserAcquisition[], number>({
      query: (days = 30) => ({
        url: '/api/v1/admin/analytics/user-acquisition',
        params: { days },
      }),
    }),
    getEngagementMetrics: builder.query<EngagementMetrics, void>({
      query: () => '/api/v1/admin/analytics/engagement',
    }),
  }),
});

export const {
  // User Management
  useGetUsersQuery,
  useGetUserByIdQuery,
  useUpdateUserMutation,
  useImpersonateUserMutation,
  useSuspendUserMutation,
  useUnsuspendUserMutation,

  // Tier Management
  useGetAdminTiersQuery,
  useGetTierByIdQuery,
  useUpdateTierMutation,
  useGetTierFeaturesQuery,
  useAssignFeatureToTierMutation,
  useGetAllFeaturesQuery,

  // Configuration
  useGetConfigurationsQuery,
  useCreateConfigurationMutation,
  useUpdateConfigurationMutation,
  useDeleteConfigurationMutation,

  // Email Templates
  useGetEmailTemplatesQuery,
  useGetEmailTemplateByIdQuery,
  useCreateEmailTemplateMutation,
  useUpdateEmailTemplateMutation,

  // Analytics
  useGetPlatformStatsQuery,
  useGetUserAcquisitionQuery,
  useGetEngagementMetricsQuery,
} = adminApi;
