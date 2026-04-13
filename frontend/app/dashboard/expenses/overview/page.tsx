/**
 * Expense Tracking Page
 * Displays user's expenses with statistics
 */
'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { DollarSign, Trash2, Archive, LayoutGrid, List, CalendarDays, Layers, Upload, Plus, Play, Filter, Search, ArrowUp, ArrowDown, Lock, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import {
  useListExpensesQuery,
  useGetExpenseStatsQuery,
  useUpdateExpenseMutation,
  useDeleteExpenseMutation,
  useBatchDeleteExpensesMutation,
  useProcessExpenseDuePaymentsMutation,
} from '@/lib/api/expensesApi';
import { Button } from '@/components/ui/button';
import { SplitButton } from '@/components/ui/split-button';
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
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { ExpenseForm } from '@/components/expenses/expense-form';
import { BatchExpenseForm } from '@/components/expenses/batch-expense-form';
import { filterByMonth } from '@/components/ui/month-filter';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { BatchDeleteConfirmDialog } from '@/components/ui/batch-delete-confirm-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { filterBySearchAndCategory } from '@/components/ui/search-filter';
import { sortItems, type SortField, type SortDirection } from '@/components/ui/sort-filter';
import { CurrencyDisplay } from '@/components/currency';
import { useViewPreferences } from '@/lib/hooks/use-view-preferences';
import { useColumnVisibility, type ColumnConfig } from '@/lib/hooks/use-column-visibility';
import { CalendarView } from '@/components/ui/calendar-view';
import { ExpenseActionsContext } from '../context';
import { CATEGORY_NAME_TO_KEY, EXPENSE_CATEGORY_KEYS } from '@/lib/constants/expense-categories';
import { useGetUserFeaturesQuery } from '@/lib/api/authApi';
import { FEATURE_REQUIREMENTS } from '@/lib/constants/feature-map';

export default function ExpensesPage() {
  const router = useRouter();
  const tOverview = useTranslations('expenses.overview');
  const tActions = useTranslations('expenses.actions');
  const tStatus = useTranslations('expenses.status');
  const tFrequency = useTranslations('expenses.frequency');
  const tCommon = useTranslations('common');
  const tCategories = useTranslations('expenses.categories');

  // Helper to translate category (handles both new keys and legacy names)
  const translateCategory = (category: string | undefined | null): string => {
    if (!category) return '';
    // Check if it's already a translation key
    if (EXPENSE_CATEGORY_KEYS.includes(category as typeof EXPENSE_CATEGORY_KEYS[number])) {
      return tCategories(category as typeof EXPENSE_CATEGORY_KEYS[number]);
    }
    // Check if it's a legacy name that needs conversion
    const key = CATEGORY_NAME_TO_KEY[category];
    if (key) {
      return tCategories(key);
    }
    // Fallback to original value
    return category;
  };
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isBatchFormOpen, setIsBatchFormOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);

  // Get user features for batch operations check
  const { data: userFeatures } = useGetUserFeaturesQuery();
  const hasBatchOperations = userFeatures?.features[FEATURE_REQUIREMENTS.batch_operations]?.enabled ?? false;

  // Use default view preferences from user settings
  const { viewMode, setViewMode } = useViewPreferences();
  // Column configuration for list view
  const columnConfig: ColumnConfig[] = React.useMemo(() => [
    { id: 'name', label: tOverview('table.name'), locked: true },
    { id: 'description', label: tOverview('table.description') },
    { id: 'category', label: tOverview('table.category') },
    { id: 'amount', label: tOverview('table.amount') },
    { id: 'frequency', label: tOverview('table.frequency') },
    { id: 'date', label: tOverview('table.date') },
    { id: 'monthlyEquiv', label: tOverview('table.monthlyEquiv') },
    { id: 'originalAmount', label: tOverview('table.originalAmount') },
    { id: 'status', label: tOverview('table.status') },
  ], [tOverview]);

  const {
    visibleColumns,
    toggleColumn,
    showAllColumns,
    isColumnVisible,
  } = useColumnVisibility('expenses', columnConfig);

  // Context to set action buttons in layout
  const { setActions } = React.useContext(ExpenseActionsContext);

  // Default to current month in YYYY-MM format
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(currentMonth);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(new Set());
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);


  const {
    data: expensesData,
    isLoading: isLoadingExpenses,
    error: expensesError,
    refetch: refetchExpenses,
  } = useListExpensesQuery({ is_active: true });

  // Calculate date range from selectedMonth
  const statsParams = React.useMemo(() => {
    if (!selectedMonth) return undefined;

    const [year, month] = selectedMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    return {
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
    };
  }, [selectedMonth]);

  const {
    data: stats,
    isLoading: isLoadingStats,
    error: statsError,
  } = useGetExpenseStatsQuery(statsParams);

  const [updateExpense] = useUpdateExpenseMutation();
  const [deleteExpense, { isLoading: isDeleting }] = useDeleteExpenseMutation();
  const [batchDeleteExpenses, { isLoading: isBatchDeleting }] = useBatchDeleteExpensesMutation();
  const [processExpenseDuePayments, { isLoading: isProcessingPayments }] = useProcessExpenseDuePaymentsMutation();

  const handleAddExpense = React.useCallback(() => {
    setEditingExpenseId(null);
    setIsFormOpen(true);
  }, []);

  const handleImportExpenses = React.useCallback(() => {
    router.push('/dashboard/expenses/import');
  }, [router]);

  const handleBatchAddExpense = React.useCallback(() => {
    setIsBatchFormOpen(true);
  }, []);

  const handleProcessDuePayments = React.useCallback(async () => {
    try {
      const result = await processExpenseDuePayments().unwrap();
      if (result.due_count === 0) {
        toast.info(tOverview('noDuePayments'));
      } else if (result.processed > 0) {
        toast.success(tOverview('paymentsProcessed', {
          processed: result.processed,
          autoPaid: result.auto_paid
        }));
      }
      if (result.failed_payments.length > 0) {
        result.failed_payments.forEach((failure) => {
          toast.error(tOverview('paymentFailed', { name: failure.expense_name, reason: failure.reason }));
        });
      }
      refetchExpenses();
    } catch (error) {
      toast.error(tOverview('processPaymentsError'));
    }
  }, [processExpenseDuePayments, refetchExpenses, tOverview]);

  const handleDeleteExpense = (id: string) => {
    setDeletingExpenseId(id);
    setDeleteDialogOpen(true);
  };

  const handleArchiveExpense = async (id: string) => {
    try {
      await updateExpense({ id, data: { is_active: false } }).unwrap();
      toast.success('Expense archived successfully');
      setSelectedExpenseIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    } catch (error) {
      toast.error('Failed to archive expense');
    }
  };

  const handleBatchArchive = React.useCallback(async () => {
    const idsToArchive = Array.from(selectedExpenseIds);
    let successCount = 0;
    let failCount = 0;

    for (const id of idsToArchive) {
      try {
        await updateExpense({ id, data: { is_active: false } }).unwrap();
        successCount++;
      } catch (error) {
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(`Successfully archived ${successCount} expense(s)`);
    }
    if (failCount > 0) {
      toast.error(`Failed to archive ${failCount} expense(s)`);
    }

    setSelectedExpenseIds(new Set());
  }, [selectedExpenseIds, updateExpense]);

  const confirmDelete = async () => {
    if (!deletingExpenseId) return;

    try {
      await deleteExpense(deletingExpenseId).unwrap();
      toast.success('Expense deleted successfully');
      setDeleteDialogOpen(false);
      setDeletingExpenseId(null);
    } catch (error) {
      toast.error('Failed to delete expense');
    }
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingExpenseId(null);
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
    if (selectedExpenseIds.size === filteredExpenses.length) {
      setSelectedExpenseIds(new Set());
    } else {
      setSelectedExpenseIds(new Set(filteredExpenses.map((e) => e.id)));
    }
  };

  const handleBatchDelete = React.useCallback(() => {
    if (selectedExpenseIds.size === 0) return;
    setBatchDeleteDialogOpen(true);
  }, [selectedExpenseIds.size]);

  const confirmBatchDelete = async () => {
    if (selectedExpenseIds.size === 0) return;

    try {
      const result = await batchDeleteExpenses({
        expense_ids: Array.from(selectedExpenseIds),
      }).unwrap();

      if (result.failed_ids.length > 0) {
        toast.error(`Failed to delete ${result.failed_ids.length} expense(s)`);
      } else {
        toast.success(`Successfully deleted ${result.deleted_count} expense(s)`);
      }

      setBatchDeleteDialogOpen(false);
      setSelectedExpenseIds(new Set());
    } catch (error) {
      toast.error('Failed to delete expenses');
    }
  };

  // Get unique categories from expenses
  const uniqueCategories = React.useMemo(() => {
    if (!expensesData?.items) return [];
    const categories = expensesData.items
      .map((expense) => expense.category)
      .filter((cat): cat is string => !!cat);
    return Array.from(new Set(categories)).sort();
  }, [expensesData?.items]);

  // Apply all filters: month -> search/category
  const monthFilteredExpenses = filterByMonth(
    expensesData?.items,
    selectedMonth,
    (expense) => expense.frequency,
    (expense) => expense.date,
    (expense) => expense.start_date,
    (expense) => expense.end_date
  );

  const searchFilteredExpenses = filterBySearchAndCategory(
    monthFilteredExpenses,
    searchQuery,
    selectedCategory,
    (expense) => expense.name,
    (expense) => expense.category
  );

  // Apply sorting (using display_amount for currency-aware sorting)
  const filteredExpenses = sortItems(
    searchFilteredExpenses,
    sortField,
    sortDirection,
    (expense) => expense.name,
    (expense) => expense.display_monthly_equivalent || expense.display_amount || expense.amount,
    (expense) => expense.start_date || expense.date
  ) || [];

  // Set action buttons in layout
  React.useEffect(() => {
    setActions(
      <>
        {selectedExpenseIds.size > 0 && (
          <>
            <Button
              onClick={handleBatchArchive}
              variant="outline"
              size="default"
              className="w-full sm:w-auto"
            >
              <Archive className="mr-2 h-4 w-4" />
              <span className="truncate">{tOverview('archiveSelected', { count: selectedExpenseIds.size })}</span>
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
        <SplitButton
          primaryLabel={tOverview('importExpenses')}
          onPrimaryClick={handleImportExpenses}
          primaryIcon={<Upload className="h-4 w-4" />}
          options={[
            {
              label: tOverview('addManually'),
              onClick: handleAddExpense,
              icon: <Plus className="h-4 w-4" />,
            },
            ...(hasBatchOperations
              ? [
                  {
                    label: tOverview('batchAddExpense'),
                    onClick: handleBatchAddExpense,
                    icon: <Layers className="h-4 w-4" />,
                  },
                ]
              : []),
            {
              label: isProcessingPayments ? tOverview('processingPayments') : tOverview('processDuePayments'),
              onClick: handleProcessDuePayments,
              icon: <Play className="h-4 w-4" />,
              disabled: isProcessingPayments,
            },
          ]}
          className="w-full sm:w-auto"
        />
      </>
    );

    // Cleanup on unmount
    return () => setActions(null);
  }, [selectedExpenseIds.size, setActions, handleBatchArchive, handleBatchDelete, handleAddExpense, handleImportExpenses, handleBatchAddExpense, handleProcessDuePayments, isProcessingPayments, hasBatchOperations, tOverview]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedCategory !== null) count++;
    if (selectedMonth !== null) count++;
    if (sortField !== 'name' || sortDirection !== 'asc') count++;
    return count;
  }, [selectedCategory, selectedMonth, sortField, sortDirection]);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Search and Filters */}
      {(expensesData?.items && expensesData.items.length > 0) && (
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          {/* Search + Filter grouped together */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder={tOverview('searchPlaceholder')}
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
            <PopoverContent className="w-64 p-0" align="end">
              {/* Filter section */}
              <div className="p-2 space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.filter')}</p>

                {/* Category */}
                <div className="space-y-1">
                  <label className="text-sm font-medium">{tOverview('table.category')}</label>
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
                          {translateCategory(category)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Month */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">{tCommon('common.month')}</label>
                    {selectedMonth && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedMonth(null)}
                        className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3 mr-1" />
                        {tCommon('common.clear')}
                      </Button>
                    )}
                  </div>
                  <input
                    type="month"
                    value={selectedMonth || ''}
                    onChange={(e) => setSelectedMonth(e.target.value || null)}
                    onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                    min="2020-01"
                    max="2030-12"
                    className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm cursor-pointer ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
              </div>

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
                    title="Card View"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                    className="h-[32px] w-[32px] p-0"
                    title="List View"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  {selectedMonth && (
                    <Button
                      variant={viewMode === 'calendar' ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode('calendar')}
                      className="h-[32px] w-[32px] p-0"
                      title="Calendar View"
                    >
                      <CalendarDays className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Columns section (list view only) */}
              {viewMode === 'list' && (
                <>
                  <Separator />
                  <div className="p-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.columns')}</p>
                      {Object.values(visibleColumns).filter(Boolean).length < columnConfig.length && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                          onClick={showAllColumns}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          {tCommon('common.showAll')}
                        </Button>
                      )}
                    </div>
                    <div className="space-y-1">
                      {columnConfig.map((column) => (
                        <label
                          key={column.id}
                          className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                            column.locked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-muted'
                          }`}
                        >
                          <Checkbox
                            checked={visibleColumns[column.id] ?? true}
                            onCheckedChange={() => toggleColumn(column.id)}
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
          </div>

          {/* Inline stats */}
          {stats && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground flex-shrink-0 max-w-xs">
              <span><span className="font-semibold text-foreground">{stats.total_expenses}</span> expenses</span>
              <span>·</span>
              <span><span className="font-semibold text-foreground"><CurrencyDisplay amount={stats.total_monthly_expense} currency={stats.currency} decimals={0} /></span>/mo</span>
              <span>·</span>
              <span><span className="font-semibold text-foreground"><CurrencyDisplay amount={stats.total_annual_expense} currency={stats.currency} decimals={0} /></span>/yr</span>
            </div>
          )}
        </div>
      )}

      {/* Expenses List */}
      <div>
        {isLoadingExpenses ? (
          <LoadingCards count={3} />
        ) : expensesError ? (
          <ApiErrorState error={expensesError} onRetry={refetchExpenses} />
        ) : !expensesData?.items || expensesData.items.length === 0 ? (
          <EmptyState
            icon={DollarSign}
            title={tOverview('noExpenses')}
            description={tOverview('noExpensesDescription')}
            actionLabel={tOverview('importExpenses')}
            onAction={handleImportExpenses}
          />
        ) : viewMode === 'calendar' && selectedMonth ? (
          <CalendarView
            items={filteredExpenses.map((expense) => ({
              id: expense.id,
              name: expense.name,
              amount: expense.amount,
              currency: expense.currency,
              display_amount: expense.display_amount,
              display_currency: expense.display_currency,
              category: expense.category,
              date: expense.date,
              start_date: expense.start_date,
              frequency: expense.frequency,
              is_active: expense.is_active,
            }))}
            selectedMonth={selectedMonth}
            onMonthChange={setSelectedMonth}
            onItemClick={(id) => router.push(`/dashboard/expenses/${id}`)}
            selectedItemIds={selectedExpenseIds}
            onToggleSelect={handleToggleSelect}
          />
        ) : !filteredExpenses || filteredExpenses.length === 0 ? (
          <EmptyState
            icon={DollarSign}
            title={selectedMonth ? tOverview('noExpensesForMonth') : tOverview('noExpenses')}
            description={selectedMonth
              ? tOverview('noExpensesForMonthDescription', { month: new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) })
              : tOverview('noExpensesDescription')
            }
            actionLabel={tOverview('importExpenses')}
            onAction={handleImportExpenses}
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
                className="relative cursor-pointer hover:shadow-md transition-shadow"
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
                          {expense.description ? (
                            expense.description.startsWith('Imported from ')
                              ? tOverview('importedFrom', { source: expense.description.replace('Imported from ', '') })
                              : expense.description
                          ) : <>&nbsp;</>}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant={expense.is_active ? 'default' : 'secondary'} className="text-xs flex-shrink-0">
                      {expense.is_active ? tStatus('active') : tStatus('inactive')}
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
                        {tFrequency(expense.frequency)}
                        {expense.display_currency && expense.display_currency !== expense.currency && (
                          <span className="ml-1 text-xs">
                            ({tOverview('orig')}: {expense.amount} {expense.currency})
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="rounded-lg bg-muted p-2 md:p-3 min-h-[60px]">
                      {(expense.display_monthly_equivalent ?? expense.monthly_equivalent) ? (
                        <>
                          <p className="text-[10px] md:text-xs text-muted-foreground">
                            {tOverview('monthlyEquivalent')}
                          </p>
                          <p className="text-sm font-semibold">
                            <CurrencyDisplay
                              amount={expense.display_monthly_equivalent ?? expense.monthly_equivalent ?? 0}
                              currency={expense.display_currency ?? expense.currency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </p>
                        </>
                      ) : (
                        <p className="text-[10px] md:text-xs text-muted-foreground">&nbsp;</p>
                      )}
                    </div>

                    <div className="rounded-lg bg-muted/50 p-2 md:p-3 min-h-[48px]">
                      <p className="text-[10px] md:text-xs text-muted-foreground">
                        {expense.frequency === 'one_time' ? tOverview('date') : tOverview('startDate')}
                      </p>
                      <p className="text-xs md:text-sm font-semibold">
                        {(() => {
                          const dateValue = expense.date || expense.start_date;
                          return dateValue
                            ? new Date(dateValue).toLocaleDateString('en-US', {
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
                        <Badge variant="outline" className="text-xs flex-shrink-0">{translateCategory(expense.category)}</Badge>
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
                    {isColumnVisible('name') && (
                      <TableHead className="w-[200px]">{tOverview('table.name')}</TableHead>
                    )}
                    {isColumnVisible('description') && (
                      <TableHead className="hidden md:table-cell">{tOverview('table.description')}</TableHead>
                    )}
                    {isColumnVisible('category') && (
                      <TableHead className="hidden lg:table-cell">{tOverview('table.category')}</TableHead>
                    )}
                    {isColumnVisible('amount') && (
                      <TableHead className="text-right">{tOverview('table.amount')}</TableHead>
                    )}
                    {isColumnVisible('frequency') && (
                      <TableHead className="hidden sm:table-cell">{tOverview('table.frequency')}</TableHead>
                    )}
                    {isColumnVisible('date') && (
                      <TableHead className="hidden lg:table-cell">{tOverview('table.date')}</TableHead>
                    )}
                    {isColumnVisible('monthlyEquiv') && (
                      <TableHead className="hidden xl:table-cell text-right">{tOverview('table.monthlyEquiv')}</TableHead>
                    )}
                    {isColumnVisible('originalAmount') && (
                      <TableHead className="hidden 2xl:table-cell text-right">{tOverview('table.originalAmount')}</TableHead>
                    )}
                    {isColumnVisible('status') && (
                      <TableHead className="hidden sm:table-cell">{tOverview('table.status')}</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExpenses.map((expense) => (
                    <TableRow
                      key={expense.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/dashboard/expenses/${expense.id}`)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedExpenseIds.has(expense.id)}
                          onCheckedChange={() => handleToggleSelect(expense.id)}
                          aria-label={`Select ${expense.name}`}
                        />
                      </TableCell>
                      {isColumnVisible('name') && (
                        <TableCell className="font-medium">
                          <div className="max-w-[200px]">
                            <p className="truncate">{expense.name}</p>
                            {!isColumnVisible('description') && (
                              <p className="text-xs text-muted-foreground md:hidden truncate">
                                {expense.description}
                              </p>
                            )}
                          </div>
                        </TableCell>
                      )}
                      {isColumnVisible('description') && (
                        <TableCell className="hidden md:table-cell">
                          <p className="max-w-[250px] truncate text-sm text-muted-foreground">
                            {expense.description || '-'}
                          </p>
                        </TableCell>
                      )}
                      {isColumnVisible('category') && (
                        <TableCell className="hidden lg:table-cell">
                          {expense.category ? (
                            <Badge variant="outline" className="text-xs">{translateCategory(expense.category)}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      )}
                      {isColumnVisible('amount') && (
                        <TableCell className="text-right font-semibold">
                          <CurrencyDisplay
                            amount={expense.display_amount ?? expense.amount}
                            currency={expense.display_currency ?? expense.currency}
                            showSymbol={true}
                            showCode={false}
                          />
                        </TableCell>
                      )}
                      {isColumnVisible('frequency') && (
                        <TableCell className="hidden sm:table-cell">
                          <span className="text-sm text-muted-foreground">
                            {tFrequency(expense.frequency)}
                          </span>
                        </TableCell>
                      )}
                      {isColumnVisible('date') && (
                        <TableCell className="hidden lg:table-cell">
                          <span className="text-sm text-muted-foreground">
                            {(() => {
                              const dateValue = expense.date || expense.start_date;
                              return dateValue
                                ? new Date(dateValue).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  })
                                : '-';
                            })()}
                          </span>
                        </TableCell>
                      )}
                      {isColumnVisible('monthlyEquiv') && (
                        <TableCell className="hidden xl:table-cell text-right">
                          {(expense.display_monthly_equivalent ?? expense.monthly_equivalent) ? (
                            <span className="text-sm">
                              <CurrencyDisplay
                                amount={expense.display_monthly_equivalent ?? expense.monthly_equivalent ?? 0}
                                currency={expense.display_currency ?? expense.currency}
                                showSymbol={true}
                                showCode={false}
                              />
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      )}
                      {isColumnVisible('originalAmount') && (
                        <TableCell className="hidden 2xl:table-cell text-right">
                          {expense.display_currency && expense.display_currency !== expense.currency ? (
                            <span className="text-sm text-muted-foreground">
                              {expense.amount} {expense.currency}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      )}
                      {isColumnVisible('status') && (
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant={expense.is_active ? 'default' : 'secondary'} className="text-xs">
                            {expense.is_active ? tStatus('active') : tStatus('inactive')}
                          </Badge>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      {/* Expense Form Dialog */}
      {isFormOpen && (
        <ExpenseForm
          expenseId={editingExpenseId}
          isOpen={isFormOpen}
          onClose={handleFormClose}
        />
      )}

      {/* Batch Add Expense Form */}
      {isBatchFormOpen && (
        <BatchExpenseForm
          isOpen={isBatchFormOpen}
          onClose={() => setIsBatchFormOpen(false)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        title={tOverview('deleteConfirmTitle')}
        description={tOverview('deleteConfirmDescription')}
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
