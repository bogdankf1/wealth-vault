/**
 * Debt Detail Page
 * Shows debt details, payment history, and actions (mark paid, forgive, record payment)
 */
'use client';

import React, { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  Edit,
  CheckCircle,
  DollarSign,
  Calendar,
  Wallet,
  Clock,
  Bell,
  Receipt,
  Percent,
  User,
  AlertTriangle,
  Gift,
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ApiErrorState } from '@/components/ui/error-state';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { DebtForm } from '@/components/debts/debt-form';
import { DebtPaymentList } from '@/components/debts/debt-payment-list';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import {
  useGetDebtQuery,
  useRecordDebtPaymentMutation,
  useMarkDebtPaidMutation,
  useForgiveDebtMutation,
} from '@/lib/api/debtsApi';
import { useGetAccountQuery } from '@/lib/api/savingsApi';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function DebtDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();

  // Translation hooks
  const t = useTranslations('debts.detail');
  const tStatus = useTranslations('debts.status');
  const tActions = useTranslations('debts.actions');

  // State
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const [markPaidDialogOpen, setMarkPaidDialogOpen] = useState(false);
  const [forgiveDialogOpen, setForgiveDialogOpen] = useState(false);
  const [recordPaymentDialogOpen, setRecordPaymentDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [depositToAccount, setDepositToAccount] = useState(true);

  // Queries
  const { data: debt, isLoading, error, refetch } = useGetDebtQuery(id);
  const { data: linkedAccount } = useGetAccountQuery(debt?.deposit_account_id || '', {
    skip: !debt?.deposit_account_id,
  });

  // Mutations
  const [recordPayment, { isLoading: isRecordingPayment }] = useRecordDebtPaymentMutation();
  const [markPaid, { isLoading: isMarkingPaid }] = useMarkDebtPaidMutation();
  const [forgiveDebt, { isLoading: isForgiving }] = useForgiveDebtMutation();

  const getStatusBadgeVariant = (isPaid: boolean, isOverdue: boolean) => {
    if (isPaid) return 'secondary';
    if (isOverdue) return 'destructive';
    return 'default';
  };

  const getStatusLabel = (isPaid: boolean, isOverdue: boolean) => {
    if (isPaid) return tStatus('paid');
    if (isOverdue) return tStatus('overdue');
    return tStatus('active');
  };

  const handleRecordPayment = async () => {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      toast.error('Please enter a valid payment amount');
      return;
    }

    try {
      await recordPayment({
        debtId: id,
        data: {
          amount: parseFloat(paymentAmount),
          notes: paymentNotes || undefined,
          deposit_to_account: depositToAccount,
        },
      }).unwrap();
      toast.success(t('paymentRecordedSuccess'));
      setRecordPaymentDialogOpen(false);
      setPaymentAmount('');
      setPaymentNotes('');
    } catch (error) {
      toast.error(t('paymentRecordedError'));
    }
  };

  const handleMarkPaid = async () => {
    try {
      await markPaid(id).unwrap();
      toast.success(t('markPaidSuccess'));
      setMarkPaidDialogOpen(false);
    } catch (error) {
      toast.error(t('markPaidError'));
    }
  };

  const handleForgive = async () => {
    try {
      await forgiveDebt(id).unwrap();
      toast.success(t('forgiveSuccess'));
      setForgiveDialogOpen(false);
    } catch (error) {
      toast.error(t('forgiveError'));
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

  if (!debt) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">{t('notFound')}</p>
        <Button variant="link" onClick={() => router.push('/dashboard/debts/overview')}>
          {t('backToDebts')}
        </Button>
      </div>
    );
  }

  const isPaid = debt.is_paid;
  const isOverdue = debt.is_overdue || false;
  const canMarkPaid = !isPaid;
  const canForgive = !isPaid && (debt.amount_remaining ?? 0) > 0;
  const canRecordPayment = !isPaid;

  const progressPercent = Number(debt.progress_percentage) || 0;

  return (
    <div className="space-y-3 lg:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2 lg:gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 lg:h-10 lg:w-10"
            onClick={() => router.push('/dashboard/debts/overview')}
          >
            <ArrowLeft className="h-4 w-4 lg:h-5 lg:w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-1.5 lg:gap-2">
              <h1 className="text-lg lg:text-2xl font-bold">{debt.debtor_name}</h1>
              <Badge variant={getStatusBadgeVariant(isPaid, isOverdue)} className="text-[10px] lg:text-xs">
                {getStatusLabel(isPaid, isOverdue)}
              </Badge>
            </div>
            {debt.description && (
              <p className="text-xs lg:text-sm text-muted-foreground">{debt.description}</p>
            )}
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
            {canRecordPayment && (
              <DropdownMenuItem onClick={() => setRecordPaymentDialogOpen(true)}>
                <Receipt className="h-4 w-4" />
                {t('recordPayment')}
              </DropdownMenuItem>
            )}
            {canMarkPaid && (
              <DropdownMenuItem onClick={() => setMarkPaidDialogOpen(true)}>
                <CheckCircle className="h-4 w-4" />
                {t('markPaid')}
              </DropdownMenuItem>
            )}
            {canForgive && (
              <DropdownMenuItem onClick={() => setForgiveDialogOpen(true)}>
                <Gift className="h-4 w-4" />
                {t('forgive')}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setIsEditFormOpen(true)}>
              <Edit className="h-4 w-4" />
              {tActions('edit')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Progress Section */}
      <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
        <CardHeader className="px-3 lg:px-6 pb-1 lg:pb-2">
          <CardTitle className="text-xs lg:text-sm font-medium flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            {t('collectionProgress')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 lg:px-6">
          <div className="space-y-2 lg:space-y-3">
            <div className="flex justify-between text-xs lg:text-sm">
              <span>
                <CurrencyDisplay
                  amount={debt.display_amount_paid ?? debt.amount_paid}
                  currency={debt.display_currency ?? debt.currency}
                  showSymbol
                />
                {' '}{t('of')}{' '}
                <CurrencyDisplay
                  amount={debt.display_amount ?? debt.amount}
                  currency={debt.display_currency ?? debt.currency}
                  showSymbol
                />
              </span>
              <span className="font-medium">{progressPercent.toFixed(0)}%</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
            <div className="flex justify-between text-[10px] lg:text-xs text-muted-foreground">
              <span>
                {t('remaining')}: <CurrencyDisplay
                  amount={debt.amount_remaining ?? 0}
                  currency={debt.display_currency ?? debt.currency}
                  showSymbol
                />
              </span>
              {debt.due_date && (
                <span>{t('dueBy')}: {format(new Date(debt.due_date), 'MMM d, yyyy')}</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-2 md:gap-3 lg:gap-4 lg:grid-cols-4">
        {/* Total Amount */}
        <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 px-3 lg:px-6 pb-1 lg:pb-2">
            <CardTitle className="text-xs lg:text-sm font-medium">{t('totalAmount')}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground hidden sm:block" />
          </CardHeader>
          <CardContent className="px-3 lg:px-6">
            <div className="text-base sm:text-lg lg:text-2xl font-bold">
              <CurrencyDisplay
                amount={debt.display_amount ?? debt.amount}
                currency={debt.display_currency ?? debt.currency}
                showSymbol
              />
            </div>
            <p className="text-[10px] lg:text-xs text-muted-foreground">{t('originalDebtAmount')}</p>
          </CardContent>
        </Card>

        {/* Amount Collected */}
        <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 px-3 lg:px-6 pb-1 lg:pb-2">
            <CardTitle className="text-xs lg:text-sm font-medium">{t('amountCollected')}</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground hidden sm:block" />
          </CardHeader>
          <CardContent className="px-3 lg:px-6">
            <div className="text-base sm:text-lg lg:text-2xl font-bold text-green-600">
              <CurrencyDisplay
                amount={debt.display_amount_paid ?? debt.amount_paid}
                currency={debt.display_currency ?? debt.currency}
                showSymbol
              />
            </div>
            <p className="text-[10px] lg:text-xs text-muted-foreground">{t('receivedSoFar')}</p>
          </CardContent>
        </Card>

        {/* Amount Remaining */}
        <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 px-3 lg:px-6 pb-1 lg:pb-2">
            <CardTitle className="text-xs lg:text-sm font-medium">{t('amountRemaining')}</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground hidden sm:block" />
          </CardHeader>
          <CardContent className="px-3 lg:px-6">
            <div className="text-base sm:text-lg lg:text-2xl font-bold">
              <CurrencyDisplay
                amount={debt.amount_remaining ?? 0}
                currency={debt.display_currency ?? debt.currency}
                showSymbol
              />
            </div>
            <p className="text-[10px] lg:text-xs text-muted-foreground">{t('stillOwed')}</p>
          </CardContent>
        </Card>

        {/* Interest Rate (if applicable) */}
        {debt.interest_rate != null && debt.interest_rate > 0 && (
          <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 px-3 lg:px-6 pb-1 lg:pb-2">
              <CardTitle className="text-xs lg:text-sm font-medium">{t('interestRate')}</CardTitle>
              <Percent className="h-4 w-4 text-muted-foreground hidden sm:block" />
            </CardHeader>
            <CardContent className="px-3 lg:px-6">
              <div className="text-base sm:text-lg lg:text-2xl font-bold">{debt.interest_rate}%</div>
              <p className="text-[10px] lg:text-xs text-muted-foreground">{t('annualRate')}</p>
              {debt.accrued_interest > 0 && (
                <p className="text-[10px] lg:text-xs text-muted-foreground mt-1">
                  {t('accruedInterest')}: <CurrencyDisplay
                    amount={debt.accrued_interest}
                    currency={debt.currency}
                    showSymbol
                  />
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Due Date */}
        {debt.due_date && (
          <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 px-3 lg:px-6 pb-1 lg:pb-2">
              <CardTitle className="text-xs lg:text-sm font-medium">{t('dueDate')}</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground hidden sm:block" />
            </CardHeader>
            <CardContent className="px-3 lg:px-6">
              <div className="text-base sm:text-lg lg:text-2xl font-bold">
                {format(new Date(debt.due_date), 'MMM d, yyyy')}
              </div>
              {isOverdue && (
                <p className="text-[10px] lg:text-xs text-destructive font-medium">{t('overdue')}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Next Payment */}
        {debt.next_payment_date && !isPaid && (
          <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 px-3 lg:px-6 pb-1 lg:pb-2">
              <CardTitle className="text-xs lg:text-sm font-medium">{t('nextPayment')}</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground hidden sm:block" />
            </CardHeader>
            <CardContent className="px-3 lg:px-6">
              <div className="text-base sm:text-lg lg:text-2xl font-bold">
                {format(new Date(debt.next_payment_date), 'MMM d, yyyy')}
              </div>
              {debt.expected_payment_amount && (
                <p className="text-[10px] lg:text-xs text-muted-foreground">
                  {t('expected')}: <CurrencyDisplay
                    amount={debt.expected_payment_amount}
                    currency={debt.currency}
                    showSymbol
                  />
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Debt Details & Account Integration */}
      <div className="grid gap-2 md:gap-3 lg:gap-4 md:grid-cols-2">
        {/* Debt Details */}
        <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
          <CardHeader className="px-3 lg:px-6">
            <CardTitle className="text-xs lg:text-sm font-medium flex items-center gap-2">
              <User className="h-4 w-4" />
              {t('debtDetails')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 lg:px-6 space-y-2 lg:space-y-3 text-xs lg:text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('debtor')}</span>
              <span className="font-medium">{debt.debtor_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('createdAt')}</span>
              <span>{format(new Date(debt.created_at), 'MMM d, yyyy')}</span>
            </div>
            {debt.paid_date && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('paidDate')}</span>
                <span>{format(new Date(debt.paid_date), 'MMM d, yyyy')}</span>
              </div>
            )}
            {debt.payment_frequency && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('paymentFrequency')}</span>
                <span className="capitalize">{debt.payment_frequency}</span>
              </div>
            )}
            {debt.notes && (
              <div className="pt-2 border-t">
                <span className="text-muted-foreground">{t('notes')}</span>
                <p className="mt-1">{debt.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Account Integration */}
        <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
          <CardHeader className="px-3 lg:px-6">
            <CardTitle className="text-xs lg:text-sm font-medium flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              {t('linkedAccount')}
            </CardTitle>
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
                  <span className="text-muted-foreground">{t('autoDeposit')}</span>
                  <Badge variant={debt.auto_deposit ? 'default' : 'secondary'}>
                    {debt.auto_deposit ? t('enabled') : t('disabled')}
                  </Badge>
                </div>
                {debt.reminder_days_before > 0 && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Bell className="h-4 w-4" />
                    {t('reminderDays', { days: debt.reminder_days_before })}
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">{t('noLinkedAccount')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payment History */}
      <DebtPaymentList debtId={id} currency={debt.currency} />

      {/* Dialogs */}
      <DebtForm
        debtId={id}
        isOpen={isEditFormOpen}
        onClose={() => setIsEditFormOpen(false)}
      />

      {/* Record Payment Dialog */}
      <Dialog open={recordPaymentDialogOpen} onOpenChange={setRecordPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('recordPaymentTitle')}</DialogTitle>
            <DialogDescription>{t('recordPaymentDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="payment_amount">{t('paymentAmount')} *</Label>
              <Input
                id="payment_amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment_notes">{t('paymentNotes')}</Label>
              <Textarea
                id="payment_notes"
                placeholder={t('paymentNotesPlaceholder')}
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
              />
            </div>
            {debt.deposit_account_id && (
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="deposit_to_account">{t('depositToAccount')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t('depositToAccountHelp', { account: linkedAccount?.name || '' })}
                  </p>
                </div>
                <Switch
                  id="deposit_to_account"
                  checked={depositToAccount}
                  onCheckedChange={setDepositToAccount}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordPaymentDialogOpen(false)}>
              {tActions('cancel')}
            </Button>
            <Button onClick={handleRecordPayment} disabled={isRecordingPayment}>
              {isRecordingPayment ? t('recording') : t('recordPayment')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Paid Confirmation Dialog */}
      <DeleteConfirmDialog
        open={markPaidDialogOpen}
        onOpenChange={setMarkPaidDialogOpen}
        onConfirm={handleMarkPaid}
        title={t('markPaidConfirmTitle')}
        description={t('markPaidConfirmDescription')}
        itemName="debt"
        isDeleting={isMarkingPaid}
        cancelLabel={tActions('cancel')}
        deleteLabel={t('markPaid')}
      />

      {/* Forgive Confirmation Dialog */}
      <DeleteConfirmDialog
        open={forgiveDialogOpen}
        onOpenChange={setForgiveDialogOpen}
        onConfirm={handleForgive}
        title={t('forgiveConfirmTitle')}
        description={t('forgiveConfirmDescription')}
        itemName="debt"
        isDeleting={isForgiving}
        cancelLabel={tActions('cancel')}
        deleteLabel={t('forgive')}
      />
    </div>
  );
}
