/**
 * Transaction List Component
 * Displays a list of transactions for a savings account
 * With search, source type filter, and transaction type filter
 */
'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Search,
} from 'lucide-react';
import {
  useListTransactionsQuery,
  type AccountTransaction,
  type TransactionType,
  type SourceType,
} from '@/lib/api/savingsApi';
import { formatCurrency } from '@/lib/utils/currency';
import { format } from 'date-fns';

// Extended source type with 'all' option for filter UI
type SourceFilterType = SourceType | 'all';

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
  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [sourceFilter, setSourceFilter] = React.useState<SourceFilterType>('all');
  const pageSize = 10;

  const t = useTranslations('savings.transactions');

  // Debounce search input
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      if (searchQuery !== debouncedSearch) {
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data, isLoading, isFetching } = useListTransactionsQuery({
    accountId,
    page,
    page_size: pageSize,
    transaction_type: typeFilter !== 'all' ? typeFilter : undefined,
    source_type: sourceFilter !== 'all' ? sourceFilter : undefined,
    search: debouncedSearch || undefined,
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
      <CardHeader className="space-y-4">
        <CardTitle>{t('title')}</CardTitle>
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Source Type Filter */}
          <Select
            value={sourceFilter}
            onValueChange={(value) => {
              setSourceFilter(value as SourceFilterType);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder={t('sourceFilter')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allSources')}</SelectItem>
              <SelectItem value="subscription">{t('sources.subscription')}</SelectItem>
              <SelectItem value="installment">{t('sources.installment')}</SelectItem>
              <SelectItem value="portfolio">{t('sources.portfolio')}</SelectItem>
              <SelectItem value="debt">{t('sources.debt')}</SelectItem>
              <SelectItem value="expense">{t('sources.expense')}</SelectItem>
              <SelectItem value="transfer">{t('sources.transfer')}</SelectItem>
              <SelectItem value="interest">{t('sources.interest')}</SelectItem>
            </SelectContent>
          </Select>

          {/* Transaction Type Filter */}
          <Select
            value={typeFilter}
            onValueChange={(value) => {
              setTypeFilter(value as TransactionType | 'all');
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[160px]">
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
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          renderSkeleton()
        ) : transactions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {debouncedSearch || sourceFilter !== 'all' || typeFilter !== 'all'
              ? t('noMatchingTransactions')
              : t('noTransactions')}
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
