/**
 * Budgets Archive Page
 * Displays archived budgets with unarchive functionality
 */
'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Archive, ArchiveRestore, Trash2, LayoutGrid, List } from 'lucide-react';
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
import { SearchFilter, filterBySearchAndCategory } from '@/components/ui/search-filter';
import { SortFilter, sortItems, type SortField, type SortDirection } from '@/components/ui/sort-filter';
import { CurrencyDisplay } from '@/components/currency';
import { useViewPreferences } from '@/lib/hooks/use-view-preferences';
import { BudgetsActionsContext } from '../context';

const PERIOD_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

export default function BudgetsArchivePage() {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingBudgetId, setDeletingBudgetId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedBudgetIds, setSelectedBudgetIds] = useState<Set<string>>(new Set());
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);

  // Use default view preferences from user settings
  const { viewMode, setViewMode } = useViewPreferences();

  // Context to set action buttons in layout
  const { setActions } = React.useContext(BudgetsActionsContext);

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
      toast.success('Budget unarchived successfully');
      setSelectedBudgetIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    } catch (error) {
      console.error('Failed to unarchive budget:', error);
      toast.error('Failed to unarchive budget');
    }
  };

  const handleBatchUnarchive = useCallback(async () => {
    const idsToUnarchive = Array.from(selectedBudgetIds);
    let successCount = 0;
    let failCount = 0;

    for (const id of idsToUnarchive) {
      try {
        await updateBudget({ id, data: { is_active: true } }).unwrap();
        successCount++;
      } catch (error) {
        console.error(`Failed to unarchive budget ${id}:`, error);
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(`Successfully unarchived ${successCount} budget(s)`);
    }
    if (failCount > 0) {
      toast.error(`Failed to unarchive ${failCount} budget(s)`);
    }

    setSelectedBudgetIds(new Set());
  }, [selectedBudgetIds, updateBudget]);

  const handleDelete = (id: string) => {
    setDeletingBudgetId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingBudgetId) return;

    try {
      await deleteBudget(deletingBudgetId).unwrap();
      toast.success('Budget deleted permanently');
      setDeleteDialogOpen(false);
      setDeletingBudgetId(null);
      setSelectedBudgetIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(deletingBudgetId);
        return newSet;
      });
    } catch (error) {
      console.error('Failed to delete budget:', error);
      toast.error('Failed to delete budget');
    }
  };

  const handleToggleSelect = (budgetId: string) => {
    setSelectedBudgetIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(budgetId)) {
        newSet.delete(budgetId);
      } else {
        newSet.add(budgetId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedBudgetIds.size === filteredBudgets.length && filteredBudgets.length > 0) {
      setSelectedBudgetIds(new Set());
    } else {
      setSelectedBudgetIds(new Set(filteredBudgets.map((budget) => budget.id)));
    }
  };

  const handleBatchDelete = () => {
    setBatchDeleteDialogOpen(true);
  };

  const confirmBatchDelete = async () => {
    if (selectedBudgetIds.size === 0) return;

    try {
      const result = await batchDeleteBudgets({
        ids: Array.from(selectedBudgetIds),
      }).unwrap();

      if (result.failed_ids.length > 0) {
        toast.error(`Failed to delete ${result.failed_ids.length} budget(s)`);
      } else {
        toast.success(`Successfully deleted ${result.deleted_count} budget(s) permanently`);
      }

      setBatchDeleteDialogOpen(false);
      setSelectedBudgetIds(new Set());
    } catch (error) {
      console.error('Failed to delete budgets:', error);
      toast.error('Failed to delete budgets');
    }
  };

  // Set action buttons in layout
  React.useEffect(() => {
    setActions(
      <>
        {selectedBudgetIds.size > 0 && (
          <>
            <Button
              onClick={handleBatchUnarchive}
              variant="outline"
              size="default"
              className="w-full sm:w-auto"
            >
              <ArchiveRestore className="mr-2 h-4 w-4" />
              <span className="truncate">Unarchive Selected ({selectedBudgetIds.size})</span>
            </Button>
            <Button
              onClick={handleBatchDelete}
              variant="destructive"
              size="default"
              className="w-full sm:w-auto"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              <span className="truncate">Delete Selected ({selectedBudgetIds.size})</span>
            </Button>
          </>
        )}
      </>
    );

    return () => setActions(null);
  }, [selectedBudgetIds.size, setActions, handleBatchUnarchive]);

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
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex-1">
            <SearchFilter
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
              categories={uniqueCategories}
              searchPlaceholder="Search archived budgets..."
              categoryPlaceholder="All Categories"
            />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <SortFilter
              sortField={sortField}
              sortDirection={sortDirection}
              onSortFieldChange={setSortField}
              onSortDirectionChange={setSortDirection}
            />
            <div className="inline-flex items-center gap-1 border rounded-md p-0.5 w-fit self-end" style={{ height: '36px' }}>
              <Button
                variant={viewMode === 'card' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('card')}
                className="h-[32px] w-[32px] p-0"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                className="h-[32px] w-[32px] p-0"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Budgets List */}
      <div>
        {isLoading ? (
          <LoadingCards count={6} />
        ) : !budgets || budgets.length === 0 ? (
          <EmptyState
            icon={Archive}
            title="No archived budgets"
            description="Archived budgets will appear here"
          />
        ) : !filteredBudgets || filteredBudgets.length === 0 ? (
          <EmptyState
            icon={Archive}
            title="No archived budgets found"
            description="Try adjusting your search or filters"
          />
        ) : viewMode === 'card' ? (
          <>
            {filteredBudgets.length > 0 && (
              <div className="flex items-center gap-2 px-1 mb-4">
                <Checkbox
                  checked={selectedBudgetIds.size === filteredBudgets.length}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all budgets"
                />
                <span className="text-sm text-muted-foreground">
                  {selectedBudgetIds.size === filteredBudgets.length ? 'Deselect all' : 'Select all'}
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
                <Card key={budget.id} className="relative opacity-75">
                  <CardHeader className="pb-3 md:pb-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <Checkbox
                          checked={selectedBudgetIds.has(budget.id)}
                          onCheckedChange={() => handleToggleSelect(budget.id)}
                          aria-label={`Select ${budget.name}`}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base md:text-lg truncate">{budget.name}</CardTitle>
                          <CardDescription className="mt-1 min-h-[20px] text-xs md:text-sm line-clamp-2">
                            {budget.description || ' '}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs flex-shrink-0">
                        Archived
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
                          <span className="text-muted-foreground">Spent</span>
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

                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUnarchive(budget.id)}
                        >
                          <ArchiveRestore className="mr-1 h-3 w-3" />
                          Unarchive
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(budget.id)}
                          disabled={isDeleting}
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
                          Delete
                        </Button>
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
                        checked={selectedBudgetIds.size === filteredBudgets.length && filteredBudgets.length > 0}
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead className="w-[200px]">Name</TableHead>
                    <TableHead className="hidden md:table-cell">Description</TableHead>
                    <TableHead className="hidden lg:table-cell">Category</TableHead>
                    <TableHead className="text-right">Budget</TableHead>
                    <TableHead className="text-right">Spent</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead className="hidden sm:table-cell">Period</TableHead>
                    <TableHead className="hidden xl:table-cell">Date Range</TableHead>
                    <TableHead className="hidden 2xl:table-cell">Progress</TableHead>
                    <TableHead className="text-right w-[180px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBudgets.map((budget) => {
                    const progressPercentage = getProgressPercentage(budget);
                    const progressColor = getProgressColor(budget);
                    const spent = budget.display_spent ?? budget.spent ?? 0;
                    const remaining = budget.display_remaining ?? budget.remaining ?? 0;

                    return (
                      <TableRow key={budget.id} className="opacity-75">
                        <TableCell>
                          <Checkbox
                            checked={selectedBudgetIds.has(budget.id)}
                            onCheckedChange={() => handleToggleSelect(budget.id)}
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
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleUnarchive(budget.id)}
                              className="h-8 w-8 p-0"
                            >
                              <ArchiveRestore className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(budget.id)}
                              disabled={isDeleting}
                              className="h-8 w-8 p-0"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
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
        title="Delete Budget Permanently"
        description="This will permanently delete this budget. This action cannot be undone."
        itemName="budget"
        isDeleting={isDeleting}
      />

      {/* Batch Delete Confirmation Dialog */}
      <BatchDeleteConfirmDialog
        open={batchDeleteDialogOpen}
        onOpenChange={setBatchDeleteDialogOpen}
        onConfirm={confirmBatchDelete}
        count={selectedBudgetIds.size}
        itemName="budget"
        isDeleting={isBatchDeleting}
      />
    </div>
  );
}
