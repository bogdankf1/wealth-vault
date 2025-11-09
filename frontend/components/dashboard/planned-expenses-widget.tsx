/**
 * Planned Expenses Widget
 * Displays recurring expense payments planned for the selected month
 */
'use client';

import { CalendarClock, Receipt, Calendar } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useListExpensesQuery } from '@/lib/api/expensesApi';
import { useGetMyPreferencesQuery } from '@/lib/api/preferencesApi';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { format, parseISO, isWithinInterval, startOfMonth, endOfMonth, addDays, addWeeks, addMonths, addQuarters, addYears } from 'date-fns';

interface PlannedExpensesWidgetProps {
  selectedMonth: string; // YYYY-MM format
}

// Calculate next occurrence date for recurring expenses
function getNextOccurrenceDate(expense: { frequency: string; start_date?: string | null }, referenceMonth: string): Date | null {
  const [year, month] = referenceMonth.split('-').map(Number);
  const monthStart = startOfMonth(new Date(year, month - 1));
  const monthEnd = endOfMonth(new Date(year, month - 1));

  // Only process recurring expenses
  if (expense.frequency === 'one_time') return null;
  if (!expense.start_date) return null;

  const startDate = parseISO(expense.start_date);
  let currentDate = new Date(startDate);

  // Calculate next occurrence based on frequency
  while (currentDate < monthStart) {
    switch (expense.frequency) {
      case 'daily':
        currentDate = addDays(currentDate, 1);
        break;
      case 'weekly':
        currentDate = addWeeks(currentDate, 1);
        break;
      case 'biweekly':
        currentDate = addWeeks(currentDate, 2);
        break;
      case 'monthly':
        currentDate = addMonths(currentDate, 1);
        break;
      case 'quarterly':
        currentDate = addQuarters(currentDate, 1);
        break;
      case 'annually':
        currentDate = addYears(currentDate, 1);
        break;
      default:
        return null;
    }
  }

  // Check if it falls within the selected month
  if (isWithinInterval(currentDate, { start: monthStart, end: monthEnd })) {
    return currentDate;
  }

  return null;
}

export function PlannedExpensesWidget({ selectedMonth }: PlannedExpensesWidgetProps) {
  const { data: expensesData, isLoading, error } = useListExpensesQuery({ is_active: true });
  const { data: preferences } = useGetMyPreferencesQuery();
  const displayCurrency = preferences?.display_currency || preferences?.currency;

  // Filter and map recurring expenses for the selected month
  const upcomingExpenses = expensesData?.items
    .map((expense) => {
      const nextDate = getNextOccurrenceDate(expense, selectedMonth);
      if (!nextDate) return null;

      return {
        ...expense,
        nextDate,
      };
    })
    .filter((expense) => expense !== null)
    .sort((a, b) => a!.nextDate!.getTime() - b!.nextDate!.getTime());

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            <CardTitle>Planned Expenses</CardTitle>
          </div>
          <CardDescription>Recurring expense payments for selected month</CardDescription>
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
            <CardTitle>Planned Expenses</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>
              Failed to load expenses. Please try again later.
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
            <CardTitle>Planned Expenses</CardTitle>
          </div>
          {upcomingExpenses && upcomingExpenses.length > 0 && (
            <Badge variant="secondary">{upcomingExpenses.length}</Badge>
          )}
        </div>
        <CardDescription>Recurring expense payments for selected month</CardDescription>
      </CardHeader>
      <CardContent>
        {!upcomingExpenses || upcomingExpenses.length === 0 ? (
          <div className="text-center py-8">
            <Receipt className="mx-auto h-12 w-12 text-muted-foreground mb-4 opacity-50" />
            <p className="text-sm text-muted-foreground">
              No recurring expenses planned for this month
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingExpenses.map((expense) => (
              <div
                key={expense.id}
                className="rounded-lg border bg-card p-4 hover:bg-accent/5 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-sm truncate">{expense.name}</h4>
                      {expense.category && (
                        <Badge variant="outline" className="text-xs">
                          {expense.category}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>
                        {format(expense.nextDate!, 'MMM dd, yyyy')}
                      </span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-semibold">
                      <CurrencyDisplay
                        amount={expense.amount}
                        currency={expense.currency}
                        displayCurrency={displayCurrency}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground capitalize">
                      {expense.frequency.replace('_', ' ')}
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
