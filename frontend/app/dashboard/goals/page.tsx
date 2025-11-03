/**
 * Goals Tracking Page
 * Displays user's financial goals with progress tracking
 */
'use client';

import React, { useState } from 'react';
import { Target, TrendingUp, DollarSign, Edit, Trash2, CheckCircle2 } from 'lucide-react';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import {
  useListGoalsQuery,
  useGetGoalStatsQuery,
  useDeleteGoalMutation,
} from '@/lib/api/goalsApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { GoalForm } from '@/components/goals/goal-form';
import { ModuleHeader } from '@/components/ui/module-header';
import { StatsCards, StatCard } from '@/components/ui/stats-cards';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { SearchFilter, filterBySearchAndCategory } from '@/components/ui/search-filter';
import { Progress } from '@/components/ui/progress';

export default function GoalsPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

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

  const handleAddGoal = () => {
    setEditingGoalId(null);
    setIsFormOpen(true);
  };

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
      setDeleteDialogOpen(false);
      setDeletingGoalId(null);
    } catch (error) {
      console.error('Failed to delete goal:', error);
    }
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingGoalId(null);
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
  const filteredGoals = filterBySearchAndCategory(
    goalsData?.items,
    searchQuery,
    selectedCategory,
    (goal) => goal.name,
    (goal) => goal.category
  );

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
    <div className="container mx-auto space-y-4 md:space-y-6 p-4 md:p-6">
      {/* Header */}
      <ModuleHeader
        title="Goals"
        description="Track and manage your financial goals"
        actionLabel="Add Goal"
        onAction={handleAddGoal}
      />

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
        <StatsCards stats={statsCards} />
      ) : null}

      {/* Goals List */}
      <div>
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between min-h-[38px]">
          <h2 className="text-xl font-semibold">Goals</h2>
        </div>

        {/* Search and Category Filter */}
        <div className="mb-4">
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
        ) : (
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
                      <div className="flex-1">
                        <CardTitle className="text-lg">{goal.name}</CardTitle>
                        <CardDescription className="mt-1 min-h-[20px]">
                          {goal.description || <>&nbsp;</>}
                        </CardDescription>
                      </div>
                      <Badge variant={goal.is_completed ? 'default' : goal.is_active ? 'secondary' : 'outline'}>
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
    </div>
  );
}
