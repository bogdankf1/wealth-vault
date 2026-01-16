/**
 * Income Source Detail Page
 * Shows income source details, transaction history, and actions
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
  Clock,
  TrendingUp,
  Repeat,
  DollarSign,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiErrorState } from '@/components/ui/error-state';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { IncomeSourceForm } from '@/components/income/income-source-form';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import {
  useGetIncomeSourceQuery,
  useDeleteIncomeSourceMutation,
} from '@/lib/api/incomeApi';
import { useGetAccountQuery } from '@/lib/api/savingsApi';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function IncomeDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();

  // Translation hooks
  const t = useTranslations('income.detail');
  const tStatus = useTranslations('income.status');
  const tFrequency = useTranslations('income.frequency');
  const tCategories = useTranslations('income.categories');
  const tActions = useTranslations('income.actions');

  // State
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Queries
  const { data: income, isLoading, error, refetch } = useGetIncomeSourceQuery(id);
  const { data: linkedAccount } = useGetAccountQuery(income?.target_account_id || '', {
    skip: !income?.target_account_id,
  });

  // Mutations
  const [deleteIncome, { isLoading: isDeleting }] = useDeleteIncomeSourceMutation();

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
    'Salary': 'salary',
    'Business': 'business',
    'Freelance': 'freelance',
    'Side Projects': 'sideProjects',
    'Investments': 'investments',
    'Gifts': 'gifts',
    'Refunds & Reimbursements': 'refundsReimbursements',
    'Rental': 'rental',
    'Other': 'other',
  };

  const translateCategory = (category: string) => {
    const key = CATEGORY_MAP[category] || category.toLowerCase().replace(/[^a-z]/g, '');
    try {
      return tCategories(key);
    } catch {
      return category;
    }
  };

  const handleDelete = async () => {
    try {
      await deleteIncome(id).unwrap();
      toast.success(t('deleteSuccess'));
      router.push('/dashboard/income/overview');
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

  if (!income) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">{t('notFound')}</p>
        <Button variant="link" onClick={() => router.push('/dashboard/income/overview')}>
          {t('backToIncome')}
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
            onClick={() => router.push('/dashboard/income/overview')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{income.name}</h1>
              <Badge variant={income.is_active ? 'default' : 'secondary'}>
                {income.is_active ? tStatus('active') : tStatus('inactive')}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {income.category && translateCategory(income.category)}
              {income.category && ' • '}
              {FREQUENCY_LABELS[income.frequency]}
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
      {income.description && (
        <p className="text-muted-foreground">{income.description}</p>
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
            <div className="text-2xl font-bold">
              <CurrencyDisplay
                amount={income.display_amount ?? income.amount}
                currency={income.display_currency ?? income.currency}
                showSymbol
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t('perPayment')} • {FREQUENCY_LABELS[income.frequency]}
            </p>
          </CardContent>
        </Card>

        {/* Monthly Equivalent */}
        {income.display_monthly_equivalent && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('monthlyEquivalent')}</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                <CurrencyDisplay
                  amount={income.display_monthly_equivalent}
                  currency={income.display_currency ?? income.currency}
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
              {FREQUENCY_LABELS[income.frequency]}
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
              {income.start_date
                ? format(new Date(income.start_date), 'MMM d, yyyy')
                : income.date
                ? format(new Date(income.date), 'MMM d, yyyy')
                : '-'}
            </div>
            <p className="text-xs text-muted-foreground">{t('whenStarted')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Income Details */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Dates Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t('incomeDetails')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('startDate')}</span>
              <span>
                {income.start_date
                  ? format(new Date(income.start_date), 'MMM d, yyyy')
                  : income.date
                  ? format(new Date(income.date), 'MMM d, yyyy')
                  : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('endDate')}</span>
              <span>
                {income.end_date
                  ? format(new Date(income.end_date), 'MMM d, yyyy')
                  : t('noEndDate')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('created')}</span>
              <span>{format(new Date(income.created_at), 'MMM d, yyyy')}</span>
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
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('autoDeposit')}</span>
                  <Badge variant={income.auto_deposit ? 'default' : 'secondary'}>
                    {income.auto_deposit ? t('autoDepositEnabled') : t('autoDepositDisabled')}
                  </Badge>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">{t('noLinkedAccount')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialogs */}
      <IncomeSourceForm
        sourceId={id}
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
        itemName={income.name}
        isDeleting={isDeleting}
        cancelLabel={tActions('cancel')}
        deleteLabel={tActions('delete')}
      />
    </div>
  );
}
