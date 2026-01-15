/**
 * Savings Account Detail Page
 * Shows account details, transactions, and actions (deposit/withdraw/transfer)
 */
'use client';

import React, { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  Edit,
  Plus,
  Minus,
  ArrowLeftRight,
  Percent,
  TrendingUp,
  Calendar,
  Building,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiErrorState } from '@/components/ui/error-state';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { SavingsAccountForm } from '@/components/savings/savings-account-form';
import { TransactionForm, type TransactionFormType } from '@/components/savings/transaction-form';
import { TransactionList } from '@/components/savings/transaction-list';
import { TransferDialog } from '@/components/savings/transfer-dialog';
import {
  useGetAccountQuery,
  useCalculateInterestQuery,
  usePostInterestMutation,
} from '@/lib/api/savingsApi';
import { formatCurrency } from '@/lib/utils/currency';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function AccountDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();

  // Translation hooks
  const t = useTranslations('savings.detail');
  const tAccountTypes = useTranslations('savings.accountTypes');
  const tInterest = useTranslations('savings.interest');
  const tActions = useTranslations('savings.actions');
  const tStatus = useTranslations('savings.status');

  // State
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const [transactionFormType, setTransactionFormType] = useState<TransactionFormType | null>(null);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);

  // Queries
  const { data: account, isLoading, error, refetch } = useGetAccountQuery(id);
  const { data: interestCalc } = useCalculateInterestQuery(id, {
    skip: !account?.interest_rate,
  });

  // Mutations
  const [postInterest, { isLoading: isPostingInterest }] = usePostInterestMutation();

  const ACCOUNT_TYPE_LABELS: Record<string, string> = {
    personal: tAccountTypes('personal'),
    business: tAccountTypes('business'),
    cash: tAccountTypes('cash'),
    crypto: tAccountTypes('crypto'),
    fixed_deposit: tAccountTypes('fixedDeposit'),
    other: tAccountTypes('other'),
  };

  const handlePostInterest = async () => {
    try {
      const result = await postInterest(id).unwrap();
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error(tInterest('postError'));
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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

  if (!account) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">{t('notFound')}</p>
        <Button variant="link" onClick={() => router.push('/dashboard/accounts/overview')}>
          {t('backToAccounts')}
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
            onClick={() => router.push('/dashboard/accounts/overview')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{account.name}</h1>
              <Badge variant={account.is_active ? 'default' : 'secondary'}>
                {account.is_active ? tStatus('active') : tStatus('inactive')}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {ACCOUNT_TYPE_LABELS[account.account_type] || account.account_type}
              {account.institution && ` • ${account.institution}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsEditFormOpen(true)}>
            <Edit className="mr-2 h-4 w-4" />
            {tActions('edit')}
          </Button>
          <Button variant="default" size="sm" onClick={() => setTransactionFormType('deposit')}>
            <Plus className="mr-2 h-4 w-4" />
            {t('deposit')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setTransactionFormType('withdrawal')}>
            <Minus className="mr-2 h-4 w-4" />
            {t('withdraw')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsTransferDialogOpen(true)}>
            <ArrowLeftRight className="mr-2 h-4 w-4" />
            {t('transfer')}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Current Balance */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('currentBalance')}</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <CurrencyDisplay
                amount={account.display_current_balance ?? account.current_balance}
                currency={account.display_currency ?? account.currency}
                showSymbol
              />
            </div>
            {account.display_currency && account.display_currency !== account.currency && (
              <p className="text-xs text-muted-foreground">
                {formatCurrency(account.current_balance, account.currency)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Interest Rate */}
        {account.interest_rate !== undefined && account.interest_rate > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{tInterest('rate')}</CardTitle>
              <Percent className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {account.interest_rate_percent?.toFixed(2)}%
              </div>
              <p className="text-xs text-muted-foreground">
                {tInterest(`method${account.interest_accrual_method === 'compound' ? 'Compound' : 'Simple'}`)} • {tInterest(`frequency${account.interest_frequency.charAt(0).toUpperCase() + account.interest_frequency.slice(1)}`)}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Accrued Interest */}
        {account.interest_rate !== undefined && account.interest_rate > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{tInterest('accrued')}</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                +{formatCurrency(account.accrued_interest || 0, account.currency)}
              </div>
              {interestCalc?.days_elapsed !== undefined && (
                <p className="text-xs text-muted-foreground">
                  {tInterest('daysElapsed', { days: interestCalc.days_elapsed })}
                </p>
              )}
              {account.accrued_interest > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 w-full"
                  onClick={handlePostInterest}
                  disabled={isPostingInterest}
                >
                  {isPostingInterest ? tInterest('posting') : tInterest('postToBalance')}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Account Info */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('accountInfo')}</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-1">
            {account.account_number_last4 && (
              <p className="text-sm">
                <span className="text-muted-foreground">{t('accountNumber')}: </span>
                ••••{account.account_number_last4}
              </p>
            )}
            <p className="text-sm">
              <span className="text-muted-foreground">{t('created')}: </span>
              {format(new Date(account.created_at), 'MMM d, yyyy')}
            </p>
            {account.last_interest_accrual && (
              <p className="text-sm">
                <span className="text-muted-foreground">{tInterest('lastAccrual')}: </span>
                {format(new Date(account.last_interest_accrual), 'MMM d, yyyy')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {account.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t('notes')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{account.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Transaction History */}
      <TransactionList accountId={id} currency={account.currency} />

      {/* Dialogs */}
      <SavingsAccountForm
        accountId={id}
        isOpen={isEditFormOpen}
        onClose={() => setIsEditFormOpen(false)}
      />

      {transactionFormType && (
        <TransactionForm
          accountId={id}
          type={transactionFormType}
          isOpen={!!transactionFormType}
          onClose={() => setTransactionFormType(null)}
        />
      )}

      <TransferDialog
        isOpen={isTransferDialogOpen}
        onClose={() => setIsTransferDialogOpen(false)}
        preselectedFromAccountId={id}
      />
    </div>
  );
}
