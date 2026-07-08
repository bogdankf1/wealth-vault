/**
 * Goals Tracking Page
 * Displays user's financial goals with progress tracking
 */
'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Target, Archive, CheckCircle2, Link2, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import {
  useListGoalsQuery,
  useGetGoalStatsQuery,
  useUpdateGoalMutation,
  useDeleteGoalMutation,
  useBatchDeleteGoalsMutation,
} from '@/lib/api/goalsApi';
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { GoalForm } from '@/components/goals/goal-form';

import { GoalsActionsContext } from '../context';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { BatchDeleteConfirmDialog } from '@/components/ui/batch-delete-confirm-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { filterBySearchAndCategory } from '@/components/ui/search-filter';
import { Progress } from '@/components/ui/progress';
import { sortItems, type SortField, type SortDirection } from '@/components/ui/sort-filter';
import { useViewPreferences } from '@/hooks/use-view-preferences';
import { useColumnVisibility, type ColumnConfig } from '@/hooks/use-column-visibility';
import { ListControlsPopover } from '@/components/ui/list-controls-popover';
import { useRowSelection } from '@/hooks/use-row-selection';
import { toast } from 'sonner';

export default function GoalsPage() {
  const router = useRouter();

  // Translations
  const tOverview = useTranslations('goals.overview');
  const tActions = useTranslations('goals.actions');
  const tCommon = useTranslations('common');
  const tCategories = useTranslations('goals.categories');
  const tStatus = useTranslations('goals.status');

  // Legacy mapping for old category values to translation keys
  const GOAL_CATEGORY_MAP: Record<string, string> = {
    'Home/Property': 'homeProperty',
    'Vehicle': 'vehicle',
    'Education': 'education',
    'Wedding': 'wedding',
    'Travel': 'travelVacation',
    'Travel/Vacation': 'travelVacation',
    'Emergency Fund': 'emergencyFund',
    'Major Purchase': 'majorPurchase',
    'General Savings': 'generalSavings',
    'Retirement': 'retirement',
    'Other': 'other',
  };

  // Helper to translate category
  const translateCategory = (category: string | undefined | null): string => {
    if (!category) return '';

    // Check legacy mapping first
    if (GOAL_CATEGORY_MAP[category]) {
      return tCategories(GOAL_CATEGORY_MAP[category] as Parameters<typeof tCategories>[0]);
    }

    // Convert "travel_vacation" to "travelVacation"
    const key = category
      .split(/[\s_]+/)
      .filter(word => word.length > 0)
      .map((word, index) =>
        index === 0
          ? word.toLowerCase()
          : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      )
      .join('');
    try {
      return tCategories(key as Parameters<typeof tCategories>[0]);
    } catch {
      return category;
    }
  };

  // Get context for setting actions
  const { setActions } = React.useContext(GoalsActionsContext);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);
  const selection = useRowSelection();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Use default view preferences from user settings
  const { viewMode, setViewMode } = useViewPreferences();

  // Column configuration for list view
  const columnConfig: ColumnConfig[] = React.useMemo(() => [
    { id: 'name', label: tOverview('name'), locked: true },
    { id: 'category', label: tOverview('category') },
    { id: 'saved', label: tOverview('saved') },
    { id: 'target', label: tOverview('target') },
    { id: 'progress', label: tOverview('progress') },
    { id: 'monthlyContribution', label: tOverview('monthlyContribution') },
    { id: 'originalTarget', label: tOverview('originalTarget') },
    { id: 'targetDate', label: tOverview('targetDate') },
    { id: 'status', label: tOverview('status') },
  ], [tOverview]);

  const {
    visibleColumns,
    toggleColumn,
    showAllColumns,
    isColumnVisible,
  } = useColumnVisibility('goals', columnConfig);

  const {
    data: goalsData,
    isLoading: isLoadingGoals,
    error: goalsError,
    refetch: refetchGoals,
  } = useListGoalsQuery({ is_active: true });

  const {
    data: stats,
  } = useGetGoalStatsQuery();

  const [updateGoal] = useUpdateGoalMutation();
  const [deleteGoal, { isLoading: isDeleting }] = useDeleteGoalMutation();
  const [batchDeleteGoals, { isLoading: isBatchDeleting }] = useBatchDeleteGoalsMutation();

  const handleAddGoal = useCallback(() => {
    setEditingGoalId(null);
    setIsFormOpen(true);
  }, []);

  const handleArchiveGoal = async (id: string) => {
    try {
      await updateGoal({ id, data: { is_active: false } }).unwrap();
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
        await updateGoal({ id, data: { is_active: false } }).unwrap();
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
  }, [selection, updateGoal, tOverview]);

  const confirmDelete = async () => {
    if (!deletingGoalId) return;

    try {
      await deleteGoal(deletingGoalId).unwrap();
      toast.success(tOverview('deleteSuccess'));
      setDeleteDialogOpen(false);
      setDeletingGoalId(null);
    } catch (error) {
      toast.error(tOverview('deleteError'));
    }
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingGoalId(null);
  };

  const handleBatchDelete = useCallback(() => {
    if (selection.size === 0) return;
    setBatchDeleteDialogOpen(true);
  }, [selection.size]);

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
              <Archive className="mr-2 h-4 w-4" />
              <span className="truncate">{tOverview('archiveSelected', { count: selectedGoalIds.size })}</span>
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
        <Button onClick={handleAddGoal} size="default" className="w-full sm:w-auto">
          <Target className="mr-2 h-4 w-4" />
          <span className="truncate">{tOverview('addGoal')}</span>
        </Button>
      </>
    );

    return () => setActions(null);
  }, [selection.size, setActions, handleBatchArchive, handleBatchDelete, handleAddGoal, tOverview]);

  const confirmBatchDelete = async () => {
    if (selection.size === 0) return;

    try {
      const result = await batchDeleteGoals({
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

  // Get unique categories from goals
  const uniqueCategories = React.useMemo(() => {
    if (!goalsData?.items) return [];
    const categories = goalsData.items
      .map((goal) => goal.category)
      .filter((cat): cat is string => !!cat);
    return Array.from(new Set(categories)).sort();
  }, [goalsData?.items]);

  // Apply search and category filters
  const searchFilteredGoals = filterBySearchAndCategory(
    goalsData?.items,
    searchQuery,
    selectedCategory,
    (goal) => goal.name,
    (goal) => goal.category
  );

  // Apply sorting (using display_target_amount for currency-aware sorting)
  const filteredGoals = sortItems(
    searchFilteredGoals,
    sortField,
    sortDirection,
    (goal) => goal.name,
    (goal) => goal.display_target_amount || goal.target_amount,
    (goal) => goal.target_date
  ) || [];

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedCategory !== null) count++;
    if (sortField !== 'name' || sortDirection !== 'asc') count++;
    return count;
  }, [selectedCategory, sortField, sortDirection]);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Search and Filters */}
      {(goalsData?.items && goalsData.items.length > 0) && (
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
              columnControls={{ columns: columnConfig, visibleColumns, toggleColumn, showAllColumns }}
            />
          </div>

          {/* Inline stats */}
          {stats && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground flex-shrink-0 max-w-xs">
              <span><span className="font-semibold text-foreground">{stats.total_goals}</span> goals</span>
              <span>·</span>
              <span><span className="font-semibold text-foreground"><CurrencyDisplay amount={stats.total_target_amount} currency={stats.currency} decimals={0} /></span> target</span>
              <span>·</span>
              <span><span className="font-semibold text-foreground">{Number(stats.average_progress).toFixed(2)}%</span> avg</span>
            </div>
          )}
        </div>
      )}

      {/* Goals List */}
      <div>

        {isLoadingGoals ? (
          <LoadingCards count={3} />
        ) : goalsError ? (
          <ApiErrorState error={goalsError} onRetry={refetchGoals} />
        ) : !goalsData?.items || goalsData.items.length === 0 ? (
          <EmptyState
            icon={Target}
            title={tOverview('noGoals')}
            description={tOverview('noGoalsDescription')}
            actionLabel={tOverview('addGoal')}
            onAction={handleAddGoal}
          />
        ) : !filteredGoals || filteredGoals.length === 0 ? (
          <EmptyState
            icon={Target}
            title={tCommon('noResults')}
            description={tOverview('noFilterResults')}
            actionLabel={tOverview('addGoal')}
            onAction={handleAddGoal}
          />
        ) : viewMode === 'card' ? (
          <div className="space-y-3">
            {filteredGoals.length > 0 && (
              <div className="flex items-center gap-2 px-1">
                <Checkbox
                  checked={selection.isAllSelected(filteredGoals.length)}
                  onCheckedChange={() => selection.selectAll(filteredGoals.map((goal) => goal.id))}
                  aria-label={tOverview('selectAll')}
                />
                <span className="text-sm text-muted-foreground">
                  {selection.isAllSelected(filteredGoals.length) ? tOverview('deselectAll') : tOverview('selectAll')}
                </span>
              </div>
            )}
            <div className="grid gap-3 md:gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredGoals.map((goal) => {
              const progress = goal.progress_percentage || 0;
              const displayTarget = goal.display_target_amount ?? goal.target_amount;
              const displayCurrent = goal.display_current_amount ?? goal.current_amount;
              const displayCurrency = goal.display_currency ?? goal.currency;
              const remaining = displayTarget - displayCurrent;

              return (
                <Card
                  key={goal.id}
                  className="relative cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => router.push(`/dashboard/goals/${goal.id}`)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <div onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selection.selectedIds.has(goal.id)}
                            onCheckedChange={() => selection.toggle(goal.id)}
                            aria-label={`Select ${goal.name}`}
                            className="mt-1"
                          />
                        </div>
                        <div className="flex-1">
                        <CardTitle className="text-lg">
                          {goal.name}
                          {goal.auto_track_progress && (
                            <Link2 className="h-3 w-3 inline ml-2 text-blue-500 dark:text-blue-400" />
                          )}
                        </CardTitle>
                        <CardDescription className="mt-1 min-h-[20px]">
                          {goal.description || <>&nbsp;</>}
                        </CardDescription>
                        </div>
                      </div>
                      <Badge variant={goal.is_completed ? 'default' : goal.is_active ? 'secondary' : 'outline'} className="flex-shrink-0">
                        {goal.is_completed ? (
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            {tStatus('completed')}
                          </span>
                        ) : goal.is_active ? tStatus('active') : tStatus('paused')}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {/* Target and Current Amounts */}
                      <div className="rounded-lg border bg-muted/50 p-3">
                        <div className="flex items-baseline justify-between mb-1">
                          <span className="text-xs text-muted-foreground">{tOverview('saved')}</span>
                          <span className="text-lg md:text-2xl font-bold">
                            <CurrencyDisplay
                              amount={displayCurrent}
                              currency={displayCurrency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between">
                          <span className="text-xs text-muted-foreground">
                            {tOverview('of')} <CurrencyDisplay
                              amount={displayTarget}
                              currency={displayCurrency}
                              showSymbol={true}
                              showCode={false}
                            /> {tOverview('target').toLowerCase()}
                          </span>
                          {goal.monthly_contribution && goal.monthly_contribution > 0 && (
                            <span className="text-sm text-muted-foreground">
                              +<CurrencyDisplay
                                amount={goal.display_monthly_contribution ?? goal.monthly_contribution}
                                currency={displayCurrency}
                                showSymbol={true}
                                showCode={false}
                              />{tOverview('monthlyRate')}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground min-h-[16px]">
                          {goal.display_currency && goal.display_currency !== goal.currency && (
                            <>
                              {tOverview('original')} <CurrencyDisplay
                                amount={goal.target_amount}
                                currency={goal.currency}
                                showSymbol={true}
                                showCode={false}
                              /> {tOverview('target').toLowerCase()}{goal.monthly_contribution && goal.monthly_contribution > 0 && (
                                <>, <CurrencyDisplay
                                  amount={goal.monthly_contribution}
                                  currency={goal.currency}
                                  showSymbol={true}
                                  showCode={false}
                                />{tOverview('monthlyRate')}</>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{Math.round(progress)}{tOverview('complete')}</span>
                          {remaining > 0 && (
                            <span>
                              <CurrencyDisplay
                                amount={remaining}
                                currency={displayCurrency}
                                showSymbol={true}
                                showCode={false}
                              /> {tOverview('remaining')}
                            </span>
                          )}
                        </div>
                        <Progress value={progress} className="h-2" />
                      </div>

                      {/* Target Date */}
                      <div className="rounded-lg bg-muted p-3 min-h-[60px]">
                        {goal.target_date ? (
                          <>
                            <p className="text-xs text-muted-foreground">{tOverview('targetDate')}</p>
                            <p className="text-sm font-semibold">
                              {new Date(goal.target_date).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </p>
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">&nbsp;</p>
                        )}
                      </div>

                      <div className="min-h-[24px]">
                        {goal.category && (
                          <Badge variant="outline">{translateCategory(goal.category)}</Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            </div>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={selection.isAllSelected(filteredGoals.length)}
                        onCheckedChange={() => selection.selectAll(filteredGoals.map((goal) => goal.id))}
                        aria-label={tOverview('selectAll')}
                      />
                    </TableHead>
                    {isColumnVisible('name') && (
                      <TableHead className="w-[200px]">{tOverview('name')}</TableHead>
                    )}
                    {isColumnVisible('category') && (
                      <TableHead className="hidden md:table-cell">{tOverview('category')}</TableHead>
                    )}
                    {isColumnVisible('saved') && (
                      <TableHead className="text-right">{tOverview('saved')}</TableHead>
                    )}
                    {isColumnVisible('target') && (
                      <TableHead className="text-right">{tOverview('target')}</TableHead>
                    )}
                    {isColumnVisible('progress') && (
                      <TableHead className="hidden sm:table-cell text-right">{tOverview('progress')}</TableHead>
                    )}
                    {isColumnVisible('monthlyContribution') && (
                      <TableHead className="hidden xl:table-cell text-right">{tOverview('monthlyContribution')}</TableHead>
                    )}
                    {isColumnVisible('originalTarget') && (
                      <TableHead className="hidden 2xl:table-cell text-right">{tOverview('originalTarget')}</TableHead>
                    )}
                    {isColumnVisible('targetDate') && (
                      <TableHead className="hidden lg:table-cell">{tOverview('targetDate')}</TableHead>
                    )}
                    {isColumnVisible('status') && (
                      <TableHead className="hidden sm:table-cell">{tOverview('status')}</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGoals.map((goal) => {
                    const progress = goal.progress_percentage || 0;
                    const displayTarget = goal.display_target_amount ?? goal.target_amount;
                    const displayCurrent = goal.display_current_amount ?? goal.current_amount;
                    const displayCurrency = goal.display_currency ?? goal.currency;

                    return (
                      <TableRow
                        key={goal.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/dashboard/goals/${goal.id}`)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selection.selectedIds.has(goal.id)}
                            onCheckedChange={() => selection.toggle(goal.id)}
                            aria-label={`Select ${goal.name}`}
                          />
                        </TableCell>
                        {isColumnVisible('name') && (
                          <TableCell className="font-medium">
                            <div className="max-w-[200px]">
                              <p className="truncate">
                                {goal.name}
                                {goal.auto_track_progress && (
                                  <Link2 className="h-3 w-3 inline ml-2 text-blue-500 dark:text-blue-400" />
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground md:hidden truncate">
                                {goal.description}
                              </p>
                            </div>
                          </TableCell>
                        )}
                        {isColumnVisible('category') && (
                          <TableCell className="hidden md:table-cell">
                            {goal.category ? (
                              <Badge variant="outline" className="text-xs">{translateCategory(goal.category)}</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        )}
                        {isColumnVisible('saved') && (
                          <TableCell className="text-right font-semibold">
                            <CurrencyDisplay
                              amount={displayCurrent}
                              currency={displayCurrency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </TableCell>
                        )}
                        {isColumnVisible('target') && (
                          <TableCell className="text-right">
                            <span className="text-sm text-muted-foreground">
                              <CurrencyDisplay
                                amount={displayTarget}
                                currency={displayCurrency}
                                showSymbol={true}
                                showCode={false}
                              />
                            </span>
                          </TableCell>
                        )}
                        {isColumnVisible('progress') && (
                          <TableCell className="hidden sm:table-cell text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-sm font-semibold">{Math.round(progress)}%</span>
                              <Progress value={progress} className="h-1 w-16" />
                            </div>
                          </TableCell>
                        )}
                        {isColumnVisible('monthlyContribution') && (
                          <TableCell className="hidden xl:table-cell text-right">
                            {goal.monthly_contribution && goal.monthly_contribution > 0 ? (
                              <span className="text-sm">
                                <CurrencyDisplay
                                  amount={goal.display_monthly_contribution ?? goal.monthly_contribution}
                                  currency={displayCurrency}
                                  showSymbol={true}
                                  showCode={false}
                                />
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        )}
                        {isColumnVisible('originalTarget') && (
                          <TableCell className="hidden 2xl:table-cell text-right">
                            {goal.display_currency && goal.display_currency !== goal.currency ? (
                              <span className="text-sm text-muted-foreground">
                                {goal.target_amount} {goal.currency}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        )}
                        {isColumnVisible('targetDate') && (
                          <TableCell className="hidden lg:table-cell">
                            {goal.target_date ? (
                              <span className="text-sm text-muted-foreground">
                                {new Date(goal.target_date).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        )}
                        {isColumnVisible('status') && (
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant={goal.is_completed ? 'default' : goal.is_active ? 'secondary' : 'outline'} className="text-xs">
                              {goal.is_completed ? (
                                <span className="flex items-center gap-1">
                                  <CheckCircle2 className="h-3 w-3" />
                                  {tStatus('done')}
                                </span>
                              ) : goal.is_active ? tStatus('active') : tStatus('paused')}
                            </Badge>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      {/* Goal Form Dialog */}
      {isFormOpen && (
        <GoalForm
          goalId={editingGoalId}
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
        itemName="goal"
        isDeleting={isDeleting}
        cancelLabel={tActions('cancel')}
        deleteLabel={tActions('delete')}
      />

      {/* Batch Delete Confirmation Dialog */}
      <BatchDeleteConfirmDialog
        open={batchDeleteDialogOpen}
        onOpenChange={setBatchDeleteDialogOpen}
        onConfirm={confirmBatchDelete}
        count={selection.size}
        itemName="goal"
        isDeleting={isBatchDeleting}
        cancelLabel={tActions('cancel')}
        deleteLabel={tActions('delete')}
      />
    </div>
  );
}
