/**
 * Installment Payment List Component
 * Displays payment history for an installment
 */
'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Receipt, Calendar, FileText, AlertTriangle, CheckCircle2, Clock, XCircle } from 'lucide-react';
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
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { useGetInstallmentPaymentsQuery } from '@/lib/api/installmentsApi';
import { format } from 'date-fns';

interface InstallmentPaymentListProps {
  installmentId: string;
  currency: string;
}

export function InstallmentPaymentList({ installmentId, currency }: InstallmentPaymentListProps) {
  const t = useTranslations('installments.payments');

  const { data, isLoading, error } = useGetInstallmentPaymentsQuery({
    installmentId,
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
      case 'skipped':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-3 w-3" />;
      case 'pending':
        return <Clock className="h-3 w-3" />;
      case 'failed':
        return <XCircle className="h-3 w-3" />;
      default:
        return null;
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
      case 'skipped':
        return t('skipped');
      default:
        return status;
    }
  };

  if (isLoading) {
    return (
      <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
        <CardHeader className="px-3 lg:px-6">
          <Skeleton className="h-5 lg:h-6 w-32" />
          <Skeleton className="h-3 lg:h-4 w-48" />
        </CardHeader>
        <CardContent className="px-3 lg:px-6">
          <Skeleton className="h-48 lg:h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  const payments = data?.items || [];

  return (
    <Card className="py-3 gap-1.5 lg:py-6 lg:gap-6">
      <CardHeader className="px-3 lg:px-6">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm lg:text-base">
              <Receipt className="h-4 w-4 lg:h-5 lg:w-5" />
              {t('title')}
            </CardTitle>
            <CardDescription>{t('description')}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 lg:px-6">
        {payments.length === 0 ? (
          <div className="text-center py-4 lg:py-8">
            <FileText className="mx-auto h-8 w-8 lg:h-12 lg:w-12 text-muted-foreground/50" />
            <h3 className="mt-2 lg:mt-4 text-base lg:text-lg font-semibold">{t('noPayments')}</h3>
            <p className="text-xs lg:text-sm text-muted-foreground">{t('noPaymentsDescription')}</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">{t('number')}</TableHead>
                  <TableHead>{t('scheduledDate')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('paidDate')}</TableHead>
                  <TableHead>{t('amount')}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t('breakdown')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                  <TableHead className="hidden xl:table-cell">{t('notes')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-medium">
                      #{payment.payment_number}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {format(new Date(payment.scheduled_date), 'MMM d, yyyy')}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {payment.actual_payment_date ? (
                        <div className="flex items-center gap-2">
                          {payment.is_late && (
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                          )}
                          <span className={payment.is_late ? 'text-amber-600' : ''}>
                            {format(new Date(payment.actual_payment_date), 'MMM d, yyyy')}
                          </span>
                          {payment.days_late && payment.days_late > 0 && (
                            <span className="text-xs text-amber-600">
                              ({payment.days_late}d late)
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      <CurrencyDisplay
                        amount={payment.actual_amount ?? payment.scheduled_amount}
                        currency={payment.currency}
                        showSymbol
                      />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {payment.principal_amount != null || payment.interest_amount != null ? (
                        <div className="text-xs space-y-0.5">
                          {payment.principal_amount != null && (
                            <div className="text-muted-foreground">
                              Principal: <CurrencyDisplay
                                amount={payment.principal_amount}
                                currency={payment.currency}
                                showSymbol
                              />
                            </div>
                          )}
                          {payment.interest_amount != null && payment.interest_amount > 0 && (
                            <div className="text-muted-foreground">
                              Interest: <CurrencyDisplay
                                amount={payment.interest_amount}
                                currency={payment.currency}
                                showSymbol
                              />
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={getStatusBadgeVariant(payment.status)}
                        className="gap-1"
                      >
                        {getStatusIcon(payment.status)}
                        {getStatusLabel(payment.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
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
