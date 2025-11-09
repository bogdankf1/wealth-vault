/**
 * Planned Installments Widget
 * Displays installment payments planned for the selected month
 */
'use client';

import { CalendarClock, Wallet, Calendar } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useListInstallmentsQuery } from '@/lib/api/installmentsApi';
import { useGetMyPreferencesQuery } from '@/lib/api/preferencesApi';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { format, parseISO, isWithinInterval, startOfMonth, endOfMonth, addWeeks, addMonths } from 'date-fns';

interface PlannedInstallmentsWidgetProps {
  selectedMonth: string; // YYYY-MM format
}

// Calculate payment date for installments within the selected month
function getPaymentInMonth(installment: { is_active: boolean; first_payment_date?: string; payments_made: number; number_of_payments: number; frequency: string }, referenceMonth: string): { date: Date; paymentNumber: number } | null {
  const [year, month] = referenceMonth.split('-').map(Number);
  const monthStart = startOfMonth(new Date(year, month - 1));
  const monthEnd = endOfMonth(new Date(year, month - 1));

  // Only process active installments
  if (!installment.is_active) return null;
  if (!installment.first_payment_date) return null;

  const firstPaymentDate = parseISO(installment.first_payment_date);

  // Calculate all payment dates and find which one falls in the selected month
  for (let paymentNum = 1; paymentNum <= installment.number_of_payments; paymentNum++) {
    let paymentDate = new Date(firstPaymentDate);

    // Add the appropriate interval for each payment
    for (let i = 1; i < paymentNum; i++) {
      switch (installment.frequency) {
        case 'weekly':
          paymentDate = addWeeks(paymentDate, 1);
          break;
        case 'biweekly':
          paymentDate = addWeeks(paymentDate, 2);
          break;
        case 'monthly':
          paymentDate = addMonths(paymentDate, 1);
          break;
      }
    }

    // Check if this payment falls within the selected month
    if (isWithinInterval(paymentDate, { start: monthStart, end: monthEnd })) {
      return {
        date: paymentDate,
        paymentNumber: paymentNum,
      };
    }

    // If we've passed the end of the month, no need to continue
    if (paymentDate > monthEnd) {
      break;
    }
  }

  return null;
}

export function PlannedInstallmentsWidget({ selectedMonth }: PlannedInstallmentsWidgetProps) {
  const { data: installmentsData, isLoading, error } = useListInstallmentsQuery({ is_active: true });
  const { data: preferences } = useGetMyPreferencesQuery();
  const displayCurrency = preferences?.display_currency || preferences?.currency;

  // Filter and map installments for the selected month
  const upcomingInstallments = installmentsData?.items
    .map((installment) => {
      const paymentInfo = getPaymentInMonth(installment, selectedMonth);
      return paymentInfo ? {
        ...installment,
        nextPaymentDate: paymentInfo.date,
        nextPaymentNumber: paymentInfo.paymentNumber,
      } : null;
    })
    .filter((installment) => installment !== null)
    .sort((a, b) => a!.nextPaymentDate!.getTime() - b!.nextPaymentDate!.getTime());

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            <CardTitle>Planned Installments</CardTitle>
          </div>
          <CardDescription>Installment payments for selected month</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            <CardTitle>Planned Installments</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>
              Failed to load installments. Please try again later.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            <CardTitle>Planned Installments</CardTitle>
          </div>
          {upcomingInstallments && upcomingInstallments.length > 0 && (
            <Badge variant="secondary">{upcomingInstallments.length}</Badge>
          )}
        </div>
        <CardDescription>Installment payments for selected month</CardDescription>
      </CardHeader>
      <CardContent>
        {!upcomingInstallments || upcomingInstallments.length === 0 ? (
          <div className="text-center py-8">
            <Wallet className="mx-auto h-12 w-12 text-muted-foreground mb-4 opacity-50" />
            <p className="text-sm text-muted-foreground">
              No installment payments planned for this month
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingInstallments.map((installment) => (
              <div
                key={installment!.id}
                className="rounded-lg border bg-card p-4 hover:bg-accent/5 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-sm truncate">{installment!.name}</h4>
                      {installment!.category && (
                        <Badge variant="outline" className="text-xs">
                          {installment!.category}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>
                        {format(installment!.nextPaymentDate!, 'MMM dd, yyyy')}
                      </span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-semibold">
                      <CurrencyDisplay
                        amount={installment!.amount_per_payment}
                        currency={installment!.currency}
                        displayCurrency={displayCurrency}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Payment {installment!.nextPaymentNumber} of {installment!.number_of_payments}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
