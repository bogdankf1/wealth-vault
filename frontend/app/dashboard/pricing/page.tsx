'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useGetCurrentUserQuery } from '@/lib/api/authApi';
import { useCreateCheckoutSessionMutation, useGetTiersQuery, useActivatePaddleSubscriptionMutation } from '@/lib/api/billingApi';
import { useGetMyPreferencesQuery } from '@/lib/api/preferencesApi';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { useTranslations } from 'next-intl';
import { PayPalScriptProvider } from '@paypal/react-paypal-js';
import { PaymentMethodModal, type PaymentMethod } from '@/components/pricing/payment-method-modal';
import { PayPalCheckoutModal } from '@/components/pricing/paypal-checkout-modal';
import { useIsDemo } from '@/hooks/use-is-demo';

interface TierFeature {
  name: string;
  included: boolean;
}

// Paddle types
interface PaddleEventData {
  name: string;
  data?: {
    subscription_id?: string;
    transaction_id?: string;
    id?: string;
    status?: string;
  };
}

declare global {
  interface Window {
    Paddle?: {
      Environment: {
        set: (env: 'sandbox' | 'production') => void;
      };
      Initialize: (options: {
        token: string;
        eventCallback?: (event: PaddleEventData) => void;
      }) => void;
      Checkout: {
        open: (options: {
          items: Array<{ priceId: string; quantity: number }>;
          customer?: { email: string };
          customData?: Record<string, string>;
          settings?: {
            displayMode?: 'overlay' | 'inline';
            theme?: 'light' | 'dark';
          };
        }) => void;
      };
    };
  }
}

export default function PricingPage() {
  const tPage = useTranslations('pricing.page');
  const tButtons = useTranslations('pricing.buttons');
  const tFooter = useTranslations('pricing.footer');
  const tDescriptions = useTranslations('pricing.descriptions');
  const tFeaturesStarter = useTranslations('pricing.features.starter');
  const tFeaturesGrowth = useTranslations('pricing.features.growth');
  const tFeaturesWealth = useTranslations('pricing.features.wealth');

  // Feature mappings for each tier (since backend doesn't return detailed features)
  const tierFeaturesMap: Record<string, TierFeature[]> = {
    starter: [
      { name: tFeaturesStarter('incomeSources'), included: true },
      { name: tFeaturesStarter('expenseTracking'), included: true },
      { name: tFeaturesStarter('bankUpload'), included: true },
      { name: tFeaturesStarter('savingsAccounts'), included: true },
      { name: tFeaturesStarter('subscriptions'), included: true },
      { name: tFeaturesStarter('installments'), included: true },
      { name: tFeaturesStarter('portfolioTracking'), included: false },
      { name: tFeaturesStarter('financialGoals'), included: false },
      { name: tFeaturesStarter('debtTracking'), included: false },
      { name: tFeaturesStarter('taxTracking'), included: false },
      { name: tFeaturesStarter('aiInsights'), included: false },
    ],
    growth: [
      { name: tFeaturesGrowth('incomeSources'), included: true },
      { name: tFeaturesGrowth('expenseTracking'), included: true },
      { name: tFeaturesGrowth('aiCategorization'), included: true },
      { name: tFeaturesGrowth('bankUpload'), included: true },
      { name: tFeaturesGrowth('savingsAccounts'), included: true },
      { name: tFeaturesGrowth('multiCurrency'), included: true },
      { name: tFeaturesGrowth('portfolioAssets'), included: true },
      { name: tFeaturesGrowth('financialGoals'), included: true },
      { name: tFeaturesGrowth('subscriptions'), included: true },
      { name: tFeaturesGrowth('installments'), included: true },
      { name: tFeaturesGrowth('debtTracking'), included: false },
      { name: tFeaturesGrowth('taxTracking'), included: false },
      { name: tFeaturesGrowth('aiInsights'), included: false },
    ],
    wealth: [
      { name: tFeaturesWealth('incomeSources'), included: true },
      { name: tFeaturesWealth('expenses'), included: true },
      { name: tFeaturesWealth('aiCategorization'), included: true },
      { name: tFeaturesWealth('aiInsights'), included: true },
      { name: tFeaturesWealth('bankUpload'), included: true },
      { name: tFeaturesWealth('savingsAccounts'), included: true },
      { name: tFeaturesWealth('multiCurrency'), included: true },
      { name: tFeaturesWealth('portfolioAssets'), included: true },
      { name: tFeaturesWealth('stockPrices'), included: true },
      { name: tFeaturesWealth('financialGoals'), included: true },
      { name: tFeaturesWealth('subscriptions'), included: true },
      { name: tFeaturesWealth('installments'), included: true },
      { name: tFeaturesWealth('debtTracking'), included: true },
      { name: tFeaturesWealth('taxTracking'), included: true },
    ],
  };
  const router = useRouter();
  const { data: user } = useGetCurrentUserQuery();
  const { data: tiers, isLoading: tiersLoading } = useGetTiersQuery();
  const { data: preferences } = useGetMyPreferencesQuery();
  const [createCheckoutSession, { isLoading }] = useCreateCheckoutSessionMutation();
  const [activatePaddleSubscription] = useActivatePaddleSubscriptionMutation();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [isPaddleReady, setIsPaddleReady] = useState(false);
  const [isActivatingPaddle, setIsActivatingPaddle] = useState(false);

  // Handle Paddle checkout completion
  const handlePaddleCheckoutComplete = useCallback(async (data: {
    subscription_id?: string;
    transaction_id?: string;
  }) => {
    console.log('Paddle checkout completed:', data);

    if (!data.transaction_id) {
      toast.error('No transaction ID received from checkout');
      return;
    }

    setIsActivatingPaddle(true);

    try {
      const result = await activatePaddleSubscription({
        subscription_id: data.subscription_id || '',
        transaction_id: data.transaction_id,
      }).unwrap();

      if (result.success) {
        toast.success(`Successfully subscribed to ${result.tier}!`);
        router.push('/dashboard?subscription=success');
      }
    } catch (err: unknown) {
      console.error('Paddle activation error:', err);
      const errorMessage =
        err && typeof err === 'object' && 'data' in err
          ? ((err.data as { detail?: string })?.detail || 'Failed to activate subscription')
          : 'Failed to activate subscription';
      toast.error(errorMessage);
    } finally {
      setIsActivatingPaddle(false);
    }
  }, [activatePaddleSubscription, router]);

  // Initialize Paddle.js
  useEffect(() => {
    const initPaddle = () => {
      if (!window.Paddle) return;

      const paddleEnv = process.env.NEXT_PUBLIC_PADDLE_ENV || 'sandbox';
      const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN || '';

      if (!clientToken) {
        console.error('Paddle client token not configured');
        return;
      }

      try {
        window.Paddle.Environment.set(paddleEnv as 'sandbox' | 'production');
        window.Paddle.Initialize({
          token: clientToken,
          eventCallback: (event: PaddleEventData) => {
            console.log('Paddle event:', event.name, event);

            if (event.name === 'checkout.completed') {
              handlePaddleCheckoutComplete({
                subscription_id: event.data?.subscription_id,
                transaction_id: event.data?.transaction_id || event.data?.id,
              });
            }
          },
        });
        setIsPaddleReady(true);
        console.log('Paddle initialized successfully');
      } catch (e) {
        console.error('Paddle initialization error:', e);
      }
    };

    // Check if already loaded
    if (window.Paddle) {
      initPaddle();
      return;
    }

    // Check if script exists
    const existingScript = document.querySelector('script[src*="paddle.com"]');
    if (existingScript) {
      existingScript.addEventListener('load', initPaddle);
      return;
    }

    // Load Paddle.js
    const script = document.createElement('script');
    script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    script.async = true;
    script.onload = initPaddle;
    document.head.appendChild(script);
  }, [handlePaddleCheckoutComplete]);

  // Open Paddle checkout
  const openPaddleCheckout = useCallback((tierName: string, priceId: string, userEmail?: string) => {
    if (!window.Paddle || !isPaddleReady) {
      toast.error('Payment system not ready. Please try again.');
      return;
    }

    console.log('Opening Paddle checkout:', { priceId, tierName });

    window.Paddle.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      customer: userEmail ? { email: userEmail } : undefined,
      customData: { tier: tierName },
      settings: {
        displayMode: 'overlay',
        theme: 'light',
      },
    });
  }, [isPaddleReady]);

  // Payment method modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedTier, setSelectedTier] = useState<{ id: string; name: string; display_name: string; price_monthly: number } | null>(null);

  // PayPal checkout modal state
  const [showPayPalModal, setShowPayPalModal] = useState(false);

  // Demo users must not reach real payment providers — redirect away.
  const isDemo = useIsDemo();
  useEffect(() => {
    if (isDemo) router.replace('/dashboard');
  }, [isDemo, router]);

  if (isDemo) return null;

  const displayCurrency = preferences?.display_currency || preferences?.currency || 'USD';

  // Stripe price ID mapping
  const stripePriceIdMap: Record<string, string> = {
    growth: process.env.NEXT_PUBLIC_STRIPE_GROWTH_PRICE_ID || '',
    wealth: process.env.NEXT_PUBLIC_STRIPE_WEALTH_PRICE_ID || '',
  };

  // PayPal plan ID mapping
  const paypalPlanIdMap: Record<string, string> = {
    growth: process.env.NEXT_PUBLIC_PAYPAL_GROWTH_PLAN_ID || '',
    wealth: process.env.NEXT_PUBLIC_PAYPAL_WEALTH_PLAN_ID || '',
  };

  // Paddle price ID mapping
  const paddlePriceIdMap: Record<string, string> = {
    growth: process.env.NEXT_PUBLIC_PADDLE_GROWTH_PRICE_ID || '',
    wealth: process.env.NEXT_PUBLIC_PADDLE_WEALTH_PRICE_ID || '',
  };

  const handleSubscribe = (tier: { id: string; name: string; display_name: string; price_monthly: number }) => {
    if (!user) {
      router.push('/auth/signin?redirect=/dashboard/pricing');
      return;
    }

    // Free tier - redirect to dashboard
    if (tier.price_monthly === 0) {
      router.push('/dashboard');
      return;
    }

    // Show payment method selection modal
    setSelectedTier(tier);
    setShowPaymentModal(true);
  };

  const handlePaymentMethodConfirm = async (paymentMethod: PaymentMethod) => {
    if (!selectedTier) return;

    const stripePriceId = stripePriceIdMap[selectedTier.name];

    if (!stripePriceId) {
      setShowPaymentModal(false);
      return;
    }

    try {
      setLoadingTier(selectedTier.name);

      if (paymentMethod === 'stripe') {
        // Stripe checkout flow
        const result = await createCheckoutSession({
          price_id: stripePriceId,
          success_url: `${window.location.origin}/dashboard?subscription=success`,
          cancel_url: `${window.location.origin}/dashboard/pricing?subscription=cancelled`,
        }).unwrap();

        // Redirect to Stripe checkout
        window.location.href = result.url;
      } else if (paymentMethod === 'paypal') {
        // PayPal flow - show PayPal checkout modal
        const paypalPlanId = paypalPlanIdMap[selectedTier.name];
        if (!paypalPlanId) {
          setShowPaymentModal(false);
          setLoadingTier(null);
          return;
        }
        // Close payment method modal and open PayPal modal
        setShowPaymentModal(false);
        setShowPayPalModal(true);
        setLoadingTier(null);
      } else if (paymentMethod === 'paddle') {
        // Paddle flow - use Paddle.js overlay checkout
        const paddlePriceId = paddlePriceIdMap[selectedTier.name];
        if (!paddlePriceId) {
          setShowPaymentModal(false);
          setLoadingTier(null);
          return;
        }

        // Close modal and open Paddle overlay
        setShowPaymentModal(false);
        setLoadingTier(null);
        openPaddleCheckout(selectedTier.name, paddlePriceId, user?.email);
      }
    } catch (error) {
      setShowPaymentModal(false);
      setLoadingTier(null);
    }
  };

  const handlePaymentModalClose = () => {
    if (!isLoading) {
      setShowPaymentModal(false);
      setSelectedTier(null);
      setLoadingTier(null);
    }
  };

  const handlePayPalModalClose = () => {
    setShowPayPalModal(false);
    setSelectedTier(null);
  };

  const currentTierName = user?.tier?.name || 'starter';

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 py-6 md:py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6 md:mb-12">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl lg:text-6xl">
            {tPage('title')}
          </h1>
          <p className="mt-2 md:mt-4 text-sm md:text-xl text-muted-foreground max-w-2xl mx-auto">
            {tPage('subtitle')}
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 gap-4 md:gap-8 lg:grid-cols-3">
          {tiersLoading ? (
            // Loading skeletons
            Array.from({ length: 3 }).map((_, idx) => (
              <Card key={idx} className="flex flex-col">
                <CardHeader className="pb-4">
                  <Skeleton className="h-8 w-32 mb-2" />
                  <Skeleton className="h-4 w-full mb-4" />
                  <Skeleton className="h-12 w-40" />
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="space-y-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-6 w-full" />
                    ))}
                  </div>
                </CardContent>
                <CardFooter>
                  <Skeleton className="h-10 w-full" />
                </CardFooter>
              </Card>
            ))
          ) : tiers && tiers.length > 0 ? (
            tiers
              .filter((tier) => tier.is_active)
              .map((tier) => {
                const isCurrentTier = tier.name === currentTierName;
                const isRecommended = tier.name === 'growth';

                // Get features for this tier
                const features = tierFeaturesMap[tier.name] || [];

                return (
                  <Card
                    key={tier.id}
                    className={`relative flex flex-col ${
                      isRecommended
                        ? 'border-primary shadow-lg scale-105 z-10'
                        : 'border-border'
                    }`}
                  >
                    {isRecommended && (
                      <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-3 py-1 text-xs font-semibold rounded-bl-lg rounded-tr-lg">
                        {tPage('recommended')}
                      </div>
                    )}

                    <CardHeader className="pb-2 md:pb-4 p-4 md:p-6">
                      <CardTitle className="text-lg md:text-2xl">{tier.display_name}</CardTitle>
                      <CardDescription className="mt-1 md:mt-2 text-xs md:text-sm">
                        {tDescriptions(tier.name as 'starter' | 'growth' | 'wealth')}
                      </CardDescription>
                      <div className="mt-2 md:mt-4">
                        <span className="text-2xl md:text-4xl font-bold tracking-tight text-foreground">
                          <CurrencyDisplay
                            amount={tier.price_monthly}
                            currency="USD"
                            displayCurrency={displayCurrency}
                            showSymbol={true}
                            showCode={false}
                          />
                        </span>
                        <span className="text-muted-foreground">{tPage('perMonth')}</span>
                      </div>
                    </CardHeader>

                    <CardContent className="flex-1 p-4 md:p-6 pt-0 md:pt-0">
                      <ul className="space-y-2 md:space-y-3">
                        {features.map((feature, idx) => (
                          <li key={idx} className="flex items-start gap-2 md:gap-3">
                            {feature.included ? (
                              <Check className="h-4 w-4 md:h-5 md:w-5 text-primary flex-shrink-0 mt-0.5" />
                            ) : (
                              <X className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                            )}
                            <span
                              className={`text-xs md:text-sm ${
                                feature.included
                                  ? 'text-foreground'
                                  : 'text-muted-foreground line-through'
                              }`}
                            >
                              {feature.name}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>

                    <CardFooter className="p-4 md:p-6 pt-0 md:pt-0">
                      <Button
                        className="w-full"
                        variant={isRecommended ? 'default' : 'outline'}
                        size="lg"
                        onClick={() => handleSubscribe({ ...tier, display_name: tier.display_name })}
                        disabled={isCurrentTier || (isLoading && loadingTier === tier.name)}
                      >
                        {isCurrentTier
                          ? tButtons('currentPlan')
                          : isLoading && loadingTier === tier.name
                          ? tButtons('loading')
                          : tier.price_monthly === 0
                          ? tButtons('getStarted')
                          : tButtons('subscribe')}
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })
          ) : (
            <div className="col-span-3 text-center py-12">
              <p className="text-muted-foreground">{tPage('empty')}</p>
            </div>
          )}
        </div>

        {/* FAQ or Additional Info */}
        <div className="mt-8 md:mt-16 text-center">
          <p className="text-xs md:text-sm text-muted-foreground">
            {tFooter('text')}{' '}
            <Link href="/dashboard/help" className="text-primary hover:underline">
              {tFooter('contactLink')}
            </Link>
          </p>
        </div>
      </div>

      {/* Payment Method Selection Modal */}
      {selectedTier && (
        <PaymentMethodModal
          isOpen={showPaymentModal}
          onClose={handlePaymentModalClose}
          onConfirm={handlePaymentMethodConfirm}
          tierName={selectedTier.name}
          tierPrice={selectedTier.price_monthly}
          currency={displayCurrency}
          isLoading={isLoading}
        />
      )}

      {/* PayPal Checkout Modal - Provider at page level to avoid re-initialization */}
      <PayPalScriptProvider
        options={{
          clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || '',
          vault: true,
          intent: 'subscription',
          components: 'buttons',
        }}
      >
        {selectedTier && (
          <PayPalCheckoutModal
            isOpen={showPayPalModal}
            onClose={handlePayPalModalClose}
            tierName={selectedTier.name}
            tierDisplayName={selectedTier.display_name}
            tierPrice={selectedTier.price_monthly}
            planId={paypalPlanIdMap[selectedTier.name] || ''}
            currency={displayCurrency}
          />
        )}
      </PayPalScriptProvider>

    </div>
  );
}
