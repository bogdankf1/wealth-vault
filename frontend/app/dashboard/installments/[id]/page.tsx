/**
 * Installment Detail Page
 * Shows installment details, payment history, and actions (complete/default/reactivate)
 */
'use client';

import React, { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  Edit,
  CheckCircle,
  XOctagon,
  RefreshCw,
  Calendar,
  CreditCard,
  Wallet,
  Clock,
  Bell,
  Receipt,
  TrendingDown,
  Percent,
  Target,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { ApiErrorState } from '@/components/ui/error-state';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { InstallmentForm } from '@/components/installments/installment-form';
import { InstallmentPaymentList } from '@/components/installments/installment-payment-list';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import {
  useGetInstallmentQuery,
  useCompleteInstallmentMutation,
  useDefaultInstallmentMutation,
  useReactivateInstallmentMutation,
  useRecordInstallmentPaymentMutation,
} from '@/lib/api/installmentsApi';
import { useGetAccountQuery } from '@/lib/api/savingsApi';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function InstallmentDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();

  // Translation hooks
  const t = useTranslations('installments.detail');
  const tStatus = useTranslations('installments.status');
  const tFrequencies = useTranslations('installments.frequencies');
  const tCategories = useTranslations('installments.categories');
  const tActions = useTranslations('installments.actions');

  // State
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [defaultDialogOpen, setDefaultDialogOpen] = useState(false);

  // Queries
  const { data: installment, isLoading, error, refetch } = useGetInstallmentQuery(id);
  const { data: linkedAccount } = useGetAccountQuery(installment?.payment_account_id || '', {
    skip: !installment?.payment_account_id,
  });

  // Mutations
  const [completeInstallment, { isLoading: isCompleting }] = useCompleteInstallmentMutation();
  const [defaultInstallment, { isLoading: isDefaulting }] = useDefaultInstallmentMutation();
  const [reactivateInstallment, { isLoading: isReactivating }] = useReactivateInstallmentMutation();
  const [recordPayment, { isLoading: isRecordingPayment }] = useRecordInstallmentPaymentMutation();

  const FREQUENCY_LABELS: Record<string, string> = {
    weekly: tFrequencies('weekly'),
    biweekly: tFrequencies('biweekly'),
    monthly: tFrequencies('monthly'),
  };

  const CATEGORY_MAP: Record<string, string> = {
    'Personal Tech': 'personalTech',
    'Kitchen Appliances': 'kitchenAppliances',
    'Health Tech': 'healthTech',
    'Home Appliances': 'homeAppliances',
    'Miscellaneous': 'miscellaneous',
    'Fitness Equipment': 'fitnessEquipment',
    'Housing Goods': 'housingGoods',
    'Vehicle': 'vehicle',
    'Property & Real Estate': 'propertyRealEstate',
  };

  const translateCategory = (category: string) => {
    const key = CATEGORY_MAP[category];
    return key ? tCategories(key) : category;
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active':
        return 'default';
      case 'completed':
        return 'secondary';
      case 'defaulted':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const handleComplete = async () => {
    try {
      await completeInstallment(id).unwrap();
      toast.success(t('completeSuccess'));
      setCompleteDialogOpen(false);
    } catch (error) {
      toast.error(t('completeError'));
    }
  };

  const handleDefault = async () => {
    try {
      await defaultInstallment({ id }).unwrap();
      toast.success(t('defaultSuccess'));
      setDefaultDialogOpen(false);
    } catch (error) {
      toast.error(t('defaultError'));
    }
  };

  const handleReactivate = async () => {
    try {
      await reactivateInstallment(id).unwrap();
      toast.success(t('reactivateSuccess'));
    } catch (error) {
      toast.error(t('reactivateError'));
    }
  };

  const handleRecordPayment = async () => {
    try {
      await recordPayment({ installmentId: id }).unwrap();
      toast.success(t('paymentRecordedSuccess'));
    } catch (error: unknown) {
      // Check if it's an insufficient funds error
      const apiError = error as { data?: { detail?: { error_code?: string; account_name?: string; current_balance?: number; required_amount?: number; currency?: string } } };
      if (apiError?.data?.detail?.error_code === 'INSUFFICIENT_FUNDS') {
        const { account_name, current_balance, required_amount, currency } = apiError.data.detail;
        const formattedBalance = new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(current_balance || 0);
        const formattedAmount = new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(required_amount || 0);
        toast.error(t('insufficientFunds', { accountName: account_name || 'Unknown', balance: formattedBalance, amount: formattedAmount }));
      } else {
        toast.error(t('paymentRecordedError'));
      }
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3 lg:space-y-6">
        <div className="flex items-center gap-2 lg:gap-4">
          <Skeleton className="h-8 w-8 lg:h-10 lg:w-10" />
          <div className="space-y-1.5 lg:space-y-2">
            <Skeleton className="h-5 lg:h-6 w-48" />
            <Skeleton className="h-3 lg:h-4 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 md:gap-3 lg:gap-4 lg:grid-cols-4">
          <Skeleton className="h-20 lg:h-32" />
          <Skeleton className="h-20 lg:h-32" />
          <Skeleton className="h-20 lg:h-32" />
          <Skeleton className="h-20 lg:h-32" />
        </div>
        <Skeleton className="h-64 lg:h-96" />
      </div>
    );
  }

  if (error) {
    return <ApiErrorState error={error} onRetry={refetch} />;
  }

  if (!installment) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">{t('notFound')}</p>
        <Button variant="link" onClick={() => router.push('/dashboard/installments/overview')}>
          {t('backToInstallments')}
        </Button>
      </div>
    );
  }

  const isActive = installment.status === 'active';
  const isCompleted = installment.status === 'completed';
  const isDefaulted = installment.status === 'defaulted';
  const canComplete = isActive && installment.payments_made >= installment.number_of_payments;
  const canDefault = isActive;
  const canReactivate = isCompleted || isDefaulted;

  const progressPercent = (installment.payments_made / installment.number_of_payments) * 100;
  const remainingPayments = installment.number_of_payments - installment.payments_made;

  return (
    <div className="space-y-3 lg:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2 lg:gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 lg:h-10 lg:w-10"
            onClick={() => router.push('/dashboard/installments/overview')}
          >
            <ArrowLeft className="h-4 w-4 lg:h-5 lg:w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-1.5 lg:gap-2">
              <h1 className="text-lg lg:text-2xl font-bold">{installment.name}</h1>
              <Badge variant={getStatusBadgeVariant(installment.status)} className="text-[10px] lg:text-xs">
                {tStatus(installment.status)}
              </Badge>
            </div>
            <p className="text-xs lg:text-sm text-muted-foreground">
              {installment.category && translateCategory(installment.category)}
              {installment.category && ' • '}
              {FREQUENCY_LABELS[installment.frequency]}
            </p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="lg:h-10 lg:px-4 lg:text-sm">
              {t('actions')}
              <ChevronDown className="ml-1.5 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {installment.auto_pay && installment.status === 'active' && (
              <DropdownMenuItem onClick={handleRecordPayment} disabled={isRecordingPayment}>
                <Receipt className="h-4 w-4" />
                {t('recordPayment')}
              </DropdownMenuItem>
            )}
            {canComplete && (
              <DropdownMenuItem onClick={() => setCompleteDialogOpen(true)}>
                <CheckCircle className="h-4 w-4" />
                {t('markComplete')}
              </DropdownMenuItem>
            )}
            {canReactivate && (
              <DropdownMenuItem onClick={handleReactivate} disabled={isReactivating}>
                <RefreshCw className="h-4 w-4" />
                {t('reactivate')}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setIsEditFormOpen(true)}>
              <Edit className="h-4 w-4" />
              {tActions('edit')}
            </DropdownMenuItem>
            {canDefault && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => setDefaultDialogOpen(true)}>
                  <XOctagon className="h-4 w-4" />
                  {t('markDefaulted')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Description */}
      {installment.description && (
        <p className="text-xs lg:text-sm text-muted-foreground">{installment.description}</p>
      )}

      {/* Progress Section */}
      <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
        <CardHeader className="px-3 lg:px-6 pb-1 lg:pb-2">
          <CardTitle className="text-xs lg:text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4" />
            {t('paymentProgress')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 lg:px-6">
          <div className="space-y-2 lg:space-y-3">
            <div className="flex justify-between text-xs lg:text-sm">
              <span>
                {installment.payments_made} {t('of')} {installment.number_of_payments} {t('payments')}
              </span>
              <span className="font-medium">{progressPercent.toFixed(0)}%</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
            <div className="flex justify-between text-[10px] lg:text-xs text-muted-foreground">
              <span>{remainingPayments} {t('paymentsRemaining')}</span>
              {installment.end_date && (
                <span>{t('estimatedCompletion')}: {format(new Date(installment.end_date), 'MMM yyyy')}</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-2 md:gap-3 lg:gap-4 lg:grid-cols-4">
        {/* Total Amount */}
        <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
          <CardHeader className="px-3 lg:px-6 flex flex-row items-center justify-between space-y-0 pb-1 lg:pb-2">
            <CardTitle className="text-xs lg:text-sm font-medium">{t('totalAmount')}</CardTitle>
            <CreditCard className="hidden sm:block h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-3 lg:px-6">
            <div className="text-base sm:text-lg lg:text-2xl font-bold">
              <CurrencyDisplay
                amount={installment.display_total_amount ?? installment.total_amount}
                currency={installment.display_currency ?? installment.currency}
                showSymbol
              />
            </div>
            <p className="text-[10px] lg:text-xs text-muted-foreground">{t('originalLoanAmount')}</p>
          </CardContent>
        </Card>

        {/* Payment Amount */}
        <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
          <CardHeader className="px-3 lg:px-6 flex flex-row items-center justify-between space-y-0 pb-1 lg:pb-2">
            <CardTitle className="text-xs lg:text-sm font-medium">{t('paymentAmount')}</CardTitle>
            <Receipt className="hidden sm:block h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-3 lg:px-6">
            <div className="text-base sm:text-lg lg:text-2xl font-bold">
              <CurrencyDisplay
                amount={installment.display_amount_per_payment ?? installment.amount_per_payment}
                currency={installment.display_currency ?? installment.currency}
                showSymbol
              />
            </div>
            <p className="text-[10px] lg:text-xs text-muted-foreground">
              {t('perPayment')} • {FREQUENCY_LABELS[installment.frequency]}
            </p>
          </CardContent>
        </Card>

        {/* Remaining Balance */}
        <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
          <CardHeader className="px-3 lg:px-6 flex flex-row items-center justify-between space-y-0 pb-1 lg:pb-2">
            <CardTitle className="text-xs lg:text-sm font-medium">{t('remainingBalance')}</CardTitle>
            <TrendingDown className="hidden sm:block h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-3 lg:px-6">
            <div className="text-base sm:text-lg lg:text-2xl font-bold">
              <CurrencyDisplay
                amount={installment.display_remaining_balance ?? installment.remaining_balance ?? 0}
                currency={installment.display_currency ?? installment.currency}
                showSymbol
              />
            </div>
            <p className="text-[10px] lg:text-xs text-muted-foreground">{t('leftToPay')}</p>
          </CardContent>
        </Card>

        {/* Interest Rate */}
        {installment.interest_rate != null && (
          <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
            <CardHeader className="px-3 lg:px-6 flex flex-row items-center justify-between space-y-0 pb-1 lg:pb-2">
              <CardTitle className="text-xs lg:text-sm font-medium">{t('interestRate')}</CardTitle>
              <Percent className="hidden sm:block h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="px-3 lg:px-6">
              <div className="text-base sm:text-lg lg:text-2xl font-bold">{installment.interest_rate}%</div>
              <p className="text-[10px] lg:text-xs text-muted-foreground">{t('annualRate')}</p>
            </CardContent>
          </Card>
        )}

        {/* Next Payment */}
        <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
          <CardHeader className="px-3 lg:px-6 flex flex-row items-center justify-between space-y-0 pb-1 lg:pb-2">
            <CardTitle className="text-xs lg:text-sm font-medium">{t('nextPayment')}</CardTitle>
            <Calendar className="hidden sm:block h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-3 lg:px-6">
            <div className="text-base sm:text-lg lg:text-2xl font-bold">
              {installment.next_payment_date
                ? format(new Date(installment.next_payment_date), 'MMM d, yyyy')
                : '-'}
            </div>
            <p className="text-[10px] lg:text-xs text-muted-foreground">{t('scheduledDate')}</p>
          </CardContent>
        </Card>

        {/* Last Payment */}
        <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
          <CardHeader className="px-3 lg:px-6 flex flex-row items-center justify-between space-y-0 pb-1 lg:pb-2">
            <CardTitle className="text-xs lg:text-sm font-medium">{t('lastPayment')}</CardTitle>
            <Clock className="hidden sm:block h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-3 lg:px-6">
            <div className="text-base sm:text-lg lg:text-2xl font-bold">
              {installment.last_payment_date
                ? format(new Date(installment.last_payment_date), 'MMM d, yyyy')
                : '-'}
            </div>
            <p className="text-[10px] lg:text-xs text-muted-foreground">{t('mostRecentPayment')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Installment Details */}
      <div className="grid gap-2 md:gap-3 lg:gap-4 md:grid-cols-2">
        {/* Dates Card */}
        <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
          <CardHeader className="px-3 lg:px-6">
            <CardTitle className="text-xs lg:text-sm font-medium">{t('installmentDetails')}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 lg:px-6 space-y-2 lg:space-y-3 text-xs lg:text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('startDate')}</span>
              <span>{format(new Date(installment.start_date), 'MMM d, yyyy')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('firstPaymentDate')}</span>
              <span>{format(new Date(installment.first_payment_date), 'MMM d, yyyy')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('endDate')}</span>
              <span>
                {installment.end_date
                  ? format(new Date(installment.end_date), 'MMM d, yyyy')
                  : t('notCalculated')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('totalPayments')}</span>
              <span>{installment.number_of_payments}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('paymentsMade')}</span>
              <span>{installment.payments_made}</span>
            </div>
          </CardContent>
        </Card>

        {/* Account Integration Card */}
        <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
          <CardHeader className="px-3 lg:px-6">
            <CardTitle className="text-xs lg:text-sm font-medium">{t('linkedAccount')}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 lg:px-6 space-y-2 lg:space-y-3 text-xs lg:text-sm">
            {linkedAccount ? (
              <>
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{linkedAccount.name}</span>
                  <Badge variant="outline" className="text-[10px] lg:text-xs">
                    <CurrencyDisplay
                      amount={linkedAccount.current_balance}
                      currency={linkedAccount.currency}
                      showSymbol
                    />
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('autoPay')}</span>
                  <Badge variant={installment.auto_pay ? 'default' : 'secondary'}>
                    {installment.auto_pay ? t('autoPayEnabled') : t('autoPayDisabled')}
                  </Badge>
                </div>
                {installment.reminder_days_before > 0 && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Bell className="h-4 w-4" />
                    {t('reminderDays', { days: installment.reminder_days_before })}
                  </div>
                )}
                {installment.auto_pay && installment.status === 'active' && (
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
      <InstallmentPaymentList installmentId={id} currency={installment.currency} />

      {/* Dialogs */}
      <InstallmentForm
        installmentId={id}
        isOpen={isEditFormOpen}
        onClose={() => setIsEditFormOpen(false)}
      />

      {/* Complete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={completeDialogOpen}
        onOpenChange={setCompleteDialogOpen}
        onConfirm={handleComplete}
        title={t('completeConfirmTitle')}
        description={t('completeConfirmDescription')}
        itemName="installment"
        isDeleting={isCompleting}
        cancelLabel={tActions('cancel')}
        deleteLabel={t('markComplete')}
      />

      {/* Default Confirmation Dialog */}
      <DeleteConfirmDialog
        open={defaultDialogOpen}
        onOpenChange={setDefaultDialogOpen}
        onConfirm={handleDefault}
        title={t('defaultConfirmTitle')}
        description={t('defaultConfirmDescription')}
        itemName="installment"
        isDeleting={isDefaulting}
        cancelLabel={tActions('cancel')}
        deleteLabel={t('markDefaulted')}
      />
    </div>
  );
}
