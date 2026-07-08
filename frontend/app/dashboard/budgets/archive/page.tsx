/**
 * Budgets Archive Page
 * Displays archived budgets with unarchive functionality
 */
'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, Trash2, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  useListBudgetsQuery,
  useUpdateBudgetMutation,
  useDeleteBudgetMutation,
  useBatchDeleteBudgetsMutation,
} from '@/lib/api/budgetsApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { BatchDeleteConfirmDialog } from '@/components/ui/batch-delete-confirm-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { filterBySearchAndCategory } from '@/components/ui/search-filter';
import { sortItems, type SortField, type SortDirection } from '@/components/ui/sort-filter';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CurrencyDisplay } from '@/components/currency';
import { useViewPreferences } from '@/hooks/use-view-preferences';
import { ListControlsPopover } from '@/components/ui/list-controls-popover';
import { useRowSelection } from '@/hooks/use-row-selection';
import { BudgetsActionsContext } from '../context';

export default function BudgetsArchivePage() {
  const router = useRouter();

  // Translation hooks
  const tArchive = useTranslations('budgets.archive');
  const tActions = useTranslations('budgets.actions');
  const tCommon = useTranslations('common');
  const tPeriod = useTranslations('budgets.period');
  const tOverview = useTranslations('budgets.overview');

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingBudgetId, setDeletingBudgetId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const selection = useRowSelection();
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);

  // Use default view preferences from user settings
  const { viewMode, setViewMode } = useViewPreferences();

  // Context to set action buttons in layout
  const { setActions } = React.useContext(BudgetsActionsContext);

  // Period labels with translations
  const PERIOD_LABELS: Record<string, string> = {
    monthly: tPeriod('monthly'),
    quarterly: tPeriod('quarterly'),
    yearly: tPeriod('yearly'),
  };

  // Fetch only archived budgets (is_active: false)
  const {
    data: budgetsData,
    isLoading: isLoadingBudgets,
    error: budgetsError,
  } = useListBudgetsQuery({ is_active: false });

  const [updateBudget] = useUpdateBudgetMutation();
  const [deleteBudget, { isLoading: isDeleting }] = useDeleteBudgetMutation();
  const [batchDeleteBudgets, { isLoading: isBatchDeleting }] = useBatchDeleteBudgetsMutation();

  const budgets = useMemo(() => budgetsData || [], [budgetsData]);

  // Get unique categories
  const uniqueCategories = React.useMemo(() => {
    const categories = budgets
      .map((budget) => budget.category)
      .filter((cat): cat is string => !!cat);
    return Array.from(new Set(categories)).sort();
  }, [budgets]);

  // Filter and sort budgets
  const filteredBudgets = React.useMemo(() => {
    const filtered = filterBySearchAndCategory(
      budgets,
      searchQuery,
      selectedCategory,
      (budget) => budget.name,
      (budget) => budget.category || undefined
    );

    // Apply sorting
    const sorted = sortItems(
      filtered,
      sortField,
      sortDirection,
      (budget) => budget.name,
      (budget) => budget.display_amount || budget.amount,
      (budget) => budget.start_date || budget.created_at
    );

    return sorted || [];
  }, [budgets, searchQuery, selectedCategory, sortField, sortDirection]);

  const handleUnarchive = async (id: string) => {
    try {
      await updateBudget({ id, data: { is_active: true } }).unwrap();
      toast.success(tArchive('unarchiveSuccess'));
      selection.deselect(id);
    } catch (error) {
      toast.error(tArchive('unarchiveError'));
    }
  };

  const handleBatchUnarchive = useCallback(async () => {
    const idsToUnarchive = Array.from(selection.selectedIds);
    let successCount = 0;
    let failCount = 0;

    for (const id of idsToUnarchive) {
      try {
        await updateBudget({ id, data: { is_active: true } }).unwrap();
        successCount++;
      } catch (error) {
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(tArchive('batchUnarchiveSuccess', { count: successCount }));
    }
    if (failCount > 0) {
      toast.error(tArchive('batchUnarchiveError', { count: failCount }));
    }

    selection.clear();
  }, [selection, updateBudget, tArchive]);

  const handleDelete = (id: string) => {
    setDeletingBudgetId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingBudgetId) return;

    try {
      await deleteBudget(deletingBudgetId).unwrap();
      toast.success(tOverview('deleteSuccess'));
      setDeleteDialogOpen(false);
      setDeletingBudgetId(null);
      selection.deselect(deletingBudgetId);
    } catch (error) {
      toast.error(tOverview('deleteError'));
    }
  };

  const handleBatchDelete = () => {
    setBatchDeleteDialogOpen(true);
  };

  const confirmBatchDelete = async () => {
    if (selection.size === 0) return;

    try {
      const result = await batchDeleteBudgets({
        ids: Array.from(selection.selectedIds),
      }).unwrap();

      if (result.failed_ids.length > 0) {
        toast.error(tOverview('batchDeleteError', { count: result.failed_ids.length }));
      } else {
        toast.success(tOverview('batchDeleteSuccess', { count: result.deleted_count }));
      }

      setBatchDeleteDialogOpen(false);
      selection.clear();
    } catch (error) {
      toast.error(tOverview('deleteError'));
    }
  };

  // Set action buttons in layout
  React.useEffect(() => {
    setActions(
      <>
        {selection.size > 0 && (
          <>
            <Button
              onClick={handleBatchUnarchive}
              variant="outline"
              size="default"
              className="w-full sm:w-auto"
            >
              <ArchiveRestore className="mr-2 h-4 w-4" />
              <span className="truncate">{tArchive('unarchiveSelected', { count: selection.size })}</span>
            </Button>
            <Button
              onClick={handleBatchDelete}
              variant="destructive"
              size="default"
              className="w-full sm:w-auto"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              <span className="truncate">{tOverview('deleteSelected', { count: selection.size })}</span>
            </Button>
          </>
        )}
      </>
    );

    return () => setActions(null);
  }, [selection.size, setActions, tArchive, tOverview]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedCategory !== null) count++;
    if (sortField !== 'name' || sortDirection !== 'asc') count++;
    return count;
  }, [selectedCategory, sortField, sortDirection]);

  const isLoading = isLoadingBudgets;
  const hasError = budgetsError;

  if (hasError) {
    return (
      <ApiErrorState
        error={budgetsError}
        onRetry={() => window.location.reload()}
      />
    );
  }

  // Helper function to calculate progress percentage
  const getProgressPercentage = (budget: typeof budgets[0]) => {
    if (budget.percentage_used !== undefined) {
      return Math.min(Number(budget.percentage_used), 100);
    }
    if (budget.spent !== undefined && budget.amount > 0) {
      return Math.min((budget.spent / budget.amount) * 100, 100);
    }
    return 0;
  };

  // Helper function to get progress color
  const getProgressColor = (budget: typeof budgets[0]) => {
    if (budget.is_overspent) return 'bg-red-500';
    const percentage = getProgressPercentage(budget);
    if (percentage >= 80) return 'bg-amber-500';
    return 'bg-green-500';
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Search and Filters */}
      {(budgets.length > 0 || searchQuery || selectedCategory) && (
        <div className="flex items-center gap-2">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder={tArchive('searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-9"
            />
          </div>

          {/* Filters Popover */}
          <ListControlsPopover
            activeFilterCount={activeFilterCount}
            filterSlot={
              <div className="p-2 space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.filter')}</p>

                {/* Category */}
                <div className="space-y-1">
                  <label className="text-sm font-medium">{tCommon('common.category')}</label>
                  <Select
                    value={selectedCategory || 'all'}
                    onValueChange={(value) => setSelectedCategory(value === 'all' ? null : value)}
                  >
                    <SelectTrigger className="h-8 w-full text-sm">
                      <SelectValue placeholder={tOverview('allCategories')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{tOverview('allCategories')}</SelectItem>
                      {uniqueCategories.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            }
            sortField={sortField}
            setSortField={setSortField}
            sortDirection={sortDirection}
            setSortDirection={setSortDirection}
            viewMode={viewMode}
            setViewMode={setViewMode}
          />
        </div>
      )}

      {/* Budgets List */}
      <div>
        {isLoading ? (
          <LoadingCards count={6} />
        ) : !budgets || budgets.length === 0 ? (
          <EmptyState
            icon={Archive}
            title={tArchive('noBudgets')}
            description={tArchive('noBudgetsDescription')}
          />
        ) : !filteredBudgets || filteredBudgets.length === 0 ? (
          <EmptyState
            icon={Archive}
            title={tOverview('noFilterResults')}
            description={tArchive('noBudgetsDescription')}
          />
        ) : viewMode === 'card' ? (
          <>
            {filteredBudgets.length > 0 && (
              <div className="flex items-center gap-2 px-1 mb-4">
                <Checkbox
                  checked={selection.isAllSelected(filteredBudgets.length)}
                  onCheckedChange={() => selection.selectAll(filteredBudgets.map((budget) => budget.id))}
                  aria-label={tOverview('selectAll')}
                />
                <span className="text-sm text-muted-foreground">
                  {selection.isAllSelected(filteredBudgets.length) ? tOverview('deselectAll') : tOverview('selectAll')}
                </span>
              </div>
            )}
            <div className="grid gap-3 md:gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredBudgets.map((budget) => {
              const progressPercentage = getProgressPercentage(budget);
              const progressColor = getProgressColor(budget);
              const spent = budget.display_spent ?? budget.spent ?? 0;
              const remaining = budget.display_remaining ?? budget.remaining ?? 0;

              return (
                <Card
                  key={budget.id}
                  className="relative opacity-75 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => router.push(`/dashboard/budgets/${budget.id}`)}
                >
                  <CardHeader className="pb-3 md:pb-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <div onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selection.selectedIds.has(budget.id)}
                            onCheckedChange={() => selection.toggle(budget.id)}
                            aria-label={`Select ${budget.name}`}
                            className="mt-1"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base md:text-lg truncate">{budget.name}</CardTitle>
                          <CardDescription className="mt-1 min-h-[20px] text-xs md:text-sm line-clamp-2">
                            {budget.description || ' '}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs flex-shrink-0">
                        {tArchive('archived')}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2 md:space-y-3">
                      <div>
                        <div className="text-xl md:text-2xl font-bold">
                          <CurrencyDisplay
                            amount={budget.display_amount ?? budget.amount}
                            currency={budget.display_currency ?? budget.currency}
                            showSymbol={true}
                            showCode={false}
                          />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {PERIOD_LABELS[budget.period] || budget.period}
                        </p>
                        <div className="text-[10px] md:text-xs text-muted-foreground mt-1 min-h-[16px]">
                          {budget.display_currency && budget.display_currency !== budget.currency && (
                            <>
                              Original: <CurrencyDisplay
                                amount={budget.amount}
                                currency={budget.currency}
                                showSymbol={true}
                                showCode={false}
                              />
                            </>
                          )}
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="rounded-lg bg-muted p-2 md:p-3 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{tOverview('spent')}</span>
                          <span className="font-semibold">
                            <CurrencyDisplay
                              amount={spent}
                              currency={budget.display_currency ?? budget.currency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </span>
                        </div>
                        <div className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${progressColor}`}
                            style={{ width: `${progressPercentage}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            {progressPercentage.toFixed(1)}% used
                          </span>
                          <span className={remaining >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                            {remaining >= 0 ? (
                              <>
                                <CurrencyDisplay
                                  amount={remaining}
                                  currency={budget.display_currency ?? budget.currency}
                                  showSymbol={true}
                                  showCode={false}
                                /> left
                              </>
                            ) : (
                              <>
                                <CurrencyDisplay
                                  amount={Math.abs(remaining)}
                                  currency={budget.display_currency ?? budget.currency}
                                  showSymbol={true}
                                  showCode={false}
                                /> over
                              </>
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="rounded-lg bg-muted p-2 md:p-3 min-h-[60px] flex items-center justify-center">
                        <p className="text-[10px] md:text-xs text-muted-foreground text-center">
                          Period: {budget.start_date.split('T')[0]}
                          {budget.end_date ? ` to ${budget.end_date.split('T')[0]}` : ' (ongoing)'}
                        </p>
                      </div>

                      <div className="min-h-[24px]">
                        {budget.category && (
                          <Badge variant="outline" className="text-xs flex-shrink-0">{budget.category}</Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            </div>
          </>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={selection.isAllSelected(filteredBudgets.length) && filteredBudgets.length > 0}
                        onCheckedChange={() => selection.selectAll(filteredBudgets.map((budget) => budget.id))}
                        aria-label={tOverview('selectAll')}
                      />
                    </TableHead>
                    <TableHead className="w-[200px]">{tOverview('name')}</TableHead>
                    <TableHead className="hidden md:table-cell">{tOverview('description')}</TableHead>
                    <TableHead className="hidden lg:table-cell">{tOverview('category')}</TableHead>
                    <TableHead className="text-right">{tOverview('budgetedAmount')}</TableHead>
                    <TableHead className="text-right">{tOverview('spent')}</TableHead>
                    <TableHead className="text-right">{tOverview('remaining')}</TableHead>
                    <TableHead className="hidden sm:table-cell">{tOverview('period')}</TableHead>
                    <TableHead className="hidden xl:table-cell">{tOverview('dateRange')}</TableHead>
                    <TableHead className="hidden 2xl:table-cell">{tArchive('progress')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBudgets.map((budget) => {
                    const progressPercentage = getProgressPercentage(budget);
                    const progressColor = getProgressColor(budget);
                    const spent = budget.display_spent ?? budget.spent ?? 0;
                    const remaining = budget.display_remaining ?? budget.remaining ?? 0;

                    return (
                      <TableRow
                        key={budget.id}
                        className="opacity-75 cursor-pointer"
                        onClick={() => router.push(`/dashboard/budgets/${budget.id}`)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selection.selectedIds.has(budget.id)}
                            onCheckedChange={() => selection.toggle(budget.id)}
                            aria-label={`Select ${budget.name}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="max-w-[200px]">
                            <p className="truncate">{budget.name}</p>
                            <p className="text-xs text-muted-foreground md:hidden truncate">
                              {budget.description}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <p className="max-w-[250px] truncate text-sm text-muted-foreground">
                            {budget.description || '-'}
                          </p>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {budget.category ? (
                            <Badge variant="outline" className="text-xs">{budget.category}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          <CurrencyDisplay
                            amount={budget.display_amount ?? budget.amount}
                            currency={budget.display_currency ?? budget.currency}
                            showSymbol={true}
                            showCode={false}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-sm">
                            <CurrencyDisplay
                              amount={spent}
                              currency={budget.display_currency ?? budget.currency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`text-sm ${remaining >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            <CurrencyDisplay
                              amount={Math.abs(remaining)}
                              currency={budget.display_currency ?? budget.currency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </span>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <span className="text-sm text-muted-foreground">
                            {PERIOD_LABELS[budget.period] || budget.period}
                          </span>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          <span className="text-sm text-muted-foreground">
                            {budget.start_date.split('T')[0]}
                            {budget.end_date ? ` to ${budget.end_date.split('T')[0]}` : ' (ongoing)'}
                          </span>
                        </TableCell>
                        <TableCell className="hidden 2xl:table-cell">
                          <div className="space-y-1 min-w-[120px]">
                            <div className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all ${progressColor}`}
                                style={{ width: `${progressPercentage}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {progressPercentage.toFixed(1)}%
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        title={tArchive('deleteConfirmTitle')}
        description={tArchive('deleteConfirmDescription')}
        cancelLabel={tActions('cancel')}
        deleteLabel={tActions('delete')}
        deletingLabel={tCommon('actions.deleting')}
        isDeleting={isDeleting}
      />

      {/* Batch Delete Confirmation Dialog */}
      <BatchDeleteConfirmDialog
        open={batchDeleteDialogOpen}
        onOpenChange={setBatchDeleteDialogOpen}
        onConfirm={confirmBatchDelete}
        count={selection.size}
        itemName="budget"
        isDeleting={isBatchDeleting}
      />
    </div>
  );
}
