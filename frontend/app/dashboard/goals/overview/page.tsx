/**
 * Goals Tracking Page
 * Displays user's financial goals with progress tracking
 */
'use client';

import React, { useState, useCallback } from 'react';
import { Target, TrendingUp, DollarSign, Edit, Trash2, CheckCircle2, LayoutGrid, List, Grid3x3, Rows3 } from 'lucide-react';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import {
  useListGoalsQuery,
  useGetGoalStatsQuery,
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
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { GoalForm } from '@/components/goals/goal-form';

import { StatsCards, StatCard } from '@/components/ui/stats-cards';
import { GoalsActionsContext } from '../context';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { BatchDeleteConfirmDialog } from '@/components/ui/batch-delete-confirm-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchFilter, filterBySearchAndCategory } from '@/components/ui/search-filter';
import { Progress } from '@/components/ui/progress';
import { SortFilter, sortItems, type SortField, type SortDirection } from '@/components/ui/sort-filter';
import { useViewPreferences } from '@/lib/hooks/use-view-preferences';
import { toast } from 'sonner';

export default function GoalsPage() {
  // Get context for setting actions
  const { setActions } = React.useContext(GoalsActionsContext);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);
  const [selectedGoalIds, setSelectedGoalIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Use default view preferences from user settings
  const { viewMode, setViewMode, statsViewMode, setStatsViewMode } = useViewPreferences();

  const {
    data: goalsData,
    isLoading: isLoadingGoals,
    error: goalsError,
    refetch: refetchGoals,
  } = useListGoalsQuery({});

  const {
    data: stats,
    isLoading: isLoadingStats,
    error: statsError,
  } = useGetGoalStatsQuery();

  const [deleteGoal, { isLoading: isDeleting }] = useDeleteGoalMutation();
  const [batchDeleteGoals, { isLoading: isBatchDeleting }] = useBatchDeleteGoalsMutation();

  const handleAddGoal = useCallback(() => {
    setEditingGoalId(null);
    setIsFormOpen(true);
  }, []);

  const handleEditGoal = (id: string) => {
    setEditingGoalId(id);
    setIsFormOpen(true);
  };

  const handleDeleteGoal = (id: string) => {
    setDeletingGoalId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingGoalId) return;

    try {
      await deleteGoal(deletingGoalId).unwrap();
      toast.success('Goal deleted successfully');
      setDeleteDialogOpen(false);
      setDeletingGoalId(null);
    } catch (error) {
      console.error('Failed to delete goal:', error);
      toast.error('Failed to delete goal');
    }
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingGoalId(null);
  };

  const handleToggleSelect = (goalId: string) => {
    const newSelected = new Set(selectedGoalIds);
    if (newSelected.has(goalId)) {
      newSelected.delete(goalId);
    } else {
      newSelected.add(goalId);
    }
    setSelectedGoalIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedGoalIds.size === filteredGoals.length) {
      setSelectedGoalIds(new Set());
    } else {
      setSelectedGoalIds(new Set(filteredGoals.map(goal => goal.id)));
    }
  };

  const handleBatchDelete = useCallback(() => {
    if (selectedGoalIds.size === 0) return;
    setBatchDeleteDialogOpen(true);
  }, []);

  // Set action buttons in layout
  React.useEffect(() => {
    setActions(
      <>
        {selectedGoalIds.size > 0 && (
          <Button
            onClick={handleBatchDelete}
            variant="destructive"
            size="default"
            className="w-full sm:w-auto"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            <span className="truncate">Delete Selected ({selectedGoalIds.size})</span>
          </Button>
        )}
        <Button onClick={handleAddGoal} size="default" className="w-full sm:w-auto">
          <Target className="mr-2 h-4 w-4" />
          <span className="truncate">Add Goal</span>
        </Button>
      </>
    );

    return () => setActions(null);
  }, [selectedGoalIds.size, setActions, handleBatchDelete, handleAddGoal]);

  const confirmBatchDelete = async () => {
    if (selectedGoalIds.size === 0) return;

    try {
      const result = await batchDeleteGoals({
        ids: Array.from(selectedGoalIds),
      }).unwrap();

      if (result.failed_ids.length > 0) {
        toast.error(`Failed to delete ${result.failed_ids.length} goal(s)`);
      } else {
        toast.success(`Successfully deleted ${result.deleted_count} goal(s)`);
      }
      setBatchDeleteDialogOpen(false);
      setSelectedGoalIds(new Set());
    } catch (error) {
      console.error('Batch delete failed:', error);
      toast.error('Failed to delete goals');
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

  // Prepare stats cards data
  const statsCards: StatCard[] = stats
    ? [
        {
          title: 'Total Goals',
          value: stats.total_goals,
          description: `${stats.completed_goals} completed, ${stats.active_goals} active`,
          icon: Target,
        },
        {
          title: 'Total Target',
          value: (
            <CurrencyDisplay
              amount={stats.total_target_amount}
              currency={stats.currency}
              showSymbol={true}
              showCode={false}
            />
          ),
          description: (
            <>
              <CurrencyDisplay
                amount={stats.total_saved}
                currency={stats.currency}
                showSymbol={true}
                showCode={false}
              />{' '}
              saved so far
            </>
          ),
          icon: DollarSign,
        },
        {
          title: 'Average Progress',
          value: `${Math.round(stats.average_progress)}%`,
          description: (
            <>
              <CurrencyDisplay
                amount={stats.total_remaining}
                currency={stats.currency}
                showSymbol={true}
                showCode={false}
              />{' '}
              remaining
            </>
          ),
          icon: TrendingUp,
        },
      ]
    : [];

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
      {(goalsData?.items && goalsData.items.length > 0) && (
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex-1">
            <SearchFilter
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
              categories={uniqueCategories}
              searchPlaceholder="Search goals..."
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

      {/* Goals List */}
      <div>

        {isLoadingGoals ? (
          <LoadingCards count={3} />
        ) : goalsError ? (
          <ApiErrorState error={goalsError} onRetry={refetchGoals} />
        ) : !goalsData?.items || goalsData.items.length === 0 ? (
          <EmptyState
            icon={Target}
            title="No goals yet"
            description="Start tracking your financial goals by adding your first one."
            actionLabel="Add Goal"
            onAction={handleAddGoal}
          />
        ) : !filteredGoals || filteredGoals.length === 0 ? (
          <EmptyState
            icon={Target}
            title="No goals found"
            description="Try adjusting your search or filter criteria."
            actionLabel="Clear Filters"
            onAction={() => {
              setSearchQuery('');
              setSelectedCategory(null);
            }}
          />
        ) : viewMode === 'card' ? (
          <div className="space-y-3">
            {filteredGoals.length > 0 && (
              <div className="flex items-center gap-2 px-1">
                <Checkbox
                  checked={selectedGoalIds.size === filteredGoals.length}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all goals"
                />
                <span className="text-sm text-muted-foreground">
                  {selectedGoalIds.size === filteredGoals.length ? 'Deselect all' : 'Select all'}
                </span>
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredGoals.map((goal) => {
              const progress = goal.progress_percentage || 0;
              const displayTarget = goal.display_target_amount ?? goal.target_amount;
              const displayCurrent = goal.display_current_amount ?? goal.current_amount;
              const displayCurrency = goal.display_currency ?? goal.currency;
              const remaining = displayTarget - displayCurrent;

              return (
                <Card key={goal.id} className="relative">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <Checkbox
                          checked={selectedGoalIds.has(goal.id)}
                          onCheckedChange={() => handleToggleSelect(goal.id)}
                          aria-label={`Select ${goal.name}`}
                          className="mt-1"
                        />
                        <div className="flex-1">
                        <CardTitle className="text-lg">{goal.name}</CardTitle>
                        <CardDescription className="mt-1 min-h-[20px]">
                          {goal.description || <>&nbsp;</>}
                        </CardDescription>
                        </div>
                      </div>
                      <Badge variant={goal.is_completed ? 'default' : goal.is_active ? 'secondary' : 'outline'} className="flex-shrink-0">
                        {goal.is_completed ? (
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Completed
                          </span>
                        ) : goal.is_active ? 'Active' : 'Paused'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {/* Target and Current Amounts */}
                      <div className="rounded-lg border bg-muted/50 p-3">
                        <div className="flex items-baseline justify-between mb-1">
                          <span className="text-xs text-muted-foreground">Saved</span>
                          <span className="text-2xl font-bold">
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
                        <div className="mt-2 text-xs text-muted-foreground min-h-[16px]">
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

                      {/* Target Date */}
                      <div className="rounded-lg bg-muted p-3 min-h-[60px]">
                        {goal.target_date ? (
                          <>
                            <p className="text-xs text-muted-foreground">Target Date</p>
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
                          <Badge variant="outline">{goal.category}</Badge>
                        )}
                      </div>

                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditGoal(goal.id)}
                        >
                          <Edit className="mr-1 h-3 w-3" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteGoal(goal.id)}
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
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={selectedGoalIds.size === filteredGoals.length}
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all goals"
                      />
                    </TableHead>
                    <TableHead className="w-[200px]">Name</TableHead>
                    <TableHead className="hidden md:table-cell">Category</TableHead>
                    <TableHead className="text-right">Saved</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                    <TableHead className="hidden sm:table-cell text-right">Progress</TableHead>
                    <TableHead className="hidden xl:table-cell text-right">Monthly Contrib.</TableHead>
                    <TableHead className="hidden 2xl:table-cell text-right">Original Target</TableHead>
                    <TableHead className="hidden lg:table-cell">Target Date</TableHead>
                    <TableHead className="hidden sm:table-cell">Status</TableHead>
                    <TableHead className="text-right w-[140px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGoals.map((goal) => {
                    const progress = goal.progress_percentage || 0;
                    const displayTarget = goal.display_target_amount ?? goal.target_amount;
                    const displayCurrent = goal.display_current_amount ?? goal.current_amount;
                    const displayCurrency = goal.display_currency ?? goal.currency;

                    return (
                      <TableRow key={goal.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedGoalIds.has(goal.id)}
                            onCheckedChange={() => handleToggleSelect(goal.id)}
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
                          <Badge variant={goal.is_completed ? 'default' : goal.is_active ? 'secondary' : 'outline'} className="text-xs">
                            {goal.is_completed ? (
                              <span className="flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Done
                              </span>
                            ) : goal.is_active ? 'Active' : 'Paused'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditGoal(goal.id)}
                              className="h-8 w-8 p-0"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteGoal(goal.id)}
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
        title="Delete Goal"
        itemName="goal"
        isDeleting={isDeleting}
      />

      {/* Batch Delete Confirmation Dialog */}
      <BatchDeleteConfirmDialog
        open={batchDeleteDialogOpen}
        onOpenChange={setBatchDeleteDialogOpen}
        onConfirm={confirmBatchDelete}
        count={selectedGoalIds.size}
        itemName="goal"
        isDeleting={isBatchDeleting}
      />
    </div>
  );
}
