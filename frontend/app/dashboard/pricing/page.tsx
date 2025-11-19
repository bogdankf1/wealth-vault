'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useGetCurrentUserQuery } from '@/lib/api/authApi';
import { useCreateCheckoutSessionMutation, useGetTiersQuery } from '@/lib/api/billingApi';
import { useGetMyPreferencesQuery } from '@/lib/api/preferencesApi';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { useTranslations } from 'next-intl';

interface TierFeature {
  name: string;
  included: boolean;
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
            {tPage('title')}
          </h1>
          <p className="mt-4 text-xl text-muted-foreground max-w-2xl mx-auto">
            {tPage('subtitle')}
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
                        {tPage('recommended')}
                      </div>
                    )}

                    <CardHeader className="pb-4">
                      <CardTitle className="text-2xl">{tier.display_name}</CardTitle>
                      <CardDescription className="mt-2">
                        {tDescriptions(tier.name as 'starter' | 'growth' | 'wealth')}
                      </CardDescription>
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
                        <span className="text-muted-foreground">{tPage('perMonth')}</span>
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
        <div className="mt-16 text-center">
          <p className="text-muted-foreground">
            {tFooter('text')}{' '}
            <Link href="/dashboard/help" className="text-primary hover:underline">
              {tFooter('contactLink')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
