/**
 * Calendar View Component
 * Displays items in a monthly calendar layout
 */
'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CurrencyDisplay } from '@/components/currency';
import { Checkbox } from '@/components/ui/checkbox';

interface CalendarItem {
  id: string;
  name: string;
  amount: number;
  currency: string;
  display_amount?: number | null;
  display_currency?: string | null;
  category?: string | null;
  date?: string | null;
  start_date?: string | null;
  frequency: string;
  is_active: boolean;
}

interface CalendarViewProps {
  items: CalendarItem[];
  selectedMonth: string; // YYYY-MM format
  onMonthChange: (month: string) => void;
  onItemClick: (id: string) => void;
  selectedItemIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

export function CalendarView({
  items,
  selectedMonth,
  onMonthChange,
  onItemClick,
  selectedItemIds = new Set(),
  onToggleSelect,
}: CalendarViewProps) {
  const [year, month] = selectedMonth.split('-').map(Number);
  const [expandedDays, setExpandedDays] = React.useState<Set<number>>(new Set());

  // Get the first day of the month and the number of days
  const firstDayOfMonth = new Date(year, month - 1, 1);
  const lastDayOfMonth = new Date(year, month, 0);
  const daysInMonth = lastDayOfMonth.getDate();
  const startDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday

  // Reset expanded days when month changes
  React.useEffect(() => {
    setExpandedDays(new Set());
  }, [selectedMonth]);

  // Get previous and next month
  const getPreviousMonth = () => {
    const date = new Date(selectedMonth + '-01'); // Parse as YYYY-MM-DD
    date.setMonth(date.getMonth() - 1);
    const newYear = date.getFullYear();
    const newMonth = String(date.getMonth() + 1).padStart(2, '0');
    return `${newYear}-${newMonth}`;
  };

  const getNextMonth = () => {
    const date = new Date(selectedMonth + '-01'); // Parse as YYYY-MM-DD
    date.setMonth(date.getMonth() + 1);
    const newYear = date.getFullYear();
    const newMonth = String(date.getMonth() + 1).padStart(2, '0');
    return `${newYear}-${newMonth}`;
  };

  // Helper function to check if a recurring item should appear on a specific date
  const shouldShowRecurringItem = (
    item: CalendarItem,
    targetDate: Date
  ): boolean => {
    const startDate = new Date(item.start_date || '');
    const endDate = new Date('2099-12-31'); // Default to far future if no end date

    // Check if target date is within the active range
    if (targetDate < startDate || targetDate > endDate) {
      return false;
    }

    const daysDiff = Math.floor(
      (targetDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    switch (item.frequency) {
      case 'daily':
        return true;
      case 'weekly':
        return daysDiff % 7 === 0;
      case 'biweekly':
        return daysDiff % 14 === 0;
      case 'monthly':
        // Show on the same day of each month
        return targetDate.getDate() === startDate.getDate();
      case 'quarterly':
        // Show every 3 months on the same day
        const monthsDiff =
          (targetDate.getFullYear() - startDate.getFullYear()) * 12 +
          (targetDate.getMonth() - startDate.getMonth());
        return (
          monthsDiff % 3 === 0 && targetDate.getDate() === startDate.getDate()
        );
      case 'annually':
        // Show on the same date each year
        return (
          targetDate.getMonth() === startDate.getMonth() &&
          targetDate.getDate() === startDate.getDate()
        );
      default:
        return false;
    }
  };

  // Group items by date
  const itemsByDate = React.useMemo(() => {
    const grouped: Record<number, CalendarItem[]> = {};

    items.forEach((item) => {
      if (item.frequency === 'one_time') {
        const itemDate = new Date(item.date || '');
        if (
          itemDate.getFullYear() === year &&
          itemDate.getMonth() === month - 1
        ) {
          const day = itemDate.getDate();
          if (!grouped[day]) grouped[day] = [];
          grouped[day].push(item);
        }
      } else {
        // For recurring items, check each day in the month
        for (let day = 1; day <= daysInMonth; day++) {
          const targetDate = new Date(year, month - 1, day);
          if (shouldShowRecurringItem(item, targetDate)) {
            if (!grouped[day]) grouped[day] = [];
            grouped[day].push(item);
          }
        }
      }
    });

    return grouped;
  }, [items, year, month, daysInMonth]);

  // Create calendar grid
  const calendarDays: (number | null)[] = [];

  // Add empty cells for days before the first day of the month
  for (let i = 0; i < startDayOfWeek; i++) {
    calendarDays.push(null);
  }

  // Add all days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Toggle expand/collapse for a specific day
  const toggleDayExpansion = (day: number) => {
    setExpandedDays((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(day)) {
        newSet.delete(day);
      } else {
        newSet.add(day);
      }
      return newSet;
    });
  };

  return (
    <div className="space-y-4">
      {/* Calendar Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          {firstDayOfMonth.toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
          })}
        </h3>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onMonthChange(getPreviousMonth())}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onMonthChange(getNextMonth())}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="border rounded-lg overflow-hidden bg-card">
        {/* Day Names Header */}
        <div className="grid grid-cols-7 border-b bg-muted/50">
          {dayNames.map((day) => (
            <div
              key={day}
              className="p-2 text-center text-xs font-semibold text-muted-foreground border-r last:border-r-0"
            >
              <span className="hidden sm:inline">{day}</span>
              <span className="sm:hidden">{day.charAt(0)}</span>
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day, index) => {
            const dayItems = day ? itemsByDate[day] || [] : [];
            const isToday =
              day &&
              new Date().getDate() === day &&
              new Date().getMonth() === month - 1 &&
              new Date().getFullYear() === year;

            return (
              <div
                key={index}
                className={`min-h-[80px] sm:min-h-[120px] border-r border-b last:border-r-0 ${
                  day ? 'bg-card' : 'bg-muted/20'
                } ${index % 7 === 6 ? 'border-r-0' : ''}`}
              >
                {day && (
                  <div className="p-1 sm:p-2 h-full flex flex-col">
                    {/* Day Number */}
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`text-xs sm:text-sm font-semibold ${
                          isToday
                            ? 'bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center'
                            : ''
                        }`}
                      >
                        {day}
                      </span>
                      {dayItems.length > 0 && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] h-4 px-1 sm:text-xs sm:h-5 sm:px-2"
                        >
                          {dayItems.length}
                        </Badge>
                      )}
                    </div>

                    {/* Items for this day */}
                    <div className="flex-1 space-y-1 overflow-y-auto">
                      {(expandedDays.has(day) ? dayItems : dayItems.slice(0, 3)).map((item) => (
                        <div
                          key={item.id}
                          className="group relative"
                        >
                          <Card
                            className={`p-1 sm:p-2 cursor-pointer hover:shadow-md transition-all ${
                              selectedItemIds.has(item.id)
                                ? 'ring-2 ring-primary'
                                : ''
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onItemClick(item.id);
                            }}
                          >
                            <div className="flex items-start gap-1">
                              {onToggleSelect && (
                                <Checkbox
                                  checked={selectedItemIds.has(item.id)}
                                  onCheckedChange={() => onToggleSelect(item.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="mt-0.5 flex-shrink-0"
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] sm:text-xs font-medium truncate">
                                  {item.name}
                                </p>
                                <p className="text-[10px] sm:text-xs font-semibold text-primary">
                                  <CurrencyDisplay
                                    amount={item.display_amount ?? item.amount}
                                    currency={
                                      item.display_currency ?? item.currency
                                    }
                                    showSymbol={true}
                                    showCode={false}
                                    decimals={0}
                                  />
                                </p>
                                {item.category && (
                                  <p className="text-[9px] sm:text-[10px] text-muted-foreground truncate">
                                    {item.category}
                                  </p>
                                )}
                              </div>
                            </div>
                          </Card>
                        </div>
                      ))}
                      {dayItems.length > 3 && (
                        <button
                          className="w-full text-[10px] sm:text-xs text-primary hover:text-primary/80 font-medium text-center py-1 hover:bg-muted/50 rounded transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleDayExpansion(day);
                          }}
                        >
                          {expandedDays.has(day)
                            ? 'Show less'
                            : `+${dayItems.length - 3} more`}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile Item List */}
      <div className="sm:hidden space-y-2">
        <h4 className="text-sm font-semibold text-muted-foreground">
          All Items This Month
        </h4>
        <div className="space-y-2">
          {items.map((item) => (
            <Card
              key={item.id}
              className={`p-3 cursor-pointer hover:shadow-md transition-all ${
                selectedItemIds.has(item.id) ? 'ring-2 ring-primary' : ''
              }`}
              onClick={() => onItemClick(item.id)}
            >
              <div className="flex items-start gap-2">
                {onToggleSelect && (
                  <Checkbox
                    checked={selectedItemIds.has(item.id)}
                    onCheckedChange={() => onToggleSelect(item.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{item.name}</p>
                    <Badge
                      variant={item.is_active ? 'default' : 'secondary'}
                      className="text-xs flex-shrink-0"
                    >
                      {item.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <p className="text-lg font-semibold text-primary mt-1">
                    <CurrencyDisplay
                      amount={item.display_amount ?? item.amount}
                      currency={item.display_currency ?? item.currency}
                      showSymbol={true}
                      showCode={false}
                    />
                  </p>
                  {item.category && (
                    <Badge variant="outline" className="text-xs mt-1">
                      {item.category}
                    </Badge>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {(() => {
                      const dateValue = item.date || item.start_date;
                      return dateValue
                        ? new Date(dateValue).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : '-';
                    })()}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
