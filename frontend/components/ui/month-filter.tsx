/**
 * Month Filter Component
 * Reusable month/year filter for filtering records by time period
 */
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';

interface MonthFilterProps {
  selectedMonth: string | null;
  onMonthChange: (month: string | null) => void;
  label?: string;
  clearLabel?: string;
}

export function MonthFilter({
  selectedMonth,
  onMonthChange,
  label = 'Filter by:',
  clearLabel = 'Clear'
}: MonthFilterProps) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onMonthChange(null)}
        disabled={!selectedMonth}
        className="h-9"
      >
        {clearLabel}
      </Button>
      <label htmlFor="month-filter" className="text-sm text-muted-foreground">
        {label}
      </label>
      <input
        id="month-filter"
        type="month"
        value={selectedMonth || ''}
        onChange={(e) => onMonthChange(e.target.value || null)}
        min="2020-01"
        max="2030-12"
        className="h-9 rounded-md border border-input bg-background px-3 text-sm cursor-pointer ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        style={{ colorScheme: 'light' }}
      />
    </div>
  );
}

/**
 * Utility function to filter items by month based on frequency
 *
 * @param items - Array of items to filter
 * @param selectedMonth - Selected month in YYYY-MM format (null for all items)
 * @param getFrequency - Function to extract frequency from item ('one_time' or recurring)
 * @param getDate - Function to extract date field for one-time items
 * @param getStartDate - Function to extract start_date for recurring items
 * @param getEndDate - Function to extract end_date for recurring items
 * @returns Filtered array of items
 *
 * @example
 * ```tsx
 * const filtered = filterByMonth(
 *   incomeSources,
 *   selectedMonth,
 *   (item) => item.frequency,
 *   (item) => item.date,
 *   (item) => item.start_date,
 *   (item) => item.end_date
 * );
 * ```
 */
export function filterByMonth<T>(
  items: T[] | undefined,
  selectedMonth: string | null,
  getFrequency: (item: T) => string,
  getDate: (item: T) => string | undefined | null,
  getStartDate: (item: T) => string | undefined | null,
  getEndDate: (item: T) => string | undefined | null
): T[] | undefined {
  if (!selectedMonth || !items) {
    return items;
  }

  const filterYear = parseInt(selectedMonth.split('-')[0]);
  const filterMonth = parseInt(selectedMonth.split('-')[1]) - 1; // 0-indexed

  return items.filter((item) => {
    const frequency = getFrequency(item);

    if (frequency === 'one_time') {
      // For one-time: check if date matches the selected month/year
      const dateStr = getDate(item);
      if (!dateStr) return false;

      const itemDate = new Date(dateStr);
      return itemDate.getFullYear() === filterYear && itemDate.getMonth() === filterMonth;
    } else {
      // For recurring: check if selected month overlaps with start_date and end_date range
      const startDateStr = getStartDate(item);
      if (!startDateStr) return false;

      const startDate = new Date(startDateStr);
      const endDateStr = getEndDate(item);
      const endDate = endDateStr ? new Date(endDateStr) : new Date('2099-12-31');

      // Get the start and end of the selected month
      const monthStart = new Date(filterYear, filterMonth, 1);
      const monthEnd = new Date(filterYear, filterMonth + 1, 0, 23, 59, 59);

      // Check if the selected month overlaps with the item date range
      return startDate <= monthEnd && (!endDateStr || endDate >= monthStart);
    }
  });
}
