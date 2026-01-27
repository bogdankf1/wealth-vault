'use client';

import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  useGetTaxQuery,
  usePayTaxMutation,
  useDeleteTaxMutation,
  useGetPaymentsForTaxQuery,
} from '@/lib/api/taxesApi';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiErrorState } from '@/components/ui/error-state';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Receipt,
  Wallet,
  Calendar,
  Edit,
  Trash2,
  History,
  CreditCard,
  CheckCircle2,
  XCircle,
  DollarSign,
  Percent,
  Building2,
  Clock,
  RotateCcw,
  ChevronDown,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TaxForm } from '@/components/taxes/tax-form';

export default function TaxDetailPage() {
  const params = useParams();
  const router = useRouter();
  const taxId = params.id as string;

  const t = useTranslations('taxes.detail');
  const tTypes = useTranslations('taxes.types');
  const tFrequencies = useTranslations('taxes.frequencies');
  const tPayment = useTranslations('taxes.paymentStatus');

  // State
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPayDialogOpen, setIsPayDialogOpen] = useState(false);
  const [paymentNotes, setPaymentNotes] = useState('');

  // Queries
  const { data: tax, isLoading, error } = useGetTaxQuery(taxId);
  const { data: paymentsData } = useGetPaymentsForTaxQuery({ taxId, page: 1, page_size: 10 });

  // Mutations
  const [payTax, { isLoading: isPaying }] = usePayTaxMutation();
  const [deleteTax, { isLoading: isDeleting }] = useDeleteTaxMutation();

  const handlePayTax = async () => {
    try {
      await payTax({
        taxId,
        request: paymentNotes ? { notes: paymentNotes } : undefined,
      }).unwrap();
      toast.success(t('paymentSuccess'));
      setIsPayDialogOpen(false);
      setPaymentNotes('');
    } catch (error: unknown) {
      const err = error as { data?: { detail?: string } };
      toast.error(err?.data?.detail || t('paymentError'));
    }
  };

  const handleDeleteTax = async () => {
    try {
      await deleteTax(taxId).unwrap();
      toast.success(t('deleteSuccess'));
      router.push('/dashboard/taxes/overview');
    } catch (error) {
      toast.error(t('deleteError'));
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
        <Skeleton className="h-48 lg:h-64" />
      </div>
    );
  }

  if (error || !tax) {
    return <ApiErrorState error={error} />;
  }

  const calculatedAmount = tax.calculated_amount || tax.display_fixed_amount || tax.fixed_amount || 0;
  const displayCurrency = tax.display_currency || tax.currency;
  const canPay = tax.payment_account_id && tax.payment_account;

  return (
    <div className="space-y-3 lg:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2 lg:gap-4">
          <Button variant="ghost" size="icon" className="h-8 w-8 lg:h-10 lg:w-10" onClick={() => router.push('/dashboard/taxes/overview')}>
            <ArrowLeft className="h-4 w-4 lg:h-5 lg:w-5" />
          </Button>
          <div>
            <h1 className="text-lg lg:text-2xl font-bold">{tax.name}</h1>
            {tax.description && (
              <p className="text-xs lg:text-sm text-muted-foreground">{tax.description}</p>
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
            {canPay && (
              <DropdownMenuItem onClick={() => setIsPayDialogOpen(true)}>
                {tax.is_paid_current_period ? (
                  <>
                    <RotateCcw className="h-4 w-4" />
                    {t('payAgain')}
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4" />
                    {t('payNow')}
                  </>
                )}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setIsEditDialogOpen(true)}>
              <Edit className="h-4 w-4" />
              {t('editTax')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setIsDeleteDialogOpen(true)}>
              <Trash2 className="h-4 w-4" />
              {t('deleteTax')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Status Badges */}
      <div className="flex gap-2 flex-wrap">
        <Badge variant={tax.tax_type === 'fixed' ? 'default' : 'secondary'}>
          {tax.tax_type === 'fixed' ? (
            <DollarSign className="h-3 w-3 mr-1" />
          ) : (
            <Percent className="h-3 w-3 mr-1" />
          )}
          {tTypes(tax.tax_type)}
        </Badge>
        <Badge variant="outline">{tFrequencies(tax.frequency)}</Badge>
        {tax.is_active ? (
          <Badge variant="default" className="bg-green-600">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Active
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            <XCircle className="h-3 w-3 mr-1" />
            Inactive
          </Badge>
        )}
        {tax.auto_pay && (
          <Badge variant="outline" className="border-blue-500 text-blue-600">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {t('autoPayEnabled')}
          </Badge>
        )}
        {/* Payment Status Badge */}
        {tax.is_paid_current_period ? (
          <Badge variant="default" className="bg-emerald-600">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {tPayment('paid')}
          </Badge>
        ) : (
          <Badge variant="outline" className="border-orange-500 text-orange-600">
            <Clock className="h-3 w-3 mr-1" />
            {tPayment('due')}
          </Badge>
        )}
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 gap-2 md:gap-3 lg:gap-4 lg:grid-cols-4">
        <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
          <CardHeader className="flex flex-row items-center justify-between px-3 lg:px-6 pb-1 lg:pb-2">
            <CardTitle className="text-xs lg:text-sm font-medium">{t('calculatedAmount')}</CardTitle>
            <Receipt className="hidden sm:block h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-3 lg:px-6">
            <div className="text-base sm:text-lg lg:text-2xl font-bold">
              <CurrencyDisplay
                amount={calculatedAmount}
                currency={displayCurrency}
              />
            </div>
            <p className="text-[10px] lg:text-xs text-muted-foreground mt-1">
              {tFrequencies(tax.frequency)}
            </p>
          </CardContent>
        </Card>

        <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
          <CardHeader className="flex flex-row items-center justify-between px-3 lg:px-6 pb-1 lg:pb-2">
            <CardTitle className="text-xs lg:text-sm font-medium">{t('paymentAccount')}</CardTitle>
            <Wallet className="hidden sm:block h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-3 lg:px-6">
            {tax.payment_account ? (
              <>
                <div className="text-base sm:text-lg font-bold">{tax.payment_account.name}</div>
                <p className="text-[10px] lg:text-xs text-muted-foreground mt-1">
                  Balance: <CurrencyDisplay amount={tax.payment_account.current_balance} currency={tax.payment_account.currency} />
                </p>
              </>
            ) : (
              <div className="text-muted-foreground">No account selected</div>
            )}
          </CardContent>
        </Card>

        <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
          <CardHeader className="flex flex-row items-center justify-between px-3 lg:px-6 pb-1 lg:pb-2">
            <CardTitle className="text-xs lg:text-sm font-medium">{t('incomeSource')}</CardTitle>
            <Building2 className="hidden sm:block h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-3 lg:px-6">
            {tax.income_source ? (
              <>
                <div className="text-base sm:text-lg font-bold">{tax.income_source.name}</div>
                <p className="text-[10px] lg:text-xs text-muted-foreground mt-1">
                  <CurrencyDisplay amount={tax.income_source.amount} currency={tax.income_source.currency} /> / {tax.income_source.frequency}
                </p>
              </>
            ) : (
              <div className="text-muted-foreground">{t('allIncomeSources')}</div>
            )}
          </CardContent>
        </Card>

        <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
          <CardHeader className="flex flex-row items-center justify-between px-3 lg:px-6 pb-1 lg:pb-2">
            <CardTitle className="text-xs lg:text-sm font-medium">{t('nextPaymentDate')}</CardTitle>
            <Calendar className="hidden sm:block h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-3 lg:px-6">
            {tax.next_payment_date ? (
              <div className="text-base sm:text-lg font-bold">
                {new Date(tax.next_payment_date).toLocaleDateString()}
              </div>
            ) : (
              <div className="text-muted-foreground">Not scheduled</div>
            )}
            <p className="text-[10px] lg:text-xs text-muted-foreground mt-1">
              {t('autoPay')}: {tax.auto_pay ? t('autoPayEnabled') : t('autoPayDisabled')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tax Info Card */}
      <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
        <CardHeader className="px-3 lg:px-6">
          <CardTitle className="flex items-center gap-2 text-sm lg:text-base">
            <Receipt className="h-4 w-4 lg:h-5 lg:w-5" />
            {t('taxInfo')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 lg:px-6">
          <div className="grid gap-2 lg:gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs lg:text-sm text-muted-foreground">Tax Type</p>
              <p className="text-xs lg:text-sm font-medium">{tTypes(tax.tax_type)}</p>
            </div>
            <div>
              <p className="text-xs lg:text-sm text-muted-foreground">Frequency</p>
              <p className="text-xs lg:text-sm font-medium">{tFrequencies(tax.frequency)}</p>
            </div>
            {tax.tax_type === 'fixed' && (
              <div>
                <p className="text-xs lg:text-sm text-muted-foreground">Fixed Amount</p>
                <p className="text-xs lg:text-sm font-medium">
                  <CurrencyDisplay amount={tax.fixed_amount || 0} currency={tax.currency} />
                </p>
              </div>
            )}
            {tax.tax_type === 'percentage' && (
              <div>
                <p className="text-xs lg:text-sm text-muted-foreground">Percentage</p>
                <p className="text-xs lg:text-sm font-medium">{tax.percentage}%</p>
              </div>
            )}
            {tax.notes && (
              <div className="md:col-span-2">
                <p className="text-xs lg:text-sm text-muted-foreground">Notes</p>
                <p className="text-xs lg:text-sm font-medium">{tax.notes}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Payment History */}
      <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
        <CardHeader className="px-3 lg:px-6">
          <CardTitle className="flex items-center gap-2 text-sm lg:text-base">
            <History className="h-4 w-4 lg:h-5 lg:w-5" />
            {t('paymentHistory')}
          </CardTitle>
          <CardDescription className="text-xs lg:text-sm">Recent tax payments</CardDescription>
        </CardHeader>
        <CardContent className="px-3 lg:px-6">
          {paymentsData && paymentsData.items.length > 0 ? (
            <div className="space-y-3">
              {paymentsData.items.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between p-2 lg:p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-2 lg:gap-3">
                    <div className="p-2 bg-primary/10 rounded-full">
                      <CreditCard className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs lg:text-sm font-medium">
                        <CurrencyDisplay amount={payment.amount} currency={payment.currency} />
                      </p>
                      <p className="text-[10px] lg:text-xs text-muted-foreground">
                        {new Date(payment.payment_date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge
                      variant={payment.status === 'completed' ? 'default' : payment.status === 'pending' ? 'secondary' : 'destructive'}
                    >
                      {payment.status}
                    </Badge>
                    {payment.notes && (
                      <p className="text-[10px] lg:text-xs text-muted-foreground mt-1">{payment.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 lg:py-8 text-muted-foreground">
              <History className="h-8 w-8 lg:h-12 lg:w-12 mx-auto mb-4 opacity-50" />
              <p className="text-xs lg:text-sm">{t('noPayments')}</p>
              <p className="text-[10px] lg:text-xs mt-1">{t('noPaymentsDescription')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Tax Dialog */}
      <TaxForm
        taxId={taxId}
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
      />

      {/* Pay Tax Dialog */}
      <Dialog open={isPayDialogOpen} onOpenChange={setIsPayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('paymentDialogTitle')}</DialogTitle>
            <DialogDescription>{t('paymentDialogDescription')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">{t('paymentAmount')}</p>
              <p className="text-2xl font-bold">
                <CurrencyDisplay amount={calculatedAmount} currency={displayCurrency} />
              </p>
              {tax.payment_account && (
                <p className="text-sm text-muted-foreground mt-2">
                  From: {tax.payment_account.name}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>{t('paymentNotes')}</Label>
              <Textarea
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder={t('paymentNotesPlaceholder')}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPayDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handlePayTax} disabled={isPaying}>
              {isPaying ? 'Processing...' : t('confirmPayment')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tax</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{tax.name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTax}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
