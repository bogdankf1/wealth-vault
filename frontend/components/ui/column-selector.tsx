/**
 * Column Selector Component
 * Allows users to show/hide table columns with a dropdown menu
 */
'use client';

import React from 'react';
import { Columns3, Lock, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ColumnConfig, ColumnVisibilityState } from '@/lib/hooks/use-column-visibility';

export interface ColumnSelectorProps {
  columns: ColumnConfig[];
  visibleColumns: ColumnVisibilityState;
  onToggleColumn: (columnId: string) => void;
  onShowAllColumns: () => void;
  label?: string;
  showAllLabel?: string;
}

export function ColumnSelector({
  columns,
  visibleColumns,
  onToggleColumn,
  onShowAllColumns,
  label = 'Columns',
  showAllLabel = 'Show All',
}: ColumnSelectorProps) {
  const visibleCount = Object.values(visibleColumns).filter(Boolean).length;
  const totalCount = columns.length;
  const allVisible = visibleCount === totalCount;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-2">
          <Columns3 className="h-4 w-4" />
          <span className="hidden sm:inline">{label}</span>
          {!allVisible && (
            <span className="text-xs text-muted-foreground">
              ({visibleCount}/{totalCount})
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>{label}</span>
          {!allVisible && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={(e) => {
                e.preventDefault();
                onShowAllColumns();
              }}
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              {showAllLabel}
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            checked={visibleColumns[column.id] ?? true}
            onCheckedChange={() => onToggleColumn(column.id)}
            onSelect={(e) => e.preventDefault()}
            disabled={column.locked}
            className="cursor-pointer"
          >
            <span className="flex items-center gap-2">
              {column.label}
              {column.locked && (
                <Lock className="h-3 w-3 text-muted-foreground" />
              )}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
