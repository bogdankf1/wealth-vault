/**
 * Portfolio Page
 * Displays user's investment portfolio with performance tracking
 */
'use client';

import React, { useState, useCallback } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Target, Edit, Trash2, Archive, BarChart3, LayoutGrid, List, Grid3x3, Rows3 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  useListPortfolioAssetsQuery,
  useGetPortfolioStatsQuery,
  useUpdatePortfolioAssetMutation,
  useDeletePortfolioAssetMutation,
  useBatchDeleteAssetsMutation,
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

import { StatsCards, StatCard } from '@/components/ui/stats-cards';
import { PortfolioActionsContext } from '../context';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { BatchDeleteConfirmDialog } from '@/components/ui/batch-delete-confirm-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchFilter, filterBySearchAndCategory } from '@/components/ui/search-filter';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { SortFilter, sortItems, type SortField, type SortDirection } from '@/components/ui/sort-filter';
import { useViewPreferences } from '@/lib/hooks/use-view-preferences';
import { toast } from 'sonner';

export default function PortfolioPage() {
  // Get context for setting actions
  const { setActions } = React.useContext(PortfolioActionsContext);

  // Translation hooks
  const tOverview = useTranslations('portfolio.overview');
  const tActions = useTranslations('portfolio.actions');
  const tCommon = useTranslations('common');
  const tAssetTypes = useTranslations('portfolio.assetTypes');
  const tStatus = useTranslations('portfolio.status');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Use default view preferences from user settings
  const { viewMode, setViewMode, statsViewMode, setStatsViewMode } = useViewPreferences();

  const {
    data: portfolioData,
    isLoading: isLoadingAssets,
    error: assetsError,
    refetch: refetchAssets,
  } = useListPortfolioAssetsQuery({ is_active: true });

  const {
    data: stats,
    isLoading: isLoadingStats,
    error: statsError,
  } = useGetPortfolioStatsQuery();

  const [updateAsset] = useUpdatePortfolioAssetMutation();
  const [deleteAsset, { isLoading: isDeleting }] = useDeletePortfolioAssetMutation();
  const [batchDeleteAssets, { isLoading: isBatchDeleting }] = useBatchDeleteAssetsMutation();

  const handleAddAsset = useCallback(() => {
    setEditingAssetId(null);
    setIsFormOpen(true);
  }, []);

  const handleEditAsset = (id: string) => {
    setEditingAssetId(id);
    setIsFormOpen(true);
  };

  const handleDeleteAsset = (id: string) => {
    setDeletingAssetId(id);
    setDeleteDialogOpen(true);
  };

  const handleArchiveAsset = async (id: string) => {
    try {
      await updateAsset({ id, data: { is_active: false } }).unwrap();
      toast.success(tOverview('archiveSuccess'));
      setSelectedAssetIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    } catch (error) {
      toast.error(tOverview('archiveError'));
    }
  };

  const handleBatchArchive = useCallback(async () => {
    const idsToArchive = Array.from(selectedAssetIds);
    let successCount = 0;
    let failCount = 0;

    for (const id of idsToArchive) {
      try {
        await updateAsset({ id, data: { is_active: false } }).unwrap();
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

    setSelectedAssetIds(new Set());
  }, [selectedAssetIds, updateAsset, tOverview]);

  const confirmDelete = async () => {
    if (!deletingAssetId) return;

    try {
      await deleteAsset(deletingAssetId).unwrap();
      toast.success(tOverview('deleteSuccess'));
      setDeleteDialogOpen(false);
      setDeletingAssetId(null);
    } catch (error) {
      toast.error(tOverview('deleteError'));
    }
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingAssetId(null);
  };

  const handleToggleSelect = (assetId: string) => {
    const newSelected = new Set(selectedAssetIds);
    if (newSelected.has(assetId)) {
      newSelected.delete(assetId);
    } else {
      newSelected.add(assetId);
    }
    setSelectedAssetIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedAssetIds.size === filteredAssets.length) {
      setSelectedAssetIds(new Set());
    } else {
      setSelectedAssetIds(new Set(filteredAssets.map(asset => asset.id)));
    }
  };

  const handleBatchDelete = useCallback(() => {
    if (selectedAssetIds.size === 0) return;
    setBatchDeleteDialogOpen(true);
  }, [selectedAssetIds]);

  // Set action buttons in layout
  React.useEffect(() => {
    setActions(
      <>
        {selectedAssetIds.size > 0 && (
          <>
            <Button
              onClick={handleBatchArchive}
              variant="outline"
              size="default"
              className="w-full sm:w-auto"
            >
              <Archive className="mr-2 h-4 w-4" />
              <span className="truncate">{tOverview('archiveSelected', { count: selectedAssetIds.size })}</span>
            </Button>
            <Button
              onClick={handleBatchDelete}
              variant="destructive"
              size="default"
              className="w-full sm:w-auto"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              <span className="truncate">{tOverview('deleteSelected', { count: selectedAssetIds.size })}</span>
            </Button>
          </>
        )}
        <Button onClick={handleAddAsset} size="default" className="w-full sm:w-auto">
          <DollarSign className="mr-2 h-4 w-4" />
          <span className="truncate">{tOverview('addAsset')}</span>
        </Button>
      </>
    );

    return () => setActions(null);
  }, [selectedAssetIds.size, setActions, handleBatchArchive, handleBatchDelete, handleAddAsset, tOverview]);

  const confirmBatchDelete = async () => {
    if (selectedAssetIds.size === 0) return;

    try {
      const result = await batchDeleteAssets({
        ids: Array.from(selectedAssetIds),
      }).unwrap();

      if (result.failed_ids.length > 0) {
        toast.error(tOverview('batchDeleteError', { count: result.failed_ids.length }));
      } else {
        toast.success(tOverview('batchDeleteSuccess', { count: result.deleted_count }));
      }
      setBatchDeleteDialogOpen(false);
      setSelectedAssetIds(new Set());
    } catch (error) {
      toast.error(tOverview('batchDeleteError', { count: selectedAssetIds.size }));
    }
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
  const searchFilteredAssets = filterBySearchAndCategory(
    portfolioData?.items,
    searchQuery,
    selectedCategory,
    (asset) => `${asset.asset_name} ${asset.symbol || ''}`,
    (asset) => asset.asset_type
  );

  // Apply sorting (using display_current_value for currency-aware sorting)
  const filteredAssets = sortItems(
    searchFilteredAssets,
    sortField,
    sortDirection,
    (asset) => asset.asset_name,
    (asset) => asset.display_current_value || asset.current_value || 0,
    (asset) => asset.purchase_date
  ) || [];

  // Prepare stats cards data
  const statsCards: StatCard[] = stats
    ? [
        {
          title: tOverview('totalValue'),
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
              <span>{tOverview('totalInvested')}</span>
            </span>
          ),
          icon: DollarSign,
        },
        {
          title: tOverview('totalReturn'),
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
          title: tOverview('totalAssets'),
          value: stats.total_assets,
          description: `${stats.winners} ${tOverview('winners')}, ${stats.losers} ${tOverview('losers')}`,
          icon: BarChart3,
        },
      ]
    : [];

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
      {(portfolioData?.items && portfolioData.items.length > 0) && (
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex-1">
            <SearchFilter
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
              categories={uniqueAssetTypes}
              searchPlaceholder={tOverview('searchPlaceholder')}
              categoryPlaceholder={tOverview('allAssetTypes')}
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

      {/* Assets List */}
      <div>

        {isLoadingAssets ? (
          <LoadingCards count={3} />
        ) : assetsError ? (
          <ApiErrorState error={assetsError} onRetry={refetchAssets} />
        ) : !portfolioData?.items || portfolioData.items.length === 0 ? (
          <EmptyState
            icon={Target}
            title={tOverview('noAssets')}
            description={tOverview('noAssetsDescription')}
            actionLabel={tOverview('addAsset')}
            onAction={handleAddAsset}
          />
        ) : !filteredAssets || filteredAssets.length === 0 ? (
          <EmptyState
            icon={Target}
            title={tCommon('common.noResults')}
            description={tOverview('noFilterResults')}
          />
        ) : viewMode === 'card' ? (
          <div className="space-y-3">
            {filteredAssets.length > 0 && (
              <div className="flex items-center gap-2 px-1">
                <Checkbox
                  checked={selectedAssetIds.size === filteredAssets.length}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all assets"
                />
                <span className="text-sm text-muted-foreground">
                  {selectedAssetIds.size === filteredAssets.length ? tOverview('deselectAll') : tOverview('selectAll')}
                </span>
              </div>
            )}
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
                      <div className="flex items-start gap-3 flex-1">
                        <Checkbox
                          checked={selectedAssetIds.has(asset.id)}
                          onCheckedChange={() => handleToggleSelect(asset.id)}
                          aria-label={`Select ${asset.asset_name}`}
                          className="mt-1"
                        />
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
                      </div>
                      <Badge variant={asset.is_active ? 'secondary' : 'outline'} className="flex-shrink-0">
                        {asset.is_active ? tStatus('active') : tStatus('inactive')}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {/* Current Value and Return */}
                      <div className="rounded-lg border bg-muted/50 p-3">
                        <div className="flex items-baseline justify-between mb-1">
                          <span className="text-xs text-muted-foreground">{tOverview('currentValue')}</span>
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
                            <span>{tOverview('invested')}</span>
                          </span>
                          <span className={`text-sm font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                            {formatPercentage(returnPercentage)}
                          </span>
                        </div>
                        {asset.display_currency && asset.display_currency !== asset.currency && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {tOverview('original')} <CurrencyDisplay
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
                            <span className="text-xs text-muted-foreground">{tOverview('totalReturn')}</span>
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
                            {tOverview('original')} <CurrencyDisplay
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
                          <span className="text-muted-foreground">{tOverview('quantity')}</span>
                          <span className="font-semibold">{parseFloat(asset.quantity.toString()).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{tOverview('avgCost')}</span>
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
                          <span className="text-muted-foreground">{tOverview('currentPrice')}</span>
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
                            {tOverview('original')} <CurrencyDisplay
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

                      <div className="flex flex-wrap gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditAsset(asset.id)}
                        >
                          <Edit className="mr-1 h-3 w-3" />
                          {tActions('edit')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleArchiveAsset(asset.id)}
                        >
                          <Archive className="mr-1 h-3 w-3" />
                          {tActions('archive')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteAsset(asset.id)}
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
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={selectedAssetIds.size === filteredAssets.length}
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all assets"
                      />
                    </TableHead>
                    <TableHead className="w-[200px]">{tOverview('asset')}</TableHead>
                    <TableHead className="hidden lg:table-cell">{tOverview('type')}</TableHead>
                    <TableHead className="text-right">{tOverview('currentValue')}</TableHead>
                    <TableHead className="hidden md:table-cell text-right">{tOverview('return')}</TableHead>
                    <TableHead className="hidden sm:table-cell text-right">{tOverview('quantity')}</TableHead>
                    <TableHead className="hidden xl:table-cell text-right">{tOverview('currentPrice')}</TableHead>
                    <TableHead className="hidden 2xl:table-cell text-right">{tOverview('originalValue')}</TableHead>
                    <TableHead className="hidden sm:table-cell">{tOverview('status')}</TableHead>
                    <TableHead className="text-right w-[180px]">{tOverview('actions')}</TableHead>
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
                        <TableCell>
                          <Checkbox
                            checked={selectedAssetIds.has(asset.id)}
                            onCheckedChange={() => handleToggleSelect(asset.id)}
                            aria-label={`Select ${asset.asset_name}`}
                          />
                        </TableCell>
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
                            {asset.is_active ? tStatus('active') : tStatus('inactive')}
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
                              onClick={() => handleArchiveAsset(asset.id)}
                              className="h-8 w-8 p-0"
                            >
                              <Archive className="h-4 w-4" />
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
        title={tOverview('deleteConfirmTitle')}
        description={tOverview('deleteConfirmDescription')}
        itemName="asset"
        isDeleting={isDeleting}
        cancelLabel={tActions('cancel')}
        deleteLabel={tActions('delete')}
      />

      {/* Batch Delete Confirmation Dialog */}
      <BatchDeleteConfirmDialog
        open={batchDeleteDialogOpen}
        onOpenChange={setBatchDeleteDialogOpen}
        onConfirm={confirmBatchDelete}
        count={selectedAssetIds.size}
        itemName="asset"
        isDeleting={isBatchDeleting}
        cancelLabel={tActions('cancel')}
        deleteLabel={tActions('delete')}
      />
    </div>
  );
}
