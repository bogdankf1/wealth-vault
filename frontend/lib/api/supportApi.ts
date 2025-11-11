import { apiSlice } from './apiSlice';

export enum SupportTopicStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
}

export interface SupportTopicCreate {
  title: string;
  message: string;
}

export interface SupportMessageCreate {
  message: string;
}

export interface SupportTopicStatusUpdate {
  status: SupportTopicStatus;
}

export interface SupportMessage {
  id: string;
  topic_id: string;
  user_id: string;
  message: string;
  is_admin_reply: boolean;
  created_at: string;
  user_name?: string;
  user_email?: string;
}

export interface SupportTopic {
  id: string;
  user_id: string;
  title: string;
  status: SupportTopicStatus;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message_at?: string;
  user_name?: string;
  user_email?: string;
}

export interface SupportTopicDetail {
  id: string;
  user_id: string;
  title: string;
  status: SupportTopicStatus;
  created_at: string;
  updated_at: string;
  user_name?: string;
  user_email?: string;
  messages: SupportMessage[];
}

export interface MessageResponse {
  success: boolean;
  message: string;
}

export const supportApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // User endpoints
    createTopic: builder.mutation<SupportTopic, SupportTopicCreate>({
      query: (data) => ({
        url: '/api/v1/support/topics',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Support'],
    }),
    getUserTopics: builder.query<SupportTopic[], void>({
      query: () => '/api/v1/support/topics',
      providesTags: ['Support'],
    }),
    getTopicDetail: builder.query<SupportTopicDetail, string>({
      query: (topicId) => `/api/v1/support/topics/${topicId}`,
      providesTags: (_result, _error, topicId) => [{ type: 'SupportTopic', id: topicId }],
    }),
    addMessage: builder.mutation<MessageResponse, { topicId: string; message: SupportMessageCreate }>({
      query: ({ topicId, message }) => ({
        url: `/api/v1/support/topics/${topicId}/messages`,
        method: 'POST',
        body: message,
      }),
      invalidatesTags: (_result, _error, { topicId }) => [
        { type: 'SupportTopic', id: topicId },
        'Support',
      ],
    }),

    // Admin endpoints
    getAllTopicsAdmin: builder.query<SupportTopic[], void>({
      query: () => '/api/v1/support/admin/topics',
      providesTags: ['Support'],
    }),
    getTopicDetailAdmin: builder.query<SupportTopicDetail, string>({
      query: (topicId) => `/api/v1/support/admin/topics/${topicId}`,
      providesTags: (_result, _error, topicId) => [{ type: 'SupportTopic', id: topicId }],
    }),
    addAdminReply: builder.mutation<MessageResponse, { topicId: string; message: SupportMessageCreate }>({
      query: ({ topicId, message }) => ({
        url: `/api/v1/support/admin/topics/${topicId}/messages`,
        method: 'POST',
        body: message,
      }),
      invalidatesTags: (_result, _error, { topicId }) => [
        { type: 'SupportTopic', id: topicId },
        'Support',
      ],
    }),
    updateTopicStatus: builder.mutation<SupportTopic, { topicId: string; status: SupportTopicStatusUpdate }>({
      query: ({ topicId, status }) => ({
        url: `/api/v1/support/admin/topics/${topicId}/status`,
        method: 'PATCH',
        body: status,
      }),
      invalidatesTags: (_result, _error, { topicId }) => [
        { type: 'SupportTopic', id: topicId },
        'Support',
      ],
    }),
  }),
});

export const {
  useCreateTopicMutation,
  useGetUserTopicsQuery,
  useGetTopicDetailQuery,
  useAddMessageMutation,
  useGetAllTopicsAdminQuery,
  useGetTopicDetailAdminQuery,
  useAddAdminReplyMutation,
  useUpdateTopicStatusMutation,
} = supportApi;
