/**
 * Expense Tracking Page
 * Displays user's expenses with statistics
 */
'use client';

import React, { useState } from 'react';
import { DollarSign, TrendingDown, Calendar, Edit, Trash2, Upload } from 'lucide-react';
import Link from 'next/link';
import {
  useListExpensesQuery,
  useGetExpenseStatsQuery,
  useDeleteExpenseMutation,
} from '@/lib/api/expensesApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { ExpenseForm } from '@/components/expenses/expense-form';
import { MonthFilter, filterByMonth } from '@/components/ui/month-filter';
import { StatsCards, StatCard } from '@/components/ui/stats-cards';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { SearchFilter, filterBySearchAndCategory } from '@/components/ui/search-filter';
import { CurrencyDisplay } from '@/components/currency';

const FREQUENCY_LABELS: Record<string, string> = {
  one_time: 'One-time',
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annually: 'Annually',
};

export default function ExpensesPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const {
    data: expensesData,
    isLoading: isLoadingExpenses,
    error: expensesError,
    refetch: refetchExpenses,
  } = useListExpensesQuery({});

  const {
    data: stats,
    isLoading: isLoadingStats,
    error: statsError,
  } = useGetExpenseStatsQuery();

  const [deleteExpense, { isLoading: isDeleting }] = useDeleteExpenseMutation();

  const handleAddExpense = () => {
    setEditingExpenseId(null);
    setIsFormOpen(true);
  };

  const handleEditExpense = (id: string) => {
    setEditingExpenseId(id);
    setIsFormOpen(true);
  };

  const handleDeleteExpense = (id: string) => {
    setDeletingExpenseId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingExpenseId) return;

    try {
      await deleteExpense(deletingExpenseId).unwrap();
      setDeleteDialogOpen(false);
      setDeletingExpenseId(null);
    } catch (error) {
      console.error('Failed to delete expense:', error);
    }
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingExpenseId(null);
  };

  // Get unique categories from expenses
  const uniqueCategories = React.useMemo(() => {
    if (!expensesData?.items) return [];
    const categories = expensesData.items
      .map((expense) => expense.category)
      .filter((cat): cat is string => !!cat);
    return Array.from(new Set(categories)).sort();
  }, [expensesData?.items]);

  // Apply all filters: month -> search/category
  const monthFilteredExpenses = filterByMonth(
    expensesData?.items,
    selectedMonth,
    (expense) => expense.frequency,
    (expense) => expense.date,
    (expense) => expense.start_date,
    (expense) => expense.end_date
  );

  const filteredExpenses = filterBySearchAndCategory(
    monthFilteredExpenses,
    searchQuery,
    selectedCategory,
    (expense) => expense.name,
    (expense) => expense.category
  );

  // Prepare stats cards data
  const statsCards: StatCard[] = stats
    ? [
        {
          title: 'Total Expenses',
          value: stats.total_expenses,
          description: `${stats.active_expenses} active`,
          icon: DollarSign,
        },
        {
          title: 'Monthly Spending',
          value: <CurrencyDisplay amount={stats.total_monthly_expense} currency={stats.currency} decimals={0} />,
          description: `From ${stats.active_expenses} active ${stats.active_expenses === 1 ? 'expense' : 'expenses'}`,
          icon: TrendingDown,
        },
        {
          title: 'Annual Spending',
          value: <CurrencyDisplay amount={stats.total_annual_expense} currency={stats.currency} decimals={0} />,
          description: 'Projected yearly expenses',
          icon: Calendar,
        },
      ]
    : [];

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Expense Tracking</h1>
          <p className="text-muted-foreground">Track and manage your expenses</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/expenses/import">
            <Button variant="outline">
              <Upload className="mr-2 h-4 w-4" />
              Import Statement
            </Button>
          </Link>
          <Button onClick={handleAddExpense}>Add Expense</Button>
        </div>
      </div>

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

      {/* Expenses List */}
      <div>
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold">Expenses</h2>
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
            searchPlaceholder="Search expenses..."
            categoryPlaceholder="All Categories"
          />
        </div>

        {isLoadingExpenses ? (
          <LoadingCards count={3} />
        ) : expensesError ? (
          <ApiErrorState error={expensesError} onRetry={refetchExpenses} />
        ) : !expensesData?.items || expensesData.items.length === 0 ? (
          <EmptyState
            icon={DollarSign}
            title="No expenses yet"
            description="Start tracking your expenses by adding your first expense."
            actionLabel="Add Expense"
            onAction={handleAddExpense}
          />
        ) : !filteredExpenses || filteredExpenses.length === 0 ? (
          selectedMonth ? (
            <EmptyState
              icon={DollarSign}
              title="No expenses for this month"
              description={`No expenses found for ${new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.`}
              actionLabel="Clear Filter"
              onAction={() => setSelectedMonth(null)}
            />
          ) : (
            <EmptyState
              icon={DollarSign}
              title="No expenses yet"
              description="Start tracking your expenses by adding your first expense."
              actionLabel="Add Expense"
              onAction={handleAddExpense}
            />
          )
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredExpenses.map((expense) => (
              <Card key={expense.id} className="relative">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{expense.name}</CardTitle>
                      <CardDescription className="mt-1 min-h-[20px]">
                        {expense.description || '\u00A0'}
                      </CardDescription>
                    </div>
                    <Badge variant={expense.is_active ? 'default' : 'secondary'}>
                      {expense.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <div className="text-2xl font-bold">
                        <CurrencyDisplay
                          amount={expense.display_amount ?? expense.amount}
                          currency={expense.display_currency ?? expense.currency}
                          showSymbol={true}
                          showCode={false}
                        />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {FREQUENCY_LABELS[expense.frequency] || expense.frequency}
                        {expense.display_currency && expense.display_currency !== expense.currency && (
                          <span className="ml-1 text-xs">
                            (orig: {expense.amount} {expense.currency})
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="rounded-lg bg-muted p-3 min-h-[60px]">
                      {(expense.display_monthly_equivalent ?? expense.monthly_equivalent) ? (
                        <>
                          <p className="text-xs text-muted-foreground">
                            Monthly equivalent
                          </p>
                          <p className="text-sm font-semibold">
                            <CurrencyDisplay
                              amount={expense.display_monthly_equivalent ?? expense.monthly_equivalent ?? 0}
                              currency={expense.display_currency ?? expense.currency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">\u00A0</p>
                      )}
                    </div>

                    <div className="min-h-[24px]">
                      {expense.category && (
                        <Badge variant="outline">{expense.category}</Badge>
                      )}
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditExpense(expense.id)}
                      >
                        <Edit className="mr-1 h-3 w-3" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteExpense(expense.id)}
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

      {/* Expense Form Dialog */}
      {isFormOpen && (
        <ExpenseForm
          expenseId={editingExpenseId}
          isOpen={isFormOpen}
          onClose={handleFormClose}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        title="Delete Expense"
        itemName="expense"
        isDeleting={isDeleting}
      />
    </div>
  );
}
