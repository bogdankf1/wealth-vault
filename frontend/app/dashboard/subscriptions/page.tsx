/**
 * Subscriptions Tracking Page
 * Displays user's subscriptions with next renewal dates
 */
'use client';

import React, { useState } from 'react';
import { Calendar, TrendingDown, RefreshCw, Edit, Trash2 } from 'lucide-react';
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
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { SubscriptionForm } from '@/components/subscriptions/subscription-form';
import { ModuleHeader } from '@/components/ui/module-header';
import { StatsCards, StatCard } from '@/components/ui/stats-cards';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { SearchFilter, filterBySearchAndCategory } from '@/components/ui/search-filter';
import { MonthFilter, filterByMonth } from '@/components/ui/month-filter';

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

  const {
    data: subscriptionsData,
    isLoading: isLoadingSubscriptions,
    error: subscriptionsError,
    refetch: refetchSubscriptions,
  } = useListSubscriptionsQuery({});

  const {
    data: stats,
    isLoading: isLoadingStats,
    error: statsError,
  } = useGetSubscriptionStatsQuery();

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

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
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
  const filteredSubscriptions = filterBySearchAndCategory(
    monthFilteredSubscriptions,
    searchQuery,
    selectedCategory,
    (subscription) => subscription.name,
    (subscription) => subscription.category
  );

  // Prepare stats cards data
  const statsCards: StatCard[] = stats
    ? [
        {
          title: 'Total Subscriptions',
          value: stats.total_subscriptions,
          description: `${stats.active_subscriptions} active`,
          icon: RefreshCw,
        },
        {
          title: 'Monthly Cost',
          value: formatCurrency(stats.monthly_cost, stats.currency),
          description: `From ${stats.active_subscriptions} active ${stats.active_subscriptions === 1 ? 'subscription' : 'subscriptions'}`,
          icon: TrendingDown,
        },
        {
          title: 'Annual Cost',
          value: formatCurrency(stats.total_annual_cost, stats.currency),
          description: 'Projected yearly cost',
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
    <div className="container mx-auto space-y-6 p-6">
      {/* Header */}
      <ModuleHeader
        title="Subscriptions"
        description="Track and manage your recurring subscriptions"
        actionLabel="Add Subscription"
        onAction={handleAddSubscription}
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

      {/* Subscriptions List */}
      <div>
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between min-h-[38px]">
          <h2 className="text-xl font-semibold">Subscriptions</h2>
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
            searchPlaceholder="Search subscriptions..."
            categoryPlaceholder="All Categories"
          />
        </div>

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
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{subscription.name}</CardTitle>
                        <CardDescription className="mt-1 min-h-[20px]">
                          {subscription.description || '\u00A0'}
                        </CardDescription>
                      </div>
                      <Badge variant={subscription.is_active ? 'default' : 'secondary'}>
                        {subscription.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <div className="text-2xl font-bold">
                          {formatCurrency(subscription.amount, subscription.currency)}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {FREQUENCY_LABELS[subscription.frequency] || subscription.frequency}
                        </p>
                      </div>

                      {/* Next Renewal Date - Key Feature */}
                      <div className="rounded-lg bg-muted p-3 min-h-[60px]">
                        {nextRenewal ? (
                          <>
                            <p className="text-xs text-muted-foreground">Next Renewal</p>
                            <p className="text-sm font-semibold">
                              {formatRenewalDate(nextRenewal)}
                            </p>
                            <Badge
                              variant={getRenewalBadgeVariant(urgency)}
                              className="mt-1"
                            >
                              {renewalMessage}
                            </Badge>
                          </>
                        ) : (
                          <>
                            <p className="text-xs text-muted-foreground">Status</p>
                            <p className="text-sm font-semibold">{isEnded ? 'Ended' : 'No upcoming renewal'}</p>
                          </>
                        )}
                      </div>

                      <div className="min-h-[24px]">
                        {subscription.category && (
                          <Badge variant="outline">{subscription.category}</Badge>
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
