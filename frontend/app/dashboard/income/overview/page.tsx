/**
 * Income Tracking Page
 * Displays user's income sources with statistics
 */
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TrendingUp, Trash2, Archive, LayoutGrid, List, CalendarDays, Upload, Plus, Filter, Search, ArrowUp, ArrowDown, Lock, RotateCcw, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import {
  useListIncomeSourcesQuery,
  useGetIncomeStatsQuery,
  useUpdateIncomeSourceMutation,
  useDeleteIncomeSourceMutation,
  useBatchDeleteIncomeSourcesMutation,
} from '@/lib/api/incomeApi';
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
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { IncomeSourceForm } from '@/components/income/income-source-form';
import { filterByMonth } from '@/components/ui/month-filter';
import { IncomeActionsContext } from '../context';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { BatchDeleteConfirmDialog } from '@/components/ui/batch-delete-confirm-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { filterBySearchAndCategory } from '@/components/ui/search-filter';
import { sortItems, type SortField, type SortDirection } from '@/components/ui/sort-filter';
import { useTierCheck, getFeatureDisplayName } from '@/lib/hooks/use-tier-check';
import { UpgradePromptDialog } from '@/components/upgrade-prompt';
import { useViewPreferences } from '@/lib/hooks/use-view-preferences';
import { useColumnVisibility, type ColumnConfig } from '@/lib/hooks/use-column-visibility';
import { CalendarView } from '@/components/ui/calendar-view';
import { toast } from 'sonner';
import { INCOME_CATEGORY_NAME_TO_KEY, INCOME_CATEGORY_KEYS } from '@/lib/constants/income-categories';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

export default function IncomePage() {
  const router = useRouter();
  const tOverview = useTranslations('income.overview');
  const tStatus = useTranslations('income.status');
  const tFrequency = useTranslations('income.frequency');
  const tCategories = useTranslations('income.categories');
  const tCommon = useTranslations('common');

  // Helper to translate category (handles both new keys and legacy names)
  const translateCategory = (category: string | undefined | null): string => {
    if (!category) return '';
    // Check if it's already a translation key
    if (INCOME_CATEGORY_KEYS.includes(category as typeof INCOME_CATEGORY_KEYS[number])) {
      return tCategories(category as typeof INCOME_CATEGORY_KEYS[number]);
    }
    // Check if it's a legacy name that needs mapping
    const key = INCOME_CATEGORY_NAME_TO_KEY[category];
    if (key) {
      return tCategories(key);
    }
    // Return as-is if not found
    return category;
  };

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingSourceId, setDeletingSourceId] = useState<string | null>(null);

  // Default to current month in YYYY-MM format
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(currentMonth);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set());
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);

  // Use default view preferences from user settings
  const { viewMode, setViewMode } = useViewPreferences();
  // Column configuration for list view
  const columnConfig: ColumnConfig[] = React.useMemo(() => [
    { id: 'name', label: tOverview('name'), locked: true },
    { id: 'description', label: tCommon('common.description') },
    { id: 'category', label: tOverview('category') },
    { id: 'amount', label: tOverview('amount') },
    { id: 'frequency', label: tOverview('frequency') },
    { id: 'monthlyEquivalent', label: tOverview('monthlyEquivalent') },
    { id: 'originalAmount', label: tOverview('originalAmount') },
    { id: 'status', label: tCommon('common.status') },
  ], [tOverview, tCommon]);

  const {
    visibleColumns,
    toggleColumn,
    showAllColumns,
    isColumnVisible,
  } = useColumnVisibility('income', columnConfig);

  // Context to set action buttons in layout
  const { setActions } = React.useContext(IncomeActionsContext);

  // Helper function to get frequency label
  const getFrequencyLabel = (frequency: string) => {
    return tFrequency(frequency);
  };

  const {
    data: sourcesData,
    isLoading: isLoadingSources,
    error: sourcesError,
    refetch: refetchSources,
  } = useListIncomeSourcesQuery({ is_active: true });

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
  } = useGetIncomeStatsQuery(statsParams);

  const [updateSource] = useUpdateIncomeSourceMutation();
  const [deleteSource, { isLoading: isDeleting }] = useDeleteIncomeSourceMutation();
  const [batchDeleteIncomeSources, { isLoading: isBatchDeleting }] = useBatchDeleteIncomeSourcesMutation();

  // Tier check for income sources
  const currentCount = sourcesData?.items?.length || 0;
  const tierCheck = useTierCheck('incomeSources', currentCount);

  const handleAddSource = React.useCallback(() => {
    // Check tier limits before opening form
    if (!tierCheck.canAdd) {
      setShowUpgradeDialog(true);
      return;
    }
    setEditingSourceId(null);
    setIsFormOpen(true);
  }, [tierCheck.canAdd]);

  const handleImportIncome = React.useCallback(() => {
    router.push('/dashboard/income/import');
  }, [router]);

  const handleArchiveSource = async (id: string) => {
    try {
      await updateSource({ id, data: { is_active: false } }).unwrap();
      toast.success('Income source archived successfully');
      setSelectedSourceIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    } catch (error) {
      toast.error('Failed to archive income source');
    }
  };

  const handleBatchArchive = React.useCallback(async () => {
    const idsToArchive = Array.from(selectedSourceIds);
    let successCount = 0;
    let failCount = 0;

    for (const id of idsToArchive) {
      try {
        await updateSource({ id, data: { is_active: false } }).unwrap();
        successCount++;
      } catch (error) {
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(`Successfully archived ${successCount} source(s)`);
    }
    if (failCount > 0) {
      toast.error(`Failed to archive ${failCount} source(s)`);
    }

    setSelectedSourceIds(new Set());
  }, [selectedSourceIds, updateSource]);

  const confirmDelete = async () => {
    if (!deletingSourceId) return;

    try {
      await deleteSource(deletingSourceId).unwrap();
      toast.success(tOverview('deleteSuccess'));
      setDeleteDialogOpen(false);
      setDeletingSourceId(null);
    } catch (error) {
      toast.error(tOverview('deleteError'));
    }
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingSourceId(null);
  };

  const handleToggleSelect = (sourceId: string) => {
    setSelectedSourceIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sourceId)) {
        newSet.delete(sourceId);
      } else {
        newSet.add(sourceId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedSourceIds.size === filteredSources.length) {
      setSelectedSourceIds(new Set());
    } else {
      setSelectedSourceIds(new Set(filteredSources.map((s) => s.id)));
    }
  };

  const handleBatchDelete = React.useCallback(() => {
    if (selectedSourceIds.size === 0) return;
    setBatchDeleteDialogOpen(true);
  }, [selectedSourceIds.size]);

  const confirmBatchDelete = async () => {
    if (selectedSourceIds.size === 0) return;

    try {
      const result = await batchDeleteIncomeSources({
        source_ids: Array.from(selectedSourceIds),
      }).unwrap();

      if (result.failed_ids.length > 0) {
        toast.error(tOverview('batchDeleteError', { count: result.failed_ids.length }));
      } else {
        toast.success(tOverview('batchDeleteSuccess', { count: result.deleted_count }));
      }

      setBatchDeleteDialogOpen(false);
      setSelectedSourceIds(new Set());
    } catch (error) {
      toast.error(tOverview('deleteError'));
    }
  };


  // Get unique categories from income sources
  const uniqueCategories = React.useMemo(() => {
    if (!sourcesData?.items) return [];
    const categories = sourcesData.items
      .map((source) => source.category)
      .filter((cat): cat is string => !!cat);
    return Array.from(new Set(categories)).sort();
  }, [sourcesData?.items]);

  // Apply all filters: month -> search/category
  const monthFilteredSources = filterByMonth(
    sourcesData?.items,
    selectedMonth,
    (source) => source.frequency,
    (source) => source.date,
    (source) => source.start_date,
    (source) => source.end_date
  );

  const searchFilteredSources = filterBySearchAndCategory(
    monthFilteredSources,
    searchQuery,
    selectedCategory,
    (source) => source.name,
    (source) => source.category
  );

  // Apply sorting (using display_amount for currency-aware sorting)
  const filteredSources = sortItems(
    searchFilteredSources,
    sortField,
    sortDirection,
    (source) => source.name,
    (source) => source.display_monthly_equivalent || source.display_amount || source.amount,
    (source) => source.start_date || source.date
  ) || [];

  // Active filter count for badge
  const activeFilterCount = React.useMemo(() => {
    let count = 0;
    if (selectedCategory !== null) count++;
    if (selectedMonth !== null) count++;
    if (sortField !== 'name' || sortDirection !== 'asc') count++;
    return count;
  }, [selectedCategory, selectedMonth, sortField, sortDirection]);

  // Sort direction label
  const sortDirectionLabel = React.useMemo(() => {
    if (sortField === 'name') {
      return sortDirection === 'asc' ? tCommon('common.sortAZ') : tCommon('common.sortZA');
    }
    if (sortField === 'amount') {
      return sortDirection === 'asc' ? tCommon('common.sortLowToHigh') : tCommon('common.sortHighToLow');
    }
    if (sortField === 'date') {
      return sortDirection === 'asc' ? tCommon('common.sortOldestFirst') : tCommon('common.sortNewestFirst');
    }
    return '';
  }, [sortField, sortDirection, tCommon]);

  // Set action buttons in layout
  React.useEffect(() => {
    setActions(
      <>
        {selectedSourceIds.size > 0 && (
          <>
            <Button
              onClick={handleBatchArchive}
              variant="outline"
              size="default"
              className="w-full sm:w-auto"
            >
              <Archive className="mr-2 h-4 w-4" />
              <span className="truncate">{tOverview('archiveSelected', { count: selectedSourceIds.size })}</span>
            </Button>
            <Button
              onClick={handleBatchDelete}
              variant="destructive"
              size="default"
              className="w-full sm:w-auto"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              <span className="truncate">{tOverview('deleteSelected', { count: selectedSourceIds.size })}</span>
            </Button>
          </>
        )}
        <SplitButton
          primaryLabel={tOverview('importIncome')}
          onPrimaryClick={handleImportIncome}
          primaryIcon={<Upload className="h-4 w-4" />}
          options={[
            {
              label: tOverview('addManually'),
              onClick: handleAddSource,
              icon: <Plus className="h-4 w-4" />,
            },
          ]}
          className="w-full sm:w-auto"
        />
      </>
    );

    // Cleanup on unmount
    return () => setActions(null);
  }, [selectedSourceIds.size, setActions, handleBatchArchive, handleBatchDelete, handleAddSource, handleImportIncome, tOverview]);

  return (
    <div className="space-y-4 md:space-y-6">

      {/* Search and Filters */}
      {(sourcesData?.items && sourcesData.items.length > 0) && (
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={tOverview('searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
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
              {/* FILTER section */}
              <div className="p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.filter')}</p>
                <Select
                  value={selectedCategory ?? '__all__'}
                  onValueChange={(val) => setSelectedCategory(val === '__all__' ? null : val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={tOverview('category')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">{tOverview('allCategories')}</SelectItem>
                    {uniqueCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{translateCategory(cat)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{tCommon('common.month')}</span>
                    {selectedMonth && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => setSelectedMonth(null)}
                      >
                        <X className="h-3 w-3 mr-1" />
                        {tCommon('common.clear')}
                      </Button>
                    )}
                  </div>
                  <Input
                    type="month"
                    value={selectedMonth ?? ''}
                    onChange={(e) => setSelectedMonth(e.target.value || null)}
                    onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                  />
                </div>
              </div>
              <Separator />
              {/* SORT section */}
              <div className="p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.sort')}</p>
                <div className="flex items-center gap-2">
                  <Select
                    value={sortField}
                    onValueChange={(val) => setSortField(val as SortField)}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">{tOverview('name')}</SelectItem>
                      <SelectItem value="amount">{tOverview('amount')}</SelectItem>
                      <SelectItem value="date">{tCommon('common.date')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
                    title={sortDirectionLabel}
                  >
                    {sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{sortDirectionLabel}</p>
              </div>
              <Separator />
              {/* VIEW section */}
              <div className="p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.view')}</p>
                <div className="inline-flex items-center gap-1 border rounded-md p-0.5 w-fit" style={{ height: '36px' }}>
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
              {/* COLUMNS section (only in list mode) */}
              {viewMode === 'list' && (
                <>
                  <Separator />
                  <div className="p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.columns')}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={showAllColumns}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        {tCommon('common.showAll')}
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {columnConfig.map((col) => (
                        <label key={col.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={isColumnVisible(col.id)}
                            onCheckedChange={() => toggleColumn(col.id)}
                            disabled={col.locked}
                          />
                          <span className="flex items-center gap-1">
                            {col.label}
                            {col.locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                          </span>
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
              <span><span className="font-semibold text-foreground">{stats.total_sources}</span> sources</span>
              <span>·</span>
              <span><span className="font-semibold text-foreground"><CurrencyDisplay amount={stats.total_monthly_income} currency={stats.currency} decimals={0} /></span>/mo</span>
              <span>·</span>
              <span><span className="font-semibold text-foreground"><CurrencyDisplay amount={stats.total_annual_income} currency={stats.currency} decimals={0} /></span>/yr</span>
            </div>
          )}
        </div>
      )}

      {/* Income Sources List */}
      <div>

        {isLoadingSources ? (
          <LoadingCards count={3} />
        ) : sourcesError ? (
          <ApiErrorState error={sourcesError} onRetry={refetchSources} />
        ) : !sourcesData?.items || sourcesData.items.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title={tOverview('noIncome')}
            description={tOverview('noIncomeDescription')}
            actionLabel={tOverview('importIncome')}
            onAction={handleImportIncome}
          />
        ) : viewMode === 'calendar' && selectedMonth ? (
          <CalendarView
            items={filteredSources.map((source) => ({
              id: source.id,
              name: source.name,
              amount: source.amount,
              currency: source.currency,
              display_amount: source.display_amount,
              display_currency: source.display_currency,
              category: source.category,
              date: source.date,
              start_date: source.start_date,
              frequency: source.frequency,
              is_active: source.is_active,
            }))}
            selectedMonth={selectedMonth}
            onMonthChange={setSelectedMonth}
            onItemClick={(id) => router.push(`/dashboard/income/${id}`)}
            selectedItemIds={selectedSourceIds}
            onToggleSelect={handleToggleSelect}
          />
        ) : !filteredSources || filteredSources.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title={selectedMonth ? tOverview('noIncomeForMonth') : tOverview('noIncome')}
            description={selectedMonth
              ? tOverview('noIncomeForMonthDescription', {
                  month: new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                })
              : tOverview('noIncomeDescription')
            }
            actionLabel={tOverview('importIncome')}
            onAction={handleImportIncome}
          />
        ) : viewMode === 'card' ? (
          <>
            {filteredSources.length > 0 && (
              <div className="flex items-center gap-2 px-1 mb-4">
                <Checkbox
                  checked={selectedSourceIds.size === filteredSources.length}
                  onCheckedChange={handleSelectAll}
                  aria-label={tOverview('selectAll')}
                />
                <span className="text-sm text-muted-foreground">
                  {selectedSourceIds.size === filteredSources.length ? tOverview('deselectAll') : tOverview('selectAll')}
                </span>
              </div>
            )}
            <div className="grid gap-3 md:gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredSources.map((source) => (
              <Card key={source.id} className="relative cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push(`/dashboard/income/${source.id}`)}>
                <CardHeader className="pb-3 md:pb-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedSourceIds.has(source.id)}
                          onCheckedChange={() => handleToggleSelect(source.id)}
                          aria-label={`Select ${source.name}`}
                          className="mt-1"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base md:text-lg truncate">{source.name}</CardTitle>
                        <CardDescription className="mt-1 min-h-[20px] text-xs md:text-sm line-clamp-2">
                          {source.description || <>&nbsp;</>}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant={source.is_active ? 'default' : 'secondary'} className="text-xs flex-shrink-0">
                      {source.is_active ? tStatus('active') : tStatus('inactive')}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2 md:space-y-3">
                    <div>
                      <div className="text-xl md:text-2xl font-bold">
                        <CurrencyDisplay
                          amount={source.display_amount ?? source.amount}
                          currency={source.display_currency ?? source.currency}
                          showSymbol={true}
                          showCode={false}
                        />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {getFrequencyLabel(source.frequency)}
                        {source.display_currency && source.display_currency !== source.currency && (
                          <span className="ml-1 text-xs">
                            (orig: {source.amount} {source.currency})
                          </span>
                        )}
                      </p>
                    </div>

                    {source.frequency !== 'one_time' && (
                      <div className="rounded-lg bg-muted p-2 md:p-3">
                        {(source.display_monthly_equivalent ?? source.monthly_equivalent) ? (
                          <>
                            <p className="text-[10px] md:text-xs text-muted-foreground">
                              {tOverview('monthlyEquivalent')}
                            </p>
                            <p className="text-xs md:text-sm font-semibold">
                              <CurrencyDisplay
                                amount={source.display_monthly_equivalent ?? source.monthly_equivalent ?? 0}
                                currency={source.display_currency ?? source.currency}
                                showSymbol={true}
                                showCode={false}
                              />
                            </p>
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">&nbsp;</p>
                        )}
                      </div>
                    )}

                    <div className="min-h-[24px]">
                      {source.category && (
                        <Badge variant="outline">{translateCategory(source.category)}</Badge>
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
                        checked={selectedSourceIds.size === filteredSources.length && filteredSources.length > 0}
                        onCheckedChange={handleSelectAll}
                        aria-label={tOverview('selectAll')}
                      />
                    </TableHead>
                    {isColumnVisible('name') && (
                      <TableHead className="w-[200px]">{tOverview('name')}</TableHead>
                    )}
                    {isColumnVisible('description') && (
                      <TableHead className="hidden md:table-cell">{tCommon('common.description')}</TableHead>
                    )}
                    {isColumnVisible('category') && (
                      <TableHead className="hidden lg:table-cell">{tOverview('category')}</TableHead>
                    )}
                    {isColumnVisible('amount') && (
                      <TableHead className="text-right">{tOverview('amount')}</TableHead>
                    )}
                    {isColumnVisible('frequency') && (
                      <TableHead className="hidden sm:table-cell">{tOverview('frequency')}</TableHead>
                    )}
                    {isColumnVisible('monthlyEquivalent') && (
                      <TableHead className="hidden xl:table-cell text-right">{tOverview('monthlyEquivalent')}</TableHead>
                    )}
                    {isColumnVisible('originalAmount') && (
                      <TableHead className="hidden 2xl:table-cell text-right">{tOverview('originalAmount')}</TableHead>
                    )}
                    {isColumnVisible('status') && (
                      <TableHead className="hidden sm:table-cell">{tCommon('common.status')}</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSources.map((source) => (
                    <TableRow key={source.id} className="cursor-pointer" onClick={() => router.push(`/dashboard/income/${source.id}`)}>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedSourceIds.has(source.id)}
                          onCheckedChange={() => handleToggleSelect(source.id)}
                          aria-label={`Select ${source.name}`}
                        />
                      </TableCell>
                      {isColumnVisible('name') && (
                        <TableCell className="font-medium">
                          <div className="max-w-[200px]">
                            <p className="truncate">{source.name}</p>
                            {!isColumnVisible('description') && (
                              <p className="text-xs text-muted-foreground md:hidden truncate">
                                {source.description}
                              </p>
                            )}
                          </div>
                        </TableCell>
                      )}
                      {isColumnVisible('description') && (
                        <TableCell className="hidden md:table-cell">
                          <p className="max-w-[250px] truncate text-sm text-muted-foreground">
                            {source.description || '-'}
                          </p>
                        </TableCell>
                      )}
                      {isColumnVisible('category') && (
                        <TableCell className="hidden lg:table-cell">
                          {source.category ? (
                            <Badge variant="outline" className="text-xs">{translateCategory(source.category)}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      )}
                      {isColumnVisible('amount') && (
                        <TableCell className="text-right font-semibold">
                          <CurrencyDisplay
                            amount={source.display_amount ?? source.amount}
                            currency={source.display_currency ?? source.currency}
                            showSymbol={true}
                            showCode={false}
                          />
                        </TableCell>
                      )}
                      {isColumnVisible('frequency') && (
                        <TableCell className="hidden sm:table-cell">
                          <span className="text-sm text-muted-foreground">
                            {getFrequencyLabel(source.frequency)}
                          </span>
                        </TableCell>
                      )}
                      {isColumnVisible('monthlyEquivalent') && (
                        <TableCell className="hidden xl:table-cell text-right">
                          {(source.display_monthly_equivalent ?? source.monthly_equivalent) ? (
                            <span className="text-sm">
                              <CurrencyDisplay
                                amount={source.display_monthly_equivalent ?? source.monthly_equivalent ?? 0}
                                currency={source.display_currency ?? source.currency}
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
                          {source.display_currency && source.display_currency !== source.currency ? (
                            <span className="text-sm text-muted-foreground">
                              {source.amount} {source.currency}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      )}
                      {isColumnVisible('status') && (
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant={source.is_active ? 'default' : 'secondary'} className="text-xs">
                            {source.is_active ? tStatus('active') : tStatus('inactive')}
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

      {/* Income Source Form Dialog */}
      {isFormOpen && (
        <IncomeSourceForm
          sourceId={editingSourceId}
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
        cancelLabel={tCommon('actions.cancel')}
        deleteLabel={tCommon('actions.delete')}
        deletingLabel={tCommon('actions.deleting')}
        isDeleting={isDeleting}
      />

      {/* Upgrade Prompt Dialog */}
      <UpgradePromptDialog
        isOpen={showUpgradeDialog}
        onClose={() => setShowUpgradeDialog(false)}
        feature={getFeatureDisplayName('incomeSources')}
        currentTier={tierCheck.currentTier}
        requiredTier={tierCheck.requiredTier || 'growth'}
        currentLimit={tierCheck.limit}
      />

      {/* Batch Delete Confirmation Dialog */}
      <BatchDeleteConfirmDialog
        open={batchDeleteDialogOpen}
        onOpenChange={setBatchDeleteDialogOpen}
        onConfirm={confirmBatchDelete}
        count={selectedSourceIds.size}
        itemName="income source"
        isDeleting={isBatchDeleting}
      />
    </div>
  );
}
