/**
 * Subscriptions Tracking Page
 * Displays user's subscriptions with next renewal dates
 */
'use client';

import React, { useState } from 'react';
import { Calendar, TrendingDown, RefreshCw, Edit, Trash2, LayoutGrid, List, Grid3x3, Rows3 } from 'lucide-react';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import {
  useListSubscriptionsQuery,
  useGetSubscriptionStatsQuery,
  useDeleteSubscriptionMutation,
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
import { ModuleHeader } from '@/components/ui/module-header';
import { StatsCards, StatCard } from '@/components/ui/stats-cards';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { SearchFilter, filterBySearchAndCategory } from '@/components/ui/search-filter';
import { MonthFilter, filterByMonth } from '@/components/ui/month-filter';
import { SortFilter, sortItems, type SortField, type SortDirection } from '@/components/ui/sort-filter';
import { useViewPreferences } from '@/lib/hooks/use-view-preferences';

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  biannually: 'Bi-annually',
  annually: 'Annually',
};

export default function SubscriptionsPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSubscriptionId, setEditingSubscriptionId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingSubscriptionId, setDeletingSubscriptionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Use default view preferences from user settings
  const { viewMode, setViewMode, statsViewMode, setStatsViewMode } = useViewPreferences();

  const {
    data: subscriptionsData,
    isLoading: isLoadingSubscriptions,
    error: subscriptionsError,
    refetch: refetchSubscriptions,
  } = useListSubscriptionsQuery({});

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

  const [deleteSubscription, { isLoading: isDeleting }] = useDeleteSubscriptionMutation();

  const handleAddSubscription = () => {
    setEditingSubscriptionId(null);
    setIsFormOpen(true);
  };

  const handleEditSubscription = (id: string) => {
    setEditingSubscriptionId(id);
    setIsFormOpen(true);
  };

  const handleDeleteSubscription = (id: string) => {
    setDeletingSubscriptionId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingSubscriptionId) return;

    try {
      await deleteSubscription(deletingSubscriptionId).unwrap();
      setDeleteDialogOpen(false);
      setDeletingSubscriptionId(null);
    } catch (error) {
      console.error('Failed to delete subscription:', error);
    }
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingSubscriptionId(null);
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
  );

  // Prepare stats cards data
  const statsCards: StatCard[] = stats
    ? [
        {
          title: 'Total Subscriptions',
          value: stats.total_subscriptions,
          description: selectedMonth
            ? `${stats.active_subscriptions} active in ${new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
            : `${stats.active_subscriptions} active`,
          icon: RefreshCw,
        },
        {
          title: selectedMonth ? 'Period Cost' : 'Monthly Cost',
          value: (
            <CurrencyDisplay
              amount={stats.monthly_cost}
              currency={stats.currency}
              showSymbol={true}
              showCode={false}
            />
          ),
          description: `From ${stats.active_subscriptions} active ${stats.active_subscriptions === 1 ? 'subscription' : 'subscriptions'}`,
          icon: TrendingDown,
        },
        {
          title: 'Annual Cost',
          value: (
            <CurrencyDisplay
              amount={stats.total_annual_cost}
              currency={stats.currency}
              showSymbol={true}
              showCode={false}
            />
          ),
          description: selectedMonth ? 'Based on period cost' : 'Projected yearly cost',
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

  return (
    <div className="container mx-auto space-y-4 md:space-y-6 p-4 md:p-6">
      {/* Header */}
      <ModuleHeader
        title="Subscriptions"
        description="Track and manage your recurring subscriptions"
        actionLabel="Add Subscription"
        onAction={handleAddSubscription}
      />

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
            <div className="flex items-center gap-1 border rounded-md p-1 w-fit">
              <Button
                variant={statsViewMode === 'cards' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setStatsViewMode('cards')}
                className="h-8 w-8 p-0"
              >
                <Grid3x3 className="h-4 w-4" />
              </Button>
              <Button
                variant={statsViewMode === 'compact' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setStatsViewMode('compact')}
                className="h-8 w-8 p-0"
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
              searchPlaceholder="Search subscriptions..."
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
            <div className="flex items-center gap-1 border rounded-md p-1 w-fit self-end">
              <Button
                variant={viewMode === 'card' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('card')}
                className="h-8 w-8 p-0"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                className="h-8 w-8 p-0"
              >
                <List className="h-4 w-4" />
              </Button>
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
            title="No subscriptions yet"
            description="Start tracking your subscriptions by adding your first one."
            actionLabel="Add Subscription"
            onAction={handleAddSubscription}
          />
        ) : !filteredSubscriptions || filteredSubscriptions.length === 0 ? (
          selectedMonth ? (
            <EmptyState
              icon={RefreshCw}
              title="No subscriptions for this month"
              description={`No subscriptions active in ${new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.`}
              actionLabel="Clear Filter"
              onAction={() => setSelectedMonth(null)}
            />
          ) : (
            <EmptyState
              icon={RefreshCw}
              title="No subscriptions found"
              description="Try adjusting your search or filter criteria."
              actionLabel="Clear Filters"
              onAction={() => {
                setSearchQuery('');
                setSelectedCategory(null);
              }}
            />
          )
        ) : viewMode === 'card' ? (
          <div className="grid gap-3 md:gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredSubscriptions.map((subscription) => {
              // Calculate next renewal date
              const { nextRenewal, isEnded, daysUntilRenewal } = calculateNextRenewalDate(
                subscription.start_date,
                subscription.frequency,
                subscription.end_date
              );
              const urgency = getRenewalUrgency(daysUntilRenewal);
              const renewalMessage = getRenewalMessage(daysUntilRenewal, isEnded);

              return (
                <Card key={subscription.id} className="relative">
                  <CardHeader className="pb-3 md:pb-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-base md:text-lg truncate">{subscription.name}</CardTitle>
                        <CardDescription className="mt-1 min-h-[20px] text-xs md:text-sm line-clamp-2">
                          {subscription.description || <>&nbsp;</>}
                        </CardDescription>
                      </div>
                      <Badge variant={subscription.is_active ? 'default' : 'secondary'} className="text-xs flex-shrink-0">
                        {subscription.is_active ? 'Active' : 'Inactive'}
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
                            <p className="text-[10px] md:text-xs text-muted-foreground">Next Renewal</p>
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
                            <p className="text-[10px] md:text-xs text-muted-foreground">Status</p>
                            <p className="text-sm font-semibold">{isEnded ? 'Ended' : 'No upcoming renewal'}</p>
                          </>
                        )}
                      </div>

                      <div className="min-h-[24px]">
                        {subscription.category && (
                          <Badge variant="outline" className="text-xs">{subscription.category}</Badge>
                        )}
                      </div>

                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditSubscription(subscription.id)}
                        >
                          <Edit className="mr-1 h-3 w-3" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteSubscription(subscription.id)}
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
                    <TableHead className="hidden sm:table-cell">Frequency</TableHead>
                    <TableHead className="hidden xl:table-cell">Next Renewal</TableHead>
                    <TableHead className="hidden 2xl:table-cell text-right">Original Amount</TableHead>
                    <TableHead className="hidden sm:table-cell">Status</TableHead>
                    <TableHead className="text-right w-[140px]">Actions</TableHead>
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
                    const renewalMessage = getRenewalMessage(daysUntilRenewal, isEnded);

                    return (
                      <TableRow key={subscription.id}>
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
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant={subscription.is_active ? 'default' : 'secondary'} className="text-xs">
                            {subscription.is_active ? 'Active' : 'Inactive'}
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
        title="Delete Subscription"
        itemName="subscription"
        isDeleting={isDeleting}
      />
    </div>
  );
}
