/**
 * Goals Archive Page
 * Displays archived goals with unarchive functionality
 */
'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, Trash2, CheckCircle2, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  useListGoalsQuery,
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
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { BatchDeleteConfirmDialog } from '@/components/ui/batch-delete-confirm-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { filterBySearchAndCategory } from '@/components/ui/search-filter';
import { sortItems, type SortField, type SortDirection } from '@/components/ui/sort-filter';
import { CurrencyDisplay } from '@/components/currency';
import { useViewPreferences } from '@/hooks/use-view-preferences';
import { ListControlsPopover } from '@/components/ui/list-controls-popover';
import { useRowSelection } from '@/hooks/use-row-selection';
import { GoalsActionsContext } from '../context';
import { Progress } from '@/components/ui/progress';

export default function GoalsArchivePage() {
  const router = useRouter();

  // Translations
  const tArchive = useTranslations('goals.archive');
  const tActions = useTranslations('goals.actions');
  const tCommon = useTranslations('common');
  const tStatus = useTranslations('goals.status');

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const selection = useRowSelection();
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);

  // Use default view preferences from user settings
  const { viewMode, setViewMode } = useViewPreferences();

  // Context to set action buttons in layout
  const { setActions } = React.useContext(GoalsActionsContext);

  // Fetch only archived goals (is_active: false)
  const {
    data: goalsData,
    isLoading: isLoadingGoals,
    error: goalsError,
  } = useListGoalsQuery({ is_active: false });

  const [updateGoal] = useUpdateGoalMutation();
  const [deleteGoal, { isLoading: isDeleting }] = useDeleteGoalMutation();
  const [batchDeleteGoals, { isLoading: isBatchDeleting }] = useBatchDeleteGoalsMutation();

  const goals = useMemo(() => goalsData?.items || [], [goalsData?.items]);

  // Get unique categories
  const uniqueCategories = React.useMemo(() => {
    const categories = goals
      .map((goal) => goal.category)
      .filter((cat): cat is string => !!cat);
    return Array.from(new Set(categories)).sort();
  }, [goals]);

  // Filter and sort goals
  const filteredGoals = React.useMemo(() => {
    const filtered = filterBySearchAndCategory(
      goals,
      searchQuery,
      selectedCategory,
      (goal) => goal.name,
      (goal) => goal.category || undefined
    );

    // Apply sorting
    const sorted = sortItems(
      filtered,
      sortField,
      sortDirection,
      (goal) => goal.name,
      (goal) => goal.display_target_amount || goal.target_amount,
      (goal) => goal.target_date || goal.start_date || goal.created_at
    );

    return sorted || [];
  }, [goals, searchQuery, selectedCategory, sortField, sortDirection]);

  const handleUnarchive = async (id: string) => {
    try {
      await updateGoal({ id, data: { is_active: true } }).unwrap();
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
        await updateGoal({ id, data: { is_active: true } }).unwrap();
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
  }, [selection, updateGoal, tArchive]);

  const handleDelete = (id: string) => {
    setDeletingGoalId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingGoalId) return;

    try {
      await deleteGoal(deletingGoalId).unwrap();
      toast.success(tCommon('deleteSuccess'));
      setDeleteDialogOpen(false);
      setDeletingGoalId(null);
      selection.deselect(deletingGoalId);
    } catch (error) {
      toast.error(tCommon('deleteError'));
    }
  };

  const handleBatchDelete = () => {
    setBatchDeleteDialogOpen(true);
  };

  const confirmBatchDelete = async () => {
    if (selection.size === 0) return;

    try {
      const result = await batchDeleteGoals({
        ids: Array.from(selection.selectedIds),
      }).unwrap();

      if (result.failed_ids.length > 0) {
        toast.error(tCommon('batchDeleteError', { count: result.failed_ids.length }));
      } else {
        toast.success(tCommon('batchDeleteSuccess', { count: result.deleted_count }));
      }

      setBatchDeleteDialogOpen(false);
      selection.clear();
    } catch (error) {
      toast.error(tCommon('deleteError'));
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
              <span className="truncate">{tArchive('deleteSelected', { count: selection.size })}</span>
            </Button>
          </>
        )}
      </>
    );

    return () => setActions(null);
  }, [selection.size, setActions, handleBatchUnarchive, tArchive]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedCategory !== null) count++;
    if (sortField !== 'name' || sortDirection !== 'asc') count++;
    return count;
  }, [selectedCategory, sortField, sortDirection]);

  const isLoading = isLoadingGoals;
  const hasError = goalsError;

  if (hasError) {
    return (
      <ApiErrorState
        error={goalsError}
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Search and Filters */}
      {(goals.length > 0 || searchQuery || selectedCategory) && (
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
                      <SelectValue placeholder={tCommon('common.allCategories')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{tCommon('common.allCategories')}</SelectItem>
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

      {/* Goals List */}
      <div>
        {isLoading ? (
          <LoadingCards count={6} />
        ) : !goals || goals.length === 0 ? (
          <EmptyState
            icon={Archive}
            title={tArchive('noAccounts')}
            description={tArchive('noAccountsDescription')}
          />
        ) : !filteredGoals || filteredGoals.length === 0 ? (
          <EmptyState
            icon={Archive}
            title={tCommon('noResults')}
            description={tArchive('noFilterResults')}
          />
        ) : viewMode === 'card' ? (
          <>
            {filteredGoals.length > 0 && (
              <div className="flex items-center gap-2 px-1 mb-4">
                <Checkbox
                  checked={selection.isAllSelected(filteredGoals.length)}
                  onCheckedChange={() => selection.selectAll(filteredGoals.map((goal) => goal.id))}
                  aria-label={tCommon('common.selectAll')}
                />
                <span className="text-sm text-muted-foreground">
                  {selection.isAllSelected(filteredGoals.length) ? tCommon('common.deselectAll') : tCommon('common.selectAll')}
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
                  className="relative opacity-75 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => router.push(`/dashboard/goals/${goal.id}`)}
                >
                  <CardHeader className="pb-3 md:pb-6">
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
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base md:text-lg truncate">{goal.name}</CardTitle>
                          <CardDescription className="mt-1 min-h-[20px] text-xs md:text-sm line-clamp-2">
                            {goal.description || ' '}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs flex-shrink-0">
                        {tStatus('archived')}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2 md:space-y-3">
                      {/* Target and Current Amounts */}
                      <div className="rounded-lg border bg-muted/50 p-2 md:p-3">
                        <div className="flex items-baseline justify-between mb-1">
                          <span className="text-xs text-muted-foreground">Saved</span>
                          <span className="text-xl md:text-2xl font-bold">
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
                            of <CurrencyDisplay
                              amount={displayTarget}
                              currency={displayCurrency}
                              showSymbol={true}
                              showCode={false}
                            /> target
                          </span>
                          {goal.monthly_contribution && goal.monthly_contribution > 0 && (
                            <span className="text-sm text-muted-foreground">
                              +<CurrencyDisplay
                                amount={goal.display_monthly_contribution ?? goal.monthly_contribution}
                                currency={displayCurrency}
                                showSymbol={true}
                                showCode={false}
                              />/mo
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] md:text-xs text-muted-foreground mt-1 min-h-[16px]">
                          {goal.display_currency && goal.display_currency !== goal.currency && (
                            <>
                              Original: <CurrencyDisplay
                                amount={goal.target_amount}
                                currency={goal.currency}
                                showSymbol={true}
                                showCode={false}
                              /> target{goal.monthly_contribution && goal.monthly_contribution > 0 && (
                                <>, <CurrencyDisplay
                                  amount={goal.monthly_contribution}
                                  currency={goal.currency}
                                  showSymbol={true}
                                  showCode={false}
                                />/mo</>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{Math.round(progress)}% complete</span>
                          {remaining > 0 && (
                            <span>
                              <CurrencyDisplay
                                amount={remaining}
                                currency={displayCurrency}
                                showSymbol={true}
                                showCode={false}
                              /> remaining
                            </span>
                          )}
                        </div>
                        <Progress value={progress} className="h-2" />
                      </div>

                      {/* Target Date and Status */}
                      <div className="rounded-lg bg-muted p-2 md:p-3 min-h-[60px] flex items-center justify-center">
                        {goal.target_date ? (
                          <div className="text-center w-full">
                            <p className="text-[10px] md:text-xs text-muted-foreground">
                              Target Date
                            </p>
                            <p className="text-sm font-semibold">
                              {new Date(goal.target_date).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </p>
                            {goal.is_completed && (
                              <Badge variant="default" className="text-xs mt-1">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Completed
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <div className="text-center w-full">
                            <p className="text-[10px] md:text-xs text-muted-foreground">-</p>
                            {goal.is_completed && (
                              <Badge variant="default" className="text-xs">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Completed
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="min-h-[24px]">
                        {goal.category && (
                          <Badge variant="outline" className="text-xs flex-shrink-0">{goal.category}</Badge>
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
                        checked={selection.isAllSelected(filteredGoals.length) && filteredGoals.length > 0}
                        onCheckedChange={() => selection.selectAll(filteredGoals.map((goal) => goal.id))}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead className="w-[200px]">Name</TableHead>
                    <TableHead className="hidden md:table-cell">Description</TableHead>
                    <TableHead className="hidden lg:table-cell">Category</TableHead>
                    <TableHead className="text-right">Saved</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                    <TableHead className="hidden sm:table-cell text-right">Progress</TableHead>
                    <TableHead className="hidden xl:table-cell text-right">Monthly Contrib.</TableHead>
                    <TableHead className="hidden 2xl:table-cell text-right">Original Target</TableHead>
                    <TableHead className="hidden lg:table-cell">Target Date</TableHead>
                    <TableHead className="hidden sm:table-cell">Status</TableHead>
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
                        className="opacity-75 cursor-pointer"
                        onClick={() => router.push(`/dashboard/goals/${goal.id}`)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selection.selectedIds.has(goal.id)}
                            onCheckedChange={() => selection.toggle(goal.id)}
                            aria-label={`Select ${goal.name}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="max-w-[200px]">
                            <p className="truncate">{goal.name}</p>
                            <p className="text-xs text-muted-foreground md:hidden truncate">
                              {goal.description}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <p className="max-w-[250px] truncate text-sm text-muted-foreground">
                            {goal.description || '-'}
                          </p>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {goal.category ? (
                            <Badge variant="outline" className="text-xs">{goal.category}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          <CurrencyDisplay
                            amount={displayCurrent}
                            currency={displayCurrency}
                            showSymbol={true}
                            showCode={false}
                          />
                        </TableCell>
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
                        <TableCell className="hidden sm:table-cell text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-sm font-semibold">{Math.round(progress)}%</span>
                            <Progress value={progress} className="h-1 w-16" />
                          </div>
                        </TableCell>
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
                        <TableCell className="hidden 2xl:table-cell text-right">
                          {goal.display_currency && goal.display_currency !== goal.currency ? (
                            <span className="text-sm text-muted-foreground">
                              {goal.target_amount} {goal.currency}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
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
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant={goal.is_completed ? 'default' : 'outline'} className="text-xs">
                            {goal.is_completed ? (
                              <span className="flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                {tStatus('done')}
                              </span>
                            ) : tStatus('archived')}
                          </Badge>
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
