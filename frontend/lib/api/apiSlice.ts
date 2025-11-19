/**
 * RTK Query API slice for all backend communication
 */
import { createApi, fetchBaseQuery, retry } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { getSession, signOut } from 'next-auth/react';
import { toast } from 'sonner';

/**
 * Determine if an error should be retried
 * @param error - The error from the API call
 * @returns true if the error should be retried
 */
const shouldRetry = (error: FetchBaseQueryError): boolean => {
  // Don't retry authentication errors (401, 403)
  if (error.status === 401 || error.status === 403) {
    return false;
  }

  // Don't retry client errors (400-499) except for specific cases
  if (typeof error.status === 'number' && error.status >= 400 && error.status < 500) {
    // Retry 408 (Request Timeout) and 429 (Too Many Requests)
    if (error.status === 408 || error.status === 429) {
      return true;
    }
    return false;
  }

  // Retry server errors (500-599)
  if (typeof error.status === 'number' && error.status >= 500) {
    return true;
  }

  // Retry network errors and timeouts
  if (error.status === 'FETCH_ERROR' || error.status === 'TIMEOUT_ERROR') {
    return true;
  }

  // Don't retry parsing errors
  if (error.status === 'PARSING_ERROR') {
    return false;
  }

  return false;
};

const baseQuery = fetchBaseQuery({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  timeout: 30000, // 30 second timeout
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
 * Track retry state
 */
let currentRetryAttempt = 0;
let retryToastId: string | number | undefined;

/**
 * Base query with retry logic
 * Retries failed requests with exponential backoff
 * Max 3 attempts with delays: 1s, 2s, 4s
 */
const baseQueryWithRetry = retry(
  async (args, api, extraOptions) => {
    // Show retry notification for 2nd+ attempts
    if (currentRetryAttempt > 0 && currentRetryAttempt <= 3) {
      if (retryToastId) {
        toast.dismiss(retryToastId);
      }
      retryToastId = toast.loading(
        `Connection issue detected. Retrying... (attempt ${currentRetryAttempt}/3)`,
        { duration: Infinity }
      );
    }

    const result = await baseQuery(args, api, extraOptions);

    // Dismiss retry toast if request succeeded
    if (!result.error && retryToastId) {
      toast.dismiss(retryToastId);
      retryToastId = undefined;
      if (currentRetryAttempt > 0) {
        toast.success('Connection restored!', { duration: 2000 });
      }
      currentRetryAttempt = 0;
    }

    // If there's an error, check if it should be retried
    if (result.error && !shouldRetry(result.error)) {
      // Clean up toast
      if (retryToastId) {
        toast.dismiss(retryToastId);
        retryToastId = undefined;
      }
      currentRetryAttempt = 0;
      // Don't retry this error - bail out immediately
      retry.fail(result.error);
    }

    return result;
  },
  {
    maxRetries: 3,
    // Exponential backoff: 1s, 2s, 4s
    backoff: async (attempt) => {
      currentRetryAttempt = attempt;
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    },
  }
);

/**
 * Custom base query with error handling
 * Handles specific error codes and provides user feedback
 */
const baseQueryWithAuth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const result = await baseQueryWithRetry(args, api, extraOptions);

  // Clean up retry toast if still showing
  if (retryToastId) {
    toast.dismiss(retryToastId);
    retryToastId = undefined;
  }

  // Reset retry attempt counter
  currentRetryAttempt = 0;

  // Handle 401 Unauthorized errors
  if (result.error && result.error.status === 401) {
    toast.error('Your session has expired. Please sign in again.');
    await signOut({ redirect: false });
    setTimeout(() => {
      window.location.href = '/login';
    }, 1000);
  }

  // Handle 403 Forbidden errors
  if (result.error && result.error.status === 403) {
    toast.error('You do not have permission to access this resource.');
  }

  // Handle 429 Too Many Requests
  if (result.error && result.error.status === 429) {
    toast.error('Too many requests. Please slow down and try again.');
  }

  // Handle 503 Service Unavailable
  if (result.error && result.error.status === 503) {
    toast.error('Service temporarily unavailable. Please try again later.');
  }

  // Handle network errors after all retries exhausted
  if (
    result.error &&
    (result.error.status === 'FETCH_ERROR' || result.error.status === 'TIMEOUT_ERROR')
  ) {
    toast.error('Unable to connect to the server. Please check your internet connection.');
  }

  // Handle 500+ server errors
  if (result.error && typeof result.error.status === 'number' && result.error.status >= 500) {
    toast.error('Server error occurred. Please try again later.');
  }

  return result;
};

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['User', 'Income', 'Expense', 'Saving', 'Portfolio', 'Goals', 'Subscriptions', 'Installments', 'Budget', 'Dashboard', 'Analytics', 'Subscription', 'Users', 'Tiers', 'TierFeatures', 'Features', 'Configurations', 'EmailTemplates', 'Preferences', 'Debt', 'Tax', 'DashboardLayouts', 'ActiveDashboardLayout', 'Backup', 'Support', 'SupportTopic'],
  endpoints: () => ({}),
});
