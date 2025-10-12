'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useGetCurrentUserQuery } from '@/lib/api/authApi';
import { useCreateCheckoutSessionMutation } from '@/lib/api/billingApi';

interface TierFeature {
  name: string;
  included: boolean;
}

interface Tier {
  name: string;
  displayName: string;
  price: number;
  stripePriceId: string | null;
  description: string;
  features: TierFeature[];
  recommended?: boolean;
}

const tiers: Tier[] = [
  {
    name: 'starter',
    displayName: 'Starter',
    price: 0,
    stripePriceId: null,
    description: 'Perfect for getting started with personal finance',
    features: [
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
  },
  {
    name: 'growth',
    displayName: 'Growth',
    price: 9.99,
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_GROWTH_PRICE_ID || '',
    description: 'For those serious about growing their wealth',
    recommended: true,
    features: [
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
  },
  {
    name: 'wealth',
    displayName: 'Wealth',
    price: 19.99,
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_WEALTH_PRICE_ID || '',
    description: 'Ultimate platform for wealth management',
    features: [
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
  },
];

export default function PricingPage() {
  const router = useRouter();
  const { data: user } = useGetCurrentUserQuery();
  const [createCheckoutSession, { isLoading }] = useCreateCheckoutSessionMutation();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);

  const handleSubscribe = async (tier: Tier) => {
    if (!user) {
      router.push('/auth/signin?redirect=/dashboard/pricing');
      return;
    }

    if (!tier.stripePriceId) {
      // Starter is free, redirect to dashboard
      router.push('/dashboard');
      return;
    }

    try {
      setLoadingTier(tier.name);
      const result = await createCheckoutSession({
        price_id: tier.stripePriceId,
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
          {tiers.map((tier) => {
            const isCurrentTier = tier.name === currentTierName;

            return (
              <Card
                key={tier.name}
                className={`relative flex flex-col ${
                  tier.recommended
                    ? 'border-primary shadow-lg scale-105 z-10'
                    : 'border-border'
                }`}
              >
                {tier.recommended && (
                  <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-3 py-1 text-xs font-semibold rounded-bl-lg rounded-tr-lg">
                    RECOMMENDED
                  </div>
                )}

                <CardHeader className="pb-4">
                  <CardTitle className="text-2xl">{tier.displayName}</CardTitle>
                  <CardDescription className="mt-2">{tier.description}</CardDescription>
                  <div className="mt-4">
                    <span className="text-4xl font-bold tracking-tight text-foreground">
                      ${tier.price}
                    </span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                </CardHeader>

                <CardContent className="flex-1">
                  <ul className="space-y-3">
                    {tier.features.map((feature, idx) => (
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
                    variant={tier.recommended ? 'default' : 'outline'}
                    size="lg"
                    onClick={() => handleSubscribe(tier)}
                    disabled={isCurrentTier || (isLoading && loadingTier === tier.name)}
                  >
                    {isCurrentTier
                      ? 'Current Plan'
                      : isLoading && loadingTier === tier.name
                      ? 'Loading...'
                      : tier.price === 0
                      ? 'Get Started'
                      : 'Subscribe'}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
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
