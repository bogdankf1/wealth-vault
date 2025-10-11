'use client';

import React, { useState, useMemo } from 'react';
import { Plus, TrendingUp, TrendingDown, AlertCircle, Edit, Trash2, Wallet, Target, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useListBudgetsQuery, useGetBudgetOverviewQuery, useDeleteBudgetMutation } from '@/lib/api/budgetsApi';
import { BudgetForm } from '@/components/budgets/budget-form';
import { BudgetProgressChart } from '@/components/budgets/budget-progress-chart';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { MonthFilter } from '@/components/ui/month-filter';
import { SearchFilter } from '@/components/ui/search-filter';
import { StatsCards, StatCard } from '@/components/ui/stats-cards';

const PERIOD_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

export default function BudgetsPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingBudgetId, setDeletingBudgetId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const { data: budgets, isLoading: budgetsLoading } = useListBudgetsQuery();
  const { data: overview, isLoading: overviewLoading } = useGetBudgetOverviewQuery();
  const [deleteBudget, { isLoading: isDeleting }] = useDeleteBudgetMutation();

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

    return filtered;
  }, [budgets, selectedMonth, searchQuery, selectedCategory]);

  const handleAddBudget = () => {
    setEditingBudgetId(null);
    setShowCreateModal(true);
  };

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
      setDeleteDialogOpen(false);
      setDeletingBudgetId(null);
    } catch (error) {
      console.error('Failed to delete budget:', error);
    }
  };

  const handleFormClose = () => {
    setShowCreateModal(false);
    setEditingBudgetId(null);
  };

  const formatCurrency = (amount: number | string, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Number(amount));
  };

  // Prepare stats cards data from overview
  const statsCards: StatCard[] = overview?.stats
    ? [
        {
          title: 'Total Budgeted',
          value: formatCurrency(overview.stats.total_budgeted, overview.stats.currency),
          description: `${overview.stats.active_budgets} active ${overview.stats.active_budgets === 1 ? 'budget' : 'budgets'}`,
          icon: Wallet,
        },
        {
          title: 'Total Spent',
          value: formatCurrency(overview.stats.total_spent, overview.stats.currency),
          description: `${overview.stats.overall_percentage_used.toFixed(1)}% of budget used`,
          icon: DollarSign,
        },
        {
          title: 'Remaining',
          value: formatCurrency(overview.stats.total_remaining, overview.stats.currency),
          description: overview.stats.budgets_overspent > 0
            ? `${overview.stats.budgets_overspent} ${overview.stats.budgets_overspent === 1 ? 'budget' : 'budgets'} overspent`
            : `${overview.stats.budgets_near_limit} near limit`,
          icon: Target,
        },
      ]
    : [];

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Budget Management</h1>
          <p className="text-muted-foreground">Track and manage your spending budgets</p>
        </div>
        <Button onClick={handleAddBudget}>
          <Plus className="mr-2 h-4 w-4" />
          Add Budget
        </Button>
      </div>

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
        <StatsCards stats={statsCards} />
      ) : null}

      {/* Alerts Section */}
      {overview && (
        <>
          {overview.alerts.length > 0 && (
            <Card className="border-amber-200 dark:border-amber-800">
              <CardHeader>
                <CardTitle className="flex items-center text-amber-600 dark:text-amber-400">
                  <AlertCircle className="mr-2 h-5 w-5" />
                  Budget Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {overview.alerts.map((alert, index) => (
                    <div
                      key={index}
                      className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-sm"
                    >
                      {alert}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Budget Progress Chart */}
          {overview.by_category.length > 0 && (
            <BudgetProgressChart data={overview.by_category} currency={overview.stats.currency} />
          )}

          {/* Budget by Category */}
          <Card>
            <CardHeader>
              <CardTitle>Budget by Category</CardTitle>
              <CardDescription>Your spending by category</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {overview.by_category.map((category) => (
                  <div key={category.category} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{category.category}</span>
                        {category.is_overspent && (
                          <span className="text-xs px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400">
                            Overspent
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {Number(category.spent).toLocaleString()} / {Number(category.budgeted).toLocaleString()} {overview.stats.currency}
                      </span>
                    </div>
                    <div className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          category.is_overspent
                            ? 'bg-red-500'
                            : Number(category.percentage_used) >= 80
                            ? 'bg-amber-500'
                            : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(Number(category.percentage_used), 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {Number(category.percentage_used).toFixed(1)}% used
                      </span>
                      <span className={Number(category.remaining) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                        {Number(category.remaining) >= 0 ? (
                          <span className="flex items-center">
                            <TrendingUp className="mr-1 h-3 w-3" />
                            {Number(category.remaining).toLocaleString()} left
                          </span>
                        ) : (
                          <span className="flex items-center">
                            <TrendingDown className="mr-1 h-3 w-3" />
                            {Math.abs(Number(category.remaining)).toLocaleString()} over
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Budget List */}
      <div>
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold">Budgets</h2>
          <MonthFilter
            selectedMonth={selectedMonth}
            onMonthChange={setSelectedMonth}
          />
        </div>

        {/* Search and Category Filter */}
        <div className="mb-4">
          <SearchFilter
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            categories={uniqueCategories}
            searchPlaceholder="Search budgets..."
            categoryPlaceholder="All Categories"
          />
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading budgets...</div>
        ) : !budgets || budgets.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No budgets yet. Create your first budget to get started!</p>
          </div>
        ) : !filteredBudgets || filteredBudgets.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No budgets found matching your filters.</p>
            <Button
              variant="link"
              onClick={() => {
                setSelectedMonth(null);
                setSearchQuery('');
                setSelectedCategory(null);
              }}
              className="mt-2"
            >
              Clear Filters
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredBudgets.map((budget) => (
              <Card key={budget.id} className="relative">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{budget.name}</CardTitle>
                      <CardDescription className="mt-1 min-h-[20px]">
                        {budget.description || ' '}
                      </CardDescription>
                    </div>
                    <Badge variant={budget.is_active ? 'default' : 'secondary'}>
                      {budget.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <div className="text-2xl font-bold">
                        {formatCurrency(budget.amount, budget.currency)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {PERIOD_LABELS[budget.period] || budget.period}
                      </p>
                    </div>

                    <div className="rounded-lg bg-muted p-3 min-h-[60px] flex items-center justify-center">
                      <p className="text-xs text-muted-foreground">
                        Period: {budget.start_date.split('T')[0]}
                        {budget.end_date ? ` to ${budget.end_date.split('T')[0]}` : ' (ongoing)'}
                      </p>
                    </div>

                    <div className="min-h-[24px]">
                      {budget.category && (
                        <Badge variant="outline">{budget.category}</Badge>
                      )}
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditBudget(budget.id)}
                      >
                        <Edit className="mr-1 h-3 w-3" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteBudget(budget.id)}
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
        title="Delete Budget"
        itemName="budget"
        isDeleting={isDeleting}
      />
    </div>
  );
}
