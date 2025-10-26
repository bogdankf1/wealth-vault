/**
 * RTK Query API slice for all backend communication
 */
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { getSession } from 'next-auth/react';

const baseQuery = fetchBaseQuery({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  prepareHeaders: async (headers) => {
    // Get session token from NextAuth
    const session = await getSession();
    if (session?.accessToken) {
      headers.set('Authorization', `Bearer ${session.accessToken}`);
    }
    return headers;
  },
});

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery,
  tagTypes: ['User', 'Income', 'Expense', 'Saving', 'Portfolio', 'Goals', 'Subscriptions', 'Installments', 'Budget', 'Dashboard', 'Analytics', 'Subscription', 'Users', 'Tiers', 'TierFeatures', 'Features', 'Configurations', 'EmailTemplates', 'Preferences', 'Debt', 'Tax'],
  endpoints: () => ({}),
});
