'use client';

import { useState, useEffect } from 'react';
import { format, differenceInDays, differenceInHours, differenceInMinutes } from 'date-fns';
import { CreditCard, Calendar, CheckCircle2, XCircle, AlertCircle, Clock, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  useGetSubscriptionStatusQuery,
  useCancelSubscriptionMutation,
  useGetPaymentHistoryQuery,
} from '@/lib/api/billingApi';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useGetCurrentUserQuery } from '@/lib/api/authApi';
import { useTranslations } from 'next-intl';

// Feature list that will be lost when downgrading to Starter
const FEATURES_LOST_ON_DOWNGRADE = [
  'batch_expense_creation',
  'advanced_budgeting',
  'portfolio_analytics',
  'tax_calculations',
  'ai_insights',
  'export_reports',
  'priority_support',
];

// Calculate countdown to expiration
function useExpirationCountdown(expirationDate: string | Date | undefined, isExpiring: boolean) {
  const [countdown, setCountdown] = useState<{
    days: number;
    hours: number;
    minutes: number;
    isUrgent: boolean;
    percentRemaining: number;
  } | null>(null);

  useEffect(() => {
    if (!expirationDate || !isExpiring) {
      setCountdown(null);
      return;
    }

    const calculateCountdown = () => {
      try {
        const now = new Date();
        const expiry = typeof expirationDate === 'string' ? new Date(expirationDate) : expirationDate;

        // Validate the date
        if (isNaN(expiry.getTime())) {
          console.error('Invalid expiration date:', expirationDate);
          return;
        }

        const days = differenceInDays(expiry, now);
        const hours = differenceInHours(expiry, now) % 24;
        const minutes = differenceInMinutes(expiry, now) % 60;

        // Calculate percent remaining (assuming 30-day billing cycle)
        const totalDays = 30;
        const percentRemaining = Math.max(0, Math.min(100, (days / totalDays) * 100));

        setCountdown({
          days: Math.max(0, days),
          hours: Math.max(0, hours),
          minutes: Math.max(0, minutes),
          isUrgent: days <= 3,
          percentRemaining,
        });
      } catch (error) {
        console.error('Error calculating countdown:', error);
      }
    };

    calculateCountdown();
    const interval = setInterval(calculateCountdown, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [expirationDate, isExpiring]);

  return countdown;
}

export function SubscriptionSettings() {
  const t = useTranslations('settings.subscription');
  const { toast } = useToast();
  const { data: currentUser } = useGetCurrentUserQuery();
  const { data: subscriptionStatus, isLoading } = useGetSubscriptionStatusQuery();
  const { data: paymentHistory } = useGetPaymentHistoryQuery({ limit: 10, offset: 0 });
  const [cancelSubscription] = useCancelSubscriptionMutation();

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showDowngradeWarning, setShowDowngradeWarning] = useState(false);

  const subscription = subscriptionStatus?.subscription;
  const isExpiring = Boolean(subscription?.cancel_at_period_end);
  const countdown = useExpirationCountdown(subscription?.current_period_end, isExpiring);

  const handleCancelSubscription = async () => {
    try {
      await cancelSubscription({ at_period_end: true }).unwrap();
      setShowCancelDialog(false);
      toast({
        title: t('toasts.cancelled.title'),
        description: t('toasts.cancelled.description'),
      });
    } catch {
      toast({
        title: t('toasts.error.title'),
        description: t('toasts.error.description'),
        variant: 'destructive',
      });
    }
  };


  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardHeader className="p-3">
              <div className="h-6 w-32 animate-pulse rounded bg-muted" />
              <div className="h-4 w-48 animate-pulse rounded bg-muted mt-2" />
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="h-32 w-full animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const statusColor =
    subscription?.status === 'active'
      ? 'bg-green-500'
      : subscription?.status === 'past_due'
      ? 'bg-yellow-500'
      : 'bg-red-500';

  // Determine current tier
  const currentTierName = currentUser?.tier?.display_name || subscriptionStatus?.tier_display_name || 'Starter';

  return (
    <div className="space-y-3">
      {/* Expiration Countdown Banner */}
      {isExpiring && (
        <Card className={countdown?.isUrgent ? 'border-red-500/50 bg-red-500/5' : 'border-amber-500/50 bg-amber-500/5'}>
          <CardContent className="p-3">
            <div className="flex items-start gap-2 lg:gap-3">
              <div className={`p-1.5 lg:p-2 rounded-full ${countdown?.isUrgent ? 'bg-red-500/20' : 'bg-amber-500/20'}`}>
                <Clock className={`h-4 w-4 lg:h-5 lg:w-5 ${countdown?.isUrgent ? 'text-red-500' : 'text-amber-500'}`} />
              </div>
              <div className="flex-1">
                <h3 className={`text-sm lg:text-base font-semibold ${countdown?.isUrgent ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {t('expiration.title')}
                  {subscription?.current_period_end && (
                    <span className="font-normal text-sm ml-2">
                      ({t('expiration.expiresOn', { date: format(new Date(subscription.current_period_end), 'MMM d, yyyy') })})
                    </span>
                  )}
                </h3>
                <p className="text-xs lg:text-sm text-muted-foreground">
                  {t('expiration.description')}
                </p>

                {/* Countdown Timer */}
                {countdown && (
                  <div className="flex items-center gap-4 lg:gap-6 mt-3 lg:mt-4">
                    <div className="text-center">
                      <div className={`text-2xl lg:text-3xl font-bold ${countdown.isUrgent ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {countdown.days}
                      </div>
                      <div className="text-xs text-muted-foreground uppercase">{t('expiration.days')}</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-2xl lg:text-3xl font-bold ${countdown.isUrgent ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {countdown.hours}
                      </div>
                      <div className="text-xs text-muted-foreground uppercase">{t('expiration.hours')}</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-2xl lg:text-3xl font-bold ${countdown.isUrgent ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {countdown.minutes}
                      </div>
                      <div className="text-xs text-muted-foreground uppercase">{t('expiration.minutes')}</div>
                    </div>
                  </div>
                )}

                {/* Progress Bar */}
                {countdown && (
                  <div className="mt-4">
                    <Progress
                      value={countdown.percentRemaining}
                      className={`h-2 ${countdown.isUrgent ? '[&>div]:bg-red-500' : '[&>div]:bg-amber-500'}`}
                    />
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 mt-4">
                  <Link href="/dashboard/pricing">
                    <Button size="sm" className={countdown?.isUrgent ? 'bg-red-600 hover:bg-red-700' : ''}>
                      {t('expiration.renewNow')}
                    </Button>
                  </Link>
                  <Button variant="outline" size="sm" onClick={() => setShowDowngradeWarning(true)}>
                    {t('expiration.viewLostFeatures')}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current Subscription */}
      <Card>
        <CardHeader className="p-3 pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm lg:text-base">
                <CreditCard className="h-4 w-4 lg:h-5 lg:w-5" />
                {t('title')}
              </CardTitle>
              <CardDescription className="text-xs lg:text-sm">
                {t('description')}
              </CardDescription>
            </div>
            {subscription && (
              <Badge className={statusColor}>
                {t(`statuses.${subscription.status}` as 'statuses.active')}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-3">
          {/* Show tier info for everyone */}
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs lg:text-sm font-medium mb-1">{t('currentPlan')}</p>
            <p className="text-lg lg:text-xl font-bold">{currentTierName}</p>
          </div>

          {/* Show billing details if available */}
          {subscription && subscription.current_period_start && subscription.current_period_end && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:gap-4">
                <div className="flex items-start gap-2 lg:gap-3">
                  <Calendar className="h-4 w-4 lg:h-5 lg:w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs lg:text-sm font-medium">{t('currentPeriod')}</p>
                    <p className="text-xs lg:text-sm text-muted-foreground">
                      {format(new Date(subscription.current_period_start), 'MMM d, yyyy')} -{' '}
                      {format(new Date(subscription.current_period_end), 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2 lg:gap-3">
                  <CreditCard className="h-4 w-4 lg:h-5 lg:w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs lg:text-sm font-medium">{t('nextBillingDate')}</p>
                    <p className="text-xs lg:text-sm text-muted-foreground">
                      {format(new Date(subscription.current_period_end), 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>
              </div>

              {subscription.cancel_at_period_end && !countdown && (
                <div className="flex items-start gap-2 lg:gap-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <AlertCircle className="h-4 w-4 lg:h-5 lg:w-5 text-yellow-500 mt-0.5" />
                  <div>
                    <p className="text-xs lg:text-sm font-medium">{t('subscriptionEnding')}</p>
                    <p className="text-xs lg:text-sm text-muted-foreground">
                      {t('subscriptionEndingDescription')}{' '}
                      {format(new Date(subscription.current_period_end), 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-2">
            <Link href="/dashboard/pricing">
              <Button variant="outline">
                {t('viewPricingPlans')}
              </Button>
            </Link>
            {subscription && !subscription.cancel_at_period_end && (
              <Button
                onClick={() => setShowCancelDialog(true)}
                variant="destructive"
              >
                {t('cancelSubscription')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Payment History */}
      {paymentHistory && paymentHistory.payments.length > 0 && (
        <Card>
          <CardHeader className="p-3">
            <CardTitle className="flex items-center gap-2 text-sm lg:text-base">
              <Calendar className="h-4 w-4 lg:h-5 lg:w-5" />
              {t('paymentHistory.title')}
            </CardTitle>
            <CardDescription className="text-xs lg:text-sm">{t('paymentHistory.description')}</CardDescription>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="space-y-3">
              {paymentHistory.payments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 lg:gap-3">
                    {payment.status === 'succeeded' ? (
                      <CheckCircle2 className="h-4 w-4 lg:h-5 lg:w-5 text-green-500" />
                    ) : payment.status === 'failed' ? (
                      <XCircle className="h-4 w-4 lg:h-5 lg:w-5 text-red-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 lg:h-5 lg:w-5 text-yellow-500" />
                    )}
                    <div>
                      <p className="text-xs lg:text-sm font-medium">
                        {payment.description || t('paymentHistory.subscriptionPayment')}
                      </p>
                      <p className="text-xs lg:text-sm text-muted-foreground">
                        {payment.paid_at
                          ? format(new Date(payment.paid_at), 'MMM d, yyyy')
                          : payment.failed_at
                          ? format(new Date(payment.failed_at), 'MMM d, yyyy')
                          : format(new Date(payment.created_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs lg:text-sm font-medium">
                      ${(payment.amount / 100).toFixed(2)} {payment.currency.toUpperCase()}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">{t(`paymentHistory.statuses.${payment.status}` as 'paymentHistory.statuses.succeeded')}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('cancelDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('cancelDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancelDialog.keepSubscription')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelSubscription} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('cancelDialog.confirmCancel')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Downgrade Warning Dialog */}
      <AlertDialog open={showDowngradeWarning} onOpenChange={setShowDowngradeWarning}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              {t('downgradeWarning.title')}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>{t('downgradeWarning.description')}</p>

                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs lg:text-sm font-medium mb-2 lg:mb-3">{t('downgradeWarning.featuresLost')}</p>
                  <ul className="space-y-2">
                    {FEATURES_LOST_ON_DOWNGRADE.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm">
                        <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                        <span>{t(`downgradeWarning.features.${feature}` as 'downgradeWarning.features.batch_expense_creation')}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                  <p className="text-xs lg:text-sm font-medium text-green-600 dark:text-green-400 mb-2">
                    {t('downgradeWarning.keepAccess')}
                  </p>
                  <p className="text-xs lg:text-sm text-muted-foreground">
                    {t('downgradeWarning.renewDescription')}
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('downgradeWarning.close')}</AlertDialogCancel>
            <Link href="/dashboard/pricing">
              <AlertDialogAction className="bg-green-600 hover:bg-green-700">
                {t('downgradeWarning.renewNow')}
              </AlertDialogAction>
            </Link>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
