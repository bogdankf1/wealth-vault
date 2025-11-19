/**
 * RTK Query API slice for all backend communication
 */
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { getSession, signOut } from 'next-auth/react';
import { toast } from 'sonner';

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

/**
 * Custom base query with error handling
 * Handles 401 errors by signing out the user
 */
const baseQueryWithAuth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const result = await baseQuery(args, api, extraOptions);

  // Handle 401 Unauthorized errors
  if (result.error && result.error.status === 401) {
    // Show error toast
    toast.error('Your session has expired. Please sign in again.');

    // Sign out the user
    await signOut({ redirect: false });

    // Redirect to login after a brief delay
    setTimeout(() => {
      window.location.href = '/login';
    }, 1000);
  }

  // Handle 403 Forbidden errors
  if (result.error && result.error.status === 403) {
    toast.error('You do not have permission to access this resource.');
  }

  return result;
};

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['User', 'Income', 'Expense', 'Saving', 'Portfolio', 'Goals', 'Subscriptions', 'Installments', 'Budget', 'Dashboard', 'Analytics', 'Subscription', 'Users', 'Tiers', 'TierFeatures', 'Features', 'Configurations', 'EmailTemplates', 'Preferences', 'Debt', 'Tax', 'DashboardLayouts', 'ActiveDashboardLayout', 'Backup', 'Support', 'SupportTopic'],
  endpoints: () => ({}),
});
