/**
 * Planned Subscriptions Widget
 * Displays subscription payments planned for the selected month
 */
'use client';

import { CalendarClock, CreditCard, Calendar } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useListSubscriptionsQuery } from '@/lib/api/subscriptionsApi';
import { useGetMyPreferencesQuery } from '@/lib/api/preferencesApi';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { format, parseISO, isWithinInterval, startOfMonth, endOfMonth, addMonths, addQuarters, addYears } from 'date-fns';

interface PlannedSubscriptionsWidgetProps {
  selectedMonth: string; // YYYY-MM format
}

// Calculate renewal date for subscriptions within the selected month
function getRenewalDateInMonth(subscription: { start_date: string; frequency: string; end_date?: string }, referenceMonth: string): Date | null {
  const [year, month] = referenceMonth.split('-').map(Number);
  const monthStart = startOfMonth(new Date(year, month - 1));
  const monthEnd = endOfMonth(new Date(year, month - 1));

  if (!subscription.start_date) return null;

  const startDate = parseISO(subscription.start_date);
  let currentDate = new Date(startDate);

  // Check if subscription has ended before the selected month
  if (subscription.end_date) {
    const endDate = parseISO(subscription.end_date);
    if (endDate < monthStart) return null;
  }

  // Calculate months to add based on frequency
  const getInterval = (freq: string) => {
    switch (freq) {
      case 'monthly': return { type: 'months' as const, count: 1 };
      case 'quarterly': return { type: 'quarters' as const, count: 1 };
      case 'biannually': return { type: 'months' as const, count: 6 };
      case 'annually': return { type: 'years' as const, count: 1 };
      default: return null;
    }
  };

  const interval = getInterval(subscription.frequency);
  if (!interval) return null;

  // Find the renewal that falls within the selected month
  while (currentDate < monthStart) {
    if (interval.type === 'months') {
      currentDate = addMonths(currentDate, interval.count);
    } else if (interval.type === 'quarters') {
      currentDate = addQuarters(currentDate, interval.count);
    } else if (interval.type === 'years') {
      currentDate = addYears(currentDate, interval.count);
    }
  }

  // Check if this renewal falls within the selected month
  if (isWithinInterval(currentDate, { start: monthStart, end: monthEnd })) {
    // Check if it's before end_date
    if (subscription.end_date) {
      const endDate = parseISO(subscription.end_date);
      if (currentDate > endDate) return null;
    }
    return currentDate;
  }

  return null;
}

export function PlannedSubscriptionsWidget({ selectedMonth }: PlannedSubscriptionsWidgetProps) {
  const { data: subscriptionsData, isLoading, error } = useListSubscriptionsQuery({ is_active: true });
  const { data: preferences } = useGetMyPreferencesQuery();
  const displayCurrency = preferences?.display_currency || preferences?.currency;

  // Filter subscriptions for the selected month
  const upcomingSubscriptions = subscriptionsData?.items
    .map((subscription) => {
      const renewalDate = getRenewalDateInMonth(subscription, selectedMonth);
      if (!renewalDate) return null;

      return {
        ...subscription,
        renewalDate,
      };
    })
    .filter((sub) => sub !== null)
    .sort((a, b) => a!.renewalDate!.getTime() - b!.renewalDate!.getTime());

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            <CardTitle>Planned Subscriptions</CardTitle>
          </div>
          <CardDescription>Subscription payments for selected month</CardDescription>
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
            <CardTitle>Planned Subscriptions</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>
              Failed to load subscriptions. Please try again later.
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
            <CardTitle>Planned Subscriptions</CardTitle>
          </div>
          {upcomingSubscriptions && upcomingSubscriptions.length > 0 && (
            <Badge variant="secondary">{upcomingSubscriptions.length}</Badge>
          )}
        </div>
        <CardDescription>Subscription payments for selected month</CardDescription>
      </CardHeader>
      <CardContent>
        {!upcomingSubscriptions || upcomingSubscriptions.length === 0 ? (
          <div className="text-center py-8">
            <CreditCard className="mx-auto h-12 w-12 text-muted-foreground mb-4 opacity-50" />
            <p className="text-sm text-muted-foreground">
              No subscriptions planned for this month
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingSubscriptions.map((subscription) => (
              <div
                key={subscription.id}
                className="rounded-lg border bg-card p-4 hover:bg-accent/5 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-sm truncate">{subscription.name}</h4>
                      {subscription.category && (
                        <Badge variant="outline" className="text-xs">
                          {subscription.category}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>
                        {format(subscription!.renewalDate!, 'MMM dd, yyyy')}
                      </span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-semibold">
                      <CurrencyDisplay
                        amount={subscription.amount}
                        currency={subscription.currency}
                        displayCurrency={displayCurrency}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground capitalize">
                      {subscription!.frequency.replace('_', ' ')}
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
