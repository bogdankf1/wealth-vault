'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { CreditCard, Calendar, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

export function SubscriptionSettings() {
  const t = useTranslations('settings.subscription');
  const { toast } = useToast();
  const { data: currentUser } = useGetCurrentUserQuery();
  const { data: subscriptionStatus, isLoading } = useGetSubscriptionStatusQuery();
  const { data: paymentHistory } = useGetPaymentHistoryQuery({ limit: 10, offset: 0 });
  const [cancelSubscription] = useCancelSubscriptionMutation();

  const [showCancelDialog, setShowCancelDialog] = useState(false);

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
      <div className="space-y-6">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardHeader>
              <div className="h-6 w-32 animate-pulse rounded bg-muted" />
              <div className="h-4 w-48 animate-pulse rounded bg-muted mt-2" />
            </CardHeader>
            <CardContent>
              <div className="h-32 w-full animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const subscription = subscriptionStatus?.subscription;
  const statusColor =
    subscription?.status === 'active'
      ? 'bg-green-500'
      : subscription?.status === 'past_due'
      ? 'bg-yellow-500'
      : 'bg-red-500';

  // Determine current tier
  const currentTierName = currentUser?.tier?.display_name || subscriptionStatus?.tier_display_name || 'Starter';

  return (
    <div className="space-y-6">
      {/* Current Subscription */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                {t('title')}
              </CardTitle>
              <CardDescription>
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
        <CardContent className="space-y-4">
          {/* Show tier info for everyone */}
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm font-medium mb-1">{t('currentPlan')}</p>
            <p className="text-2xl font-bold">{currentTierName}</p>
          </div>

          {/* Show billing details if available */}
          {subscription && subscription.current_period_start && subscription.current_period_end && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">{t('currentPeriod')}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(subscription.current_period_start), 'MMM d, yyyy')} -{' '}
                      {format(new Date(subscription.current_period_end), 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <CreditCard className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">{t('nextBillingDate')}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(subscription.current_period_end), 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>
              </div>

              {subscription.cancel_at_period_end && (
                <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">{t('subscriptionEnding')}</p>
                    <p className="text-sm text-muted-foreground">
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
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {t('paymentHistory.title')}
            </CardTitle>
            <CardDescription>{t('paymentHistory.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {paymentHistory.payments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {payment.status === 'succeeded' ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : payment.status === 'failed' ? (
                      <XCircle className="h-5 w-5 text-red-500" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-yellow-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium">
                        {payment.description || t('paymentHistory.subscriptionPayment')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {payment.paid_at
                          ? format(new Date(payment.paid_at), 'MMM d, yyyy')
                          : payment.failed_at
                          ? format(new Date(payment.failed_at), 'MMM d, yyyy')
                          : format(new Date(payment.created_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
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

    </div>
  );
}
