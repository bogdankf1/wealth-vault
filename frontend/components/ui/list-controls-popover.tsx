'use client';

import React from 'react';
import { Filter, ArrowUp, ArrowDown, LayoutGrid, List, CalendarDays, RotateCcw, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import type { SortField, SortDirection } from '@/components/ui/sort-filter';
import type { ColumnConfig, ColumnVisibilityState } from '@/hooks/use-column-visibility';

type ViewMode = 'card' | 'list' | 'calendar';

interface ColumnControls {
  columns: ColumnConfig[];
  visibleColumns: ColumnVisibilityState;
  toggleColumn: (columnId: string) => void;
  showAllColumns: () => void;
}

interface ListControlsPopoverProps {
  activeFilterCount: number;
  /** Module-specific filter fields (e.g. category, month), rendered above the shared Sort/View/Columns sections. */
  filterSlot: React.ReactNode;
  sortField: SortField;
  setSortField: (field: SortField) => void;
  sortDirection: SortDirection;
  setSortDirection: (direction: SortDirection) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  /** Show the calendar view control. */
  showCalendar?: boolean;
  /** Native tooltips for the view buttons (omit to render without titles). */
  viewTitles?: { card: string; list: string; calendar: string };
  /** Provide to render the columns section (list view only). */
  columnControls?: ColumnControls;
}

/**
 * Shared Sort + View + Columns popover for list/card module pages.
 *
 * The Sort/View/Columns JSX is a verbatim lift from the expenses overview page;
 * the per-module filter fields are passed in via `filterSlot`.
 */
export function ListControlsPopover({
  activeFilterCount,
  filterSlot,
  sortField,
  setSortField,
  sortDirection,
  setSortDirection,
  viewMode,
  setViewMode,
  showCalendar,
  viewTitles,
  columnControls,
}: ListControlsPopoverProps) {
  const tCommon = useTranslations('common');

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <Filter className="h-4 w-4" />
          {activeFilterCount > 0 && (
            <Badge className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end">
        {filterSlot}

        <Separator />

        {/* Sort section */}
        <div className="p-2 space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.sort')}</p>
          <div className="flex items-center gap-2">
            <Select value={sortField} onValueChange={(value) => setSortField(value as SortField)}>
              <SelectTrigger className="h-8 flex-1 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">{tCommon('common.name')}</SelectItem>
                <SelectItem value="amount">{tCommon('common.amount')}</SelectItem>
                <SelectItem value="date">{tCommon('common.date')}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
              className="h-8 gap-1.5 flex-shrink-0"
            >
              {sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
              <span className="text-sm">
                {sortField === 'name'
                  ? (sortDirection === 'asc' ? tCommon('common.sortAZ') : tCommon('common.sortZA'))
                  : sortField === 'amount'
                    ? (sortDirection === 'asc' ? tCommon('common.sortLowToHigh') : tCommon('common.sortHighToLow'))
                    : (sortDirection === 'asc' ? tCommon('common.sortOldestFirst') : tCommon('common.sortNewestFirst'))
                }
              </span>
            </Button>
          </div>
        </div>

        <Separator />

        {/* View section */}
        <div className="p-2 space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.view')}</p>
          <div className="inline-flex items-center gap-1 border rounded-md p-0.5" style={{ height: '32px' }}>
            <Button
              variant={viewMode === 'card' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('card')}
              className="h-[32px] w-[32px] p-0"
              title={viewTitles?.card}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="h-[32px] w-[32px] p-0"
              title={viewTitles?.list}
            >
              <List className="h-4 w-4" />
            </Button>
            {showCalendar && (
              <Button
                variant={viewMode === 'calendar' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('calendar')}
                className="h-[32px] w-[32px] p-0"
                title={viewTitles?.calendar}
              >
                <CalendarDays className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Columns section (list view only) */}
        {columnControls && viewMode === 'list' && (
          <>
            <Separator />
            <div className="p-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.columns')}</p>
                {Object.values(columnControls.visibleColumns).filter(Boolean).length < columnControls.columns.length && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                    onClick={columnControls.showAllColumns}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    {tCommon('common.showAll')}
                  </Button>
                )}
              </div>
              <div className="space-y-1">
                {columnControls.columns.map((column) => (
                  <label
                    key={column.id}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                      column.locked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-muted'
                    }`}
                  >
                    <Checkbox
                      checked={columnControls.visibleColumns[column.id] ?? true}
                      onCheckedChange={() => columnControls.toggleColumn(column.id)}
                      disabled={column.locked}
                    />
                    <span className="flex-1">{column.label}</span>
                    {column.locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
