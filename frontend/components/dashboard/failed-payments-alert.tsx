/**
 * Failed Payments Alert Component
 * Displays a banner/card when there are payments that failed due to insufficient funds
 */
'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useGetFailedPaymentsQuery, FailedPaymentItem } from '@/lib/api/dashboardApi';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import {
  AlertTriangle,
  ArrowRight,
  CreditCard,
  Calendar,
  FileText,
  RefreshCw,
} from 'lucide-react';

interface FailedPaymentsAlertProps {
  /** Maximum number of failed payments to show */
  maxItems?: number;
  /** Whether to show in compact mode */
  compact?: boolean;
}

export function FailedPaymentsAlert({ maxItems = 5, compact = false }: FailedPaymentsAlertProps) {
  const t = useTranslations('dashboard.failedPayments');
  const { data, isLoading, refetch } = useGetFailedPaymentsQuery();

  if (isLoading) {
    return compact ? null : <FailedPaymentsAlertSkeleton />;
  }

  // Don't show anything if no failed payments
  if (!data || !data.has_failed_payments || data.items.length === 0) {
    return null;
  }

  const displayItems = data.items.slice(0, maxItems);
  const hasMore = data.total > maxItems;

  const getPaymentTypeIcon = (type: string) => {
    switch (type) {
      case 'expense':
        return <FileText className="h-4 w-4" />;
      case 'subscription':
        return <Calendar className="h-4 w-4" />;
      case 'installment':
        return <CreditCard className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getPaymentTypeLink = (item: FailedPaymentItem) => {
    switch (item.payment_type) {
      case 'expense':
        return `/dashboard/expenses/${item.id}`;
      case 'subscription':
        return `/dashboard/subscriptions/${item.id}`;
      case 'installment':
        return `/dashboard/installments/${item.id}`;
      default:
        return '/dashboard';
    }
  };

  const getPaymentTypeLabel = (type: string) => {
    switch (type) {
      case 'expense':
        return t('types.expense');
      case 'subscription':
        return t('types.subscription');
      case 'installment':
        return t('types.installment');
      default:
        return type;
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 p-2 md:p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-lg">
        <AlertTriangle className="h-4 w-4 md:h-5 md:w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
        <span className="text-sm text-red-900 dark:text-red-100">
          {t('compactMessage', { count: data.total })}
        </span>
        <Link href="/dashboard" className="ml-auto">
          <Button variant="ghost" size="sm" className="text-red-600 dark:text-red-400">
            {t('viewAll')}
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <Card className="p-4 md:p-6 border-red-200 dark:border-red-900/30 bg-red-50/50 dark:bg-red-900/5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 md:mb-4">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="p-1.5 md:p-2 bg-red-100 dark:bg-red-900/20 rounded-lg">
            <AlertTriangle className="h-4 w-4 md:h-5 md:w-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h2 className="text-base md:text-lg font-semibold text-red-900 dark:text-red-100">
              {t('title')}
            </h2>
            <p className="text-xs md:text-sm text-red-700 dark:text-red-300">
              {t('description', { count: data.total })}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          className="text-red-600 dark:text-red-400"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Failed Payments List */}
      <div className="space-y-2 md:space-y-3">
        {displayItems.map((item) => (
          <div
            key={`${item.payment_type}-${item.id}`}
            className="flex items-center justify-between p-2 md:p-3 bg-white dark:bg-gray-900 rounded-lg border border-red-100 dark:border-red-900/20"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/20 rounded-lg">
                {getPaymentTypeIcon(item.payment_type)}
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {item.name}
                </p>
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <span className="capitalize">{getPaymentTypeLabel(item.payment_type)}</span>
                  {item.account_name && (
                    <>
                      <span>•</span>
                      <span>{item.account_name}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="font-semibold text-red-600 dark:text-red-400">
                  <CurrencyDisplay
                    amount={parseFloat(item.amount)}
                    currency={item.currency}
                    showSymbol={true}
                    showCode={false}
                  />
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {new Date(item.failure_date).toLocaleDateString()}
                </p>
              </div>
              <Link href={getPaymentTypeLink(item)}>
                <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50">
                  {t('retry')}
                </Button>
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* View All Link */}
      {hasMore && (
        <div className="mt-4 text-center">
          <Link href="/dashboard">
            <Button variant="ghost" className="text-red-600 dark:text-red-400">
              {t('viewAllButton', { count: data.total - maxItems })}
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>
      )}
    </Card>
  );
}

function FailedPaymentsAlertSkeleton() {
  return (
    <Card className="p-4 md:p-6">
      <div className="flex items-center gap-3 mb-4">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-60 mt-1" />
        </div>
      </div>
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </Card>
  );
}
