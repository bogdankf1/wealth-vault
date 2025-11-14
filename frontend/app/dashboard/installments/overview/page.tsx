/**
 * Installments Tracking Page
 * Displays user's installments/loans with payment tracking
 */
'use client';

import React, { useState } from 'react';
import { CreditCard, TrendingDown, DollarSign, Edit, Trash2, LayoutGrid, List, Grid3x3, Rows3, CalendarDays } from 'lucide-react';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import {
  useListInstallmentsQuery,
  useGetInstallmentStatsQuery,
  useDeleteInstallmentMutation,
  useBatchDeleteInstallmentsMutation,
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
import { InstallmentForm } from '@/components/installments/installment-form';
import { StatsCards, StatCard } from '@/components/ui/stats-cards';
import { InstallmentsActionsContext } from '../context';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { BatchDeleteConfirmDialog } from '@/components/ui/batch-delete-confirm-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchFilter, filterBySearchAndCategory } from '@/components/ui/search-filter';
import { MonthFilter, filterByMonth } from '@/components/ui/month-filter';
import { Progress } from '@/components/ui/progress';
import { SortFilter, sortItems, type SortField, type SortDirection } from '@/components/ui/sort-filter';
import { useViewPreferences } from '@/lib/hooks/use-view-preferences';
import { CalendarView } from '@/components/ui/calendar-view';
import { toast } from 'sonner';

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
};

export default function InstallmentsPage() {
  const { setActions } = React.useContext(InstallmentsActionsContext);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingInstallmentId, setEditingInstallmentId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingInstallmentId, setDeletingInstallmentId] = useState<string | null>(null);
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);
  const [selectedInstallmentIds, setSelectedInstallmentIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Default to current month in YYYY-MM format
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(currentMonth);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Use default view preferences from user settings
  const { viewMode, setViewMode, statsViewMode, setStatsViewMode } = useViewPreferences();

  const {
    data: installmentsData,
    isLoading: isLoadingInstallments,
    error: installmentsError,
    refetch: refetchInstallments,
  } = useListInstallmentsQuery({});

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
  } = useGetInstallmentStatsQuery(statsParams);

  const [deleteInstallment, { isLoading: isDeleting }] = useDeleteInstallmentMutation();
  const [batchDeleteInstallments, { isLoading: isBatchDeleting }] = useBatchDeleteInstallmentsMutation();

  const handleAddInstallment = React.useCallback(() => {
    setEditingInstallmentId(null);
    setIsFormOpen(true);
  }, []);

  const handleEditInstallment = React.useCallback((id: string) => {
    setEditingInstallmentId(id);
    setIsFormOpen(true);
  }, []);

  const handleDeleteInstallment = React.useCallback((id: string) => {
    setDeletingInstallmentId(id);
    setDeleteDialogOpen(true);
  }, []);

  const confirmDelete = async () => {
    if (!deletingInstallmentId) return;

    try {
      await deleteInstallment(deletingInstallmentId).unwrap();
      toast.success('Installment deleted successfully');
      setDeleteDialogOpen(false);
      setDeletingInstallmentId(null);
    } catch (error) {
      console.error('Failed to delete installment:', error);
      toast.error('Failed to delete installment');
    }
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingInstallmentId(null);
  };

  const handleToggleSelect = (installmentId: string) => {
    const newSelected = new Set(selectedInstallmentIds);
    if (newSelected.has(installmentId)) {
      newSelected.delete(installmentId);
    } else {
      newSelected.add(installmentId);
    }
    setSelectedInstallmentIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedInstallmentIds.size === filteredInstallments.length) {
      setSelectedInstallmentIds(new Set());
    } else {
      setSelectedInstallmentIds(new Set(filteredInstallments.map(installment => installment.id)));
    }
  };

  const handleBatchDelete = React.useCallback(() => {
    if (selectedInstallmentIds.size === 0) return;
    setBatchDeleteDialogOpen(true);
  }, [selectedInstallmentIds.size]);

  const confirmBatchDelete = async () => {
    if (selectedInstallmentIds.size === 0) return;

    try {
      const result = await batchDeleteInstallments({
        ids: Array.from(selectedInstallmentIds),
      }).unwrap();

      if (result.failed_ids.length > 0) {
        toast.error(`Failed to delete ${result.failed_ids.length} installment(s)`);
      } else {
        toast.success(`Successfully deleted ${result.deleted_count} installment(s)`);
      }
      setBatchDeleteDialogOpen(false);
      setSelectedInstallmentIds(new Set());
    } catch (error) {
      console.error('Batch delete failed:', error);
      toast.error('Failed to delete installments');
    }
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
  const searchFilteredInstallments = filterBySearchAndCategory(
    monthFilteredInstallments,
    searchQuery,
    selectedCategory,
    (installment) => installment.name,
    (installment) => installment.category
  );

  // Apply sorting (using display_total_amount for currency-aware sorting)
  const filteredInstallments = sortItems(
    searchFilteredInstallments,
    sortField,
    sortDirection,
    (installment) => installment.name,
    (installment) => installment.display_total_amount || installment.total_amount,
    (installment) => installment.start_date
  ) || [];

  // Prepare stats cards data
  const statsCards: StatCard[] = stats
    ? [
        {
          title: 'Total Installments',
          value: stats.total_installments,
          description: selectedMonth
            ? `${stats.active_installments} active in ${new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
            : `${stats.active_installments} active`,
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
          title: selectedMonth ? 'Period Payment' : 'Monthly Payment',
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

  // Inject action buttons into layout
  React.useEffect(() => {
    setActions(
      <>
        {selectedInstallmentIds.size > 0 && (
          <Button onClick={handleBatchDelete} variant="destructive" size="default" className="w-full sm:w-auto">
            <Trash2 className="mr-2 h-4 w-4" />
            <span className="truncate">Delete Selected ({selectedInstallmentIds.size})</span>
          </Button>
        )}
        <Button onClick={handleAddInstallment} size="default" className="w-full sm:w-auto">
          <CreditCard className="mr-2 h-4 w-4" />
          <span className="truncate">Add Installment</span>
        </Button>
      </>
    );
    return () => setActions(null);
  }, [selectedInstallmentIds.size, setActions, handleBatchDelete, handleAddInstallment]);

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
      {(installmentsData?.items && installmentsData.items.length > 0) && (
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex-1">
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

      {/* Installments List */}
      <div>
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
        ) : viewMode === 'calendar' && selectedMonth ? (
          <CalendarView
            items={filteredInstallments.map((installment) => ({
              id: installment.id,
              name: installment.name,
              amount: installment.amount_per_payment,
              currency: installment.currency,
              display_amount: installment.display_amount_per_payment,
              display_currency: installment.display_currency,
              category: installment.category,
              date: null,
              start_date: installment.start_date,
              frequency: installment.frequency,
              is_active: installment.is_active,
            }))}
            selectedMonth={selectedMonth}
            onMonthChange={setSelectedMonth}
            onItemClick={handleEditInstallment}
            selectedItemIds={selectedInstallmentIds}
            onToggleSelect={handleToggleSelect}
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
        ) : viewMode === 'card' ? (
          <div className="space-y-3">
            {filteredInstallments.length > 0 && (
              <div className="flex items-center gap-2 px-1">
                <Checkbox
                  checked={selectedInstallmentIds.size === filteredInstallments.length}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all installments"
                />
                <span className="text-sm text-muted-foreground">
                  {selectedInstallmentIds.size === filteredInstallments.length ? 'Deselect all' : 'Select all'}
                </span>
              </div>
            )}
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
                      <div className="flex items-start gap-3 flex-1">
                        <Checkbox
                          checked={selectedInstallmentIds.has(installment.id)}
                          onCheckedChange={() => handleToggleSelect(installment.id)}
                          aria-label={`Select ${installment.name}`}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                        <CardTitle className="text-base md:text-lg truncate">{installment.name}</CardTitle>
                        <CardDescription className="mt-1 min-h-[20px] text-xs md:text-sm line-clamp-2">
                          {installment.description || <>&nbsp;</>}
                        </CardDescription>
                        </div>
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
                        <div className="mt-2 text-[10px] md:text-xs text-muted-foreground min-h-[16px]">
                          {installment.display_currency && installment.display_currency !== installment.currency && (
                            <>
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
                            </>
                          )}
                        </div>
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
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={selectedInstallmentIds.size === filteredInstallments.length}
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all installments"
                      />
                    </TableHead>
                    <TableHead className="w-[200px]">Name</TableHead>
                    <TableHead className="hidden md:table-cell">Category</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead className="hidden sm:table-cell text-right">Payment</TableHead>
                    <TableHead className="hidden lg:table-cell text-right">Progress</TableHead>
                    <TableHead className="hidden xl:table-cell">Next Payment</TableHead>
                    <TableHead className="hidden 2xl:table-cell text-right">Original Total</TableHead>
                    <TableHead className="hidden sm:table-cell">Status</TableHead>
                    <TableHead className="text-right w-[140px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInstallments.map((installment) => {
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
                      <TableRow key={installment.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedInstallmentIds.has(installment.id)}
                            onCheckedChange={() => handleToggleSelect(installment.id)}
                            aria-label={`Select ${installment.name}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="max-w-[200px]">
                            <p className="truncate">{installment.name}</p>
                            <p className="text-xs text-muted-foreground md:hidden truncate">
                              {installment.description}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {installment.category ? (
                            <Badge variant="outline" className="text-xs">{installment.category}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          <CurrencyDisplay
                            amount={installment.display_remaining_balance ?? installment.remaining_balance ?? installment.display_total_amount ?? installment.total_amount}
                            currency={installment.display_currency ?? installment.currency}
                            showSymbol={true}
                            showCode={false}
                          />
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-right">
                          <div className="flex flex-col items-end">
                            <span className="text-sm">
                              <CurrencyDisplay
                                amount={installment.display_amount_per_payment ?? installment.amount_per_payment}
                                currency={installment.display_currency ?? installment.currency}
                                showSymbol={true}
                                showCode={false}
                              />
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {FREQUENCY_LABELS[installment.frequency] || installment.frequency}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-sm">{installment.payments_made}/{installment.number_of_payments}</span>
                            <Progress value={percentPaid} className="h-1 w-16" />
                            <span className="text-xs text-muted-foreground">{percentPaid}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          {nextPayment ? (
                            <div className="flex flex-col gap-1">
                              <span className="text-sm">
                                {formatPaymentDate(nextPayment)}
                              </span>
                              <Badge
                                variant={getPaymentBadgeVariant(urgency)}
                                className="text-xs w-fit"
                              >
                                {paymentMessage}
                              </Badge>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              {isPaidOff ? 'Paid Off' : '-'}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="hidden 2xl:table-cell text-right">
                          {installment.display_currency && installment.display_currency !== installment.currency ? (
                            <span className="text-sm text-muted-foreground">
                              {installment.total_amount} {installment.currency}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant={installment.is_active ? 'default' : 'secondary'} className="text-xs">
                            {installment.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditInstallment(installment.id)}
                              className="h-8 w-8 p-0"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteInstallment(installment.id)}
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

      {/* Batch Delete Confirmation Dialog */}
      <BatchDeleteConfirmDialog
        open={batchDeleteDialogOpen}
        onOpenChange={setBatchDeleteDialogOpen}
        onConfirm={confirmBatchDelete}
        count={selectedInstallmentIds.size}
        itemName="installment"
        isDeleting={isBatchDeleting}
      />
    </div>
  );
}
