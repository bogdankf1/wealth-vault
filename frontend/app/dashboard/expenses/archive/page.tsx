/**
 * Expense Archive Page
 * Displays archived expenses with unarchive functionality
 */
'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, Trash2, LayoutGrid, List, Filter, Search, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import {
  useListExpensesQuery,
  useUpdateExpenseMutation,
  useDeleteExpenseMutation,
  useBatchDeleteExpensesMutation,
} from '@/lib/api/expensesApi';
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
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { CurrencyDisplay } from '@/components/currency';
import { useViewPreferences } from '@/lib/hooks/use-view-preferences';
import { ExpenseActionsContext } from '../context';

export default function ExpensesArchivePage() {
  const router = useRouter();
  const tArchive = useTranslations('expenses.archive');
  const tOverview = useTranslations('expenses.overview');
  const tActions = useTranslations('expenses.actions');
  const tFrequency = useTranslations('expenses.frequency');
  const tCommon = useTranslations('common');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(new Set());
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);

  // Use default view preferences from user settings
  const { viewMode, setViewMode } = useViewPreferences();

  // Context to set action buttons in layout
  const { setActions } = React.useContext(ExpenseActionsContext);

  // Fetch only archived expenses (is_active: false)
  const {
    data: expensesData,
    isLoading: isLoadingExpenses,
    error: expensesError,
  } = useListExpensesQuery({ is_active: false });

  const [updateExpense] = useUpdateExpenseMutation();
  const [deleteExpense, { isLoading: isDeleting }] = useDeleteExpenseMutation();
  const [batchDeleteExpenses, { isLoading: isBatchDeleting }] = useBatchDeleteExpensesMutation();

  const expenses = useMemo(() => expensesData?.items || [], [expensesData?.items]);

  // Get unique categories
  const uniqueCategories = React.useMemo(() => {
    const categories = expenses
      .map((expense) => expense.category)
      .filter((cat): cat is string => !!cat);
    return Array.from(new Set(categories)).sort();
  }, [expenses]);

  // Filter and sort expenses
  const filteredExpenses = React.useMemo(() => {
    const filtered = filterBySearchAndCategory(
      expenses,
      searchQuery,
      selectedCategory,
      (expense) => expense.name,
      (expense) => expense.category || undefined
    );

    // Apply sorting
    const sorted = sortItems(
      filtered,
      sortField,
      sortDirection,
      (expense) => expense.name,
      (expense) => expense.display_amount || expense.amount,
      (expense) => expense.date || expense.start_date || expense.created_at
    );

    return sorted || [];
  }, [expenses, searchQuery, selectedCategory, sortField, sortDirection]);

  const handleUnarchive = async (id: string) => {
    try {
      await updateExpense({ id, data: { is_active: true } }).unwrap();
      toast.success(tArchive('unarchiveSuccess'));
      setSelectedExpenseIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    } catch (error) {
      toast.error(tArchive('unarchiveError'));
    }
  };

  const handleBatchUnarchive = useCallback(async () => {
    const idsToUnarchive = Array.from(selectedExpenseIds);
    let successCount = 0;
    let failCount = 0;

    for (const id of idsToUnarchive) {
      try {
        await updateExpense({ id, data: { is_active: true } }).unwrap();
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

    setSelectedExpenseIds(new Set());
  }, [selectedExpenseIds, updateExpense, tArchive]);

  const handleDelete = (id: string) => {
    setDeletingExpenseId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingExpenseId) return;

    try {
      await deleteExpense(deletingExpenseId).unwrap();
      toast.success(tArchive('deleteSuccess'));
      setDeleteDialogOpen(false);
      setDeletingExpenseId(null);
      setSelectedExpenseIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(deletingExpenseId);
        return newSet;
      });
    } catch (error) {
      toast.error(tArchive('deleteError'));
    }
  };

  const handleToggleSelect = (expenseId: string) => {
    setSelectedExpenseIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(expenseId)) {
        newSet.delete(expenseId);
      } else {
        newSet.add(expenseId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedExpenseIds.size === filteredExpenses.length && filteredExpenses.length > 0) {
      setSelectedExpenseIds(new Set());
    } else {
      setSelectedExpenseIds(new Set(filteredExpenses.map((expense) => expense.id)));
    }
  };

  const handleBatchDelete = () => {
    setBatchDeleteDialogOpen(true);
  };

  const confirmBatchDelete = async () => {
    if (selectedExpenseIds.size === 0) return;

    try {
      const result = await batchDeleteExpenses({
        expense_ids: Array.from(selectedExpenseIds),
      }).unwrap();

      if (result.failed_ids.length > 0) {
        toast.error(tArchive('batchDeleteError', { count: result.failed_ids.length }));
      } else {
        toast.success(tArchive('batchDeleteSuccess', { count: result.deleted_count }));
      }

      setBatchDeleteDialogOpen(false);
      setSelectedExpenseIds(new Set());
    } catch (error) {
      toast.error(tArchive('deleteError'));
    }
  };

  // Set action buttons in layout
  React.useEffect(() => {
    setActions(
      <>
        {selectedExpenseIds.size > 0 && (
          <>
            <Button
              onClick={handleBatchUnarchive}
              variant="outline"
              size="default"
              className="w-full sm:w-auto"
            >
              <ArchiveRestore className="mr-2 h-4 w-4" />
              <span className="truncate">{tArchive('unarchiveSelected', { count: selectedExpenseIds.size })}</span>
            </Button>
            <Button
              onClick={handleBatchDelete}
              variant="destructive"
              size="default"
              className="w-full sm:w-auto"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              <span className="truncate">{tOverview('deleteSelected', { count: selectedExpenseIds.size })}</span>
            </Button>
          </>
        )}
      </>
    );

    return () => setActions(null);
  }, [selectedExpenseIds.size, setActions, handleBatchUnarchive, tArchive, tOverview]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedCategory !== null) count++;
    if (sortField !== 'name' || sortDirection !== 'asc') count++;
    return count;
  }, [selectedCategory, sortField, sortDirection]);

  const isLoading = isLoadingExpenses;
  const hasError = expensesError;

  if (hasError) {
    return (
      <ApiErrorState
        error={expensesError}
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Search and Filters */}
      {(expenses.length > 0 || searchQuery || selectedCategory) && (
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
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
            <PopoverContent className="w-72 p-0" align="end">
              {/* Filter section */}
              <div className="p-3 space-y-3">
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

              <Separator />

              {/* Sort section */}
              <div className="p-3 space-y-3">
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
              <div className="p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.view')}</p>
                <div className="inline-flex items-center gap-1 border rounded-md p-0.5" style={{ height: '36px' }}>
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
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Expense List */}
      <div>
        {isLoading ? (
          <LoadingCards count={6} />
        ) : !expenses || expenses.length === 0 ? (
          <EmptyState
            icon={Archive}
            title={tArchive('noArchived')}
            description={tArchive('noArchivedDescription')}
          />
        ) : !filteredExpenses || filteredExpenses.length === 0 ? (
          <EmptyState
            icon={Archive}
            title={tArchive('noFound')}
            description={tArchive('noFoundDescription')}
          />
        ) : viewMode === 'card' ? (
          <>
            {filteredExpenses.length > 0 && (
              <div className="flex items-center gap-2 px-1 mb-4">
                <Checkbox
                  checked={selectedExpenseIds.size === filteredExpenses.length}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all expenses"
                />
                <span className="text-sm text-muted-foreground">
                  {selectedExpenseIds.size === filteredExpenses.length ? tOverview('deselectAll') : tOverview('selectAll')}
                </span>
              </div>
            )}
            <div className="grid gap-3 md:gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredExpenses.map((expense) => (
              <Card
                key={expense.id}
                className="relative opacity-75 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => router.push(`/dashboard/expenses/${expense.id}`)}
              >
                <CardHeader className="pb-3 md:pb-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedExpenseIds.has(expense.id)}
                          onCheckedChange={() => handleToggleSelect(expense.id)}
                          aria-label={`Select ${expense.name}`}
                          className="mt-1"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base md:text-lg truncate">{expense.name}</CardTitle>
                        <CardDescription className="mt-1 min-h-[20px] text-xs md:text-sm line-clamp-2">
                          {expense.description || ' '}
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
                          amount={expense.display_amount ?? expense.amount}
                          currency={expense.display_currency ?? expense.currency}
                          showSymbol={true}
                          showCode={false}
                        />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {tFrequency(expense.frequency as 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annually' | 'one_time')}
                      </p>
                      <div className="text-[10px] md:text-xs text-muted-foreground mt-1 min-h-[16px]">
                        {expense.display_currency && expense.display_currency !== expense.currency && (
                          <>
                            {tArchive('original')}: <CurrencyDisplay
                              amount={expense.amount}
                              currency={expense.currency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </>
                        )}
                      </div>
                    </div>

                    <div className="rounded-lg bg-muted p-2 md:p-3 min-h-[60px] flex items-center justify-center">
                      <p className="text-[10px] md:text-xs text-muted-foreground">
                        {(() => {
                          const date = expense.date || expense.start_date;
                          return date
                            ? new Date(date).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })
                            : '-';
                        })()}
                      </p>
                    </div>

                    <div className="min-h-[24px]">
                      {expense.category && (
                        <Badge variant="outline" className="text-xs flex-shrink-0">{expense.category}</Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
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
                        checked={selectedExpenseIds.size === filteredExpenses.length && filteredExpenses.length > 0}
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead className="w-[200px]">{tArchive('name')}</TableHead>
                    <TableHead className="hidden md:table-cell">{tArchive('description')}</TableHead>
                    <TableHead className="hidden lg:table-cell">{tArchive('category')}</TableHead>
                    <TableHead className="text-right">{tArchive('amount')}</TableHead>
                    <TableHead className="hidden sm:table-cell">{tArchive('frequency')}</TableHead>
                    <TableHead className="hidden xl:table-cell">{tArchive('date')}</TableHead>
                    <TableHead className="hidden 2xl:table-cell text-right">{tArchive('originalAmount')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExpenses.map((expense) => (
                    <TableRow
                      key={expense.id}
                      className="opacity-75 cursor-pointer"
                      onClick={() => router.push(`/dashboard/expenses/${expense.id}`)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedExpenseIds.has(expense.id)}
                          onCheckedChange={() => handleToggleSelect(expense.id)}
                          aria-label={`Select ${expense.name}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="max-w-[200px]">
                          <p className="truncate">{expense.name}</p>
                          <p className="text-xs text-muted-foreground md:hidden truncate">
                            {expense.description}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <p className="max-w-[250px] truncate text-sm text-muted-foreground">
                          {expense.description || '-'}
                        </p>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {expense.category ? (
                          <Badge variant="outline" className="text-xs">{expense.category}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        <CurrencyDisplay
                          amount={expense.display_amount ?? expense.amount}
                          currency={expense.display_currency ?? expense.currency}
                          showSymbol={true}
                          showCode={false}
                        />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="text-sm text-muted-foreground">
                          {tFrequency(expense.frequency as 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annually' | 'one_time')}
                        </span>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <span className="text-sm text-muted-foreground">
                          {(() => {
                            const date = expense.date || expense.start_date;
                            return date
                              ? new Date(date).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })
                              : '-';
                          })()}
                        </span>
                      </TableCell>
                      <TableCell className="hidden 2xl:table-cell text-right">
                        {expense.display_currency && expense.display_currency !== expense.currency ? (
                          <span className="text-sm text-muted-foreground">
                            {expense.amount} {expense.currency}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
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
        count={selectedExpenseIds.size}
        itemName="expense"
        isDeleting={isBatchDeleting}
      />
    </div>
  );
}
