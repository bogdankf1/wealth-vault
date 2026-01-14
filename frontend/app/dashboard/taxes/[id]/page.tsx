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
import { LoadingCards } from '@/components/ui/loading-state';
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
} from 'lucide-react';
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
      <div className="container mx-auto py-6 space-y-6">
        <LoadingCards count={4} />
      </div>
    );
  }

  if (error || !tax) {
    return (
      <div className="container mx-auto py-6">
        <ApiErrorState error={error} />
      </div>
    );
  }

  const calculatedAmount = tax.calculated_amount || tax.display_fixed_amount || tax.fixed_amount || 0;
  const displayCurrency = tax.display_currency || tax.currency;
  const canPay = tax.payment_account_id && tax.payment_account;

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{tax.name}</h1>
            {tax.description && (
              <p className="text-muted-foreground">{tax.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canPay && (
            tax.is_paid_current_period ? (
              <Button size="sm" variant="outline" onClick={() => setIsPayDialogOpen(true)}>
                <RotateCcw className="h-4 w-4 mr-2" />
                {t('payAgain')}
              </Button>
            ) : (
              <Button size="sm" onClick={() => setIsPayDialogOpen(true)}>
                <CreditCard className="h-4 w-4 mr-2" />
                {t('payNow')}
              </Button>
            )
          )}
          <Button variant="outline" size="sm" onClick={() => setIsEditDialogOpen(true)}>
            <Edit className="h-4 w-4 mr-2" />
            {t('editTax')}
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setIsDeleteDialogOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" />
            {t('deleteTax')}
          </Button>
        </div>
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('calculatedAmount')}</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <CurrencyDisplay
                amount={calculatedAmount}
                currency={displayCurrency}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {tFrequencies(tax.frequency)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('paymentAccount')}</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {tax.payment_account ? (
              <>
                <div className="text-lg font-bold">{tax.payment_account.name}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Balance: <CurrencyDisplay amount={tax.payment_account.current_balance} currency={tax.payment_account.currency} />
                </p>
              </>
            ) : (
              <div className="text-muted-foreground">No account selected</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('incomeSource')}</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {tax.income_source ? (
              <>
                <div className="text-lg font-bold">{tax.income_source.name}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  <CurrencyDisplay amount={tax.income_source.amount} currency={tax.income_source.currency} /> / {tax.income_source.frequency}
                </p>
              </>
            ) : (
              <div className="text-muted-foreground">{t('allIncomeSources')}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('nextPaymentDate')}</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {tax.next_payment_date ? (
              <div className="text-lg font-bold">
                {new Date(tax.next_payment_date).toLocaleDateString()}
              </div>
            ) : (
              <div className="text-muted-foreground">Not scheduled</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {t('autoPay')}: {tax.auto_pay ? t('autoPayEnabled') : t('autoPayDisabled')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tax Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            {t('taxInfo')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Tax Type</p>
              <p className="font-medium">{tTypes(tax.tax_type)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Frequency</p>
              <p className="font-medium">{tFrequencies(tax.frequency)}</p>
            </div>
            {tax.tax_type === 'fixed' && (
              <div>
                <p className="text-sm text-muted-foreground">Fixed Amount</p>
                <p className="font-medium">
                  <CurrencyDisplay amount={tax.fixed_amount || 0} currency={tax.currency} />
                </p>
              </div>
            )}
            {tax.tax_type === 'percentage' && (
              <div>
                <p className="text-sm text-muted-foreground">Percentage</p>
                <p className="font-medium">{tax.percentage}%</p>
              </div>
            )}
            {tax.notes && (
              <div className="md:col-span-2">
                <p className="text-sm text-muted-foreground">Notes</p>
                <p className="font-medium">{tax.notes}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Payment History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            {t('paymentHistory')}
          </CardTitle>
          <CardDescription>Recent tax payments</CardDescription>
        </CardHeader>
        <CardContent>
          {paymentsData && paymentsData.items.length > 0 ? (
            <div className="space-y-3">
              {paymentsData.items.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-full">
                      <CreditCard className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">
                        <CurrencyDisplay amount={payment.amount} currency={payment.currency} />
                      </p>
                      <p className="text-sm text-muted-foreground">
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
                      <p className="text-xs text-muted-foreground mt-1">{payment.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('noPayments')}</p>
              <p className="text-sm mt-1">{t('noPaymentsDescription')}</p>
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
