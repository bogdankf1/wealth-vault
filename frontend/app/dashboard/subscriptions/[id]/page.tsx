/**
 * Subscription Detail Page
 * Shows subscription details, payment history, and actions (pause/resume/cancel)
 */
'use client';

import React, { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  Edit,
  Pause,
  Play,
  XCircle,
  Calendar,
  CreditCard,
  Wallet,
  Clock,
  Bell,
  Receipt,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiErrorState } from '@/components/ui/error-state';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { SubscriptionForm } from '@/components/subscriptions/subscription-form';
import { SubscriptionPaymentList } from '@/components/subscriptions/subscription-payment-list';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import {
  useGetSubscriptionQuery,
  usePauseSubscriptionMutation,
  useResumeSubscriptionMutation,
  useCancelSubscriptionMutation,
  useRecordSubscriptionPaymentMutation,
} from '@/lib/api/subscriptionsApi';
import { useGetAccountQuery } from '@/lib/api/savingsApi';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function SubscriptionDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();

  // Translation hooks
  const t = useTranslations('subscriptions.detail');
  const tStatus = useTranslations('subscriptions.status');
  const tFrequencies = useTranslations('subscriptions.frequencies');
  const tCategories = useTranslations('subscriptions.categories');
  const tActions = useTranslations('subscriptions.actions');

  // State
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  // Queries
  const { data: subscription, isLoading, error, refetch } = useGetSubscriptionQuery(id);
  const { data: linkedAccount } = useGetAccountQuery(subscription?.payment_account_id || '', {
    skip: !subscription?.payment_account_id,
  });

  // Mutations
  const [pauseSubscription, { isLoading: isPausing }] = usePauseSubscriptionMutation();
  const [resumeSubscription, { isLoading: isResuming }] = useResumeSubscriptionMutation();
  const [cancelSubscription, { isLoading: isCancelling }] = useCancelSubscriptionMutation();
  const [recordPayment, { isLoading: isRecordingPayment }] = useRecordSubscriptionPaymentMutation();

  const FREQUENCY_LABELS: Record<string, string> = {
    monthly: tFrequencies('monthly'),
    quarterly: tFrequencies('quarterly'),
    biannually: tFrequencies('biannually'),
    annually: tFrequencies('annually'),
  };

  const CATEGORY_MAP: Record<string, string> = {
    'Cloud Storage': 'cloudStorage',
    'Music': 'music',
    'Video': 'video',
    'Education': 'education',
    'Cell Service': 'cellService',
    'Side Projects': 'sideProjects',
    'AI Tools': 'aiTools',
    'Gaming': 'gaming',
    'Miscellaneous': 'miscellaneous',
  };

  const translateCategory = (category: string) => {
    const key = CATEGORY_MAP[category];
    return key ? tCategories(key) : category;
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active':
        return 'default';
      case 'paused':
        return 'secondary';
      case 'cancelled':
      case 'expired':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const handlePause = async () => {
    try {
      await pauseSubscription({ id }).unwrap();
      toast.success(t('pauseSuccess'));
      setPauseDialogOpen(false);
    } catch (error) {
      toast.error(t('pauseError'));
    }
  };

  const handleResume = async () => {
    try {
      await resumeSubscription(id).unwrap();
      toast.success(t('resumeSuccess'));
    } catch (error) {
      toast.error(t('resumeError'));
    }
  };

  const handleCancel = async () => {
    try {
      await cancelSubscription(id).unwrap();
      toast.success(t('cancelSuccess'));
      setCancelDialogOpen(false);
    } catch (error) {
      toast.error(t('cancelError'));
    }
  };

  const handleRecordPayment = async () => {
    try {
      await recordPayment({ subscriptionId: id }).unwrap();
      toast.success('Payment recorded successfully');
    } catch (error) {
      toast.error('Failed to record payment');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error) {
    return <ApiErrorState error={error} onRetry={refetch} />;
  }

  if (!subscription) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">{t('notFound')}</p>
        <Button variant="link" onClick={() => router.push('/dashboard/subscriptions/overview')}>
          {t('backToSubscriptions')}
        </Button>
      </div>
    );
  }

  const isPaused = subscription.status === 'paused';
  const isCancelled = subscription.status === 'cancelled';
  const isExpired = subscription.status === 'expired';
  const canPause = subscription.status === 'active';
  const canResume = isPaused;
  const canCancel = subscription.status === 'active' || isPaused;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/dashboard/subscriptions/overview')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{subscription.name}</h1>
              <Badge variant={getStatusBadgeVariant(subscription.status)}>
                {tStatus(subscription.status)}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {subscription.category && translateCategory(subscription.category)}
              {subscription.category && ' • '}
              {FREQUENCY_LABELS[subscription.frequency]}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsEditFormOpen(true)}>
            <Edit className="mr-2 h-4 w-4" />
            {tActions('edit')}
          </Button>
          {canPause && (
            <Button variant="outline" size="sm" onClick={() => setPauseDialogOpen(true)}>
              <Pause className="mr-2 h-4 w-4" />
              {t('pause')}
            </Button>
          )}
          {canResume && (
            <Button variant="default" size="sm" onClick={handleResume} disabled={isResuming}>
              <Play className="mr-2 h-4 w-4" />
              {t('resume')}
            </Button>
          )}
          {canCancel && (
            <Button variant="destructive" size="sm" onClick={() => setCancelDialogOpen(true)}>
              <XCircle className="mr-2 h-4 w-4" />
              {t('cancelSubscription')}
            </Button>
          )}
        </div>
      </div>

      {/* Description */}
      {subscription.description && (
        <p className="text-muted-foreground">{subscription.description}</p>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Amount */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('amount')}</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <CurrencyDisplay
                amount={subscription.display_amount ?? subscription.amount}
                currency={subscription.display_currency ?? subscription.currency}
                showSymbol
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t('billingAmount')} • {FREQUENCY_LABELS[subscription.frequency]}
            </p>
          </CardContent>
        </Card>

        {/* Monthly Equivalent */}
        {subscription.display_monthly_equivalent && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('monthlyEquivalent')}</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                <CurrencyDisplay
                  amount={subscription.display_monthly_equivalent}
                  currency={subscription.display_currency ?? subscription.currency}
                  showSymbol
                />
              </div>
              <p className="text-xs text-muted-foreground">{t('estimatedMonthly')}</p>
            </CardContent>
          </Card>
        )}

        {/* Next Payment */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('nextPayment')}</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {subscription.next_payment_date
                ? format(new Date(subscription.next_payment_date), 'MMM d, yyyy')
                : '-'}
            </div>
            <p className="text-xs text-muted-foreground">{t('scheduledDate')}</p>
          </CardContent>
        </Card>

        {/* Last Payment */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('lastPayment')}</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {subscription.last_payment_date
                ? format(new Date(subscription.last_payment_date), 'MMM d, yyyy')
                : '-'}
            </div>
            <p className="text-xs text-muted-foreground">{t('mostRecentPayment')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Subscription Details */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Dates Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t('subscriptionDetails')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('startDate')}</span>
              <span>{format(new Date(subscription.start_date), 'MMM d, yyyy')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('endDate')}</span>
              <span>
                {subscription.end_date
                  ? format(new Date(subscription.end_date), 'MMM d, yyyy')
                  : t('noEndDate')}
              </span>
            </div>
            {subscription.paused_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paused At</span>
                <span>{format(new Date(subscription.paused_at), 'MMM d, yyyy')}</span>
              </div>
            )}
            {subscription.resume_date && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Resume Date</span>
                <span>{format(new Date(subscription.resume_date), 'MMM d, yyyy')}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Account Integration Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t('linkedAccount')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {linkedAccount ? (
              <>
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{linkedAccount.name}</span>
                  <Badge variant="outline" className="text-xs">
                    <CurrencyDisplay
                      amount={linkedAccount.current_balance}
                      currency={linkedAccount.currency}
                      showSymbol
                    />
                  </Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Auto-pay</span>
                  <Badge variant={subscription.auto_pay ? 'default' : 'secondary'}>
                    {subscription.auto_pay ? t('autoPayEnabled') : t('autoPayDisabled')}
                  </Badge>
                </div>
                {subscription.reminder_days_before > 0 && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Bell className="h-4 w-4" />
                    {t('reminderDays', { days: subscription.reminder_days_before })}
                  </div>
                )}
                {subscription.auto_pay && subscription.status === 'active' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    onClick={handleRecordPayment}
                    disabled={isRecordingPayment}
                  >
                    <Receipt className="mr-2 h-4 w-4" />
                    {t('recordPayment')}
                  </Button>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">{t('noLinkedAccount')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payment History */}
      <SubscriptionPaymentList subscriptionId={id} currency={subscription.currency} />

      {/* Dialogs */}
      <SubscriptionForm
        subscriptionId={id}
        isOpen={isEditFormOpen}
        onClose={() => setIsEditFormOpen(false)}
      />

      {/* Pause Confirmation Dialog */}
      <DeleteConfirmDialog
        open={pauseDialogOpen}
        onOpenChange={setPauseDialogOpen}
        onConfirm={handlePause}
        title={t('pauseConfirmTitle')}
        description={t('pauseConfirmDescription')}
        itemName="subscription"
        isDeleting={isPausing}
        cancelLabel={tActions('cancel')}
        deleteLabel={t('pause')}
      />

      {/* Cancel Confirmation Dialog */}
      <DeleteConfirmDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        onConfirm={handleCancel}
        title={t('cancelConfirmTitle')}
        description={t('cancelConfirmDescription')}
        itemName="subscription"
        isDeleting={isCancelling}
        cancelLabel={tActions('cancel')}
        deleteLabel={t('cancelSubscription')}
      />
    </div>
  );
}
