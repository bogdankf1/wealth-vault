'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Edit, Trash2, Archive, Wallet, Target, DollarSign, LayoutGrid, List, Grid3x3, Rows3 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useListBudgetsQuery, useGetBudgetOverviewQuery, useUpdateBudgetMutation, useDeleteBudgetMutation, useBatchDeleteBudgetsMutation } from '@/lib/api/budgetsApi';
import { BudgetForm } from '@/components/budgets/budget-form';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { BatchDeleteConfirmDialog } from '@/components/ui/batch-delete-confirm-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { MonthFilter } from '@/components/ui/month-filter';
import { SearchFilter } from '@/components/ui/search-filter';
import { StatsCards, StatCard } from '@/components/ui/stats-cards';
import { BudgetsActionsContext } from '../context';
import { SortFilter, sortItems, type SortField, type SortDirection } from '@/components/ui/sort-filter';
import { useViewPreferences } from '@/lib/hooks/use-view-preferences';
import { toast } from 'sonner';

export default function BudgetsPage() {
  // Translation hooks
  const tOverview = useTranslations('budgets.overview');
  const tActions = useTranslations('budgets.actions');
  const tCommon = useTranslations('common');
  const tPeriod = useTranslations('budgets.period');
  const tStatus = useTranslations('budgets.status');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingBudgetId, setDeletingBudgetId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedBudgetIds, setSelectedBudgetIds] = useState<Set<string>>(new Set());
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);

  // Use default view preferences from user settings
  const { viewMode, setViewMode, statsViewMode, setStatsViewMode } = useViewPreferences();

  // Get context for setting actions
  const { setActions } = React.useContext(BudgetsActionsContext);

  // Period labels with translations
  const PERIOD_LABELS: Record<string, string> = {
    monthly: tPeriod('monthly'),
    quarterly: tPeriod('quarterly'),
    yearly: tPeriod('yearly'),
  };

  const { data: budgets, isLoading: budgetsLoading } = useListBudgetsQuery({ is_active: true });

  // Calculate date range from selectedMonth for overview stats
  const overviewParams = useMemo(() => {
    if (!selectedMonth) return undefined;

    const [year, month] = selectedMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    return {
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
    };
  }, [selectedMonth]);

  const { data: overview, isLoading: overviewLoading } = useGetBudgetOverviewQuery(overviewParams);
  const [updateBudget] = useUpdateBudgetMutation();
  const [deleteBudget, { isLoading: isDeleting }] = useDeleteBudgetMutation();
  const [batchDeleteBudgets, { isLoading: isBatchDeleting }] = useBatchDeleteBudgetsMutation();

  const isLoading = budgetsLoading || overviewLoading;

  // Get unique categories from budgets
  const uniqueCategories = useMemo(() => {
    if (!budgets) return [];
    const categories = budgets
      .map((budget) => budget.category)
      .filter((cat): cat is string => !!cat);
    return Array.from(new Set(categories)).sort();
  }, [budgets]);

  // Filter budgets by month and category
  const filteredBudgets = useMemo(() => {
    if (!budgets) return [];

    let filtered = budgets;

    // Filter by month
    if (selectedMonth) {
      const [year, month] = selectedMonth.split('-').map(Number);
      filtered = filtered.filter((budget) => {
        const startDate = new Date(budget.start_date);
        const endDate = budget.end_date ? new Date(budget.end_date) : null;

        // Check if the budget period overlaps with the selected month
        const monthStart = new Date(year, month - 1, 1);
        const monthEnd = new Date(year, month, 0);

        const budgetStart = startDate;
        const budgetEnd = endDate || new Date(9999, 11, 31); // Far future if no end date

        return budgetStart <= monthEnd && budgetEnd >= monthStart;
      });
    }

    // Filter by search query (name)
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((budget) =>
        budget.name.toLowerCase().includes(query)
      );
    }

    // Filter by category
    if (selectedCategory) {
      filtered = filtered.filter((budget) => budget.category === selectedCategory);
    }

    // Apply sorting (using display_amount for currency-aware sorting)
    const sorted = sortItems(
      filtered,
      sortField,
      sortDirection,
      (budget) => budget.name,
      (budget) => budget.display_amount || budget.amount,
      (budget) => budget.start_date
    );

    return sorted || [];
  }, [budgets, selectedMonth, searchQuery, selectedCategory, sortField, sortDirection]);

  const handleAddBudget = useCallback(() => {
    setEditingBudgetId(null);
    setShowCreateModal(true);
  }, []);

  const handleEditBudget = (id: string) => {
    setEditingBudgetId(id);
    setShowCreateModal(true);
  };

  const handleDeleteBudget = (id: string) => {
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
    } catch (error) {
      console.error('Failed to delete budget:', error);
      toast.error(tOverview('deleteError'));
    }
  };

  const handleArchiveBudget = async (id: string) => {
    try {
      await updateBudget({ id, data: { is_active: false } }).unwrap();
      toast.success(tOverview('archiveSuccess'));
      setSelectedBudgetIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    } catch (error) {
      console.error('Failed to archive budget:', error);
      toast.error(tOverview('archiveError'));
    }
  };

  const handleBatchArchive = useCallback(async () => {
    const idsToArchive = Array.from(selectedBudgetIds);
    let successCount = 0;
    let failCount = 0;

    for (const id of idsToArchive) {
      try {
        await updateBudget({ id, data: { is_active: false } }).unwrap();
        successCount++;
      } catch (error) {
        console.error(`Failed to archive budget ${id}:`, error);
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(tOverview('batchArchiveSuccess', { count: successCount }));
    }
    if (failCount > 0) {
      toast.error(tOverview('batchArchiveError', { count: failCount }));
    }

    setSelectedBudgetIds(new Set());
  }, [selectedBudgetIds, updateBudget, tOverview]);

  const handleFormClose = () => {
    setShowCreateModal(false);
    setEditingBudgetId(null);
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

  const handleBatchDelete = useCallback(() => {
    setBatchDeleteDialogOpen(true);
  }, []);

  const confirmBatchDelete = async () => {
    if (selectedBudgetIds.size === 0) return;

    try {
      const result = await batchDeleteBudgets({
        ids: Array.from(selectedBudgetIds),
      }).unwrap();

      if (result.failed_ids.length > 0) {
        toast.error(tOverview('batchDeleteError', { count: result.failed_ids.length }));
      } else {
        toast.success(tOverview('batchDeleteSuccess', { count: result.deleted_count }));
      }

      setBatchDeleteDialogOpen(false);
      setSelectedBudgetIds(new Set());
    } catch {
      toast.error(tOverview('deleteError'));
    }
  };

  // Set action buttons in layout
  React.useEffect(() => {
    setActions(
      <>
        {selectedBudgetIds.size > 0 && (
          <>
            <Button
              onClick={handleBatchArchive}
              variant="outline"
              size="default"
              className="w-full sm:w-auto"
            >
              <Archive className="mr-2 h-4 w-4" />
              <span className="truncate">{tOverview('archiveSelected', { count: selectedBudgetIds.size })}</span>
            </Button>
            <Button
              onClick={handleBatchDelete}
              variant="destructive"
              size="default"
              className="w-full sm:w-auto"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              <span className="truncate">{tOverview('deleteSelected', { count: selectedBudgetIds.size })}</span>
            </Button>
          </>
        )}
        <Button onClick={handleAddBudget} size="default" className="w-full sm:w-auto">
          <Wallet className="mr-2 h-4 w-4" />
          <span className="truncate">{tOverview('addBudget')}</span>
        </Button>
      </>
    );

    return () => setActions(null);
  }, [selectedBudgetIds.size, setActions, tOverview]);

  // Prepare stats cards data from overview
  const statsCards: StatCard[] = overview?.stats
    ? [
        {
          title: selectedMonth ? 'Period Budgeted' : 'Total Budgeted',
          value: (
            <CurrencyDisplay
              amount={overview.stats.total_budgeted}
              currency={overview.stats.currency}
              showSymbol={true}
              showCode={false}
            />
          ),
          description: selectedMonth
            ? `${overview.stats.active_budgets} active in ${new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
            : `${overview.stats.active_budgets} active ${overview.stats.active_budgets === 1 ? 'budget' : 'budgets'}`,
          icon: Wallet,
        },
        {
          title: selectedMonth ? 'Period Spent' : 'Total Spent',
          value: (
            <CurrencyDisplay
              amount={overview.stats.total_spent}
              currency={overview.stats.currency}
              showSymbol={true}
              showCode={false}
            />
          ),
          description: `${overview.stats.overall_percentage_used.toFixed(1)}% of budget used`,
          icon: DollarSign,
        },
        {
          title: 'Remaining',
          value: (
            <CurrencyDisplay
              amount={overview.stats.total_remaining}
              currency={overview.stats.currency}
              showSymbol={true}
              showCode={false}
            />
          ),
          description: overview.stats.budgets_overspent > 0
            ? `${overview.stats.budgets_overspent} ${overview.stats.budgets_overspent === 1 ? 'budget' : 'budgets'} overspent`
            : `${overview.stats.budgets_near_limit} near limit`,
          icon: Target,
        },
      ]
    : [];

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Statistics Cards */}
      {isLoading ? (
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
      ) : overview?.stats ? (
        <div className="space-y-3">
          <div className="flex items-center justify-end">
            <div className="inline-flex items-center gap-1 border rounded-md p-0.5 w-fit" style={{ height: '36px' }}>
              <Button
                variant={statsViewMode === 'cards' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setStatsViewMode('cards')}
                className="h-[32px] w-[32px] p-0"
              >
                <Grid3x3 className="h-4 w-4" />
              </Button>
              <Button
                variant={statsViewMode === 'compact' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setStatsViewMode('compact')}
                className="h-[32px] w-[32px] p-0"
              >
                <Rows3 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {statsViewMode === 'cards' ? (
            <StatsCards stats={statsCards} />
          ) : (
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
          )}
        </div>
      ) : null}

      {/* Search, Filters, and View Toggle */}
      {(budgets && budgets.length > 0) && (
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

      {/* Budget List */}
      <div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">{tOverview('loading')}</div>
        ) : !budgets || budgets.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>{tOverview('noBudgets')}</p>
            <p className="text-sm mt-1">{tOverview('noBudgetsDescription')}</p>
          </div>
        ) : !filteredBudgets || filteredBudgets.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>{tOverview('noFilterResults')}</p>
            <Button
              variant="link"
              onClick={() => {
                setSelectedMonth(null);
                setSearchQuery('');
                setSelectedCategory(null);
              }}
              className="mt-2"
            >
              {tCommon('common.clear')} {tCommon('common.filterBy').replace(':', '')}
            </Button>
          </div>
        ) : viewMode === 'card' ? (
          <>
            {filteredBudgets.length > 0 && (
              <div className="flex items-center gap-2 px-1 mb-4">
                <Checkbox
                  checked={selectedBudgetIds.size === filteredBudgets.length}
                  onCheckedChange={handleSelectAll}
                  aria-label={tOverview('selectAll')}
                />
                <span className="text-sm text-muted-foreground">
                  {selectedBudgetIds.size === filteredBudgets.length ? tOverview('deselectAll') : tOverview('selectAll')}
                </span>
              </div>
            )}
            <div className="grid gap-3 md:gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredBudgets.map((budget) => (
              <Card key={budget.id} className="relative">
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
                    <Badge variant={budget.is_active ? 'default' : 'secondary'} className="text-xs flex-shrink-0">
                      {budget.is_active ? tStatus('active') : tStatus('inactive')}
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

                    <div className="rounded-lg bg-muted p-2 md:p-3 min-h-[60px] flex items-center justify-center">
                      <p className="text-[10px] md:text-xs text-muted-foreground">
                        Period: {budget.start_date.split('T')[0]}
                        {budget.end_date ? ` to ${budget.end_date.split('T')[0]}` : ' (ongoing)'}
                      </p>
                    </div>

                    <div className="min-h-[24px]">
                      {budget.category && (
                        <Badge variant="outline" className="text-xs flex-shrink-0">{budget.category}</Badge>
                      )}
                    </div>

                    <div className="flex gap-2 pt-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditBudget(budget.id)}
                      >
                        <Edit className="mr-1 h-3 w-3" />
                        {tActions('edit')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleArchiveBudget(budget.id)}
                      >
                        <Archive className="mr-1 h-3 w-3" />
                        {tActions('archive')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteBudget(budget.id)}
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
                        checked={selectedBudgetIds.size === filteredBudgets.length && filteredBudgets.length > 0}
                        onCheckedChange={handleSelectAll}
                        aria-label={tOverview('selectAll')}
                      />
                    </TableHead>
                    <TableHead className="w-[200px]">{tOverview('name')}</TableHead>
                    <TableHead className="hidden md:table-cell">{tOverview('description')}</TableHead>
                    <TableHead className="hidden lg:table-cell">{tOverview('category')}</TableHead>
                    <TableHead className="text-right">{tOverview('amount')}</TableHead>
                    <TableHead className="hidden sm:table-cell">{tOverview('period')}</TableHead>
                    <TableHead className="hidden xl:table-cell">{tOverview('dateRange')}</TableHead>
                    <TableHead className="hidden 2xl:table-cell text-right">{tOverview('originalAmount')}</TableHead>
                    <TableHead className="hidden sm:table-cell">{tOverview('status')}</TableHead>
                    <TableHead className="text-right w-[180px]">{tOverview('actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBudgets.map((budget) => (
                    <TableRow key={budget.id}>
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
                      <TableCell className="hidden 2xl:table-cell text-right">
                        {budget.display_currency && budget.display_currency !== budget.currency ? (
                          <span className="text-sm text-muted-foreground">
                            {budget.amount} {budget.currency}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant={budget.is_active ? 'default' : 'secondary'} className="text-xs">
                          {budget.is_active ? tStatus('active') : tStatus('inactive')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditBudget(budget.id)}
                            className="h-8 w-8 p-0"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleArchiveBudget(budget.id)}
                            className="h-8 w-8 p-0"
                          >
                            <Archive className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteBudget(budget.id)}
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

      {/* Budget Form Dialog */}
      {showCreateModal && (
        <BudgetForm
          open={showCreateModal}
          onClose={handleFormClose}
          budget={editingBudgetId ? budgets?.find(b => b.id === editingBudgetId) : undefined}
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
        count={selectedBudgetIds.size}
        itemName="budget"
        isDeleting={isBatchDeleting}
      />
    </div>
  );
}
