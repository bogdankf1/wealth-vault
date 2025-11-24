/**
 * Expense Tracking Page
 * Displays user's expenses with statistics
 */
'use client';

import React, { useState } from 'react';
import { DollarSign, TrendingDown, Calendar, Edit, Trash2, Archive, LayoutGrid, List, Grid3x3, Rows3, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import {
  useListExpensesQuery,
  useGetExpenseStatsQuery,
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
import { ExpenseForm } from '@/components/expenses/expense-form';
import { MonthFilter, filterByMonth } from '@/components/ui/month-filter';
import { StatsCards, StatCard } from '@/components/ui/stats-cards';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { BatchDeleteConfirmDialog } from '@/components/ui/batch-delete-confirm-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchFilter, filterBySearchAndCategory } from '@/components/ui/search-filter';
import { SortFilter, sortItems, type SortField, type SortDirection } from '@/components/ui/sort-filter';
import { CurrencyDisplay } from '@/components/currency';
import { useViewPreferences } from '@/lib/hooks/use-view-preferences';
import { CalendarView } from '@/components/ui/calendar-view';
import { ExpenseActionsContext } from '../context';
import { CATEGORY_NAME_TO_KEY, EXPENSE_CATEGORY_KEYS } from '@/lib/constants/expense-categories';

export default function ExpensesPage() {
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
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);

  // Use default view preferences from user settings
  const { viewMode, setViewMode, statsViewMode, setStatsViewMode } = useViewPreferences();

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

  const handleAddExpense = React.useCallback(() => {
    setEditingExpenseId(null);
    setIsFormOpen(true);
  }, []);

  const handleEditExpense = (id: string) => {
    setEditingExpenseId(id);
    setIsFormOpen(true);
  };

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
        <Button onClick={handleAddExpense} size="default" className="w-full sm:w-auto">
          <DollarSign className="mr-2 h-4 w-4" />
          <span className="truncate">{tOverview('addExpense')}</span>
        </Button>
      </>
    );

    // Cleanup on unmount
    return () => setActions(null);
  }, [selectedExpenseIds.size, setActions, handleBatchArchive, handleBatchDelete, handleAddExpense, tOverview]);

  // Prepare stats cards data
  const statsCards: StatCard[] = stats
    ? [
        {
          title: tOverview('totalExpenses'),
          value: stats.total_expenses,
          description: selectedMonth
            ? tOverview('activeIn', {
                count: stats.active_expenses,
                month: new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
              })
            : `${stats.active_expenses} ${tOverview('active')}`,
          icon: DollarSign,
        },
        {
          title: selectedMonth ? tOverview('periodSpending') : tOverview('monthlyExpense'),
          value: <CurrencyDisplay amount={stats.total_monthly_expense} currency={stats.currency} decimals={0} />,
          description: selectedMonth
            ? tOverview('totalFor', { month: new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) })
            : `${stats.active_expenses} ${tOverview('active')}`,
          icon: TrendingDown,
        },
        {
          title: tOverview('annualSpending'),
          value: <CurrencyDisplay amount={stats.total_annual_expense} currency={stats.currency} decimals={0} />,
          description: tOverview('projectedYearlyExpenses'),
          icon: Calendar,
        },
      ]
    : [];

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Statistics Section with Toggle */}
      {isLoadingStats || statsError || stats ? (
        <div className="space-y-3">
          <div className="flex items-center justify-end">
            <div className="inline-flex items-center gap-1 border rounded-md p-0.5 w-fit" style={{ height: '36px' }}>
              <Button
                variant={statsViewMode === 'cards' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setStatsViewMode('cards')}
                className="h-[32px] w-[32px] p-0"
                title="Cards View"
              >
                <Grid3x3 className="h-4 w-4" />
              </Button>
              <Button
                variant={statsViewMode === 'compact' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setStatsViewMode('compact')}
                className="h-[32px] w-[32px] p-0"
                title="Compact View"
              >
                <Rows3 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {isLoadingStats ? (
            statsViewMode === 'cards' ? (
              <div className="grid gap-4 md:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardHeader className="space-y-2">
                      <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                      <div className="h-8 w-32 animate-pulse rounded bg-muted" />
                    </CardHeader>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="border rounded-lg p-3 bg-card">
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-b-0">
                      <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                      <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                    </div>
                  ))}
                </div>
              </div>
            )
          ) : statsError ? (
            <ApiErrorState error={statsError} />
          ) : stats && statsViewMode === 'cards' ? (
            <StatsCards stats={statsCards} />
          ) : stats && statsViewMode === 'compact' ? (
            <div className="border rounded-lg overflow-hidden bg-card">
              <div className="divide-y">
                {statsCards.map((stat, index) => {
                  const Icon = stat.icon;
                  return (
                    <div key={index} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm font-medium truncate">{stat.title}</span>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-lg font-bold">{stat.value}</span>
                        <span className="text-xs text-muted-foreground hidden sm:inline-block w-32 truncate text-right">{stat.description}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Search, Filters, and View Toggle */}
      {(expensesData?.items && expensesData.items.length > 0) && (
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex-1">
            <SearchFilter
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
              categories={uniqueCategories}
              searchPlaceholder={tOverview('searchPlaceholder')}
              categoryPlaceholder={tOverview('allCategories')}
            />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <MonthFilter
              selectedMonth={selectedMonth}
              onMonthChange={setSelectedMonth}
              label={tCommon('common.filterBy')}
              clearLabel={tCommon('common.clear')}
            />
            <SortFilter
              sortField={sortField}
              sortDirection={sortDirection}
              onSortFieldChange={setSortField}
              onSortDirectionChange={setSortDirection}
              sortByLabel={tCommon('common.sortBy')}
            />
            <div className="inline-flex items-center gap-1 border rounded-md p-0.5 w-fit self-end" style={{ height: '36px' }}>
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
            actionLabel={tOverview('addExpense')}
            onAction={handleAddExpense}
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
            onItemClick={handleEditExpense}
            selectedItemIds={selectedExpenseIds}
            onToggleSelect={handleToggleSelect}
          />
        ) : !filteredExpenses || filteredExpenses.length === 0 ? (
          selectedMonth ? (
            <EmptyState
              icon={DollarSign}
              title={tOverview('noExpensesForMonth')}
              description={tOverview('noExpensesForMonthDescription', { month: new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) })}
              actionLabel={tOverview('clearFilter')}
              onAction={() => setSelectedMonth(null)}
            />
          ) : (
            <EmptyState
              icon={DollarSign}
              title={tOverview('noExpenses')}
              description={tOverview('noExpensesDescription')}
              actionLabel={tOverview('addExpense')}
              onAction={handleAddExpense}
            />
          )
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
              <Card key={expense.id} className="relative">
                <CardHeader className="pb-3 md:pb-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <Checkbox
                        checked={selectedExpenseIds.has(expense.id)}
                        onCheckedChange={() => handleToggleSelect(expense.id)}
                        aria-label={`Select ${expense.name}`}
                        className="mt-1"
                      />
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

                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditExpense(expense.id)}
                      >
                        <Edit className="mr-1 h-3 w-3" />
                        {tActions('edit')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleArchiveExpense(expense.id)}
                      >
                        <Archive className="mr-1 h-3 w-3" />
                        {tActions('archive')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteExpense(expense.id)}
                        disabled={isDeleting}
                      >
                        <Trash2 className="mr-1 h-3 w-3" />
                        {tActions('delete')}
                      </Button>
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
                    <TableHead className="w-[200px]">Name</TableHead>
                    <TableHead className="hidden md:table-cell">Description</TableHead>
                    <TableHead className="hidden lg:table-cell">Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="hidden sm:table-cell">Frequency</TableHead>
                    <TableHead className="hidden lg:table-cell">Date</TableHead>
                    <TableHead className="hidden xl:table-cell text-right">Monthly Equiv.</TableHead>
                    <TableHead className="hidden 2xl:table-cell text-right">Original Amount</TableHead>
                    <TableHead className="hidden sm:table-cell">Status</TableHead>
                    <TableHead className="text-right w-[180px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExpenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell>
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
                          <Badge variant="outline" className="text-xs">{translateCategory(expense.category)}</Badge>
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
                          {tFrequency(expense.frequency)}
                        </span>
                      </TableCell>
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
                      <TableCell className="hidden 2xl:table-cell text-right">
                        {expense.display_currency && expense.display_currency !== expense.currency ? (
                          <span className="text-sm text-muted-foreground">
                            {expense.amount} {expense.currency}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant={expense.is_active ? 'default' : 'secondary'} className="text-xs">
                          {expense.is_active ? tStatus('active') : tStatus('inactive')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditExpense(expense.id)}
                            className="h-8 w-8 p-0"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleArchiveExpense(expense.id)}
                            className="h-8 w-8 p-0"
                          >
                            <Archive className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteExpense(expense.id)}
                            disabled={isDeleting}
                            className="h-8 w-8 p-0"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
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
