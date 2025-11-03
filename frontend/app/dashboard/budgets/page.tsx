'use client';

import React, { useState, useMemo } from 'react';
import { Plus, TrendingUp, TrendingDown, AlertCircle, Edit, Trash2, Wallet, Target, DollarSign, LayoutGrid, List, Grid3x3, Rows3 } from 'lucide-react';
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
import { useListBudgetsQuery, useGetBudgetOverviewQuery, useDeleteBudgetMutation } from '@/lib/api/budgetsApi';
import { BudgetForm } from '@/components/budgets/budget-form';
import { BudgetProgressChart } from '@/components/budgets/budget-progress-chart';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { MonthFilter } from '@/components/ui/month-filter';
import { SearchFilter } from '@/components/ui/search-filter';
import { ModuleHeader } from '@/components/ui/module-header';
import { StatsCards, StatCard } from '@/components/ui/stats-cards';
import { SortFilter, sortItems, type SortField, type SortDirection } from '@/components/ui/sort-filter';
import { useViewPreferences } from '@/lib/hooks/use-view-preferences';

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
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Use default view preferences from user settings
  const { viewMode, setViewMode, statsViewMode, setStatsViewMode } = useViewPreferences();

  const { data: budgets, isLoading: budgetsLoading } = useListBudgetsQuery();

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
    <div className="container mx-auto space-y-4 md:space-y-6 p-4 md:p-6">
      {/* Header */}
      <ModuleHeader
        title="Budget Management"
        description="Track and manage your spending budgets"
        actionLabel="Add Budget"
        onAction={handleAddBudget}
      />

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
                        <CurrencyDisplay
                          amount={category.spent}
                          currency={overview.stats.currency}
                          showSymbol={false}
                          showCode={false}
                        /> / <CurrencyDisplay
                          amount={category.budgeted}
                          currency={overview.stats.currency}
                          showSymbol={false}
                          showCode={true}
                        />
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
                          <span className="flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" />
                            <CurrencyDisplay
                              amount={category.remaining}
                              currency={overview.stats.currency}
                              showSymbol={false}
                              showCode={false}
                            />
                            <span>left</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <TrendingDown className="h-3 w-3" />
                            <CurrencyDisplay
                              amount={Math.abs(Number(category.remaining))}
                              currency={overview.stats.currency}
                              showSymbol={false}
                              showCode={false}
                            />
                            <span>over</span>
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
              searchPlaceholder="Search budgets..."
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
        ) : viewMode === 'card' ? (
          <div className="grid gap-3 md:gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredBudgets.map((budget) => (
              <Card key={budget.id} className="relative">
                <CardHeader className="pb-3 md:pb-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-base md:text-lg truncate">{budget.name}</CardTitle>
                      <CardDescription className="mt-1 min-h-[20px] text-xs md:text-sm line-clamp-2">
                        {budget.description || ' '}
                      </CardDescription>
                    </div>
                    <Badge variant={budget.is_active ? 'default' : 'secondary'} className="text-xs flex-shrink-0">
                      {budget.is_active ? 'Active' : 'Inactive'}
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
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Name</TableHead>
                    <TableHead className="hidden md:table-cell">Description</TableHead>
                    <TableHead className="hidden lg:table-cell">Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="hidden sm:table-cell">Period</TableHead>
                    <TableHead className="hidden xl:table-cell">Date Range</TableHead>
                    <TableHead className="hidden 2xl:table-cell text-right">Original Amount</TableHead>
                    <TableHead className="hidden sm:table-cell">Status</TableHead>
                    <TableHead className="text-right w-[140px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBudgets.map((budget) => (
                    <TableRow key={budget.id}>
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
                          {budget.is_active ? 'Active' : 'Inactive'}
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
        title="Delete Budget"
        itemName="budget"
        isDeleting={isDeleting}
      />
    </div>
  );
}
