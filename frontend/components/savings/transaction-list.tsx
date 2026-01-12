/**
 * Transaction List Component
 * Displays a list of transactions for a savings account
 */
'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Percent,
  Minus,
  Plus,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  useListTransactionsQuery,
  type AccountTransaction,
  type TransactionType,
} from '@/lib/api/savingsApi';
import { formatCurrency } from '@/lib/utils/currency';
import { format } from 'date-fns';

interface TransactionListProps {
  accountId: string;
  currency?: string;
}

const TRANSACTION_TYPE_ICONS: Record<TransactionType, React.ReactNode> = {
  deposit: <ArrowDownLeft className="h-4 w-4 text-green-500" />,
  withdrawal: <ArrowUpRight className="h-4 w-4 text-red-500" />,
  transfer_in: <ArrowLeftRight className="h-4 w-4 text-blue-500" />,
  transfer_out: <ArrowLeftRight className="h-4 w-4 text-orange-500" />,
  interest: <Percent className="h-4 w-4 text-purple-500" />,
  fee: <Minus className="h-4 w-4 text-red-500" />,
  adjustment: <Plus className="h-4 w-4 text-gray-500" />,
};

const TRANSACTION_TYPE_COLORS: Record<TransactionType, string> = {
  deposit: 'text-green-600 dark:text-green-400',
  withdrawal: 'text-red-600 dark:text-red-400',
  transfer_in: 'text-blue-600 dark:text-blue-400',
  transfer_out: 'text-orange-600 dark:text-orange-400',
  interest: 'text-purple-600 dark:text-purple-400',
  fee: 'text-red-600 dark:text-red-400',
  adjustment: 'text-gray-600 dark:text-gray-400',
};

export function TransactionList({ accountId, currency = 'USD' }: TransactionListProps) {
  const [page, setPage] = React.useState(1);
  const [typeFilter, setTypeFilter] = React.useState<TransactionType | 'all'>('all');
  const pageSize = 10;

  const t = useTranslations('savings.transactions');

  const { data, isLoading, isFetching } = useListTransactionsQuery({
    accountId,
    page,
    page_size: pageSize,
    transaction_type: typeFilter !== 'all' ? typeFilter : undefined,
  });

  const transactions = data?.items || [];
  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  const formatTransactionType = (type: TransactionType): string => {
    return t(`types.${type}`);
  };

  const getAmountPrefix = (type: TransactionType): string => {
    switch (type) {
      case 'deposit':
      case 'transfer_in':
      case 'interest':
        return '+';
      case 'withdrawal':
      case 'transfer_out':
      case 'fee':
        return '-';
      default:
        return '';
    }
  };

  const renderTransaction = (transaction: AccountTransaction) => {
    const prefix = getAmountPrefix(transaction.transaction_type);
    const colorClass = TRANSACTION_TYPE_COLORS[transaction.transaction_type];

    return (
      <div
        key={transaction.id}
        className="flex items-center justify-between py-3 border-b last:border-b-0"
      >
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 p-2 rounded-full bg-muted">
            {TRANSACTION_TYPE_ICONS[transaction.transaction_type]}
          </div>
          <div>
            <div className="font-medium">
              {formatTransactionType(transaction.transaction_type)}
            </div>
            <div className="text-sm text-muted-foreground">
              {transaction.description || t('noDescription')}
            </div>
            <div className="text-xs text-muted-foreground">
              {format(new Date(transaction.transaction_date), 'MMM d, yyyy h:mm a')}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className={`font-semibold ${colorClass}`}>
            {prefix}{formatCurrency(transaction.amount, transaction.currency)}
          </div>
          <div className="text-xs text-muted-foreground">
            {t('balance')}: {formatCurrency(transaction.balance_after, transaction.currency)}
          </div>
          <Badge variant={transaction.status === 'completed' ? 'default' : 'secondary'} className="mt-1">
            {t(`status.${transaction.status}`)}
          </Badge>
        </div>
      </div>
    );
  };

  const renderSkeleton = () => (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-32 mt-1" />
            </div>
          </div>
          <div className="text-right">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-16 mt-1" />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t('title')}</CardTitle>
        <Select
          value={typeFilter}
          onValueChange={(value) => {
            setTypeFilter(value as TransactionType | 'all');
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t('filterByType')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allTypes')}</SelectItem>
            <SelectItem value="deposit">{t('types.deposit')}</SelectItem>
            <SelectItem value="withdrawal">{t('types.withdrawal')}</SelectItem>
            <SelectItem value="transfer_in">{t('types.transfer_in')}</SelectItem>
            <SelectItem value="transfer_out">{t('types.transfer_out')}</SelectItem>
            <SelectItem value="interest">{t('types.interest')}</SelectItem>
            <SelectItem value="fee">{t('types.fee')}</SelectItem>
            <SelectItem value="adjustment">{t('types.adjustment')}</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          renderSkeleton()
        ) : transactions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {t('noTransactions')}
          </div>
        ) : (
          <>
            <div className={isFetching ? 'opacity-50' : ''}>
              {transactions.map(renderTransaction)}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  {t('showing', {
                    from: (page - 1) * pageSize + 1,
                    to: Math.min(page * pageSize, data?.total || 0),
                    total: data?.total || 0,
                  })}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1 || isFetching}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {t('previous')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={page >= totalPages || isFetching}
                  >
                    {t('next')}
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
