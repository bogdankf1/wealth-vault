/**
 * Authentication API endpoints
 */
import { apiSlice } from './apiSlice';

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  avatar_url: string | null;
  tier: {
    id: string;
    name: string;
    display_name: string;
  } | null;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface GoogleAuthRequest {
  token: string;
}

export interface FeatureInfo {
  enabled: boolean;
  limit: number | null;
  name: string;
  module: string;
}

export interface UserFeaturesResponse {
  features: Record<string, FeatureInfo>;
}

export const authApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    googleAuth: builder.mutation<TokenResponse, GoogleAuthRequest>({
      query: (credentials) => ({
        url: '/api/v1/auth/google',
        method: 'POST',
        body: credentials,
      }),
      invalidatesTags: ['User'],
    }),
    getCurrentUser: builder.query<User, void>({
      query: () => '/api/v1/auth/me',
      providesTags: ['User'],
    }),
    getUserFeatures: builder.query<UserFeaturesResponse, void>({
      query: () => '/api/v1/auth/me/features',
      providesTags: ['User'],
    }),
  }),
});

export const { useGoogleAuthMutation, useGetCurrentUserQuery, useGetUserFeaturesQuery } = authApi;
