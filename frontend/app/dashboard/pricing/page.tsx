'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useGetCurrentUserQuery } from '@/lib/api/authApi';
import { useCreateCheckoutSessionMutation } from '@/lib/api/billingApi';
import { useGetTiersQuery } from '@/lib/api/adminApi';
import { useGetMyPreferencesQuery } from '@/lib/api/preferencesApi';
import { CurrencyDisplay } from '@/components/currency/currency-display';

interface TierFeature {
  name: string;
  included: boolean;
}

// Feature mappings for each tier (since backend doesn't return detailed features)
const tierFeaturesMap: Record<string, TierFeature[]> = {
  starter: [
    { name: 'Up to 5 income sources', included: true },
    { name: 'Up to 10 expense categories', included: true },
    { name: 'Up to 3 savings goals', included: true },
    { name: 'Up to 5 subscriptions', included: true },
    { name: 'Basic dashboard', included: true },
    { name: 'Advanced analytics', included: false },
    { name: 'AI insights', included: false },
    { name: 'Portfolio tracking', included: false },
    { name: 'Priority support', included: false },
  ],
  growth: [
    { name: 'Up to 20 income sources', included: true },
    { name: 'Up to 30 expense categories', included: true },
    { name: 'Up to 10 savings goals', included: true },
    { name: 'Up to 20 subscriptions', included: true },
    { name: 'Advanced dashboard', included: true },
    { name: 'Advanced analytics', included: true },
    { name: 'Basic AI insights', included: true },
    { name: 'Portfolio tracking (up to 50 assets)', included: true },
    { name: 'Priority support', included: false },
  ],
  wealth: [
    { name: 'Unlimited income sources', included: true },
    { name: 'Unlimited expense categories', included: true },
    { name: 'Unlimited savings goals', included: true },
    { name: 'Unlimited subscriptions', included: true },
    { name: 'Premium dashboard', included: true },
    { name: 'Advanced analytics', included: true },
    { name: 'Advanced AI insights', included: true },
    { name: 'Portfolio tracking (unlimited assets)', included: true },
    { name: 'Priority support', included: true },
  ],
};

export default function PricingPage() {
  const router = useRouter();
  const { data: user } = useGetCurrentUserQuery();
  const { data: tiers, isLoading: tiersLoading } = useGetTiersQuery();
  const { data: preferences } = useGetMyPreferencesQuery();
  const [createCheckoutSession, { isLoading }] = useCreateCheckoutSessionMutation();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);

  const displayCurrency = preferences?.display_currency || preferences?.currency || 'USD';

  // Stripe price ID mapping
  const stripePriceIdMap: Record<string, string> = {
    growth: process.env.NEXT_PUBLIC_STRIPE_GROWTH_PRICE_ID || '',
    wealth: process.env.NEXT_PUBLIC_STRIPE_WEALTH_PRICE_ID || '',
  };

  const handleSubscribe = async (tier: { id: string; name: string; price_monthly: number }) => {
    if (!user) {
      router.push('/auth/signin?redirect=/dashboard/pricing');
      return;
    }

    const stripePriceId = stripePriceIdMap[tier.name];

    if (!stripePriceId || tier.price_monthly === 0) {
      // Starter is free, redirect to dashboard
      router.push('/dashboard');
      return;
    }

    try {
      setLoadingTier(tier.name);
      const result = await createCheckoutSession({
        price_id: stripePriceId,
        success_url: `${window.location.origin}/dashboard?subscription=success`,
        cancel_url: `${window.location.origin}/dashboard/pricing?subscription=cancelled`,
      }).unwrap();

      // Redirect to Stripe checkout
      window.location.href = result.url;
    } catch (error) {
      console.error('Failed to create checkout session:', error);
      setLoadingTier(null);
    }
  };

  const currentTierName = user?.tier?.name || 'starter';

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl">
            Choose Your Plan
          </h1>
          <p className="mt-4 text-xl text-muted-foreground max-w-2xl mx-auto">
            Start free and upgrade as you grow. All plans include a 14-day money-back guarantee.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
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
                        RECOMMENDED
                      </div>
                    )}

                    <CardHeader className="pb-4">
                      <CardTitle className="text-2xl">{tier.display_name}</CardTitle>
                      <CardDescription className="mt-2">{tier.description}</CardDescription>
                      <div className="mt-4">
                        <span className="text-4xl font-bold tracking-tight text-foreground">
                          <CurrencyDisplay
                            amount={tier.price_monthly}
                            currency="USD"
                            displayCurrency={displayCurrency}
                            showSymbol={true}
                            showCode={false}
                          />
                        </span>
                        <span className="text-muted-foreground">/month</span>
                      </div>
                    </CardHeader>

                    <CardContent className="flex-1">
                      <ul className="space-y-3">
                        {features.map((feature, idx) => (
                          <li key={idx} className="flex items-start gap-3">
                            {feature.included ? (
                              <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                            ) : (
                              <X className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                            )}
                            <span
                              className={
                                feature.included
                                  ? 'text-foreground'
                                  : 'text-muted-foreground line-through'
                              }
                            >
                              {feature.name}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>

                    <CardFooter>
                      <Button
                        className="w-full"
                        variant={isRecommended ? 'default' : 'outline'}
                        size="lg"
                        onClick={() => handleSubscribe(tier)}
                        disabled={isCurrentTier || (isLoading && loadingTier === tier.name)}
                      >
                        {isCurrentTier
                          ? 'Current Plan'
                          : isLoading && loadingTier === tier.name
                          ? 'Loading...'
                          : tier.price_monthly === 0
                          ? 'Get Started'
                          : 'Subscribe'}
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })
          ) : (
            <div className="col-span-3 text-center py-12">
              <p className="text-muted-foreground">No pricing tiers available at this time.</p>
            </div>
          )}
        </div>

        {/* FAQ or Additional Info */}
        <div className="mt-16 text-center">
          <p className="text-muted-foreground">
            All plans can be upgraded or cancelled at any time. Need help choosing?{' '}
            <a href="mailto:support@wealthvault.com" className="text-primary hover:underline">
              Contact us
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
