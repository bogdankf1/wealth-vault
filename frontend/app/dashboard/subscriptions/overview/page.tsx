/**
 * Subscriptions Tracking Page
 * Displays user's subscriptions with next renewal dates
 */
'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Archive, LayoutGrid, List, CalendarDays, Upload, Plus, Play, Filter, Search, ArrowUp, ArrowDown, Lock, RotateCcw, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import {
  useListSubscriptionsQuery,
  useGetSubscriptionStatsQuery,
  useUpdateSubscriptionMutation,
  useDeleteSubscriptionMutation,
  useBatchDeleteSubscriptionsMutation,
  useProcessSubscriptionDuePaymentsMutation,
} from '@/lib/api/subscriptionsApi';
import {
  calculateNextRenewalDate,
  getRenewalUrgency,
  formatRenewalDate,
  getRenewalMessage,
} from '@/lib/utils/subscription-renewal';
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
import { SubscriptionForm } from '@/components/subscriptions/subscription-form';
import { SubscriptionsActionsContext } from '../context';
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
import { sortItems, type SortField, type SortDirection } from '@/components/ui/sort-filter';
import { Separator } from '@/components/ui/separator';
import { useViewPreferences } from '@/lib/hooks/use-view-preferences';
import { useColumnVisibility, type ColumnConfig } from '@/lib/hooks/use-column-visibility';
import { CalendarView } from '@/components/ui/calendar-view';
import { toast } from 'sonner';

export default function SubscriptionsPage() {
  const router = useRouter();

  // Translation hooks
  const tOverview = useTranslations('subscriptions.overview');
  const tActions = useTranslations('subscriptions.actions');
  const tCommon = useTranslations('common');
  const tFrequencies = useTranslations('subscriptions.frequencies');
  const tStatus = useTranslations('subscriptions.status');
  const tRenewal = useTranslations('subscriptions.renewal');
  const tCategories = useTranslations('subscriptions.categories');

  // Helper to translate category
  const translateCategory = (category: string | undefined | null): string => {
    if (!category) return '';
    // Convert "Cloud Storage" or "cloud_storage" to "cloudStorage"
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

  const FREQUENCY_LABELS: Record<string, string> = {
    monthly: tFrequencies('monthly'),
    quarterly: tFrequencies('quarterly'),
    biannually: tFrequencies('biannually'),
    annually: tFrequencies('annually'),
  };

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSubscriptionId, setEditingSubscriptionId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingSubscriptionId, setDeletingSubscriptionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Default to current month in YYYY-MM format
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(currentMonth);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedSubscriptionIds, setSelectedSubscriptionIds] = useState<Set<string>>(new Set());
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);

  // Use default view preferences from user settings
  const { viewMode, setViewMode } = useViewPreferences();

  // Column configuration for list view
  const columnConfig: ColumnConfig[] = React.useMemo(() => [
    { id: 'name', label: tOverview('name'), locked: true },
    { id: 'description', label: tCommon('common.description') },
    { id: 'category', label: tOverview('category') },
    { id: 'amount', label: tOverview('amount') },
    { id: 'frequency', label: tOverview('frequency') },
    { id: 'nextRenewal', label: tOverview('nextRenewal') },
    { id: 'originalAmount', label: tCommon('common.originalAmount') },
    { id: 'status', label: tCommon('common.status') },
  ], [tOverview, tCommon]);

  const {
    visibleColumns,
    toggleColumn,
    showAllColumns,
    isColumnVisible,
  } = useColumnVisibility('subscriptions', columnConfig);

  // Context to set action buttons in layout
  const { setActions } = React.useContext(SubscriptionsActionsContext);

  const {
    data: subscriptionsData,
    isLoading: isLoadingSubscriptions,
    error: subscriptionsError,
    refetch: refetchSubscriptions,
  } = useListSubscriptionsQuery({ is_active: true });

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
  } = useGetSubscriptionStatsQuery(statsParams);

  const [updateSubscription] = useUpdateSubscriptionMutation();
  const [deleteSubscription, { isLoading: isDeleting }] = useDeleteSubscriptionMutation();
  const [batchDeleteSubscriptions, { isLoading: isBatchDeleting }] = useBatchDeleteSubscriptionsMutation();
  const [processSubscriptionDuePayments, { isLoading: isProcessingPayments }] = useProcessSubscriptionDuePaymentsMutation();

  const handleAddSubscription = React.useCallback(() => {
    setEditingSubscriptionId(null);
    setIsFormOpen(true);
  }, []);

  const handleImportSubscriptions = React.useCallback(() => {
    router.push('/dashboard/subscriptions/import');
  }, [router]);

  const handleProcessDuePayments = React.useCallback(async () => {
    try {
      const result = await processSubscriptionDuePayments().unwrap();
      if (result.due_count === 0) {
        toast.info(tOverview('noDuePayments'));
      } else if (result.processed > 0) {
        toast.success(tOverview('paymentsProcessed', {
          processed: result.processed,
          autoPaid: result.auto_paid
        }));
      }
      if (result.failed_payments.length > 0) {
        result.failed_payments.forEach((failure) => {
          toast.error(tOverview('paymentFailed', { name: failure.subscription_name, reason: failure.reason }));
        });
      }
      refetchSubscriptions();
    } catch (error) {
      toast.error(tOverview('processPaymentsError'));
    }
  }, [processSubscriptionDuePayments, refetchSubscriptions, tOverview]);

  const handleArchiveSubscription = async (id: string) => {
    try {
      await updateSubscription({ id, data: { is_active: false } }).unwrap();
      toast.success(tOverview('archiveSuccess'));
      setSelectedSubscriptionIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    } catch (error) {
      toast.error(tOverview('archiveError'));
    }
  };

  const handleBatchArchive = React.useCallback(async () => {
    const idsToArchive = Array.from(selectedSubscriptionIds);
    let successCount = 0;
    let failCount = 0;

    for (const id of idsToArchive) {
      try {
        await updateSubscription({ id, data: { is_active: false } }).unwrap();
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

    setSelectedSubscriptionIds(new Set());
  }, [selectedSubscriptionIds, updateSubscription, tOverview]);

  const confirmDelete = async () => {
    if (!deletingSubscriptionId) return;

    try {
      await deleteSubscription(deletingSubscriptionId).unwrap();
      toast.success(tOverview('deleteSuccess'));
      setDeleteDialogOpen(false);
      setDeletingSubscriptionId(null);
    } catch (error) {
      toast.error(tOverview('deleteError'));
    }
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingSubscriptionId(null);
  };

  const handleToggleSelect = (subscriptionId: string) => {
    setSelectedSubscriptionIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(subscriptionId)) {
        newSet.delete(subscriptionId);
      } else {
        newSet.add(subscriptionId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedSubscriptionIds.size === filteredSubscriptions.length) {
      setSelectedSubscriptionIds(new Set());
    } else {
      setSelectedSubscriptionIds(new Set(filteredSubscriptions.map((s) => s.id)));
    }
  };

  const handleBatchDelete = React.useCallback(() => {
    if (selectedSubscriptionIds.size === 0) return;
    setBatchDeleteDialogOpen(true);
  }, [selectedSubscriptionIds.size]);

  const confirmBatchDelete = async () => {
    if (selectedSubscriptionIds.size === 0) return;

    try {
      const result = await batchDeleteSubscriptions({
        ids: Array.from(selectedSubscriptionIds),
      }).unwrap();

      if (result.failed_ids.length > 0) {
        toast.error(tOverview('batchDeleteError', { count: result.failed_ids.length }));
      } else {
        toast.success(tOverview('batchDeleteSuccess', { count: result.deleted_count }));
      }

      setBatchDeleteDialogOpen(false);
      setSelectedSubscriptionIds(new Set());
    } catch (error) {
      toast.error(tOverview('deleteError'));
    }
  };


  // Get unique categories from subscriptions
  const uniqueCategories = React.useMemo(() => {
    if (!subscriptionsData?.items) return [];
    const categories = subscriptionsData.items
      .map((subscription) => subscription.category)
      .filter((cat): cat is string => !!cat);
    return Array.from(new Set(categories)).sort();
  }, [subscriptionsData?.items]);

  // Apply month filter first - filter by start_date and end_date range
  const monthFilteredSubscriptions = filterByMonth(
    subscriptionsData?.items,
    selectedMonth,
    (subscription) => subscription.frequency, // All subscriptions are recurring
    () => null, // No one-time date field
    (subscription) => subscription.start_date,
    (subscription) => subscription.end_date
  );

  // Apply search and category filters
  const searchFilteredSubscriptions = filterBySearchAndCategory(
    monthFilteredSubscriptions,
    searchQuery,
    selectedCategory,
    (subscription) => subscription.name,
    (subscription) => subscription.category
  );

  // Apply sorting (using display_amount for currency-aware sorting)
  const filteredSubscriptions = sortItems(
    searchFilteredSubscriptions,
    sortField,
    sortDirection,
    (subscription) => subscription.name,
    (subscription) => subscription.display_amount || subscription.amount,
    (subscription) => subscription.start_date
  ) || [];

  // Get renewal badge variant based on urgency
  const getRenewalBadgeVariant = (urgency: string): 'default' | 'secondary' | 'destructive' => {
    switch (urgency) {
      case 'high':
        return 'destructive';
      case 'medium':
        return 'default';
      default:
        return 'secondary';
    }
  };

  // Set action buttons in layout
  React.useEffect(() => {
    setActions(
      <>
        {selectedSubscriptionIds.size > 0 && (
          <>
            <Button
              onClick={handleBatchArchive}
              variant="outline"
              size="default"
              className="w-full sm:w-auto"
            >
              <Archive className="mr-2 h-4 w-4" />
              <span className="truncate">{tOverview('archiveSelected', { count: selectedSubscriptionIds.size })}</span>
            </Button>
            <Button
              onClick={handleBatchDelete}
              variant="destructive"
              size="default"
              className="w-full sm:w-auto"
            >
              <span className="truncate">{tOverview('deleteSelected', { count: selectedSubscriptionIds.size })}</span>
            </Button>
          </>
        )}
        <SplitButton
          primaryLabel={tOverview('importSubscriptions')}
          onPrimaryClick={handleImportSubscriptions}
          primaryIcon={<Upload className="h-4 w-4" />}
          options={[
            {
              label: tOverview('addManually'),
              onClick: handleAddSubscription,
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

    // Cleanup on unmount
    return () => setActions(null);
  }, [selectedSubscriptionIds.size, setActions, handleBatchArchive, handleBatchDelete, handleAddSubscription, handleImportSubscriptions, handleProcessDuePayments, isProcessingPayments, tOverview, tActions]);

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
      {(subscriptionsData?.items && subscriptionsData.items.length > 0) && (
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
            <PopoverContent className="w-64 p-0" align="end">
              {/* Filter section */}
              <div className="p-2.5 space-y-2">
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
              <div className="p-2.5 space-y-2">
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
              <div className="p-2.5 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.view')}</p>
                <div className="inline-flex items-center gap-1 border rounded-md p-0.5" style={{ height: '36px' }}>
                  <Button
                    variant={viewMode === 'card' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('card')}
                    className="h-[32px] w-[32px] p-0"
                    title={tCommon('common.cardView')}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                    className="h-[32px] w-[32px] p-0"
                    title={tCommon('common.listView')}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  {selectedMonth && (
                    <Button
                      variant={viewMode === 'calendar' ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode('calendar')}
                      className="h-[32px] w-[32px] p-0"
                      title={tCommon('common.calendarView')}
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
                  <div className="p-2.5 space-y-2">
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
              <span><span className="font-semibold text-foreground">{stats.total_subscriptions}</span> subs</span>
              <span>&middot;</span>
              <span><span className="font-semibold text-foreground"><CurrencyDisplay amount={stats.monthly_cost} currency={stats.currency} decimals={0} /></span>/mo</span>
              <span>&middot;</span>
              <span><span className="font-semibold text-foreground"><CurrencyDisplay amount={stats.total_annual_cost} currency={stats.currency} decimals={0} /></span>/yr</span>
            </div>
          )}
        </div>
      )}

      {/* Subscriptions List */}
      <div>
        {isLoadingSubscriptions ? (
          <LoadingCards count={3} />
        ) : subscriptionsError ? (
          <ApiErrorState error={subscriptionsError} onRetry={refetchSubscriptions} />
        ) : !subscriptionsData?.items || subscriptionsData.items.length === 0 ? (
          <EmptyState
            icon={RefreshCw}
            title={tOverview('noSubscriptions')}
            description={tOverview('noSubscriptionsDescription')}
            actionLabel={tOverview('importSubscriptions')}
            onAction={handleImportSubscriptions}
          />
        ) : viewMode === 'calendar' && selectedMonth ? (
          <CalendarView
            items={filteredSubscriptions.map((subscription) => ({
              id: subscription.id,
              name: subscription.name,
              amount: subscription.amount,
              currency: subscription.currency,
              display_amount: subscription.display_amount,
              display_currency: subscription.display_currency,
              category: subscription.category,
              date: null,
              start_date: subscription.start_date,
              frequency: subscription.frequency,
              is_active: subscription.is_active,
            }))}
            selectedMonth={selectedMonth}
            onMonthChange={setSelectedMonth}
            onItemClick={(id) => router.push(`/dashboard/subscriptions/${id}`)}
            selectedItemIds={selectedSubscriptionIds}
            onToggleSelect={handleToggleSelect}
          />
        ) : !filteredSubscriptions || filteredSubscriptions.length === 0 ? (
          <EmptyState
            icon={RefreshCw}
            title={selectedMonth ? tOverview('noSubscriptions') : tOverview('noFilterResults')}
            description={selectedMonth
              ? `${tOverview('noSubscriptionsDescription')} ${new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.`
              : tOverview('noSubscriptionsDescription')
            }
            actionLabel={tOverview('importSubscriptions')}
            onAction={handleImportSubscriptions}
          />
        ) : viewMode === 'card' ? (
          <>
            {filteredSubscriptions.length > 0 && (
              <div className="flex items-center gap-2 px-1 mb-4">
                <Checkbox
                  checked={selectedSubscriptionIds.size === filteredSubscriptions.length}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all subscriptions"
                />
                <span className="text-sm text-muted-foreground">
                  {selectedSubscriptionIds.size === filteredSubscriptions.length ? tOverview('deselectAll') : tOverview('selectAll')}
                </span>
              </div>
            )}
            <div className="grid gap-3 md:gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredSubscriptions.map((subscription) => {
              // Calculate next renewal date
              const { nextRenewal, isEnded, daysUntilRenewal } = calculateNextRenewalDate(
                subscription.start_date,
                subscription.frequency,
                subscription.end_date
              );
              const urgency = getRenewalUrgency(daysUntilRenewal);

              // Get renewal message with translations
              let renewalMessage = '';
              if (isEnded) {
                renewalMessage = tRenewal('ended');
              } else if (daysUntilRenewal < 0) {
                renewalMessage = tRenewal('noRenewalScheduled');
              } else if (daysUntilRenewal === 0) {
                renewalMessage = tRenewal('renewsToday');
              } else if (daysUntilRenewal === 1) {
                renewalMessage = tRenewal('renewsIn1Day', { days: 1 });
              } else {
                renewalMessage = tRenewal('renewsInDays', { days: daysUntilRenewal });
              }

              return (
                <Card
                  key={subscription.id}
                  className="relative cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => router.push(`/dashboard/subscriptions/${subscription.id}`)}
                >
                  <CardHeader className="pb-3 md:pb-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <div onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedSubscriptionIds.has(subscription.id)}
                            onCheckedChange={() => handleToggleSelect(subscription.id)}
                            aria-label={`Select ${subscription.name}`}
                            className="mt-1"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base md:text-lg truncate">{subscription.name}</CardTitle>
                          <CardDescription className="mt-1 min-h-[20px] text-xs md:text-sm line-clamp-2">
                            {subscription.description || <>&nbsp;</>}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant={subscription.is_active ? 'default' : 'secondary'} className="text-xs flex-shrink-0">
                        {subscription.is_active ? tStatus('active') : tStatus('archived')}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2 md:space-y-3">
                      <div>
                        <div className="text-xl md:text-2xl font-bold">
                          <CurrencyDisplay
                            amount={subscription.display_amount ?? subscription.amount}
                            currency={subscription.display_currency ?? subscription.currency}
                            showSymbol={true}
                            showCode={false}
                          />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {FREQUENCY_LABELS[subscription.frequency] || subscription.frequency}
                          {subscription.display_currency && subscription.display_currency !== subscription.currency && (
                            <span className="ml-1 text-[10px] md:text-xs">
                              (orig: {subscription.amount} {subscription.currency})
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Next Renewal Date - Key Feature */}
                      <div className="rounded-lg bg-muted p-2 md:p-3 min-h-[60px]">
                        {nextRenewal ? (
                          <>
                            <p className="text-[10px] md:text-xs text-muted-foreground">{tOverview('nextRenewal')}</p>
                            <p className="text-sm font-semibold">
                              {formatRenewalDate(nextRenewal, tRenewal('noUpcomingRenewal'), 'uk-UA')}
                            </p>
                            <Badge
                              variant={getRenewalBadgeVariant(urgency)}
                              className="mt-1 text-xs"
                            >
                              {renewalMessage}
                            </Badge>
                          </>
                        ) : (
                          <>
                            <p className="text-[10px] md:text-xs text-muted-foreground">{tOverview('status')}</p>
                            <p className="text-sm font-semibold">{isEnded ? tStatus('expired') : tOverview('nextRenewal')}</p>
                          </>
                        )}
                      </div>

                      <div className="min-h-[24px]">
                        {subscription.category && (
                          <Badge variant="outline" className="text-xs">{translateCategory(subscription.category)}</Badge>
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
                        checked={selectedSubscriptionIds.size === filteredSubscriptions.length && filteredSubscriptions.length > 0}
                        onCheckedChange={handleSelectAll}
                        aria-label={tOverview('selectAll')}
                      />
                    </TableHead>
                    {isColumnVisible('name') && (
                      <TableHead className="w-[200px]">{tOverview('name')}</TableHead>
                    )}
                    {isColumnVisible('description') && (
                      <TableHead className="hidden md:table-cell">{tCommon('common.description')}</TableHead>
                    )}
                    {isColumnVisible('category') && (
                      <TableHead className="hidden lg:table-cell">{tOverview('category')}</TableHead>
                    )}
                    {isColumnVisible('amount') && (
                      <TableHead className="text-right">{tOverview('amount')}</TableHead>
                    )}
                    {isColumnVisible('frequency') && (
                      <TableHead className="hidden sm:table-cell">{tOverview('frequency')}</TableHead>
                    )}
                    {isColumnVisible('nextRenewal') && (
                      <TableHead className="hidden xl:table-cell">{tOverview('nextRenewal')}</TableHead>
                    )}
                    {isColumnVisible('originalAmount') && (
                      <TableHead className="hidden 2xl:table-cell text-right">{tCommon('common.originalAmount')}</TableHead>
                    )}
                    {isColumnVisible('status') && (
                      <TableHead className="hidden sm:table-cell">{tCommon('common.status')}</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubscriptions.map((subscription) => {
                    const { nextRenewal, isEnded, daysUntilRenewal } = calculateNextRenewalDate(
                      subscription.start_date,
                      subscription.frequency,
                      subscription.end_date
                    );
                    const urgency = getRenewalUrgency(daysUntilRenewal);

                    // Get renewal message with translations
                    let renewalMessage = '';
                    if (isEnded) {
                      renewalMessage = tRenewal('ended');
                    } else if (daysUntilRenewal < 0) {
                      renewalMessage = tRenewal('noRenewalScheduled');
                    } else if (daysUntilRenewal === 0) {
                      renewalMessage = tRenewal('renewsToday');
                    } else if (daysUntilRenewal === 1) {
                      renewalMessage = tRenewal('renewsIn1Day', { days: 1 });
                    } else {
                      renewalMessage = tRenewal('renewsInDays', { days: daysUntilRenewal });
                    }

                    return (
                      <TableRow
                        key={subscription.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/dashboard/subscriptions/${subscription.id}`)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedSubscriptionIds.has(subscription.id)}
                            onCheckedChange={() => handleToggleSelect(subscription.id)}
                            aria-label={`Select ${subscription.name}`}
                          />
                        </TableCell>
                        {isColumnVisible('name') && (
                          <TableCell className="font-medium">
                            <div className="max-w-[200px]">
                              <p className="truncate">{subscription.name}</p>
                              {!isColumnVisible('description') && (
                                <p className="text-xs text-muted-foreground md:hidden truncate">
                                  {subscription.description}
                                </p>
                              )}
                            </div>
                          </TableCell>
                        )}
                        {isColumnVisible('description') && (
                          <TableCell className="hidden md:table-cell">
                            <p className="max-w-[250px] truncate text-sm text-muted-foreground">
                              {subscription.description || '-'}
                            </p>
                          </TableCell>
                        )}
                        {isColumnVisible('category') && (
                          <TableCell className="hidden lg:table-cell">
                            {subscription.category ? (
                              <Badge variant="outline" className="text-xs">{translateCategory(subscription.category)}</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        )}
                        {isColumnVisible('amount') && (
                          <TableCell className="text-right font-semibold">
                            <CurrencyDisplay
                              amount={subscription.display_amount ?? subscription.amount}
                              currency={subscription.display_currency ?? subscription.currency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </TableCell>
                        )}
                        {isColumnVisible('frequency') && (
                          <TableCell className="hidden sm:table-cell">
                            <span className="text-sm text-muted-foreground">
                              {FREQUENCY_LABELS[subscription.frequency] || subscription.frequency}
                            </span>
                          </TableCell>
                        )}
                        {isColumnVisible('nextRenewal') && (
                          <TableCell className="hidden xl:table-cell">
                            {nextRenewal ? (
                              <div className="flex flex-col gap-1">
                                <span className="text-sm">
                                  {formatRenewalDate(nextRenewal, tRenewal('noUpcomingRenewal'), 'uk-UA')}
                                </span>
                                <Badge
                                  variant={getRenewalBadgeVariant(urgency)}
                                  className="text-xs w-fit"
                                >
                                  {renewalMessage}
                                </Badge>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                {isEnded ? 'Ended' : '-'}
                              </span>
                            )}
                          </TableCell>
                        )}
                        {isColumnVisible('originalAmount') && (
                          <TableCell className="hidden 2xl:table-cell text-right">
                            {subscription.display_currency && subscription.display_currency !== subscription.currency ? (
                              <span className="text-sm text-muted-foreground">
                                {subscription.amount} {subscription.currency}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        )}
                        {isColumnVisible('status') && (
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant={subscription.is_active ? 'default' : 'secondary'} className="text-xs">
                              {subscription.is_active ? tStatus('active') : tStatus('archived')}
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

      {/* Subscription Form Dialog */}
      {isFormOpen && (
        <SubscriptionForm
          subscriptionId={editingSubscriptionId}
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
        itemName="subscription"
        isDeleting={isDeleting}
        cancelLabel={tActions('cancel')}
        deleteLabel={tActions('delete')}
      />

      {/* Batch Delete Confirmation Dialog */}
      <BatchDeleteConfirmDialog
        open={batchDeleteDialogOpen}
        onOpenChange={setBatchDeleteDialogOpen}
        onConfirm={confirmBatchDelete}
        count={selectedSubscriptionIds.size}
        itemName="subscription"
        isDeleting={isBatchDeleting}
        cancelLabel={tActions('cancel')}
        deleteLabel={tActions('delete')}
      />
    </div>
  );
}
