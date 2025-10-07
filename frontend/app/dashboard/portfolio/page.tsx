/**
 * Portfolio Page
 * Displays user's investment portfolio with performance tracking
 */
'use client';

import React, { useState } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Target, Edit, Trash2, BarChart3 } from 'lucide-react';
import {
  useListPortfolioAssetsQuery,
  useGetPortfolioStatsQuery,
  useDeletePortfolioAssetMutation,
} from '@/lib/api/portfolioApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { PortfolioForm } from '@/components/portfolio/portfolio-form';
import { ModuleHeader } from '@/components/ui/module-header';
import { StatsCards, StatCard } from '@/components/ui/stats-cards';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { SearchFilter, filterBySearchAndCategory } from '@/components/ui/search-filter';

export default function PortfolioPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const {
    data: portfolioData,
    isLoading: isLoadingAssets,
    error: assetsError,
    refetch: refetchAssets,
  } = useListPortfolioAssetsQuery({});

  const {
    data: stats,
    isLoading: isLoadingStats,
    error: statsError,
  } = useGetPortfolioStatsQuery();

  const [deleteAsset, { isLoading: isDeleting }] = useDeletePortfolioAssetMutation();

  const handleAddAsset = () => {
    setEditingAssetId(null);
    setIsFormOpen(true);
  };

  const handleEditAsset = (id: string) => {
    setEditingAssetId(id);
    setIsFormOpen(true);
  };

  const handleDeleteAsset = (id: string) => {
    setDeletingAssetId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingAssetId) return;

    try {
      await deleteAsset(deletingAssetId).unwrap();
      setDeleteDialogOpen(false);
      setDeletingAssetId(null);
    } catch (error) {
      console.error('Failed to delete asset:', error);
    }
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingAssetId(null);
  };

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatPercentage = (value: number | string) => {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    const sign = numValue >= 0 ? '+' : '';
    return `${sign}${numValue.toFixed(2)}%`;
  };

  // Get unique asset types from portfolio
  const uniqueAssetTypes = React.useMemo(() => {
    if (!portfolioData?.items) return [];
    const types = portfolioData.items
      .map((asset) => asset.asset_type)
      .filter((type): type is string => !!type);
    return Array.from(new Set(types)).sort();
  }, [portfolioData?.items]);

  // Apply search and category filters
  const filteredAssets = filterBySearchAndCategory(
    portfolioData?.items,
    searchQuery,
    selectedCategory,
    (asset) => `${asset.asset_name} ${asset.symbol || ''}`,
    (asset) => asset.asset_type
  );

  // Prepare stats cards data
  const statsCards: StatCard[] = stats
    ? [
        {
          title: 'Total Value',
          value: formatCurrency(stats.current_value, stats.currency),
          description: `${formatCurrency(stats.total_invested, stats.currency)} invested`,
          icon: DollarSign,
        },
        {
          title: 'Total Return',
          value: formatCurrency(stats.total_return, stats.currency),
          description: formatPercentage(stats.total_return_percentage),
          icon: stats.total_return >= 0 ? TrendingUp : TrendingDown,
        },
        {
          title: 'Total Assets',
          value: stats.total_assets,
          description: `${stats.winners} winners, ${stats.losers} losers`,
          icon: BarChart3,
        },
      ]
    : [];

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Header */}
      <ModuleHeader
        title="Portfolio"
        description="Track and manage your investment portfolio"
        actionLabel="Add Asset"
        onAction={handleAddAsset}
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

      {/* Best/Worst Performers */}
      {stats && (stats.best_performer || stats.worst_performer) && (
        <div className="grid gap-4 md:grid-cols-2">
          {stats.best_performer && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Best Performer
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{stats.best_performer.asset_name}</p>
                    {stats.best_performer.symbol && (
                      <p className="text-sm text-muted-foreground">{stats.best_performer.symbol}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-green-600">
                      {formatPercentage(stats.best_performer.return_percentage)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {stats.worst_performer && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Worst Performer
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{stats.worst_performer.asset_name}</p>
                    {stats.worst_performer.symbol && (
                      <p className="text-sm text-muted-foreground">{stats.worst_performer.symbol}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-red-600">
                      {formatPercentage(stats.worst_performer.return_percentage)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Assets List */}
      <div>
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between min-h-[38px]">
          <h2 className="text-xl font-semibold">Assets</h2>
        </div>

        {/* Search and Asset Type Filter */}
        <div className="mb-4">
          <SearchFilter
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            categories={uniqueAssetTypes}
            searchPlaceholder="Search assets..."
            categoryPlaceholder="All Asset Types"
          />
        </div>

        {isLoadingAssets ? (
          <LoadingCards count={3} />
        ) : assetsError ? (
          <ApiErrorState error={assetsError} onRetry={refetchAssets} />
        ) : !portfolioData?.items || portfolioData.items.length === 0 ? (
          <EmptyState
            icon={Target}
            title="No assets yet"
            description="Start tracking your investments by adding your first asset."
            actionLabel="Add Asset"
            onAction={handleAddAsset}
          />
        ) : !filteredAssets || filteredAssets.length === 0 ? (
          <EmptyState
            icon={Target}
            title="No assets found"
            description="Try adjusting your search or filter criteria."
            actionLabel="Clear Filters"
            onAction={() => {
              setSearchQuery('');
              setSelectedCategory(null);
            }}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredAssets.map((asset) => {
              const totalReturn = asset.total_return || 0;
              const returnPercentage = asset.return_percentage || 0;
              const isPositive = totalReturn >= 0;

              return (
                <Card key={asset.id} className="relative">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{asset.asset_name}</CardTitle>
                        <CardDescription className="mt-1 min-h-[20px]">
                          {asset.symbol ? (
                            <span className="font-mono font-semibold">{asset.symbol}</span>
                          ) : (
                            '\u00A0'
                          )}
                        </CardDescription>
                      </div>
                      <Badge variant={asset.is_active ? 'secondary' : 'outline'}>
                        {asset.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {/* Current Value and Return */}
                      <div className="rounded-lg border bg-muted/50 p-3">
                        <div className="flex items-baseline justify-between mb-1">
                          <span className="text-xs text-muted-foreground">Current Value</span>
                          <span className="text-2xl font-bold">
                            {formatCurrency(asset.current_value || 0, asset.currency)}
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between">
                          <span className="text-xs text-muted-foreground">
                            {formatCurrency(asset.total_invested || 0, asset.currency)} invested
                          </span>
                          <span className={`text-sm font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                            {formatPercentage(returnPercentage)}
                          </span>
                        </div>
                      </div>

                      {/* Return Display */}
                      <div className={`rounded-lg p-3 ${isPositive ? 'bg-green-50' : 'bg-red-50'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {isPositive ? (
                              <TrendingUp className="h-4 w-4 text-green-600" />
                            ) : (
                              <TrendingDown className="h-4 w-4 text-red-600" />
                            )}
                            <span className="text-xs text-muted-foreground">Total Return</span>
                          </div>
                          <span className={`font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(totalReturn, asset.currency)}
                          </span>
                        </div>
                      </div>

                      {/* Holdings Info */}
                      <div className="rounded-lg bg-muted p-3 space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Quantity:</span>
                          <span className="font-semibold">{parseFloat(asset.quantity.toString()).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Avg. Cost:</span>
                          <span className="font-semibold">
                            {formatCurrency(asset.purchase_price, asset.currency)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Current Price:</span>
                          <span className="font-semibold">
                            {formatCurrency(asset.current_price, asset.currency)}
                          </span>
                        </div>
                      </div>

                      <div className="min-h-[24px]">
                        {asset.asset_type && (
                          <Badge variant="outline">{asset.asset_type}</Badge>
                        )}
                      </div>

                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditAsset(asset.id)}
                        >
                          <Edit className="mr-1 h-3 w-3" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteAsset(asset.id)}
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

      {/* Portfolio Form Dialog */}
      {isFormOpen && (
        <PortfolioForm
          assetId={editingAssetId}
          isOpen={isFormOpen}
          onClose={handleFormClose}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        title="Delete Asset"
        itemName="asset"
        isDeleting={isDeleting}
      />
    </div>
  );
}
