/**
 * Expense Detail Page
 * Shows expense details and actions
 */
'use client';

import React, { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  Edit,
  Calendar,
  Wallet,
  TrendingDown,
  Repeat,
  DollarSign,
  CreditCard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiErrorState } from '@/components/ui/error-state';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { ExpenseForm } from '@/components/expenses/expense-form';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import {
  useGetExpenseQuery,
  useDeleteExpenseMutation,
} from '@/lib/api/expensesApi';
import { useGetAccountQuery } from '@/lib/api/savingsApi';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ExpenseDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();

  // Translation hooks
  const t = useTranslations('expenses.detail');
  const tStatus = useTranslations('expenses.status');
  const tFrequency = useTranslations('expenses.frequency');
  const tCategories = useTranslations('expenses.categories');
  const tActions = useTranslations('expenses.actions');
  const tPaymentMethods = useTranslations('expenses.form.paymentMethods');

  // State
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Queries
  const { data: expense, isLoading, error, refetch } = useGetExpenseQuery(id);
  const { data: linkedAccount } = useGetAccountQuery(expense?.payment_account_id || '', {
    skip: !expense?.payment_account_id,
  });

  // Mutations
  const [deleteExpense, { isLoading: isDeleting }] = useDeleteExpenseMutation();

  const FREQUENCY_LABELS: Record<string, string> = {
    daily: tFrequency('daily'),
    weekly: tFrequency('weekly'),
    biweekly: tFrequency('biweekly'),
    monthly: tFrequency('monthly'),
    quarterly: tFrequency('quarterly'),
    annually: tFrequency('annually'),
    one_time: tFrequency('one_time'),
  };

  const CATEGORY_MAP: Record<string, string> = {
    'Groceries': 'groceries',
    'Dining Out / Delivery': 'diningOut',
    'Clothing': 'clothing',
    'Gifts': 'gifts',
    'Transportation': 'transportation',
    'Personal Care': 'personalCare',
    'Healthcare': 'healthcare',
    'Luxury & Premium Items': 'luxuryPremium',
    'Postal & Shipping': 'postalShipping',
    'Miscellaneous': 'miscellaneous',
    'Housing': 'housing',
    'Education & Learning': 'educationLearning',
    'Travel & Vacations': 'travelVacations',
    'Entertainment': 'entertainment',
  };

  const translateCategory = (category: string) => {
    const key = CATEGORY_MAP[category] || category.toLowerCase().replace(/[^a-z]/g, '');
    try {
      return tCategories(key);
    } catch {
      return category;
    }
  };

  const translatePaymentMethod = (method: string) => {
    try {
      return tPaymentMethods(method);
    } catch {
      return method;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'paid':
        return 'default';
      case 'pending':
        return 'secondary';
      case 'overdue':
        return 'destructive';
      case 'cancelled':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  const handleDelete = async () => {
    try {
      await deleteExpense(id).unwrap();
      toast.success(t('deleteSuccess'));
      router.push('/dashboard/expenses/overview');
    } catch (error) {
      toast.error(t('deleteError'));
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
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return <ApiErrorState error={error} onRetry={refetch} />;
  }

  if (!expense) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">{t('notFound')}</p>
        <Button variant="link" onClick={() => router.push('/dashboard/expenses/overview')}>
          {t('backToExpenses')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/dashboard/expenses/overview')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{expense.name}</h1>
              <Badge variant={expense.is_active ? 'default' : 'secondary'}>
                {expense.is_active ? tStatus('active') : tStatus('inactive')}
              </Badge>
              {expense.status && (
                <Badge variant={getStatusBadgeVariant(expense.status)}>
                  {t(`paymentStatus.${expense.status}`)}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              {expense.category && translateCategory(expense.category)}
              {expense.category && ' • '}
              {FREQUENCY_LABELS[expense.frequency]}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsEditFormOpen(true)}>
            <Edit className="mr-2 h-4 w-4" />
            {tActions('edit')}
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
            {tActions('delete')}
          </Button>
        </div>
      </div>

      {/* Description */}
      {expense.description && (
        <p className="text-muted-foreground">{expense.description}</p>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Amount */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('amount')}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              <CurrencyDisplay
                amount={expense.display_amount ?? expense.amount}
                currency={expense.display_currency ?? expense.currency}
                showSymbol
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t('perPayment')} • {FREQUENCY_LABELS[expense.frequency]}
            </p>
          </CardContent>
        </Card>

        {/* Monthly Equivalent */}
        {expense.display_monthly_equivalent && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('monthlyEquivalent')}</CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                <CurrencyDisplay
                  amount={expense.display_monthly_equivalent}
                  currency={expense.display_currency ?? expense.currency}
                  showSymbol
                />
              </div>
              <p className="text-xs text-muted-foreground">{t('estimatedMonthly')}</p>
            </CardContent>
          </Card>
        )}

        {/* Frequency */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('frequency')}</CardTitle>
            <Repeat className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {FREQUENCY_LABELS[expense.frequency]}
            </div>
            <p className="text-xs text-muted-foreground">{t('paymentSchedule')}</p>
          </CardContent>
        </Card>

        {/* Start Date */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('startDate')}</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {expense.start_date
                ? format(new Date(expense.start_date), 'MMM d, yyyy')
                : expense.date
                ? format(new Date(expense.date), 'MMM d, yyyy')
                : '-'}
            </div>
            <p className="text-xs text-muted-foreground">{t('whenStarted')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Expense Details */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Dates Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t('expenseDetails')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('startDate')}</span>
              <span>
                {expense.start_date
                  ? format(new Date(expense.start_date), 'MMM d, yyyy')
                  : expense.date
                  ? format(new Date(expense.date), 'MMM d, yyyy')
                  : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('endDate')}</span>
              <span>
                {expense.end_date
                  ? format(new Date(expense.end_date), 'MMM d, yyyy')
                  : t('noEndDate')}
              </span>
            </div>
            {expense.paid_date && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('lastPaid')}</span>
                <span>{format(new Date(expense.paid_date), 'MMM d, yyyy')}</span>
              </div>
            )}
            {expense.payment_method && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('paymentMethod')}</span>
                <span>{translatePaymentMethod(expense.payment_method)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('created')}</span>
              <span>{format(new Date(expense.created_at), 'MMM d, yyyy')}</span>
            </div>
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
                {expense.payment_method && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CreditCard className="h-4 w-4" />
                    {translatePaymentMethod(expense.payment_method)}
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">{t('noLinkedAccount')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialogs */}
      <ExpenseForm
        expenseId={id}
        isOpen={isEditFormOpen}
        onClose={() => setIsEditFormOpen(false)}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title={t('deleteConfirmTitle')}
        description={t('deleteConfirmDescription')}
        itemName={expense.name}
        isDeleting={isDeleting}
        cancelLabel={tActions('cancel')}
        deleteLabel={tActions('delete')}
      />
    </div>
  );
}
