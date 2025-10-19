/**
 * Installments Tracking Page
 * Displays user's installments/loans with payment tracking
 */
'use client';

import React, { useState } from 'react';
import { CreditCard, TrendingDown, DollarSign, Edit, Trash2 } from 'lucide-react';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import {
  useListInstallmentsQuery,
  useGetInstallmentStatsQuery,
  useDeleteInstallmentMutation,
} from '@/lib/api/installmentsApi';
import {
  calculateNextPaymentDate,
  getPaymentUrgency,
  formatPaymentDate,
  getPaymentMessage,
  calculatePercentPaid,
} from '@/lib/utils/installment-payment';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { InstallmentForm } from '@/components/installments/installment-form';
import { ModuleHeader } from '@/components/ui/module-header';
import { StatsCards, StatCard } from '@/components/ui/stats-cards';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { SearchFilter, filterBySearchAndCategory } from '@/components/ui/search-filter';
import { MonthFilter, filterByMonth } from '@/components/ui/month-filter';
import { Progress } from '@/components/ui/progress';

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
};

export default function InstallmentsPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingInstallmentId, setEditingInstallmentId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingInstallmentId, setDeletingInstallmentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const {
    data: installmentsData,
    isLoading: isLoadingInstallments,
    error: installmentsError,
    refetch: refetchInstallments,
  } = useListInstallmentsQuery({});

  const {
    data: stats,
    isLoading: isLoadingStats,
    error: statsError,
  } = useGetInstallmentStatsQuery();

  const [deleteInstallment, { isLoading: isDeleting }] = useDeleteInstallmentMutation();

  const handleAddInstallment = () => {
    setEditingInstallmentId(null);
    setIsFormOpen(true);
  };

  const handleEditInstallment = (id: string) => {
    setEditingInstallmentId(id);
    setIsFormOpen(true);
  };

  const handleDeleteInstallment = (id: string) => {
    setDeletingInstallmentId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingInstallmentId) return;

    try {
      await deleteInstallment(deletingInstallmentId).unwrap();
      setDeleteDialogOpen(false);
      setDeletingInstallmentId(null);
    } catch (error) {
      console.error('Failed to delete installment:', error);
    }
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingInstallmentId(null);
  };

  // Get unique categories from installments
  const uniqueCategories = React.useMemo(() => {
    if (!installmentsData?.items) return [];
    const categories = installmentsData.items
      .map((installment) => installment.category)
      .filter((cat): cat is string => !!cat);
    return Array.from(new Set(categories)).sort();
  }, [installmentsData?.items]);

  // Apply month filter first - filter by first_payment_date and end_date range
  const monthFilteredInstallments = filterByMonth(
    installmentsData?.items,
    selectedMonth,
    (installment) => installment.frequency, // All installments are recurring
    () => null, // No one-time date field
    (installment) => installment.first_payment_date,
    (installment) => installment.end_date
  );

  // Apply search and category filters
  const filteredInstallments = filterBySearchAndCategory(
    monthFilteredInstallments,
    searchQuery,
    selectedCategory,
    (installment) => installment.name,
    (installment) => installment.category
  );

  // Prepare stats cards data
  const statsCards: StatCard[] = stats
    ? [
        {
          title: 'Total Installments',
          value: stats.total_installments,
          description: `${stats.active_installments} active`,
          icon: CreditCard,
        },
        {
          title: 'Total Debt',
          value: (
            <CurrencyDisplay
              amount={stats.total_debt}
              currency={stats.currency}
              showSymbol={true}
              showCode={false}
            />
          ),
          description: stats.debt_free_date
            ? `Debt-free by ${new Date(stats.debt_free_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
            : 'No debt-free date projected',
          icon: TrendingDown,
        },
        {
          title: 'Monthly Payment',
          value: (
            <CurrencyDisplay
              amount={stats.monthly_payment}
              currency={stats.currency}
              showSymbol={true}
              showCode={false}
            />
          ),
          description: (
            <>
              <CurrencyDisplay
                amount={stats.total_paid}
                currency={stats.currency}
                showSymbol={true}
                showCode={false}
              />{' '}
              paid so far
            </>
          ),
          icon: DollarSign,
        },
      ]
    : [];

  // Get payment badge variant based on urgency
  const getPaymentBadgeVariant = (urgency: string): 'default' | 'secondary' | 'destructive' => {
    switch (urgency) {
      case 'high':
        return 'destructive';
      case 'medium':
        return 'default';
      default:
        return 'secondary';
    }
  };

  return (
    <div className="container mx-auto space-y-4 md:space-y-6 p-4 md:p-6">
      {/* Header */}
      <ModuleHeader
        title="Installments"
        description="Track and manage your loans and payment plans"
        actionLabel="Add Installment"
        onAction={handleAddInstallment}
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

      {/* Installments List */}
      <div>
        <div className="mb-3 md:mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between min-h-[38px]">
          <h2 className="text-lg md:text-xl font-semibold">Installments</h2>
          <MonthFilter
            selectedMonth={selectedMonth}
            onMonthChange={setSelectedMonth}
          />
        </div>

        {/* Search and Category Filter */}
        <div className="mb-3 md:mb-4">
          <SearchFilter
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            categories={uniqueCategories}
            searchPlaceholder="Search installments..."
            categoryPlaceholder="All Categories"
          />
        </div>

        {isLoadingInstallments ? (
          <LoadingCards count={3} />
        ) : installmentsError ? (
          <ApiErrorState error={installmentsError} onRetry={refetchInstallments} />
        ) : !installmentsData?.items || installmentsData.items.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="No installments yet"
            description="Start tracking your loans and payment plans by adding your first one."
            actionLabel="Add Installment"
            onAction={handleAddInstallment}
          />
        ) : !filteredInstallments || filteredInstallments.length === 0 ? (
          selectedMonth ? (
            <EmptyState
              icon={CreditCard}
              title="No installments for this month"
              description={`No installments active in ${new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.`}
              actionLabel="Clear Filter"
              onAction={() => setSelectedMonth(null)}
            />
          ) : (
            <EmptyState
              icon={CreditCard}
              title="No installments found"
              description="Try adjusting your search or filter criteria."
              actionLabel="Clear Filters"
              onAction={() => {
                setSearchQuery('');
                setSelectedCategory(null);
              }}
            />
          )
        ) : (
          <div className="grid gap-3 md:gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredInstallments.map((installment) => {
              // Calculate next payment date
              const { nextPayment, isPaidOff, daysUntilPayment } = calculateNextPaymentDate(
                installment.first_payment_date,
                installment.frequency,
                installment.payments_made,
                installment.number_of_payments,
                installment.end_date
              );
              const urgency = getPaymentUrgency(daysUntilPayment);
              const paymentMessage = getPaymentMessage(daysUntilPayment, isPaidOff);
              const percentPaid = calculatePercentPaid(
                installment.payments_made,
                installment.number_of_payments
              );

              return (
                <Card key={installment.id} className="relative">
                  <CardHeader className="pb-3 md:pb-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base md:text-lg truncate">{installment.name}</CardTitle>
                        <CardDescription className="mt-1 min-h-[20px] text-xs md:text-sm line-clamp-2">
                          {installment.description || '\u00A0'}
                        </CardDescription>
                      </div>
                      <Badge variant={installment.is_active ? 'default' : 'secondary'} className="text-xs flex-shrink-0">
                        {installment.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2 md:space-y-3">
                      {/* Total and Remaining Balance */}
                      <div className="rounded-lg border bg-muted/50 p-2 md:p-3">
                        <div className="flex items-baseline justify-between mb-1">
                          <span className="text-[10px] md:text-xs text-muted-foreground">Remaining</span>
                          <span className="text-xl md:text-2xl font-bold">
                            <CurrencyDisplay
                              amount={installment.display_remaining_balance ?? installment.remaining_balance ?? installment.display_total_amount ?? installment.total_amount}
                              currency={installment.display_currency ?? installment.currency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between">
                          <span className="text-[10px] md:text-xs text-muted-foreground">
                            of{' '}
                            <CurrencyDisplay
                              amount={installment.display_total_amount ?? installment.total_amount}
                              currency={installment.display_currency ?? installment.currency}
                              showSymbol={true}
                              showCode={false}
                            />{' '}
                            total
                          </span>
                          <span className="text-xs md:text-sm text-muted-foreground">
                            <CurrencyDisplay
                              amount={installment.display_amount_per_payment ?? installment.amount_per_payment}
                              currency={installment.display_currency ?? installment.currency}
                              showSymbol={true}
                              showCode={false}
                            />{' '}
                            {FREQUENCY_LABELS[installment.frequency] || installment.frequency}
                          </span>
                        </div>
                        {installment.display_currency && installment.display_currency !== installment.currency && (
                          <div className="mt-2 text-[10px] md:text-xs text-muted-foreground">
                            Original: <CurrencyDisplay
                              amount={installment.total_amount}
                              currency={installment.currency}
                              showSymbol={true}
                              showCode={false}
                            /> total, <CurrencyDisplay
                              amount={installment.amount_per_payment}
                              currency={installment.currency}
                              showSymbol={true}
                              showCode={false}
                            /> {FREQUENCY_LABELS[installment.frequency] || installment.frequency}
                          </div>
                        )}
                      </div>

                      {/* Payment Progress */}
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>
                            {installment.payments_made} of {installment.number_of_payments} payments
                          </span>
                          <span>{percentPaid}%</span>
                        </div>
                        <Progress value={percentPaid} className="h-2" />
                      </div>

                      {/* Next Payment Date - Key Feature */}
                      <div className="rounded-lg bg-muted p-2 md:p-3 min-h-[60px]">
                        {nextPayment ? (
                          <>
                            <p className="text-[10px] md:text-xs text-muted-foreground">Next Payment</p>
                            <p className="text-xs md:text-sm font-semibold">
                              {formatPaymentDate(nextPayment)}
                            </p>
                            <Badge
                              variant={getPaymentBadgeVariant(urgency)}
                              className="mt-1 text-xs flex-shrink-0"
                            >
                              {paymentMessage}
                            </Badge>
                          </>
                        ) : (
                          <>
                            <p className="text-[10px] md:text-xs text-muted-foreground">Status</p>
                            <p className="text-xs md:text-sm font-semibold">
                              {isPaidOff ? 'Paid Off' : 'No upcoming payment'}
                            </p>
                          </>
                        )}
                      </div>

                      <div className="min-h-[24px]">
                        {installment.category && (
                          <Badge variant="outline" className="text-xs flex-shrink-0">{installment.category}</Badge>
                        )}
                      </div>

                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditInstallment(installment.id)}
                        >
                          <Edit className="mr-1 h-3 w-3" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteInstallment(installment.id)}
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

      {/* Installment Form Dialog */}
      {isFormOpen && (
        <InstallmentForm
          installmentId={editingInstallmentId}
          isOpen={isFormOpen}
          onClose={handleFormClose}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        title="Delete Installment"
        itemName="installment"
        isDeleting={isDeleting}
      />
    </div>
  );
}
