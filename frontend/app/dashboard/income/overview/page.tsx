/**
 * Income Tracking Page
 * Displays user's income sources with statistics
 */
'use client';

import React, { useState } from 'react';
import { TrendingUp, Calendar, Edit, Trash2, LayoutGrid, List, Grid3x3, Rows3, CalendarDays } from 'lucide-react';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import {
  useListIncomeSourcesQuery,
  useGetIncomeStatsQuery,
  useDeleteIncomeSourceMutation,
  useBatchDeleteIncomeSourcesMutation,
} from '@/lib/api/incomeApi';
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
import { IncomeSourceForm } from '@/components/income/income-source-form';
import { MonthFilter, filterByMonth } from '@/components/ui/month-filter';
import { StatsCards, StatCard } from '@/components/ui/stats-cards';
import { IncomeActionsContext } from '../context';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { BatchDeleteConfirmDialog } from '@/components/ui/batch-delete-confirm-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchFilter, filterBySearchAndCategory } from '@/components/ui/search-filter';
import { SortFilter, sortItems, type SortField, type SortDirection } from '@/components/ui/sort-filter';
import { useTierCheck, getFeatureDisplayName } from '@/lib/hooks/use-tier-check';
import { UpgradePromptDialog } from '@/components/upgrade-prompt';
import { useViewPreferences } from '@/lib/hooks/use-view-preferences';
import { CalendarView } from '@/components/ui/calendar-view';
import { toast } from 'sonner';

const FREQUENCY_LABELS: Record<string, string> = {
  one_time: 'One-time',
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annually: 'Annually',
};

export default function IncomePage() {
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
  const { viewMode, setViewMode, statsViewMode, setStatsViewMode } = useViewPreferences();

  // Context to set action buttons in layout
  const { setActions } = React.useContext(IncomeActionsContext);

  const {
    data: sourcesData,
    isLoading: isLoadingSources,
    error: sourcesError,
    refetch: refetchSources,
  } = useListIncomeSourcesQuery({});

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

  const handleEditSource = (id: string) => {
    setEditingSourceId(id);
    setIsFormOpen(true);
  };

  const handleDeleteSource = (id: string) => {
    setDeletingSourceId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingSourceId) return;

    try {
      await deleteSource(deletingSourceId).unwrap();
      toast.success('Income source deleted successfully');
      setDeleteDialogOpen(false);
      setDeletingSourceId(null);
    } catch (error) {
      console.error('Failed to delete income source:', error);
      toast.error('Failed to delete income source');
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
        toast.error(`Failed to delete ${result.failed_ids.length} income source(s)`);
      } else {
        toast.success(`Successfully deleted ${result.deleted_count} income source(s)`);
      }

      setBatchDeleteDialogOpen(false);
      setSelectedSourceIds(new Set());
    } catch (error) {
      console.error('Failed to batch delete income sources:', error);
      toast.error('Failed to delete income sources');
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

  // Prepare stats cards data
  const statsCards: StatCard[] = stats
    ? [
        {
          title: 'Total Sources',
          value: stats.total_sources,
          description: selectedMonth
            ? `${stats.active_sources} active in ${new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
            : `${stats.active_sources} active`,
          icon: TrendingUp,
        },
        {
          title: selectedMonth ? 'Period Income' : 'Monthly Income',
          value: (
            <CurrencyDisplay
              amount={stats.total_monthly_income}
              currency={stats.currency}
              showSymbol={true}
              showCode={false}
            />
          ),
          description: `From ${stats.active_sources} active ${stats.active_sources === 1 ? 'source' : 'sources'}`,
          icon: TrendingUp,
        },
        {
          title: 'Annual Income',
          value: (
            <CurrencyDisplay
              amount={stats.total_annual_income}
              currency={stats.currency}
              showSymbol={true}
              showCode={false}
            />
          ),
          description: selectedMonth ? 'Based on period income' : 'Projected yearly income',
          icon: Calendar,
        },
      ]
    : [];

  // Set action buttons in layout
  React.useEffect(() => {
    setActions(
      <>
        {selectedSourceIds.size > 0 && (
          <Button
            onClick={handleBatchDelete}
            variant="destructive"
            size="default"
            className="w-full sm:w-auto"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            <span className="truncate">Delete Selected ({selectedSourceIds.size})</span>
          </Button>
        )}
        <Button onClick={handleAddSource} size="default" className="w-full sm:w-auto">
          <TrendingUp className="mr-2 h-4 w-4" />
          <span className="truncate">Add Income Source</span>
        </Button>
      </>
    );

    // Cleanup on unmount
    return () => setActions(null);
  }, [selectedSourceIds.size, setActions, handleBatchDelete, handleAddSource]);

  return (
    <div className="space-y-4 md:space-y-6">

      {/* Statistics Cards */}
      {isLoadingStats ? (
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
      ) : statsError ? (
        <ApiErrorState error={statsError} />
      ) : stats ? (
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
      {(sourcesData?.items && sourcesData.items.length > 0) && (
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
            <div className="flex-1">
              <SearchFilter
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                selectedCategory={selectedCategory}
                onCategoryChange={setSelectedCategory}
                categories={uniqueCategories}
                searchPlaceholder="Search income sources..."
                categoryPlaceholder="All Categories"
              />
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <MonthFilter
                selectedMonth={selectedMonth}
                onMonthChange={setSelectedMonth}
              />
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

      {/* Income Sources List */}
      <div>

        {isLoadingSources ? (
          <LoadingCards count={3} />
        ) : sourcesError ? (
          <ApiErrorState error={sourcesError} onRetry={refetchSources} />
        ) : !sourcesData?.items || sourcesData.items.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="No income sources yet"
            description="Start tracking your income by adding your first income source."
            actionLabel="Add Income Source"
            onAction={handleAddSource}
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
            onItemClick={handleEditSource}
            selectedItemIds={selectedSourceIds}
            onToggleSelect={handleToggleSelect}
          />
        ) : !filteredSources || filteredSources.length === 0 ? (
          selectedMonth ? (
            <EmptyState
              icon={TrendingUp}
              title="No income sources for this month"
              description={`No income sources found for ${new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.`}
              actionLabel="Clear Filter"
              onAction={() => setSelectedMonth(null)}
            />
          ) : (
            <EmptyState
              icon={TrendingUp}
              title="No income sources yet"
              description="Start tracking your income by adding your first income source."
              actionLabel="Add Income Source"
              onAction={handleAddSource}
            />
          )
        ) : viewMode === 'card' ? (
          <div className="grid gap-3 md:gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredSources.map((source) => (
              <Card key={source.id} className="relative">
                <CardHeader className="pb-3 md:pb-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <Checkbox
                        checked={selectedSourceIds.has(source.id)}
                        onCheckedChange={() => handleToggleSelect(source.id)}
                        aria-label={`Select ${source.name}`}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base md:text-lg truncate">{source.name}</CardTitle>
                        <CardDescription className="mt-1 min-h-[20px] text-xs md:text-sm line-clamp-2">
                          {source.description || <>&nbsp;</>}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant={source.is_active ? 'default' : 'secondary'} className="text-xs flex-shrink-0">
                      {source.is_active ? 'Active' : 'Inactive'}
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
                        {FREQUENCY_LABELS[source.frequency] || source.frequency}
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
                              Monthly equivalent
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
                        <Badge variant="outline">{source.category}</Badge>
                      )}
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditSource(source.id)}
                      >
                        <Edit className="mr-1 h-3 w-3" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteSource(source.id)}
                        disabled={isDeleting}
                      >
                        <Trash2 className="mr-1 h-3 w-3" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
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
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead className="w-[200px]">Name</TableHead>
                    <TableHead className="hidden md:table-cell">Description</TableHead>
                    <TableHead className="hidden lg:table-cell">Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="hidden sm:table-cell">Frequency</TableHead>
                    <TableHead className="hidden xl:table-cell text-right">Monthly Equiv.</TableHead>
                    <TableHead className="hidden 2xl:table-cell text-right">Original Amount</TableHead>
                    <TableHead className="hidden sm:table-cell">Status</TableHead>
                    <TableHead className="text-right w-[140px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSources.map((source) => (
                    <TableRow key={source.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedSourceIds.has(source.id)}
                          onCheckedChange={() => handleToggleSelect(source.id)}
                          aria-label={`Select ${source.name}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="max-w-[200px]">
                          <p className="truncate">{source.name}</p>
                          <p className="text-xs text-muted-foreground md:hidden truncate">
                            {source.description}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <p className="max-w-[250px] truncate text-sm text-muted-foreground">
                          {source.description || '-'}
                        </p>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {source.category ? (
                          <Badge variant="outline" className="text-xs">{source.category}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        <CurrencyDisplay
                          amount={source.display_amount ?? source.amount}
                          currency={source.display_currency ?? source.currency}
                          showSymbol={true}
                          showCode={false}
                        />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="text-sm text-muted-foreground">
                          {FREQUENCY_LABELS[source.frequency] || source.frequency}
                        </span>
                      </TableCell>
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
                      <TableCell className="hidden 2xl:table-cell text-right">
                        {source.display_currency && source.display_currency !== source.currency ? (
                          <span className="text-sm text-muted-foreground">
                            {source.amount} {source.currency}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant={source.is_active ? 'default' : 'secondary'} className="text-xs">
                          {source.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditSource(source.id)}
                            className="h-8 w-8 p-0"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteSource(source.id)}
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
        title="Delete Income Source"
        itemName="income source"
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
