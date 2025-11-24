/**
 * Subscriptions Tracking Page
 * Displays user's subscriptions with next renewal dates
 */
'use client';

import React, { useState } from 'react';
import { Calendar, TrendingDown, RefreshCw, Edit, Trash2, Archive, LayoutGrid, List, Grid3x3, Rows3, CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import {
  useListSubscriptionsQuery,
  useGetSubscriptionStatsQuery,
  useUpdateSubscriptionMutation,
  useDeleteSubscriptionMutation,
  useBatchDeleteSubscriptionsMutation,
} from '@/lib/api/subscriptionsApi';
import {
  calculateNextRenewalDate,
  getRenewalUrgency,
  formatRenewalDate,
  getRenewalMessage,
} from '@/lib/utils/subscription-renewal';
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
import { SubscriptionForm } from '@/components/subscriptions/subscription-form';
import { StatsCards, StatCard } from '@/components/ui/stats-cards';
import { SubscriptionsActionsContext } from '../context';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { BatchDeleteConfirmDialog } from '@/components/ui/batch-delete-confirm-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchFilter, filterBySearchAndCategory } from '@/components/ui/search-filter';
import { MonthFilter, filterByMonth } from '@/components/ui/month-filter';
import { SortFilter, sortItems, type SortField, type SortDirection } from '@/components/ui/sort-filter';
import { useViewPreferences } from '@/lib/hooks/use-view-preferences';
import { CalendarView } from '@/components/ui/calendar-view';
import { toast } from 'sonner';

export default function SubscriptionsPage() {
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
  const { viewMode, setViewMode, statsViewMode, setStatsViewMode } = useViewPreferences();

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
    isLoading: isLoadingStats,
    error: statsError,
  } = useGetSubscriptionStatsQuery(statsParams);

  const [updateSubscription] = useUpdateSubscriptionMutation();
  const [deleteSubscription, { isLoading: isDeleting }] = useDeleteSubscriptionMutation();
  const [batchDeleteSubscriptions, { isLoading: isBatchDeleting }] = useBatchDeleteSubscriptionsMutation();

  const handleAddSubscription = React.useCallback(() => {
    setEditingSubscriptionId(null);
    setIsFormOpen(true);
  }, []);

  const handleEditSubscription = (id: string) => {
    setEditingSubscriptionId(id);
    setIsFormOpen(true);
  };

  const handleDeleteSubscription = (id: string) => {
    setDeletingSubscriptionId(id);
    setDeleteDialogOpen(true);
  };

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

  // Prepare stats cards data
  const statsCards: StatCard[] = stats
    ? [
        {
          title: tOverview('totalSubscriptions'),
          value: stats.total_subscriptions,
          description: selectedMonth
            ? tOverview('activeSubscriptions').replace('{count}', String(stats.active_subscriptions)) + ' ' + new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
            : tOverview('activeSubscriptions').replace('{count}', String(stats.active_subscriptions)),
          icon: RefreshCw,
        },
        {
          title: tOverview('monthlyCost'),
          value: (
            <CurrencyDisplay
              amount={stats.monthly_cost}
              currency={stats.currency}
              showSymbol={true}
              showCode={false}
            />
          ),
          description: tOverview('totalMonthlySpending'),
          icon: TrendingDown,
        },
        {
          title: tOverview('upcomingRenewals'),
          value: (
            <CurrencyDisplay
              amount={stats.total_annual_cost}
              currency={stats.currency}
              showSymbol={true}
              showCode={false}
            />
          ),
          description: tOverview('subscriptionsDueThisMonth'),
          icon: Calendar,
        },
      ]
    : [];

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
              <Trash2 className="mr-2 h-4 w-4" />
              <span className="truncate">{tOverview('deleteSelected', { count: selectedSubscriptionIds.size })}</span>
            </Button>
          </>
        )}
        <Button onClick={handleAddSubscription} size="default" className="w-full sm:w-auto">
          <RefreshCw className="mr-2 h-4 w-4" />
          <span className="truncate">{tOverview('addSubscription')}</span>
        </Button>
      </>
    );

    // Cleanup on unmount
    return () => setActions(null);
  }, [selectedSubscriptionIds.size, setActions, handleBatchArchive, handleBatchDelete, handleAddSubscription, tOverview, tActions]);

  return (
    <div className="space-y-4 md:space-y-6">

      {/* Statistics Cards */}
      {isLoadingStats ? (
        <div className="grid gap-3 md:gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
      {(subscriptionsData?.items && subscriptionsData.items.length > 0) && (
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex-1">
            <SearchFilter
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
              categories={uniqueCategories}
              searchPlaceholder={tOverview('searchPlaceholder')}
              categoryPlaceholder={tOverview('allCategories')}
            />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <MonthFilter
              selectedMonth={selectedMonth}
              onMonthChange={setSelectedMonth}
              label={tCommon('common.filterBy')}
              clearLabel={tCommon('common.clear')}
            />
            <SortFilter
              sortField={sortField}
              sortDirection={sortDirection}
              onSortFieldChange={setSortField}
              onSortDirectionChange={setSortDirection}
              sortOptions={[
                { field: 'name', label: tCommon('common.name') },
                { field: 'amount', label: tCommon('common.amount') },
                { field: 'date', label: tCommon('common.date') },
              ]}
              sortByLabel={tCommon('common.sortBy')}
              sortAZLabel={tCommon('common.sortAZ')}
              sortZALabel={tCommon('common.sortZA')}
              sortLowToHighLabel={tCommon('common.sortLowToHigh')}
              sortHighToLowLabel={tCommon('common.sortHighToLow')}
              sortOldestFirstLabel={tCommon('common.sortOldestFirst')}
              sortNewestFirstLabel={tCommon('common.sortNewestFirst')}
              sortAscendingLabel={tCommon('common.sortAscending')}
              sortDescendingLabel={tCommon('common.sortDescending')}
            />
            <div className="inline-flex items-center gap-1 border rounded-md p-0.5 w-fit self-end" style={{ height: '36px' }}>
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
            actionLabel={tOverview('addSubscription')}
            onAction={handleAddSubscription}
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
            onItemClick={handleEditSubscription}
            selectedItemIds={selectedSubscriptionIds}
            onToggleSelect={handleToggleSelect}
          />
        ) : !filteredSubscriptions || filteredSubscriptions.length === 0 ? (
          selectedMonth ? (
            <EmptyState
              icon={RefreshCw}
              title={tOverview('noSubscriptions')}
              description={`${tOverview('noSubscriptionsDescription')} ${new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.`}
              actionLabel={tCommon('common.clearFilter')}
              onAction={() => setSelectedMonth(null)}
            />
          ) : (
            <EmptyState
              icon={RefreshCw}
              title={tOverview('noFilterResults')}
              description={tOverview('noSubscriptionsDescription')}
              actionLabel={tCommon('clearFilters')}
              onAction={() => {
                setSearchQuery('');
                setSelectedCategory(null);
              }}
            />
          )
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
                <Card key={subscription.id} className="relative">
                  <CardHeader className="pb-3 md:pb-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <Checkbox
                          checked={selectedSubscriptionIds.has(subscription.id)}
                          onCheckedChange={() => handleToggleSelect(subscription.id)}
                          aria-label={`Select ${subscription.name}`}
                          className="mt-1"
                        />
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

                      <div className="flex flex-wrap gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditSubscription(subscription.id)}
                        >
                          <Edit className="mr-1 h-3 w-3" />
                          {tActions('edit')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleArchiveSubscription(subscription.id)}
                        >
                          <Archive className="mr-1 h-3 w-3" />
                          {tActions('archive')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteSubscription(subscription.id)}
                          disabled={isDeleting}
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
                          {tActions('delete')}
                        </Button>
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
                    <TableHead className="w-[200px]">{tOverview('name')}</TableHead>
                    <TableHead className="hidden md:table-cell">{tCommon('common.description')}</TableHead>
                    <TableHead className="hidden lg:table-cell">{tOverview('category')}</TableHead>
                    <TableHead className="text-right">{tOverview('amount')}</TableHead>
                    <TableHead className="hidden sm:table-cell">{tOverview('frequency')}</TableHead>
                    <TableHead className="hidden xl:table-cell">{tOverview('nextRenewal')}</TableHead>
                    <TableHead className="hidden 2xl:table-cell text-right">{tCommon('common.originalAmount')}</TableHead>
                    <TableHead className="hidden sm:table-cell">{tOverview('status')}</TableHead>
                    <TableHead className="text-right w-[180px]">{tOverview('actions')}</TableHead>
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
                      <TableRow key={subscription.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedSubscriptionIds.has(subscription.id)}
                            onCheckedChange={() => handleToggleSelect(subscription.id)}
                            aria-label={`Select ${subscription.name}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="max-w-[200px]">
                            <p className="truncate">{subscription.name}</p>
                            <p className="text-xs text-muted-foreground md:hidden truncate">
                              {subscription.description}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <p className="max-w-[250px] truncate text-sm text-muted-foreground">
                            {subscription.description || '-'}
                          </p>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {subscription.category ? (
                            <Badge variant="outline" className="text-xs">{translateCategory(subscription.category)}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          <CurrencyDisplay
                            amount={subscription.display_amount ?? subscription.amount}
                            currency={subscription.display_currency ?? subscription.currency}
                            showSymbol={true}
                            showCode={false}
                          />
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <span className="text-sm text-muted-foreground">
                            {FREQUENCY_LABELS[subscription.frequency] || subscription.frequency}
                          </span>
                        </TableCell>
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
                        <TableCell className="hidden 2xl:table-cell text-right">
                          {subscription.display_currency && subscription.display_currency !== subscription.currency ? (
                            <span className="text-sm text-muted-foreground">
                              {subscription.amount} {subscription.currency}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant={subscription.is_active ? 'default' : 'secondary'} className="text-xs">
                            {subscription.is_active ? tStatus('active') : tStatus('archived')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditSubscription(subscription.id)}
                              className="h-8 w-8 p-0"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleArchiveSubscription(subscription.id)}
                              className="h-8 w-8 p-0"
                            >
                              <Archive className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteSubscription(subscription.id)}
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
