/**
 * Income Tracking Page
 * Displays user's income sources with statistics
 */
'use client';

import React, { useState } from 'react';
import { TrendingUp, Calendar, Edit, Trash2 } from 'lucide-react';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import {
  useListIncomeSourcesQuery,
  useGetIncomeStatsQuery,
  useDeleteIncomeSourceMutation,
} from '@/lib/api/incomeApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { IncomeSourceForm } from '@/components/income/income-source-form';
import { MonthFilter, filterByMonth } from '@/components/ui/month-filter';
import { ModuleHeader } from '@/components/ui/module-header';
import { StatsCards, StatCard } from '@/components/ui/stats-cards';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { SearchFilter, filterBySearchAndCategory } from '@/components/ui/search-filter';
import { useTierCheck, getFeatureDisplayName } from '@/lib/hooks/use-tier-check';
import { UpgradePromptDialog } from '@/components/upgrade-prompt';

const FREQUENCY_LABELS: Record<string, string> = {
  one_time: 'One-time',
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annually: 'Annually',
};

export default function IncomePage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingSourceId, setDeletingSourceId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);

  const {
    data: sourcesData,
    isLoading: isLoadingSources,
    error: sourcesError,
    refetch: refetchSources,
  } = useListIncomeSourcesQuery({});

  const {
    data: stats,
    isLoading: isLoadingStats,
    error: statsError,
  } = useGetIncomeStatsQuery();

  const [deleteSource, { isLoading: isDeleting }] = useDeleteIncomeSourceMutation();

  // Tier check for income sources
  const currentCount = sourcesData?.items?.length || 0;
  const tierCheck = useTierCheck('incomeSources', currentCount);

  const handleAddSource = () => {
    // Check tier limits before opening form
    if (!tierCheck.canAdd) {
      setShowUpgradeDialog(true);
      return;
    }
    setEditingSourceId(null);
    setIsFormOpen(true);
  };

  const handleEditSource = (id: string) => {
    setEditingSourceId(id);
    setIsFormOpen(true);
  };

  const handleDeleteSource = (id: string) => {
    setDeletingSourceId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingSourceId) return;

    try {
      await deleteSource(deletingSourceId).unwrap();
      setDeleteDialogOpen(false);
      setDeletingSourceId(null);
    } catch (error) {
      console.error('Failed to delete income source:', error);
    }
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingSourceId(null);
  };


  // Get unique categories from income sources
  const uniqueCategories = React.useMemo(() => {
    if (!sourcesData?.items) return [];
    const categories = sourcesData.items
      .map((source) => source.category)
      .filter((cat): cat is string => !!cat);
    return Array.from(new Set(categories)).sort();
  }, [sourcesData?.items]);

  // Apply all filters: month -> search/category
  const monthFilteredSources = filterByMonth(
    sourcesData?.items,
    selectedMonth,
    (source) => source.frequency,
    (source) => source.date,
    (source) => source.start_date,
    (source) => source.end_date
  );

  const filteredSources = filterBySearchAndCategory(
    monthFilteredSources,
    searchQuery,
    selectedCategory,
    (source) => source.name,
    (source) => source.category
  );

  // Prepare stats cards data
  const statsCards: StatCard[] = stats
    ? [
        {
          title: 'Total Sources',
          value: stats.total_sources,
          description: `${stats.active_sources} active`,
          icon: TrendingUp,
        },
        {
          title: 'Monthly Income',
          value: (
            <CurrencyDisplay
              amount={stats.total_monthly_income}
              currency={stats.currency}
              showSymbol={true}
              showCode={false}
            />
          ),
          description: `From ${stats.active_sources} active ${stats.active_sources === 1 ? 'source' : 'sources'}`,
          icon: TrendingUp,
        },
        {
          title: 'Annual Income',
          value: (
            <CurrencyDisplay
              amount={stats.total_annual_income}
              currency={stats.currency}
              showSymbol={true}
              showCode={false}
            />
          ),
          description: 'Projected yearly income',
          icon: Calendar,
        },
      ]
    : [];

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Header */}
      <ModuleHeader
        title="Income Tracking"
        description="Track and manage your income sources"
        actionLabel="Add Income Source"
        onAction={handleAddSource}
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

      {/* Income Sources List */}
      <div>
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold">Income Sources</h2>
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
            searchPlaceholder="Search income sources..."
            categoryPlaceholder="All Categories"
          />
        </div>

        {isLoadingSources ? (
          <LoadingCards count={3} />
        ) : sourcesError ? (
          <ApiErrorState error={sourcesError} onRetry={refetchSources} />
        ) : !sourcesData?.items || sourcesData.items.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="No income sources yet"
            description="Start tracking your income by adding your first income source."
            actionLabel="Add Income Source"
            onAction={handleAddSource}
          />
        ) : !filteredSources || filteredSources.length === 0 ? (
          selectedMonth ? (
            <EmptyState
              icon={TrendingUp}
              title="No income sources for this month"
              description={`No income sources found for ${new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.`}
              actionLabel="Clear Filter"
              onAction={() => setSelectedMonth(null)}
            />
          ) : (
            <EmptyState
              icon={TrendingUp}
              title="No income sources yet"
              description="Start tracking your income by adding your first income source."
              actionLabel="Add Income Source"
              onAction={handleAddSource}
            />
          )
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredSources.map((source) => (
              <Card key={source.id} className="relative">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{source.name}</CardTitle>
                      <CardDescription className="mt-1 min-h-[20px]">
                        {source.description || '\u00A0'}
                      </CardDescription>
                    </div>
                    <Badge variant={source.is_active ? 'default' : 'secondary'}>
                      {source.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <div className="text-2xl font-bold">
                        <CurrencyDisplay
                          amount={source.display_amount ?? source.amount}
                          currency={source.display_currency ?? source.currency}
                          showSymbol={true}
                          showCode={false}
                        />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {FREQUENCY_LABELS[source.frequency] || source.frequency}
                        {source.display_currency && source.display_currency !== source.currency && (
                          <span className="ml-1 text-xs">
                            (orig: {source.amount} {source.currency})
                          </span>
                        )}
                      </p>
                    </div>

                    {source.frequency !== 'one_time' && (
                      <div className="rounded-lg bg-muted p-3">
                        {(source.display_monthly_equivalent ?? source.monthly_equivalent) ? (
                          <>
                            <p className="text-xs text-muted-foreground">
                              Monthly equivalent
                            </p>
                            <p className="text-sm font-semibold">
                              <CurrencyDisplay
                                amount={source.display_monthly_equivalent ?? source.monthly_equivalent ?? 0}
                                currency={source.display_currency ?? source.currency}
                                showSymbol={true}
                                showCode={false}
                              />
                            </p>
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">&nbsp;</p>
                        )}
                      </div>
                    )}

                    <div className="min-h-[24px]">
                      {source.category && (
                        <Badge variant="outline">{source.category}</Badge>
                      )}
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditSource(source.id)}
                      >
                        <Edit className="mr-1 h-3 w-3" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteSource(source.id)}
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

      {/* Income Source Form Dialog */}
      {isFormOpen && (
        <IncomeSourceForm
          sourceId={editingSourceId}
          isOpen={isFormOpen}
          onClose={handleFormClose}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        title="Delete Income Source"
        itemName="income source"
        isDeleting={isDeleting}
      />

      {/* Upgrade Prompt Dialog */}
      <UpgradePromptDialog
        isOpen={showUpgradeDialog}
        onClose={() => setShowUpgradeDialog(false)}
        feature={getFeatureDisplayName('incomeSources')}
        currentTier={tierCheck.currentTier}
        requiredTier={tierCheck.requiredTier || 'growth'}
        currentLimit={tierCheck.limit}
      />
    </div>
  );
}
