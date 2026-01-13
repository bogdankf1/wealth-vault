/**
 * Subscription Payment List Component
 * Displays payment history for a subscription
 */
'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Receipt, Calendar, FileText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { useGetSubscriptionPaymentsQuery } from '@/lib/api/subscriptionsApi';
import { format } from 'date-fns';

interface SubscriptionPaymentListProps {
  subscriptionId: string;
  currency: string;
}

export function SubscriptionPaymentList({ subscriptionId, currency }: SubscriptionPaymentListProps) {
  const t = useTranslations('subscriptions.payments');

  const { data, isLoading, error } = useGetSubscriptionPaymentsQuery({
    subscriptionId,
    page: 1,
    page_size: 50,
  });

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'completed':
        return 'default';
      case 'pending':
        return 'secondary';
      case 'failed':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return t('completed');
      case 'pending':
        return t('pending');
      case 'failed':
        return t('failed');
      default:
        return status;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  const payments = data?.items || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              {t('title')}
            </CardTitle>
            <CardDescription>{t('description')}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-semibold">{t('noPayments')}</h3>
            <p className="text-muted-foreground">{t('noPaymentsDescription')}</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('date')}</TableHead>
                  <TableHead>{t('amount')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('period')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t('notes')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {format(new Date(payment.payment_date), 'MMM d, yyyy')}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      <CurrencyDisplay
                        amount={payment.amount}
                        currency={payment.currency}
                        showSymbol
                      />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {payment.period_start && payment.period_end ? (
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(payment.period_start), 'MMM d')} -{' '}
                          {format(new Date(payment.period_end), 'MMM d, yyyy')}
                        </span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(payment.status)}>
                        {getStatusLabel(payment.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-sm text-muted-foreground max-w-[200px] truncate block">
                        {payment.notes || '-'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
