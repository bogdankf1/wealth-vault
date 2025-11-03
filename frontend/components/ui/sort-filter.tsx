/**
 * Sort Filter Component
 * Reusable sorting component with field selection and direction toggle
 */
'use client';

import React from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type SortField = 'name' | 'amount' | 'date';
export type SortDirection = 'asc' | 'desc';

export interface SortOption {
  field: SortField;
  label: string;
}

export interface SortFilterProps {
  sortField: SortField;
  sortDirection: SortDirection;
  onSortFieldChange: (field: SortField) => void;
  onSortDirectionChange: (direction: SortDirection) => void;
  sortOptions?: SortOption[];
}

const DEFAULT_SORT_OPTIONS: SortOption[] = [
  { field: 'name', label: 'Name' },
  { field: 'amount', label: 'Amount' },
  { field: 'date', label: 'Date' },
];

export function SortFilter({
  sortField,
  sortDirection,
  onSortFieldChange,
  onSortDirectionChange,
  sortOptions = DEFAULT_SORT_OPTIONS,
}: SortFilterProps) {
  const toggleDirection = () => {
    onSortDirectionChange(sortDirection === 'asc' ? 'desc' : 'asc');
  };

  const getSortIcon = () => {
    if (sortDirection === 'asc') {
      return <ArrowUp className="h-4 w-4" />;
    }
    return <ArrowDown className="h-4 w-4" />;
  };

  const getDirectionLabel = () => {
    const fieldLabel = sortOptions.find((opt) => opt.field === sortField)?.label || 'Field';

    if (sortField === 'name') {
      return sortDirection === 'asc' ? 'A-Z' : 'Z-A';
    } else if (sortField === 'amount') {
      return sortDirection === 'asc' ? 'Low to High' : 'High to Low';
    } else if (sortField === 'date') {
      return sortDirection === 'asc' ? 'Oldest First' : 'Newest First';
    }
    return sortDirection === 'asc' ? 'Ascending' : 'Descending';
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground whitespace-nowrap">Sort by:</span>

      {/* Sort Field Selector */}
      <Select value={sortField} onValueChange={(value) => onSortFieldChange(value as SortField)}>
        <SelectTrigger className="h-9 w-[130px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {sortOptions.map((option) => (
            <SelectItem key={option.field} value={option.field}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Sort Direction Toggle */}
      <Button
        variant="outline"
        size="sm"
        onClick={toggleDirection}
        className="h-9 gap-2"
        title={`Sort ${getDirectionLabel()}`}
      >
        {getSortIcon()}
        <span className="hidden sm:inline">{getDirectionLabel()}</span>
      </Button>
    </div>
  );
}

/**
 * Utility function to sort items based on field and direction
 */
export function sortItems<T>(
  items: T[] | undefined,
  sortField: SortField,
  sortDirection: SortDirection,
  getName: (item: T) => string,
  getAmount: (item: T) => number | string,
  getDate: (item: T) => string | null | undefined
): T[] | undefined {
  if (!items) return items;

  const sorted = [...items];

  sorted.sort((a, b) => {
    let compareA: string | number;
    let compareB: string | number;

    switch (sortField) {
      case 'name':
        compareA = getName(a).toLowerCase();
        compareB = getName(b).toLowerCase();
        break;

      case 'amount':
        compareA = typeof getAmount(a) === 'string'
          ? parseFloat(getAmount(a) as string) || 0
          : (getAmount(a) as number);
        compareB = typeof getAmount(b) === 'string'
          ? parseFloat(getAmount(b) as string) || 0
          : (getAmount(b) as number);
        break;

      case 'date':
        const dateA = getDate(a);
        const dateB = getDate(b);
        compareA = dateA ? new Date(dateA).getTime() : 0;
        compareB = dateB ? new Date(dateB).getTime() : 0;
        break;

      default:
        return 0;
    }

    // Compare values
    if (compareA < compareB) {
      return sortDirection === 'asc' ? -1 : 1;
    }
    if (compareA > compareB) {
      return sortDirection === 'asc' ? 1 : -1;
    }
    return 0;
  });

  return sorted;
}
