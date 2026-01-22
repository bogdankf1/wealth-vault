/**
 * Billing API for Stripe and PayPal integration
 */
import { apiSlice } from './apiSlice';

export interface CreateCheckoutSessionRequest {
  price_id: string;
  success_url: string;
  cancel_url: string;
}

export interface CreateCheckoutSessionResponse {
  session_id: string;
  url: string;
}

export interface CreatePortalSessionRequest {
  return_url: string;
}

export interface CreatePortalSessionResponse {
  url: string;
}

export interface CancelSubscriptionRequest {
  at_period_end?: boolean;
}

export interface UpdateSubscriptionRequest {
  new_price_id: string;
}

export interface Subscription {
  id: string;
  payment_provider: 'stripe' | 'paypal';
  // Stripe fields
  stripe_subscription_id?: string;
  stripe_customer_id?: string;
  stripe_price_id?: string;
  // PayPal fields
  paypal_subscription_id?: string;
  paypal_plan_id?: string;
  // Common fields
  status: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  canceled_at?: string;
  trial_start?: string;
  trial_end?: string;
  created_at: string;
  updated_at: string;
}

export interface TierOption {
  id: string;
  name: string;
  display_name: string;
  price_monthly: number;
  stripe_price_id: string;
  paypal_plan_id: string;
  action: 'upgrade' | 'downgrade' | 'current';
}

export interface SubscriptionStatusResponse {
  has_subscription: boolean;
  subscription?: Subscription;
  tier_name?: string;
  tier_display_name?: string;
  payment_provider?: 'stripe' | 'paypal';
  can_upgrade: boolean;
  can_downgrade: boolean;
  available_tiers: TierOption[];
}

export interface PaymentHistory {
  id: string;
  payment_provider: 'stripe' | 'paypal';
  // Stripe fields
  stripe_invoice_id?: string;
  stripe_payment_intent_id?: string;
  // PayPal fields
  paypal_transaction_id?: string;
  paypal_subscription_id?: string;
  // Common fields
  amount: number;
  currency: string;
  status: string;
  description?: string;
  payment_method?: string;
  paid_at?: string;
  failed_at?: string;
  refunded_at?: string;
  created_at: string;
}

export interface PaymentHistoryListResponse {
  payments: PaymentHistory[];
  total: number;
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

// PayPal-specific interfaces
export interface PayPalActivateSubscriptionRequest {
  subscription_id: string;
}

export interface PayPalActivateSubscriptionResponse {
  success: boolean;
  subscription_id: string;
  tier: string;
  status: string;
}

export interface PayPalCancelSubscriptionRequest {
  reason?: string;
}

export interface PayPalUpdateSubscriptionRequest {
  new_plan_id: string;
}

export interface PayPalUpdateSubscriptionResponse {
  success: boolean;
  subscription_id: string;
  requires_approval: boolean;
  approval_url?: string;
}

export const billingApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getTiers: builder.query<Tier[], void>({
      query: () => '/api/v1/billing/tiers',
      providesTags: ['Tiers'],
    }),

    createCheckoutSession: builder.mutation<
      CreateCheckoutSessionResponse,
      CreateCheckoutSessionRequest
    >({
      query: (body) => ({
        url: '/api/v1/billing/create-checkout',
        method: 'POST',
        body,
      }),
    }),

    createPortalSession: builder.mutation<
      CreatePortalSessionResponse,
      CreatePortalSessionRequest
    >({
      query: (body) => ({
        url: '/api/v1/billing/create-portal-session',
        method: 'POST',
        body,
      }),
    }),

    getSubscriptionStatus: builder.query<SubscriptionStatusResponse, void>({
      query: () => '/api/v1/billing/subscription',
      providesTags: ['Subscription'],
    }),

    cancelSubscription: builder.mutation<
      { status: string; message: string },
      CancelSubscriptionRequest
    >({
      query: (body) => ({
        url: '/api/v1/billing/cancel-subscription',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Subscription'],
    }),

    updateSubscription: builder.mutation<
      { status: string; message: string; subscription_id: string },
      UpdateSubscriptionRequest
    >({
      query: (body) => ({
        url: '/api/v1/billing/update-subscription',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Subscription'],
    }),

    getPaymentHistory: builder.query<
      PaymentHistoryListResponse,
      { limit?: number; offset?: number }
    >({
      query: (params) => ({
        url: '/api/v1/billing/payment-history',
        params,
      }),
    }),

    // PayPal endpoints
    activatePayPalSubscription: builder.mutation<
      PayPalActivateSubscriptionResponse,
      PayPalActivateSubscriptionRequest
    >({
      query: (body) => ({
        url: '/api/v1/billing/paypal/activate',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Subscription', 'User'],
    }),

    cancelPayPalSubscription: builder.mutation<
      { status: string; message: string },
      PayPalCancelSubscriptionRequest
    >({
      query: (body) => ({
        url: '/api/v1/billing/paypal/cancel',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Subscription'],
    }),

    updatePayPalSubscription: builder.mutation<
      PayPalUpdateSubscriptionResponse,
      PayPalUpdateSubscriptionRequest
    >({
      query: (body) => ({
        url: '/api/v1/billing/paypal/update',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Subscription'],
    }),
  }),
  overrideExisting: true,
});

export const {
  useGetTiersQuery,
  useCreateCheckoutSessionMutation,
  useCreatePortalSessionMutation,
  useGetSubscriptionStatusQuery,
  useCancelSubscriptionMutation,
  useUpdateSubscriptionMutation,
  useGetPaymentHistoryQuery,
  // PayPal hooks
  useActivatePayPalSubscriptionMutation,
  useCancelPayPalSubscriptionMutation,
  useUpdatePayPalSubscriptionMutation,
} = billingApi;
