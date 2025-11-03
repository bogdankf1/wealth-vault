/**
 * Portfolio Page
 * Displays user's investment portfolio with performance tracking
 */
'use client';

import React, { useState } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Target, Edit, Trash2, BarChart3, LayoutGrid, List } from 'lucide-react';
import {
  useListPortfolioAssetsQuery,
  useGetPortfolioStatsQuery,
  useDeletePortfolioAssetMutation,
} from '@/lib/api/portfolioApi';
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
import { PortfolioForm } from '@/components/portfolio/portfolio-form';
import { ModuleHeader } from '@/components/ui/module-header';
import { StatsCards, StatCard } from '@/components/ui/stats-cards';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { SearchFilter, filterBySearchAndCategory } from '@/components/ui/search-filter';
import { CurrencyDisplay } from '@/components/currency/currency-display';

export default function PortfolioPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
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
          value: (
            <CurrencyDisplay
              amount={stats.current_value}
              currency={stats.currency}
              showSymbol={true}
              showCode={false}
            />
          ),
          description: (
            <span className="flex items-center gap-1">
              <CurrencyDisplay
                amount={stats.total_invested}
                currency={stats.currency}
                showSymbol={true}
                showCode={false}
              />
              <span>invested</span>
            </span>
          ),
          icon: DollarSign,
        },
        {
          title: 'Total Return',
          value: (
            <CurrencyDisplay
              amount={stats.total_return}
              currency={stats.currency}
              showSymbol={true}
              showCode={false}
            />
          ),
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
    <div className="container mx-auto space-y-4 md:space-y-6 p-4 md:p-6">
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

      {/* Search, Filters, and View Toggle */}
      {(portfolioData?.items && portfolioData.items.length > 0) && (
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex-1">
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
          <div className="flex items-center gap-1 border rounded-md p-1">
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
      )}

      {/* Assets List */}
      <div>

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
        ) : viewMode === 'card' ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredAssets.map((asset) => {
              const displayCurrency = asset.display_currency || asset.currency;
              const displayCurrentValue = asset.display_current_value ?? asset.current_value ?? 0;
              const displayTotalInvested = asset.display_total_invested ?? asset.total_invested ?? 0;
              const displayTotalReturn = asset.display_total_return ?? asset.total_return ?? 0;
              const displayPurchasePrice = asset.display_purchase_price ?? asset.purchase_price;
              const displayCurrentPrice = asset.display_current_price ?? asset.current_price;
              const returnPercentage = asset.return_percentage || 0;
              const isPositive = displayTotalReturn >= 0;

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
                            <>&nbsp;</>
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
                            <CurrencyDisplay
                              amount={displayCurrentValue}
                              currency={displayCurrency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <CurrencyDisplay
                              amount={displayTotalInvested}
                              currency={displayCurrency}
                              showSymbol={true}
                              showCode={false}
                            />
                            <span>invested</span>
                          </span>
                          <span className={`text-sm font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                            {formatPercentage(returnPercentage)}
                          </span>
                        </div>
                        {asset.display_currency && asset.display_currency !== asset.currency && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Original: <CurrencyDisplay
                              amount={asset.current_value || 0}
                              currency={asset.currency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </p>
                        )}
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
                            <CurrencyDisplay
                              amount={displayTotalReturn}
                              currency={displayCurrency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </span>
                        </div>
                        {asset.display_currency && asset.display_currency !== asset.currency && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Original: <CurrencyDisplay
                              amount={asset.total_return || 0}
                              currency={asset.currency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </p>
                        )}
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
                            <CurrencyDisplay
                              amount={displayPurchasePrice}
                              currency={displayCurrency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Current Price:</span>
                          <span className="font-semibold">
                            <CurrencyDisplay
                              amount={displayCurrentPrice}
                              currency={displayCurrency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </span>
                        </div>
                        {asset.display_currency && asset.display_currency !== asset.currency && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Original: <CurrencyDisplay
                              amount={asset.purchase_price}
                              currency={asset.currency}
                              showSymbol={true}
                              showCode={false}
                            /> / <CurrencyDisplay
                              amount={asset.current_price}
                              currency={asset.currency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </p>
                        )}
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
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Asset</TableHead>
                    <TableHead className="hidden lg:table-cell">Type</TableHead>
                    <TableHead className="text-right">Current Value</TableHead>
                    <TableHead className="hidden md:table-cell text-right">Return</TableHead>
                    <TableHead className="hidden sm:table-cell text-right">Quantity</TableHead>
                    <TableHead className="hidden xl:table-cell text-right">Current Price</TableHead>
                    <TableHead className="hidden 2xl:table-cell text-right">Original Value</TableHead>
                    <TableHead className="hidden sm:table-cell">Status</TableHead>
                    <TableHead className="text-right w-[140px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssets.map((asset) => {
                    const displayCurrency = asset.display_currency || asset.currency;
                    const displayCurrentValue = asset.display_current_value ?? asset.current_value ?? 0;
                    const displayTotalReturn = asset.display_total_return ?? asset.total_return ?? 0;
                    const displayCurrentPrice = asset.display_current_price ?? asset.current_price;
                    const returnPercentage = asset.return_percentage || 0;
                    const isPositive = displayTotalReturn >= 0;

                    return (
                      <TableRow key={asset.id}>
                        <TableCell className="font-medium">
                          <div className="max-w-[200px]">
                            <p className="truncate">{asset.asset_name}</p>
                            {asset.symbol && (
                              <p className="text-xs text-muted-foreground font-mono truncate">
                                {asset.symbol}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {asset.asset_type ? (
                            <Badge variant="outline" className="text-xs">{asset.asset_type}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          <CurrencyDisplay
                            amount={displayCurrentValue}
                            currency={displayCurrency}
                            showSymbol={true}
                            showCode={false}
                          />
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-right">
                          <div className="flex flex-col items-end">
                            <span className={`font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                              <CurrencyDisplay
                                amount={displayTotalReturn}
                                currency={displayCurrency}
                                showSymbol={true}
                                showCode={false}
                              />
                            </span>
                            <span className={`text-xs ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                              {formatPercentage(returnPercentage)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-right">
                          <span className="text-sm">
                            {parseFloat(asset.quantity.toString()).toFixed(2)}
                          </span>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell text-right">
                          <span className="text-sm">
                            <CurrencyDisplay
                              amount={displayCurrentPrice}
                              currency={displayCurrency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </span>
                        </TableCell>
                        <TableCell className="hidden 2xl:table-cell text-right">
                          {asset.display_currency && asset.display_currency !== asset.currency ? (
                            <span className="text-sm text-muted-foreground">
                              {asset.current_value || 0} {asset.currency}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant={asset.is_active ? 'secondary' : 'outline'} className="text-xs">
                            {asset.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditAsset(asset.id)}
                              className="h-8 w-8 p-0"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteAsset(asset.id)}
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
