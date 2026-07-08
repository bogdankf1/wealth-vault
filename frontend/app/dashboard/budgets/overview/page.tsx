'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet, DollarSign, Sparkles, AlertCircle, Plus, Loader2, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { Button } from '@/components/ui/button';
import { SplitButton } from '@/components/ui/split-button';
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
import { useListBudgetsQuery, useGetBudgetOverviewQuery, useUpdateBudgetMutation, useDeleteBudgetMutation, useBatchDeleteBudgetsMutation, useCreateBudgetMutation } from '@/lib/api/budgetsApi';
import { useGetMyPreferencesQuery } from '@/lib/api/preferencesApi';
import { useGetBudgetPresetsMutation, type BudgetPreset } from '@/lib/api/aiApi';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BudgetForm } from '@/components/budgets/budget-form';
import { EmptyState } from '@/components/ui/empty-state';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { BatchDeleteConfirmDialog } from '@/components/ui/batch-delete-confirm-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BudgetsActionsContext } from '../context';
import { sortItems, type SortField, type SortDirection } from '@/components/ui/sort-filter';
import { useViewPreferences } from '@/hooks/use-view-preferences';
import { useColumnVisibility, type ColumnConfig } from '@/hooks/use-column-visibility';
import { ListControlsPopover } from '@/components/ui/list-controls-popover';
import { useRowSelection } from '@/hooks/use-row-selection';
import { toast } from 'sonner';
import { CATEGORY_NAME_TO_KEY, EXPENSE_CATEGORY_KEYS } from '@/lib/constants/expense-categories';

export default function BudgetsPage() {
  const router = useRouter();

  // Translation hooks
  const tOverview = useTranslations('budgets.overview');
  const tActions = useTranslations('budgets.actions');
  const tCommon = useTranslations('common');
  const tPeriod = useTranslations('budgets.period');
  const tStatus = useTranslations('budgets.status');
  const tCategories = useTranslations('expenses.categories');

  // Helper to translate category (handles both new keys and legacy names)
  const translateCategory = (category: string | undefined | null): string => {
    if (!category) return '';
    // Check if it's already a translation key
    if (EXPENSE_CATEGORY_KEYS.includes(category as typeof EXPENSE_CATEGORY_KEYS[number])) {
      return tCategories(category as typeof EXPENSE_CATEGORY_KEYS[number]);
    }
    // Check if it's a legacy name that needs mapping
    const key = CATEGORY_NAME_TO_KEY[category];
    if (key) {
      return tCategories(key);
    }
    // Return as-is if not found
    return category;
  };

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingBudgetId, setDeletingBudgetId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const selection = useRowSelection();
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);

  // Use default view preferences from user settings
  const { viewMode, setViewMode } = useViewPreferences();

  // Column configuration for list view
  const columnConfig: ColumnConfig[] = React.useMemo(() => [
    { id: 'name', label: tOverview('name'), locked: true },
    { id: 'description', label: tOverview('description') },
    { id: 'category', label: tOverview('category') },
    { id: 'amount', label: tOverview('amount') },
    { id: 'period', label: tOverview('period') },
    { id: 'dateRange', label: tOverview('dateRange') },
    { id: 'originalAmount', label: tOverview('originalAmount') },
    { id: 'status', label: tOverview('status') },
  ], [tOverview]);

  const {
    visibleColumns,
    toggleColumn,
    showAllColumns,
    isColumnVisible,
  } = useColumnVisibility('budgets', columnConfig);

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
  const { data: preferences } = useGetMyPreferencesQuery();
  const [updateBudget] = useUpdateBudgetMutation();
  const [deleteBudget, { isLoading: isDeleting }] = useDeleteBudgetMutation();
  const [createBudget] = useCreateBudgetMutation();
  const [batchDeleteBudgets, { isLoading: isBatchDeleting }] = useBatchDeleteBudgetsMutation();
  const [getBudgetPresets, { isLoading: isLoadingPresets }] = useGetBudgetPresetsMutation();

  // AI Budget Presets state
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [budgetPresets, setBudgetPresets] = useState<BudgetPreset[]>([]);
  const [analysisSummary, setAnalysisSummary] = useState('');
  const [presetsError, setPresetsError] = useState<string | null>(null);
  const [addingPresets, setAddingPresets] = useState<Set<number>>(new Set());

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
      toast.error(tOverview('deleteError'));
    }
  };

  const handleArchiveBudget = async (id: string) => {
    try {
      await updateBudget({ id, data: { is_active: false } }).unwrap();
      toast.success(tOverview('archiveSuccess'));
      selection.deselect(id);
    } catch (error) {
      toast.error(tOverview('archiveError'));
    }
  };

  const handleBatchArchive = useCallback(async () => {
    const idsToArchive = Array.from(selection.selectedIds);
    let successCount = 0;
    let failCount = 0;

    for (const id of idsToArchive) {
      try {
        await updateBudget({ id, data: { is_active: false } }).unwrap();
        successCount++;
      } catch (error) {
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(tOverview('batchArchiveSuccess', { count: successCount }));
    }
    if (failCount > 0) {
      toast.error(tOverview('batchArchiveError', { count: failCount }));
    }

    selection.clear();
  }, [selection, updateBudget, tOverview]);

  const handleFormClose = () => {
    setShowCreateModal(false);
    setEditingBudgetId(null);
  };

  const handleBatchDelete = useCallback(() => {
    setBatchDeleteDialogOpen(true);
  }, []);

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
    } catch {
      toast.error(tOverview('deleteError'));
    }
  };

  // AI Budget Presets handlers
  const handleOpenAiPresets = useCallback(async () => {
    setAiDialogOpen(true);
    setBudgetPresets([]);
    setPresetsError(null);
    setAnalysisSummary('');

    try {
      const result = await getBudgetPresets({
        currency: preferences?.currency || 'USD',
      }).unwrap();

      setBudgetPresets(result.presets);
      setAnalysisSummary(result.analysis_summary);
    } catch (err) {
      setPresetsError(tOverview('aiPresets.fetchError'));
    }
  }, [preferences?.currency, getBudgetPresets, tOverview]);

  const handleAddPresetAsBudget = useCallback(async (preset: BudgetPreset, index: number) => {
    setAddingPresets(prev => new Set(prev).add(index));

    try {
      const today = new Date();
      const startDate = new Date(today.getFullYear(), today.getMonth(), 1); // First day of current month

      await createBudget({
        name: preset.name,
        category: preset.category,
        description: preset.description,
        amount: preset.suggested_amount,
        currency: preferences?.currency || 'USD',
        period: preset.period as 'monthly' | 'quarterly' | 'yearly',
        start_date: startDate.toISOString().split('T')[0],
        is_active: true,
        alert_threshold: preset.alert_threshold,
      }).unwrap();

      toast.success(tOverview('aiPresets.addSuccess', { name: preset.name }));

      // Reset the selection for this preset so user can add again if needed
      setAddingPresets(prev => {
        const newSet = new Set(prev);
        newSet.delete(index);
        return newSet;
      });
    } catch (err) {
      toast.error(tOverview('aiPresets.addError'));
      setAddingPresets(prev => {
        const newSet = new Set(prev);
        newSet.delete(index);
        return newSet;
      });
    }
  }, [createBudget, preferences?.currency, tOverview]);

  // Set action buttons in layout
  React.useEffect(() => {
    setActions(
      <>
        {selection.size > 0 && (
          <>
            {/* Archive hidden for now
            <Button
              onClick={handleBatchArchive}
              variant="outline"
              size="default"
              className="w-full sm:w-auto"
            >
              <span className="truncate">{tOverview('archiveSelected', { count: selectedBudgetIds.size })}</span>
            </Button>
            */}
            <Button
              onClick={handleBatchDelete}
              variant="destructive"
              size="default"
              className="w-full sm:w-auto"
            >
              <span className="truncate">{tOverview('deleteSelected', { count: selection.size })}</span>
            </Button>
          </>
        )}
        <SplitButton
          primaryLabel={tOverview('aiPresets.button')}
          onPrimaryClick={handleOpenAiPresets}
          primaryIcon={<Sparkles className="h-4 w-4" />}
          options={[
            {
              label: tOverview('addManually'),
              onClick: handleAddBudget,
              icon: <Plus className="h-4 w-4" />,
            },
          ]}
          className="w-full sm:w-auto"
        />
      </>
    );

    return () => setActions(null);
  }, [selection.size, setActions, tOverview, handleOpenAiPresets, handleAddBudget]);

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
      {(budgets && budgets.length > 0) && (
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Search Input */}
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
            <ListControlsPopover
              activeFilterCount={activeFilterCount}
              filterSlot={
                <div className="p-2 space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.filter')}</p>

                  {/* Category */}
                  <div className="space-y-1">
                    <label className="text-sm font-medium">{tOverview('category')}</label>
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
              }
              sortField={sortField}
              setSortField={setSortField}
              sortDirection={sortDirection}
              setSortDirection={setSortDirection}
              viewMode={viewMode}
              setViewMode={setViewMode}
              columnControls={{ columns: columnConfig, visibleColumns, toggleColumn, showAllColumns }}
            />
          </div>

          {/* Inline stats */}
          {overview?.stats && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground flex-shrink-0 max-w-xs">
              <span><span className="font-semibold text-foreground"><CurrencyDisplay amount={overview.stats.total_budgeted} currency={overview.stats.currency} decimals={0} /></span> budget</span>
              <span>·</span>
              <span><span className="font-semibold text-foreground"><CurrencyDisplay amount={overview.stats.total_spent} currency={overview.stats.currency} decimals={0} /></span> spent</span>
              <span>·</span>
              <span><span className="font-semibold text-foreground"><CurrencyDisplay amount={overview.stats.total_remaining} currency={overview.stats.currency} decimals={0} /></span> left</span>
            </div>
          )}
        </div>
      )}

      {/* Budget List */}
      <div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">{tOverview('loading')}</div>
        ) : !budgets || budgets.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title={tOverview('noBudgets')}
            description={tOverview('noBudgetsDescription')}
            actionLabel={tOverview('aiPresets.button')}
            onAction={handleOpenAiPresets}
          />
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
            {filteredBudgets.map((budget) => (
              <Card
                key={budget.id}
                className="relative cursor-pointer hover:shadow-md transition-shadow"
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
                          amount={budget.effective_amount ?? budget.display_amount ?? budget.amount}
                          currency={budget.display_currency ?? budget.currency}
                          showSymbol={true}
                          showCode={false}
                        />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {PERIOD_LABELS[budget.period] || budget.period}
                      </p>
                      <div className="text-[10px] md:text-xs text-muted-foreground mt-1 min-h-[16px]">
                        {budget.rollover_unused && budget.rollover_amount > 0 ? (
                          <span className="text-green-600 dark:text-green-400">
                            {tOverview('base')}: <CurrencyDisplay
                              amount={budget.amount}
                              currency={budget.currency}
                              showSymbol={true}
                              showCode={false}
                            /> + {tOverview('rollover')}: <CurrencyDisplay
                              amount={budget.rollover_amount}
                              currency={budget.currency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </span>
                        ) : budget.display_currency && budget.display_currency !== budget.currency ? (
                          <>
                            {tOverview('original')}: <CurrencyDisplay
                              amount={budget.amount}
                              currency={budget.currency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-lg bg-muted p-2 md:p-3 min-h-[60px] flex items-center justify-center">
                      <p className="text-[10px] md:text-xs text-muted-foreground">
                        {tOverview('periodLabel')}: {budget.start_date.split('T')[0]}
                        {budget.end_date ? ` ${tOverview('to')} ${budget.end_date.split('T')[0]}` : ` (${tOverview('ongoing')})`}
                      </p>
                    </div>

                    <div className="min-h-[24px]">
                      {budget.category && (
                        <Badge variant="outline" className="text-xs flex-shrink-0">{translateCategory(budget.category)}</Badge>
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
                        checked={selection.isAllSelected(filteredBudgets.length) && filteredBudgets.length > 0}
                        onCheckedChange={() => selection.selectAll(filteredBudgets.map((budget) => budget.id))}
                        aria-label={tOverview('selectAll')}
                      />
                    </TableHead>
                    {isColumnVisible('name') && (
                      <TableHead className="w-[200px]">{tOverview('name')}</TableHead>
                    )}
                    {isColumnVisible('description') && (
                      <TableHead className="hidden md:table-cell">{tOverview('description')}</TableHead>
                    )}
                    {isColumnVisible('category') && (
                      <TableHead className="hidden lg:table-cell">{tOverview('category')}</TableHead>
                    )}
                    {isColumnVisible('amount') && (
                      <TableHead className="text-right">{tOverview('amount')}</TableHead>
                    )}
                    {isColumnVisible('period') && (
                      <TableHead className="hidden sm:table-cell">{tOverview('period')}</TableHead>
                    )}
                    {isColumnVisible('dateRange') && (
                      <TableHead className="hidden xl:table-cell">{tOverview('dateRange')}</TableHead>
                    )}
                    {isColumnVisible('originalAmount') && (
                      <TableHead className="hidden 2xl:table-cell text-right">{tOverview('originalAmount')}</TableHead>
                    )}
                    {isColumnVisible('status') && (
                      <TableHead className="hidden sm:table-cell">{tOverview('status')}</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBudgets.map((budget) => (
                    <TableRow
                      key={budget.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/dashboard/budgets/${budget.id}`)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selection.selectedIds.has(budget.id)}
                          onCheckedChange={() => selection.toggle(budget.id)}
                          aria-label={`Select ${budget.name}`}
                        />
                      </TableCell>
                      {isColumnVisible('name') && (
                        <TableCell className="font-medium">
                          <div className="max-w-[200px]">
                            <p className="truncate">{budget.name}</p>
                            {!isColumnVisible('description') && (
                              <p className="text-xs text-muted-foreground md:hidden truncate">
                                {budget.description}
                              </p>
                            )}
                          </div>
                        </TableCell>
                      )}
                      {isColumnVisible('description') && (
                        <TableCell className="hidden md:table-cell">
                          <p className="max-w-[250px] truncate text-sm text-muted-foreground">
                            {budget.description || '-'}
                          </p>
                        </TableCell>
                      )}
                      {isColumnVisible('category') && (
                        <TableCell className="hidden lg:table-cell">
                          {budget.category ? (
                            <Badge variant="outline" className="text-xs">{translateCategory(budget.category)}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      )}
                      {isColumnVisible('amount') && (
                        <TableCell className="text-right font-semibold">
                          <div>
                            <CurrencyDisplay
                              amount={budget.effective_amount ?? budget.display_amount ?? budget.amount}
                              currency={budget.display_currency ?? budget.currency}
                              showSymbol={true}
                              showCode={false}
                            />
                            {budget.rollover_unused && budget.rollover_amount > 0 && (
                              <div className="text-xs text-green-600 dark:text-green-400 font-normal">
                                +<CurrencyDisplay
                                  amount={budget.rollover_amount}
                                  currency={budget.currency}
                                  showSymbol={true}
                                  showCode={false}
                                /> {tOverview('rollover')}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      )}
                      {isColumnVisible('period') && (
                        <TableCell className="hidden sm:table-cell">
                          <span className="text-sm text-muted-foreground">
                            {PERIOD_LABELS[budget.period] || budget.period}
                          </span>
                        </TableCell>
                      )}
                      {isColumnVisible('dateRange') && (
                        <TableCell className="hidden xl:table-cell">
                          <span className="text-sm text-muted-foreground">
                            {budget.start_date.split('T')[0]}
                            {budget.end_date ? ` ${tOverview('to')} ${budget.end_date.split('T')[0]}` : ` (${tOverview('ongoing')})`}
                          </span>
                        </TableCell>
                      )}
                      {isColumnVisible('originalAmount') && (
                        <TableCell className="hidden 2xl:table-cell text-right">
                          {budget.display_currency && budget.display_currency !== budget.currency ? (
                            <span className="text-sm text-muted-foreground">
                              {budget.amount} {budget.currency}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      )}
                      {isColumnVisible('status') && (
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant={budget.is_active ? 'default' : 'secondary'} className="text-xs">
                            {budget.is_active ? tStatus('active') : tStatus('inactive')}
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
        count={selection.size}
        itemName="budget"
        isDeleting={isBatchDeleting}
      />

      {/* AI Budget Presets Dialog */}
      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent className="sm:max-w-[650px] max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              {tOverview('aiPresets.title')}
            </DialogTitle>
            <DialogDescription>
              {tOverview('aiPresets.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Loading state */}
            {isLoadingPresets && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">{tOverview('aiPresets.loading')}</span>
              </div>
            )}

            {/* Error state */}
            {presetsError && !isLoadingPresets && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{presetsError}</AlertDescription>
              </Alert>
            )}

            {/* Analysis Summary */}
            {!isLoadingPresets && !presetsError && analysisSummary && (
              <Alert>
                <Sparkles className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  {analysisSummary}
                </AlertDescription>
              </Alert>
            )}

            {/* Presets list */}
            {!isLoadingPresets && !presetsError && budgetPresets.length > 0 && (
              <div className="max-h-[400px] overflow-y-auto pr-2">
                <div className="space-y-3">
                  {budgetPresets.map((preset, index) => (
                    <Card key={index} className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium truncate">{preset.name}</h4>
                              <Badge
                                variant={preset.priority === 'high' ? 'destructive' : preset.priority === 'medium' ? 'default' : 'secondary'}
                                className="text-xs"
                              >
                                {tOverview(`aiPresets.priority.${preset.priority}`)}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                              {preset.description}
                            </p>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <Badge variant="outline" className="text-xs">
                                <DollarSign className="h-3 w-3 mr-1" />
                                <CurrencyDisplay
                                  amount={preset.suggested_amount}
                                  currency={preferences?.currency || 'USD'}
                                  showSymbol={false}
                                  showCode={true}
                                />
                              </Badge>
                              <Badge variant="secondary" className="text-xs capitalize">
                                {tPeriod(preset.period)}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {translateCategory(preset.category)}
                              </Badge>
                            </div>
                            {preset.reasoning && (
                              <p className="text-xs text-muted-foreground mt-2 italic">
                                {preset.reasoning}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Add Button */}
                        <div className="flex justify-end pt-2 border-t">
                          <Button
                            size="sm"
                            onClick={() => handleAddPresetAsBudget(preset, index)}
                            disabled={addingPresets.has(index)}
                          >
                            {addingPresets.has(index) ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <Plus className="h-4 w-4 mr-2" />
                            )}
                            {tOverview('aiPresets.addBudget')}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!isLoadingPresets && !presetsError && budgetPresets.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{tOverview('aiPresets.noPresets')}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
