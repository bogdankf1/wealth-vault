/**
 * Time Range Filter Widget
 * Allows users to select different time periods for dashboard analytics
 */
'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';

export type TimeRange = {
  start: Date;
  end: Date;
  label: string;
};

export type TimeRangePeriod =
  | 'this_month'
  | 'last_month'
  | 'last_3_months'
  | 'last_6_months'
  | 'last_12_months'
  | 'ytd'
  | 'custom';

interface TimeRangeFilterProps {
  onRangeChange: (range: TimeRange) => void;
  defaultPeriod?: TimeRangePeriod;
}

export function TimeRangeFilter({
  onRangeChange,
  defaultPeriod = 'last_3_months',
}: TimeRangeFilterProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<TimeRangePeriod>(defaultPeriod);
  const [customStartDate, setCustomStartDate] = useState<Date>();
  const [customEndDate, setCustomEndDate] = useState<Date>();

  // Calculate date range based on period
  const getDateRange = (period: TimeRangePeriod): TimeRange => {
    const now = new Date();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    switch (period) {
      case 'this_month': {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        return { start, end: endOfToday, label: 'This Month' };
      }
      case 'last_month': {
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        return { start, end, label: 'Last Month' };
      }
      case 'last_3_months': {
        const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        return { start, end: endOfToday, label: 'Last 3 Months' };
      }
      case 'last_6_months': {
        const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        return { start, end: endOfToday, label: 'Last 6 Months' };
      }
      case 'last_12_months': {
        const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        return { start, end: endOfToday, label: 'Last 12 Months' };
      }
      case 'ytd': {
        const start = new Date(now.getFullYear(), 0, 1);
        return { start, end: endOfToday, label: 'Year to Date' };
      }
      case 'custom': {
        if (customStartDate && customEndDate) {
          return {
            start: customStartDate,
            end: customEndDate,
            label: `${format(customStartDate, 'MMM d')} - ${format(customEndDate, 'MMM d, yyyy')}`,
          };
        }
        // Default to last 3 months if custom dates not set
        const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        return { start, end: endOfToday, label: 'Custom Range' };
      }
      default:
        const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        return { start, end: endOfToday, label: 'Last 3 Months' };
    }
  };

  const handlePeriodChange = (period: TimeRangePeriod) => {
    setSelectedPeriod(period);
    if (period !== 'custom') {
      const range = getDateRange(period);
      onRangeChange(range);
    }
  };

  const handleCustomDateApply = () => {
    if (customStartDate && customEndDate) {
      const range = getDateRange('custom');
      onRangeChange(range);
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
            Time Period
          </label>
          <Select value={selectedPeriod} onValueChange={handlePeriodChange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="last_month">Last Month</SelectItem>
              <SelectItem value="last_3_months">Last 3 Months</SelectItem>
              <SelectItem value="last_6_months">Last 6 Months</SelectItem>
              <SelectItem value="last_12_months">Last 12 Months</SelectItem>
              <SelectItem value="ytd">Year to Date</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {selectedPeriod === 'custom' && (
          <>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                Start Date
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[150px] justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {customStartDate ? format(customStartDate, 'MMM d, yyyy') : 'Pick date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customStartDate}
                    onSelect={setCustomStartDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                End Date
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[150px] justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {customEndDate ? format(customEndDate, 'MMM d, yyyy') : 'Pick date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customEndDate}
                    onSelect={setCustomEndDate}
                    initialFocus
                    disabled={(date) => customStartDate ? date < customStartDate : false}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="self-end">
              <Button
                onClick={handleCustomDateApply}
                disabled={!customStartDate || !customEndDate}
              >
                Apply
              </Button>
            </div>
          </>
        )}

        <div className="ml-auto self-end">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {getDateRange(selectedPeriod).label}
          </p>
        </div>
      </div>
    </Card>
  );
}
