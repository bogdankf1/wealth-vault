/**
 * History Time Range Filter Component
 * Shows a Select dropdown for selecting time range
 */
'use client';

import React from 'react';
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
      <Select value={value} onValueChange={(v) => onChange(v as HistoryTimeRange)}>
        <SelectTrigger className="w-[160px]" size="sm">
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
  );
}
