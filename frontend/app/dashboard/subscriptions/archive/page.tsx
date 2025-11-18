/**
 * Subscription Archive Page
 * Displays archived subscriptions with unarchive functionality
 */
'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Archive, ArchiveRestore, Trash2, LayoutGrid, List } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  useListSubscriptionsQuery,
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
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { BatchDeleteConfirmDialog } from '@/components/ui/batch-delete-confirm-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchFilter, filterBySearchAndCategory } from '@/components/ui/search-filter';
import { SortFilter, sortItems, type SortField, type SortDirection } from '@/components/ui/sort-filter';
import { CurrencyDisplay } from '@/components/currency';
import { useViewPreferences } from '@/lib/hooks/use-view-preferences';
import { SubscriptionsActionsContext } from '../context';

export default function SubscriptionsArchivePage() {
  // Translation hooks
  const tArchive = useTranslations('subscriptions.archive');
  const tActions = useTranslations('subscriptions.actions');
  const tCommon = useTranslations('common');
  const tRenewal = useTranslations('subscriptions.renewal');
  const tFrequencies = useTranslations('subscriptions.frequencies');
  const tStatus = useTranslations('subscriptions.status');

  const FREQUENCY_LABELS: Record<string, string> = {
    monthly: tFrequencies('monthly'),
    quarterly: tFrequencies('quarterly'),
    biannually: tFrequencies('biannually'),
    annually: tFrequencies('annually'),
  };

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingSubscriptionId, setDeletingSubscriptionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedSubscriptionIds, setSelectedSubscriptionIds] = useState<Set<string>>(new Set());
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);

  // Use default view preferences from user settings
  const { viewMode, setViewMode } = useViewPreferences();

  // Context to set action buttons in layout
  const { setActions } = React.useContext(SubscriptionsActionsContext);

  // Fetch only archived subscriptions (is_active: false)
  const {
    data: subscriptionsData,
    isLoading: isLoadingSubscriptions,
    error: subscriptionsError,
  } = useListSubscriptionsQuery({ is_active: false });

  const [updateSubscription] = useUpdateSubscriptionMutation();
  const [deleteSubscription, { isLoading: isDeleting }] = useDeleteSubscriptionMutation();
  const [batchDeleteSubscriptions, { isLoading: isBatchDeleting }] = useBatchDeleteSubscriptionsMutation();

  const subscriptions = useMemo(() => subscriptionsData?.items || [], [subscriptionsData?.items]);

  // Get unique categories
  const uniqueCategories = React.useMemo(() => {
    const categories = subscriptions
      .map((subscription) => subscription.category)
      .filter((cat): cat is string => !!cat);
    return Array.from(new Set(categories)).sort();
  }, [subscriptions]);

  // Filter and sort subscriptions
  const filteredSubscriptions = React.useMemo(() => {
    const filtered = filterBySearchAndCategory(
      subscriptions,
      searchQuery,
      selectedCategory,
      (subscription) => subscription.name,
      (subscription) => subscription.category || undefined
    );

    // Apply sorting
    const sorted = sortItems(
      filtered,
      sortField,
      sortDirection,
      (subscription) => subscription.name,
      (subscription) => subscription.display_amount || subscription.amount,
      (subscription) => subscription.start_date || subscription.created_at
    );

    return sorted || [];
  }, [subscriptions, searchQuery, selectedCategory, sortField, sortDirection]);

  const handleUnarchive = async (id: string) => {
    try {
      await updateSubscription({ id, data: { is_active: true } }).unwrap();
      toast.success(tArchive('unarchiveSuccess'));
      setSelectedSubscriptionIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    } catch (error) {
      console.error('Failed to unarchive subscription:', error);
      toast.error(tArchive('unarchiveError'));
    }
  };

  const handleBatchUnarchive = useCallback(async () => {
    const idsToUnarchive = Array.from(selectedSubscriptionIds);
    let successCount = 0;
    let failCount = 0;

    for (const id of idsToUnarchive) {
      try {
        await updateSubscription({ id, data: { is_active: true } }).unwrap();
        successCount++;
      } catch (error) {
        console.error(`Failed to unarchive subscription ${id}:`, error);
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(tArchive('batchUnarchiveSuccess', { count: successCount }));
    }
    if (failCount > 0) {
      toast.error(tArchive('batchUnarchiveError', { count: failCount }));
    }

    setSelectedSubscriptionIds(new Set());
  }, [selectedSubscriptionIds, updateSubscription, tArchive]);

  const handleDelete = (id: string) => {
    setDeletingSubscriptionId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingSubscriptionId) return;

    try {
      await deleteSubscription(deletingSubscriptionId).unwrap();
      toast.success(tArchive('unarchiveSuccess'));
      setDeleteDialogOpen(false);
      setDeletingSubscriptionId(null);
      setSelectedSubscriptionIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(deletingSubscriptionId);
        return newSet;
      });
    } catch (error) {
      console.error('Failed to delete subscription:', error);
      toast.error(tArchive('unarchiveError'));
    }
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
    if (selectedSubscriptionIds.size === filteredSubscriptions.length && filteredSubscriptions.length > 0) {
      setSelectedSubscriptionIds(new Set());
    } else {
      setSelectedSubscriptionIds(new Set(filteredSubscriptions.map((subscription) => subscription.id)));
    }
  };

  const handleBatchDelete = () => {
    setBatchDeleteDialogOpen(true);
  };

  const confirmBatchDelete = async () => {
    if (selectedSubscriptionIds.size === 0) return;

    try {
      const result = await batchDeleteSubscriptions({
        ids: Array.from(selectedSubscriptionIds),
      }).unwrap();

      if (result.failed_ids.length > 0) {
        toast.error(tArchive('batchUnarchiveError', { count: result.failed_ids.length }));
      } else {
        toast.success(tArchive('batchUnarchiveSuccess', { count: result.deleted_count }));
      }

      setBatchDeleteDialogOpen(false);
      setSelectedSubscriptionIds(new Set());
    } catch (error) {
      console.error('Failed to delete subscriptions:', error);
      toast.error(tArchive('unarchiveError'));
    }
  };

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
              onClick={handleBatchUnarchive}
              variant="outline"
              size="default"
              className="w-full sm:w-auto"
            >
              <ArchiveRestore className="mr-2 h-4 w-4" />
              <span className="truncate">{tArchive('unarchiveSelected', { count: selectedSubscriptionIds.size })}</span>
            </Button>
            <Button
              onClick={handleBatchDelete}
              variant="destructive"
              size="default"
              className="w-full sm:w-auto"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              <span className="truncate">{tArchive('deleteSelected', { count: selectedSubscriptionIds.size })}</span>
            </Button>
          </>
        )}
      </>
    );

    return () => setActions(null);
  }, [selectedSubscriptionIds.size, setActions, handleBatchUnarchive, tArchive]);

  const isLoading = isLoadingSubscriptions;
  const hasError = subscriptionsError;

  if (hasError) {
    return (
      <ApiErrorState
        error={subscriptionsError}
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Search and Filters */}
      {(subscriptions.length > 0 || searchQuery || selectedCategory) && (
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex-1">
            <SearchFilter
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
              categories={uniqueCategories}
              searchPlaceholder={tArchive('searchPlaceholder')}
              categoryPlaceholder={tCommon('common.allCategories')}
            />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <SortFilter
              sortField={sortField}
              sortDirection={sortDirection}
              onSortFieldChange={setSortField}
              onSortDirectionChange={setSortDirection}
              sortByLabel={tCommon('common.sortBy')}
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

      {/* Subscription List */}
      <div>
        {isLoading ? (
          <LoadingCards count={6} />
        ) : !subscriptions || subscriptions.length === 0 ? (
          <EmptyState
            icon={Archive}
            title={tArchive('noSubscriptions')}
            description={tArchive('noSubscriptionsDescription')}
          />
        ) : !filteredSubscriptions || filteredSubscriptions.length === 0 ? (
          <EmptyState
            icon={Archive}
            title={tArchive('noFilterResults')}
            description={tArchive('noSubscriptionsDescription')}
          />
        ) : viewMode === 'card' ? (
          <>
            {filteredSubscriptions.length > 0 && (
              <div className="flex items-center gap-2 px-1 mb-4">
                <Checkbox
                  checked={selectedSubscriptionIds.size === filteredSubscriptions.length}
                  onCheckedChange={handleSelectAll}
                  aria-label={tCommon('common.selectAll')}
                />
                <span className="text-sm text-muted-foreground">
                  {selectedSubscriptionIds.size === filteredSubscriptions.length ? tCommon('common.deselectAll') : tCommon('common.selectAll')}
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
                <Card key={subscription.id} className="relative opacity-75">
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
                            {subscription.description || ' '}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs flex-shrink-0">
                        {tArchive('archived')}
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
                        </p>
                        <div className="text-[10px] md:text-xs text-muted-foreground mt-1 min-h-[16px]">
                          {subscription.display_currency && subscription.display_currency !== subscription.currency && (
                            <>
                              Original: <CurrencyDisplay
                                amount={subscription.amount}
                                currency={subscription.currency}
                                showSymbol={true}
                                showCode={false}
                              />
                            </>
                          )}
                        </div>
                      </div>

                      {/* Next Renewal Date or Status */}
                      <div className="rounded-lg bg-muted p-2 md:p-3 min-h-[60px]">
                        {nextRenewal ? (
                          <>
                            <p className="text-[10px] md:text-xs text-muted-foreground">{tArchive('nextRenewal')}</p>
                            <p className="text-sm font-semibold">
                              {formatRenewalDate(nextRenewal)}
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
                            <p className="text-[10px] md:text-xs text-muted-foreground">{tArchive('status')}</p>
                            <p className="text-sm font-semibold">{isEnded ? tStatus('expired') : tArchive('nextRenewal')}</p>
                          </>
                        )}
                      </div>

                      <div className="min-h-[24px]">
                        {subscription.category && (
                          <Badge variant="outline" className="text-xs flex-shrink-0">{subscription.category}</Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUnarchive(subscription.id)}
                        >
                          <ArchiveRestore className="mr-1 h-3 w-3" />
                          {tArchive('unarchive')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(subscription.id)}
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
                        aria-label={tArchive('selectAll')}
                      />
                    </TableHead>
                    <TableHead className="w-[200px]">{tCommon('common.name')}</TableHead>
                    <TableHead className="hidden md:table-cell">{tCommon('common.description')}</TableHead>
                    <TableHead className="hidden lg:table-cell">{tCommon('common.category')}</TableHead>
                    <TableHead className="text-right">{tCommon('common.amount')}</TableHead>
                    <TableHead className="hidden sm:table-cell">{tArchive('frequency')}</TableHead>
                    <TableHead className="hidden xl:table-cell">{tArchive('nextRenewal')}</TableHead>
                    <TableHead className="hidden 2xl:table-cell text-right">{tCommon('common.originalAmount')}</TableHead>
                    <TableHead className="text-right w-[180px]">{tArchive('actions')}</TableHead>
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
                      <TableRow key={subscription.id} className="opacity-75">
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
                            <Badge variant="outline" className="text-xs">{subscription.category}</Badge>
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
                                {formatRenewalDate(nextRenewal)}
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
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleUnarchive(subscription.id)}
                              className="h-8 w-8 p-0"
                            >
                              <ArchiveRestore className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(subscription.id)}
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

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        title={tArchive('deleteConfirmTitle')}
        description={tArchive('deleteConfirmDescription')}
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
