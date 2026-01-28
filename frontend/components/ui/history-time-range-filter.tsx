/**
 * History Time Range Filter Component
 * Shows a Select dropdown on mobile and a button group on desktop
 */
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { HistoryTimeRange } from '@/types/module-layout';

interface TimeRangeOption {
  value: HistoryTimeRange;
  label: string;
}

interface HistoryTimeRangeFilterProps {
  value: HistoryTimeRange;
  onChange: (value: HistoryTimeRange) => void;
  options: TimeRangeOption[];
  showLabel?: string;
}

export function HistoryTimeRangeFilter({
  value,
  onChange,
  options,
  showLabel = 'Show:',
}: HistoryTimeRangeFilterProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">{showLabel}</span>

      {/* Mobile: Select dropdown */}
      <div className="sm:hidden">
        <Select value={value} onValueChange={(v) => onChange(v as HistoryTimeRange)}>
          <SelectTrigger className="w-[140px]" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop: Button group */}
      <div className="hidden sm:inline-flex rounded-md border">
        {options.map((option, index) => {
          const isFirst = index === 0;
          const isLast = index === options.length - 1;
          const isMiddle = !isFirst && !isLast;

          return (
            <Button
              key={option.value}
              variant={value === option.value ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => onChange(option.value)}
              className={
                isFirst
                  ? 'rounded-r-none'
                  : isLast
                  ? 'rounded-l-none'
                  : isMiddle
                  ? 'rounded-none border-x'
                  : ''
              }
            >
              {option.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
