/**
 * Budget Detail Page
 * Shows budget details, spending progress, and actions
 */
'use client';

import React, { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  Edit,
  Calendar,
  TrendingUp,
  Repeat,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { ApiErrorState } from '@/components/ui/error-state';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { BudgetForm } from '@/components/budgets/budget-form';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import {
  useGetBudgetQuery,
  useDeleteBudgetMutation,
} from '@/lib/api/budgetsApi';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function BudgetDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();

  // Translation hooks
  const t = useTranslations('budgets.detail');
  const tStatus = useTranslations('budgets.status');
  const tPeriod = useTranslations('budgets.period');
  const tCategories = useTranslations('budgets.categories');
  const tActions = useTranslations('budgets.actions');

  // State
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Queries
  const { data: budgetData, isLoading, error, refetch } = useGetBudgetQuery(id);

  // Mutations
  const [deleteBudget, { isLoading: isDeleting }] = useDeleteBudgetMutation();

  // Extract budget from response (API returns BudgetWithProgress)
  const budget = budgetData?.budget;
  const progress = budgetData;

  const PERIOD_LABELS: Record<string, string> = {
    weekly: tPeriod('weekly'),
    monthly: tPeriod('monthly'),
    quarterly: tPeriod('quarterly'),
    yearly: tPeriod('yearly'),
  };

  const CATEGORY_MAP: Record<string, string> = {
    'Housing': 'housing',
    'Food': 'food',
    'Transportation': 'transportation',
    'Utilities': 'utilities',
    'Healthcare': 'healthcare',
    'Entertainment': 'entertainment',
    'Shopping': 'shopping',
    'Education': 'education',
    'Savings': 'savings',
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

  const getStatusInfo = () => {
    if (!progress || !budget) return { variant: 'secondary' as const, label: '', color: '' };
    const percentUsed = progress.percentage_used || 0;
    if (progress.is_overspent || percentUsed > 100) {
      return { variant: 'destructive' as const, label: tStatus('exceeded'), color: 'text-red-600' };
    }
    if (progress.should_alert || percentUsed >= (budget.alert_threshold || 80)) {
      return { variant: 'secondary' as const, label: tStatus('warning'), color: 'text-yellow-600' };
    }
    return { variant: 'default' as const, label: tStatus('onTrack'), color: 'text-green-600' };
  };

  const handleDelete = async () => {
    try {
      await deleteBudget(id).unwrap();
      toast.success(t('deleteSuccess'));
      router.push('/dashboard/budgets/overview');
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

  if (!budget) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">{t('notFound')}</p>
        <Button variant="link" onClick={() => router.push('/dashboard/budgets/overview')}>
          {t('backToBudgets')}
        </Button>
      </div>
    );
  }

  const statusInfo = getStatusInfo();
  const percentUsed = Math.min(progress?.percentage_used || 0, 100);
  const effectiveAmount = budget.effective_amount || budget.amount;
  const spent = progress?.spent || 0;
  const remaining = progress?.remaining || (effectiveAmount - spent);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/dashboard/budgets/overview')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{budget.name}</h1>
              <Badge variant={budget.is_active ? 'default' : 'secondary'}>
                {budget.is_active ? tStatus('active') : tStatus('inactive')}
              </Badge>
              <Badge variant={statusInfo.variant}>
                {statusInfo.label}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {budget.category && translateCategory(budget.category)}
              {budget.category && ' • '}
              {PERIOD_LABELS[budget.period]}
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
      {budget.description && (
        <p className="text-muted-foreground">{budget.description}</p>
      )}

      {/* Progress Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{t('spendingProgress')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between text-sm">
            <span>
              <CurrencyDisplay
                amount={spent}
                currency={budget.display_currency || budget.currency}
                showSymbol
              />
              {' '}{t('of')}{' '}
              <CurrencyDisplay
                amount={effectiveAmount}
                currency={budget.display_currency || budget.currency}
                showSymbol
              />
            </span>
            <span className={statusInfo.color}>{Math.round(progress?.percentage_used || 0)}%</span>
          </div>
          <Progress value={percentUsed} className="h-3" />
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{t('spent')}</span>
            <span className={remaining >= 0 ? 'text-green-600' : 'text-red-600'}>
              {remaining >= 0 ? t('remaining') : t('over')}:{' '}
              <CurrencyDisplay
                amount={Math.abs(remaining)}
                currency={budget.display_currency || budget.currency}
                showSymbol
              />
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Budget Amount */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('budgetAmount')}</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <CurrencyDisplay
                amount={budget.display_amount ?? budget.amount}
                currency={budget.display_currency ?? budget.currency}
                showSymbol
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t('perPeriod')} • {PERIOD_LABELS[budget.period]}
            </p>
          </CardContent>
        </Card>

        {/* Effective Amount (with rollover) */}
        {budget.rollover_amount > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('effectiveAmount')}</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                <CurrencyDisplay
                  amount={effectiveAmount}
                  currency={budget.display_currency ?? budget.currency}
                  showSymbol
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t('includesRollover')}{' '}
                <CurrencyDisplay
                  amount={budget.rollover_amount}
                  currency={budget.display_currency ?? budget.currency}
                  showSymbol
                />
              </p>
            </CardContent>
          </Card>
        )}

        {/* Spent */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('spent')}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${spent > effectiveAmount ? 'text-red-600' : ''}`}>
              <CurrencyDisplay
                amount={spent}
                currency={budget.display_currency ?? budget.currency}
                showSymbol
              />
            </div>
            <p className="text-xs text-muted-foreground">{t('currentPeriod')}</p>
          </CardContent>
        </Card>

        {/* Alert Threshold */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('alertThreshold')}</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{budget.alert_threshold || 80}%</div>
            <p className="text-xs text-muted-foreground">{t('alertWhenReached')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Budget Details */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Dates Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t('budgetDetails')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('period')}</span>
              <span>{PERIOD_LABELS[budget.period]}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('startDate')}</span>
              <span>{format(new Date(budget.start_date), 'MMM d, yyyy')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('endDate')}</span>
              <span>
                {budget.end_date
                  ? format(new Date(budget.end_date), 'MMM d, yyyy')
                  : t('noEndDate')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('created')}</span>
              <span>{format(new Date(budget.created_at), 'MMM d, yyyy')}</span>
            </div>
          </CardContent>
        </Card>

        {/* Settings Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t('budgetSettings')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">{t('rolloverUnused')}</span>
              <Badge variant={budget.rollover_unused ? 'default' : 'secondary'}>
                {budget.rollover_unused ? t('enabled') : t('disabled')}
              </Badge>
            </div>
            {budget.rollover_unused && budget.rollover_amount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('rolloverAmount')}</span>
                <span className="text-green-600">
                  +<CurrencyDisplay
                    amount={budget.rollover_amount}
                    currency={budget.display_currency ?? budget.currency}
                    showSymbol
                  />
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('alertThreshold')}</span>
              <span>{budget.alert_threshold || 80}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">{t('status')}</span>
              <div className="flex items-center gap-1">
                {progress?.is_overspent ? (
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                ) : (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                )}
                <span className={statusInfo.color}>{statusInfo.label}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dialogs */}
      <BudgetForm
        open={isEditFormOpen}
        onClose={() => setIsEditFormOpen(false)}
        budget={budget}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title={t('deleteConfirmTitle')}
        description={t('deleteConfirmDescription')}
        itemName={budget.name}
        isDeleting={isDeleting}
        cancelLabel={tActions('cancel')}
        deleteLabel={tActions('delete')}
      />
    </div>
  );
}
