/**
 * Installments Tracking Page
 * Displays user's installments/loans with payment tracking
 */
'use client';

import React, { useState, useMemo } from 'react';

import { useRouter } from 'next/navigation';
import { CreditCard, Edit, Trash2, Archive, LayoutGrid, List, CalendarDays, Upload, Plus, Play, Filter, Search, ArrowUp, ArrowDown, Lock, RotateCcw, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import {
  useListInstallmentsQuery,
  useGetInstallmentStatsQuery,
  useUpdateInstallmentMutation,
  useDeleteInstallmentMutation,
  useBatchDeleteInstallmentsMutation,
  useProcessInstallmentDuePaymentsMutation,
} from '@/lib/api/installmentsApi';
import {
  calculateNextPaymentDate,
  getPaymentUrgency,
  formatPaymentDate,
  getPaymentMessage,
  calculatePercentPaid,
} from '@/lib/utils/installment-payment';
import { Button } from '@/components/ui/button';
import { SplitButton } from '@/components/ui/split-button';
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
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { InstallmentForm } from '@/components/installments/installment-form';
import { InstallmentsActionsContext } from '../context';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { BatchDeleteConfirmDialog } from '@/components/ui/batch-delete-confirm-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { filterBySearchAndCategory } from '@/components/ui/search-filter';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { filterByMonth } from '@/components/ui/month-filter';
import { Progress } from '@/components/ui/progress';
import { sortItems, type SortField, type SortDirection } from '@/components/ui/sort-filter';
import { Separator } from '@/components/ui/separator';
import { useViewPreferences } from '@/lib/hooks/use-view-preferences';
import { useColumnVisibility, type ColumnConfig } from '@/lib/hooks/use-column-visibility';
import { CalendarView } from '@/components/ui/calendar-view';
import { toast } from 'sonner';

export default function InstallmentsPage() {
  const router = useRouter();
  // Translation hooks
  const tOverview = useTranslations('installments.overview');
  const tCommon = useTranslations('common');
  const tFrequencies = useTranslations('installments.frequencies');
  const tPayment = useTranslations('installments.payment');
  const tCategories = useTranslations('installments.categories');

  // Helper to translate category
  const translateCategory = (category: string | undefined | null): string => {
    if (!category) return '';
    // Convert "Personal Tech" or "personal_tech" to "personalTech"
    const key = category
      .split(/[\s_&]+/)
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

  const { setActions } = React.useContext(InstallmentsActionsContext);

  const FREQUENCY_LABELS: Record<string, string> = {
    weekly: tFrequencies('weekly'),
    biweekly: tFrequencies('biweekly'),
    monthly: tFrequencies('monthly'),
  };

  // Helper function to get translated payment message
  const getTranslatedPaymentMessage = (daysUntilPayment: number, isPaidOff: boolean): string => {
    if (isPaidOff) return tPayment('paidOff');
    if (daysUntilPayment < 0) return tPayment('noUpcomingPayment');
    if (daysUntilPayment === 0) return tPayment('dueToday');
    if (daysUntilPayment === 1) return tPayment('dueIn1Day', { days: 1 });
    return tPayment('dueInDays', { days: daysUntilPayment });
  };

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
  const { viewMode, setViewMode } = useViewPreferences();
  // Column configuration for list view
  const columnConfig: ColumnConfig[] = React.useMemo(() => [
    { id: 'name', label: tOverview('name'), locked: true },
    { id: 'category', label: tOverview('category') },
    { id: 'remaining', label: tOverview('remaining') },
    { id: 'payment', label: tOverview('payment') },
    { id: 'progress', label: tOverview('progress') },
    { id: 'nextPayment', label: tOverview('nextPayment') },
    { id: 'originalTotal', label: tOverview('originalTotal') },
    { id: 'status', label: tCommon('common.status') },
  ], [tOverview, tCommon]);

  const {
    visibleColumns,
    toggleColumn,
    showAllColumns,
    isColumnVisible,
  } = useColumnVisibility('installments', columnConfig);

  const {
    data: installmentsData,
    isLoading: isLoadingInstallments,
    error: installmentsError,
    refetch: refetchInstallments,
  } = useListInstallmentsQuery({ is_active: true });

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
  } = useGetInstallmentStatsQuery(statsParams);

  const [updateInstallment] = useUpdateInstallmentMutation();
  const [deleteInstallment, { isLoading: isDeleting }] = useDeleteInstallmentMutation();
  const [batchDeleteInstallments, { isLoading: isBatchDeleting }] = useBatchDeleteInstallmentsMutation();
  const [processInstallmentDuePayments, { isLoading: isProcessingPayments }] = useProcessInstallmentDuePaymentsMutation();

  const handleAddInstallment = React.useCallback(() => {
    setEditingInstallmentId(null);
    setIsFormOpen(true);
  }, []);

  const handleImportInstallments = React.useCallback(() => {
    router.push('/dashboard/installments/import');
  }, [router]);

  const handleProcessDuePayments = React.useCallback(async () => {
    try {
      const result = await processInstallmentDuePayments().unwrap();
      if (result.due_count === 0) {
        toast.info(tOverview('noDuePayments'));
      } else if (result.processed > 0) {
        toast.success(tOverview('paymentsProcessed', {
          processed: result.processed,
          autoPaid: result.auto_paid,
          completed: result.completed
        }));
      }
      if (result.failed_payments.length > 0) {
        result.failed_payments.forEach((failure) => {
          toast.error(tOverview('paymentFailed', { name: failure.installment_name, reason: failure.reason }));
        });
      }
      refetchInstallments();
    } catch (error) {
      toast.error(tOverview('processPaymentsError'));
    }
  }, [processInstallmentDuePayments, refetchInstallments, tOverview]);

  const handleEditInstallment = React.useCallback((id: string) => {
    setEditingInstallmentId(id);
    setIsFormOpen(true);
  }, []);

  const handleDeleteInstallment = React.useCallback((id: string) => {
    setDeletingInstallmentId(id);
    setDeleteDialogOpen(true);
  }, []);

  const handleArchiveInstallment = async (id: string) => {
    try {
      await updateInstallment({ id, data: { is_active: false } }).unwrap();
      toast.success(tOverview('archiveSuccess'));
      setSelectedInstallmentIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    } catch (error) {
      toast.error(tOverview('archiveError'));
    }
  };

  const handleBatchArchive = React.useCallback(async () => {
    const idsToArchive = Array.from(selectedInstallmentIds);
    let successCount = 0;
    let failCount = 0;

    for (const id of idsToArchive) {
      try {
        await updateInstallment({ id, data: { is_active: false } }).unwrap();
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

    setSelectedInstallmentIds(new Set());
  }, [selectedInstallmentIds, updateInstallment]);

  const confirmDelete = async () => {
    if (!deletingInstallmentId) return;

    try {
      await deleteInstallment(deletingInstallmentId).unwrap();
      toast.success(tOverview('deleteSuccess'));
      setDeleteDialogOpen(false);
      setDeletingInstallmentId(null);
    } catch (error) {
      toast.error(tOverview('deleteError'));
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
        toast.error(tOverview('batchDeleteError', { count: result.failed_ids.length }));
      } else {
        toast.success(tOverview('batchDeleteSuccess', { count: result.deleted_count }));
      }
      setBatchDeleteDialogOpen(false);
      setSelectedInstallmentIds(new Set());
    } catch (error) {
      toast.error(tOverview('batchDeleteError', { count: selectedInstallmentIds.size }));
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
          <>
            <Button
              onClick={handleBatchArchive}
              variant="outline"
              size="default"
              className="w-full sm:w-auto"
            >
              <Archive className="mr-2 h-4 w-4" />
              <span className="truncate">{tOverview('archiveSelected', { count: selectedInstallmentIds.size })}</span>
            </Button>
            <Button onClick={handleBatchDelete} variant="destructive" size="default" className="w-full sm:w-auto">
              <Trash2 className="mr-2 h-4 w-4" />
              <span className="truncate">{tOverview('deleteSelected', { count: selectedInstallmentIds.size })}</span>
            </Button>
          </>
        )}
        <SplitButton
          primaryLabel={tOverview('importInstallments')}
          onPrimaryClick={handleImportInstallments}
          primaryIcon={<Upload className="h-4 w-4" />}
          options={[
            {
              label: tOverview('addManually'),
              onClick: handleAddInstallment,
              icon: <Plus className="h-4 w-4" />,
            },
            {
              label: isProcessingPayments ? tOverview('processingPayments') : tOverview('processDuePayments'),
              onClick: handleProcessDuePayments,
              icon: <Play className="h-4 w-4" />,
              disabled: isProcessingPayments,
            },
          ]}
          className="w-full sm:w-auto"
        />
      </>
    );
    return () => setActions(null);
  }, [selectedInstallmentIds.size, setActions, handleBatchArchive, handleBatchDelete, handleAddInstallment, handleImportInstallments, handleProcessDuePayments, isProcessingPayments, tOverview]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedCategory !== null) count++;
    if (selectedMonth !== null) count++;
    if (sortField !== 'name' || sortDirection !== 'asc') count++;
    return count;
  }, [selectedCategory, selectedMonth, sortField, sortDirection]);

  return (
    <div className="space-y-4 md:space-y-6">

      {/* Search and Filters */}
      {(installmentsData?.items && installmentsData.items.length > 0) && (
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
            <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="relative">
                <Filter className="h-4 w-4" />
                {activeFilterCount > 0 && (
                  <Badge className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="end">
              {/* Filter section */}
              <div className="p-3 space-y-3">
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

                {/* Month */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">{tCommon('common.month')}</label>
                    {selectedMonth && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedMonth(null)}
                        className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3 mr-1" />
                        {tCommon('common.clear')}
                      </Button>
                    )}
                  </div>
                  <input
                    type="month"
                    value={selectedMonth || ''}
                    onChange={(e) => setSelectedMonth(e.target.value || null)}
                    onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                    min="2020-01"
                    max="2030-12"
                    className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm cursor-pointer ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
              </div>

              <Separator />

              {/* Sort section */}
              <div className="p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.sort')}</p>
                <div className="flex items-center gap-2">
                  <Select value={sortField} onValueChange={(value) => setSortField(value as SortField)}>
                    <SelectTrigger className="h-8 flex-1 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">{tCommon('common.name')}</SelectItem>
                      <SelectItem value="amount">{tCommon('common.amount')}</SelectItem>
                      <SelectItem value="date">{tCommon('common.date')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
                    className="h-8 gap-1.5 flex-shrink-0"
                  >
                    {sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                    <span className="text-sm">
                      {sortField === 'name'
                        ? (sortDirection === 'asc' ? tCommon('common.sortAZ') : tCommon('common.sortZA'))
                        : sortField === 'amount'
                          ? (sortDirection === 'asc' ? tCommon('common.sortLowToHigh') : tCommon('common.sortHighToLow'))
                          : (sortDirection === 'asc' ? tCommon('common.sortOldestFirst') : tCommon('common.sortNewestFirst'))
                      }
                    </span>
                  </Button>
                </div>
              </div>

              <Separator />

              {/* View section */}
              <div className="p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.view')}</p>
                <div className="inline-flex items-center gap-1 border rounded-md p-0.5" style={{ height: '36px' }}>
                  <Button
                    variant={viewMode === 'card' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('card')}
                    className="h-[32px] w-[32px] p-0"
                    title={tOverview('cardView')}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                    className="h-[32px] w-[32px] p-0"
                    title={tOverview('listView')}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  {selectedMonth && (
                    <Button
                      variant={viewMode === 'calendar' ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode('calendar')}
                      className="h-[32px] w-[32px] p-0"
                      title={tOverview('calendarView')}
                    >
                      <CalendarDays className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Columns section (list view only) */}
              {viewMode === 'list' && (
                <>
                  <Separator />
                  <div className="p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.columns')}</p>
                      {Object.values(visibleColumns).filter(Boolean).length < columnConfig.length && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                          onClick={showAllColumns}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          {tCommon('common.showAll')}
                        </Button>
                      )}
                    </div>
                    <div className="space-y-1">
                      {columnConfig.map((column) => (
                        <label
                          key={column.id}
                          className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                            column.locked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-muted'
                          }`}
                        >
                          <Checkbox
                            checked={visibleColumns[column.id] ?? true}
                            onCheckedChange={() => toggleColumn(column.id)}
                            disabled={column.locked}
                          />
                          <span className="flex-1">{column.label}</span>
                          {column.locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </PopoverContent>
            </Popover>
          </div>

          {/* Inline stats */}
          {stats && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground flex-shrink-0 max-w-xs">
              <span><span className="font-semibold text-foreground">{stats.total_installments}</span> plans</span>
              <span>·</span>
              <span><span className="font-semibold text-foreground"><CurrencyDisplay amount={stats.total_debt} currency={stats.currency} decimals={0} /></span> debt</span>
              <span>·</span>
              <span><span className="font-semibold text-foreground"><CurrencyDisplay amount={stats.monthly_payment} currency={stats.currency} decimals={0} /></span>/mo</span>
            </div>
          )}
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
            title={tOverview('noInstallments')}
            description={tOverview('noInstallmentsDescription')}
            actionLabel={tOverview('addInstallment')}
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
            onItemClick={(id) => router.push(`/dashboard/installments/${id}`)}
            selectedItemIds={selectedInstallmentIds}
            onToggleSelect={handleToggleSelect}
          />
        ) : !filteredInstallments || filteredInstallments.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title={selectedMonth ? tOverview('noInstallmentsForMonth') : tOverview('noFilterResults')}
            description={selectedMonth
              ? `${tOverview('noInstallmentsForMonthDescription')} ${new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.`
              : tOverview('noFilterResultsDescription')
            }
            actionLabel={tOverview('addInstallment')}
            onAction={handleAddInstallment}
          />
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
                  {selectedInstallmentIds.size === filteredInstallments.length ? tOverview('deselectAll') : tOverview('selectAll')}
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
              const paymentMessage = getTranslatedPaymentMessage(daysUntilPayment, isPaidOff);
              const percentPaid = calculatePercentPaid(
                installment.payments_made,
                installment.number_of_payments
              );

              return (
                <Card
                  key={installment.id}
                  className="relative cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => router.push(`/dashboard/installments/${installment.id}`)}
                >
                  <CardHeader className="pb-3 md:pb-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <div onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedInstallmentIds.has(installment.id)}
                            onCheckedChange={() => handleToggleSelect(installment.id)}
                            aria-label={`Select ${installment.name}`}
                            className="mt-1"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base md:text-lg truncate">{installment.name}</CardTitle>
                          <CardDescription className="mt-1 min-h-[20px] text-xs md:text-sm line-clamp-2">
                            {installment.description || <>&nbsp;</>}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant={installment.is_active ? 'default' : 'secondary'} className="text-xs flex-shrink-0">
                        {installment.is_active ? tOverview('active') : tOverview('inactive')}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2 md:space-y-3">
                      {/* Total and Remaining Balance */}
                      <div className="rounded-lg border bg-muted/50 p-2 md:p-3">
                        <div className="flex items-baseline justify-between mb-1">
                          <span className="text-[10px] md:text-xs text-muted-foreground">{tOverview('remaining')}</span>
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
                            {tOverview('of')}{' '}
                            <CurrencyDisplay
                              amount={installment.display_total_amount ?? installment.total_amount}
                              currency={installment.display_currency ?? installment.currency}
                              showSymbol={true}
                              showCode={false}
                            />{' '}
                            {tOverview('total')}
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
                              {tOverview('original')}: <CurrencyDisplay
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
                            {installment.payments_made} {tOverview('of')} {installment.number_of_payments} {tOverview('payments')}
                          </span>
                          <span>{percentPaid}%</span>
                        </div>
                        <Progress value={percentPaid} className="h-2" />
                      </div>

                      {/* Next Payment Date - Key Feature */}
                      <div className="rounded-lg bg-muted p-2 md:p-3 min-h-[60px]">
                        {nextPayment ? (
                          <>
                            <p className="text-[10px] md:text-xs text-muted-foreground">{tOverview('nextPayment')}</p>
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
                            <p className="text-[10px] md:text-xs text-muted-foreground">{tOverview('status')}</p>
                            <p className="text-xs md:text-sm font-semibold">
                              {isPaidOff ? tOverview('paidOff') : tOverview('noUpcomingPayment')}
                            </p>
                          </>
                        )}
                      </div>

                      <div className="min-h-[24px]">
                        {installment.category && (
                          <Badge variant="outline" className="text-xs flex-shrink-0">{translateCategory(installment.category)}</Badge>
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
                        checked={selectedInstallmentIds.size === filteredInstallments.length}
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all installments"
                      />
                    </TableHead>
                    {isColumnVisible('name') && (
                      <TableHead className="w-[200px]">{tOverview('name')}</TableHead>
                    )}
                    {isColumnVisible('category') && (
                      <TableHead className="hidden md:table-cell">{tOverview('category')}</TableHead>
                    )}
                    {isColumnVisible('remaining') && (
                      <TableHead className="text-right">{tOverview('remaining')}</TableHead>
                    )}
                    {isColumnVisible('payment') && (
                      <TableHead className="hidden sm:table-cell text-right">{tOverview('payment')}</TableHead>
                    )}
                    {isColumnVisible('progress') && (
                      <TableHead className="hidden lg:table-cell text-right">{tOverview('progress')}</TableHead>
                    )}
                    {isColumnVisible('nextPayment') && (
                      <TableHead className="hidden xl:table-cell">{tOverview('nextPayment')}</TableHead>
                    )}
                    {isColumnVisible('originalTotal') && (
                      <TableHead className="hidden 2xl:table-cell text-right">{tOverview('originalTotal')}</TableHead>
                    )}
                    {isColumnVisible('status') && (
                      <TableHead className="hidden sm:table-cell">{tCommon('common.status')}</TableHead>
                    )}
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
                    const paymentMessage = getTranslatedPaymentMessage(daysUntilPayment, isPaidOff);
                    const percentPaid = calculatePercentPaid(
                      installment.payments_made,
                      installment.number_of_payments
                    );

                    return (
                      <TableRow
                        key={installment.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/dashboard/installments/${installment.id}`)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedInstallmentIds.has(installment.id)}
                            onCheckedChange={() => handleToggleSelect(installment.id)}
                            aria-label={`Select ${installment.name}`}
                          />
                        </TableCell>
                        {isColumnVisible('name') && (
                          <TableCell className="font-medium">
                            <div className="max-w-[200px]">
                              <p className="truncate">{installment.name}</p>
                              <p className="text-xs text-muted-foreground md:hidden truncate">
                                {installment.description}
                              </p>
                            </div>
                          </TableCell>
                        )}
                        {isColumnVisible('category') && (
                          <TableCell className="hidden md:table-cell">
                            {installment.category ? (
                              <Badge variant="outline" className="text-xs">{translateCategory(installment.category)}</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        )}
                        {isColumnVisible('remaining') && (
                          <TableCell className="text-right font-semibold">
                            <CurrencyDisplay
                              amount={installment.display_remaining_balance ?? installment.remaining_balance ?? installment.display_total_amount ?? installment.total_amount}
                              currency={installment.display_currency ?? installment.currency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </TableCell>
                        )}
                        {isColumnVisible('payment') && (
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
                        )}
                        {isColumnVisible('progress') && (
                          <TableCell className="hidden lg:table-cell text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-sm">{installment.payments_made}/{installment.number_of_payments}</span>
                              <Progress value={percentPaid} className="h-1 w-16" />
                              <span className="text-xs text-muted-foreground">{percentPaid}%</span>
                            </div>
                          </TableCell>
                        )}
                        {isColumnVisible('nextPayment') && (
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
                                {isPaidOff ? tOverview('paidOff') : '-'}
                              </span>
                            )}
                          </TableCell>
                        )}
                        {isColumnVisible('originalTotal') && (
                          <TableCell className="hidden 2xl:table-cell text-right">
                            {installment.display_currency && installment.display_currency !== installment.currency ? (
                              <span className="text-sm text-muted-foreground">
                                {installment.total_amount} {installment.currency}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        )}
                        {isColumnVisible('status') && (
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant={installment.is_active ? 'default' : 'secondary'} className="text-xs">
                              {installment.is_active ? tOverview('active') : tOverview('inactive')}
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
        title={tCommon('deleteDialog.title')}
        description={tCommon('deleteDialog.description', { item: tOverview('installment') })}
        cancelLabel={tCommon('actions.cancel')}
        deleteLabel={tCommon('actions.delete')}
        deletingLabel={tCommon('actions.deleting')}
        isDeleting={isDeleting}
      />

      {/* Batch Delete Confirmation Dialog */}
      <BatchDeleteConfirmDialog
        open={batchDeleteDialogOpen}
        onOpenChange={setBatchDeleteDialogOpen}
        onConfirm={confirmBatchDelete}
        count={selectedInstallmentIds.size}
        title={tOverview('batchDeleteTitle', { count: selectedInstallmentIds.size })}
        description={tOverview('batchDeleteDescription', { count: selectedInstallmentIds.size })}
        cancelLabel={tCommon('actions.cancel')}
        deleteLabel={tCommon('actions.delete')}
        deletingLabel={tCommon('actions.deleting')}
        isDeleting={isBatchDeleting}
      />
    </div>
  );
}
