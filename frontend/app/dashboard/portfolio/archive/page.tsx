/**
 * Portfolio Archive Page
 * Displays archived portfolio assets with unarchive functionality
 */
'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Archive, ArchiveRestore, Trash2, LayoutGrid, List } from 'lucide-react';
import { toast } from 'sonner';
import {
  useListPortfolioAssetsQuery,
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
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { BatchDeleteConfirmDialog } from '@/components/ui/batch-delete-confirm-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchFilter, filterBySearchAndCategory } from '@/components/ui/search-filter';
import { SortFilter, sortItems, type SortField, type SortDirection } from '@/components/ui/sort-filter';
import { CurrencyDisplay } from '@/components/currency';
import { useViewPreferences } from '@/lib/hooks/use-view-preferences';
import { PortfolioActionsContext } from '../context';

export default function PortfolioArchivePage() {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);

  // Use default view preferences from user settings
  const { viewMode, setViewMode } = useViewPreferences();

  // Context to set action buttons in layout
  const { setActions } = React.useContext(PortfolioActionsContext);

  // Fetch only archived portfolio assets (is_active: false)
  const {
    data: assetsData,
    isLoading: isLoadingAssets,
    error: assetsError,
  } = useListPortfolioAssetsQuery({ is_active: false });

  const [updateAsset] = useUpdatePortfolioAssetMutation();
  const [deleteAsset, { isLoading: isDeleting }] = useDeletePortfolioAssetMutation();
  const [batchDeleteAssets, { isLoading: isBatchDeleting }] = useBatchDeleteAssetsMutation();

  const assets = useMemo(() => assetsData?.items || [], [assetsData?.items]);

  // Get unique asset types
  const uniqueAssetTypes = React.useMemo(() => {
    const types = assets
      .map((asset) => asset.asset_type)
      .filter((type): type is string => !!type);
    return Array.from(new Set(types)).sort();
  }, [assets]);

  // Filter and sort assets
  const filteredAssets = React.useMemo(() => {
    const filtered = filterBySearchAndCategory(
      assets,
      searchQuery,
      selectedCategory,
      (asset) => `${asset.asset_name} ${asset.symbol || ''}`,
      (asset) => asset.asset_type || undefined
    );

    // Apply sorting
    const sorted = sortItems(
      filtered,
      sortField,
      sortDirection,
      (asset) => asset.asset_name,
      (asset) => asset.display_current_value || asset.current_value || 0,
      (asset) => asset.purchase_date || asset.created_at
    );

    return sorted || [];
  }, [assets, searchQuery, selectedCategory, sortField, sortDirection]);

  const handleUnarchive = async (id: string) => {
    try {
      await updateAsset({ id, data: { is_active: true } }).unwrap();
      toast.success('Portfolio asset unarchived successfully');
      setSelectedAssetIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    } catch (error) {
      console.error('Failed to unarchive portfolio asset:', error);
      toast.error('Failed to unarchive portfolio asset');
    }
  };

  const handleBatchUnarchive = useCallback(async () => {
    const idsToUnarchive = Array.from(selectedAssetIds);
    let successCount = 0;
    let failCount = 0;

    for (const id of idsToUnarchive) {
      try {
        await updateAsset({ id, data: { is_active: true } }).unwrap();
        successCount++;
      } catch (error) {
        console.error(`Failed to unarchive portfolio asset ${id}:`, error);
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(`Successfully unarchived ${successCount} asset(s)`);
    }
    if (failCount > 0) {
      toast.error(`Failed to unarchive ${failCount} asset(s)`);
    }

    setSelectedAssetIds(new Set());
  }, [selectedAssetIds, updateAsset]);

  const handleDelete = (id: string) => {
    setDeletingAssetId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingAssetId) return;

    try {
      await deleteAsset(deletingAssetId).unwrap();
      toast.success('Portfolio asset deleted permanently');
      setDeleteDialogOpen(false);
      setDeletingAssetId(null);
      setSelectedAssetIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(deletingAssetId);
        return newSet;
      });
    } catch (error) {
      console.error('Failed to delete portfolio asset:', error);
      toast.error('Failed to delete portfolio asset');
    }
  };

  const handleToggleSelect = (assetId: string) => {
    setSelectedAssetIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(assetId)) {
        newSet.delete(assetId);
      } else {
        newSet.add(assetId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedAssetIds.size === filteredAssets.length && filteredAssets.length > 0) {
      setSelectedAssetIds(new Set());
    } else {
      setSelectedAssetIds(new Set(filteredAssets.map((asset) => asset.id)));
    }
  };

  const handleBatchDelete = () => {
    setBatchDeleteDialogOpen(true);
  };

  const confirmBatchDelete = async () => {
    if (selectedAssetIds.size === 0) return;

    try {
      const result = await batchDeleteAssets({
        ids: Array.from(selectedAssetIds),
      }).unwrap();

      if (result.failed_ids.length > 0) {
        toast.error(`Failed to delete ${result.failed_ids.length} asset(s)`);
      } else {
        toast.success(`Successfully deleted ${result.deleted_count} asset(s) permanently`);
      }

      setBatchDeleteDialogOpen(false);
      setSelectedAssetIds(new Set());
    } catch (error) {
      console.error('Failed to delete portfolio assets:', error);
      toast.error('Failed to delete portfolio assets');
    }
  };

  const formatPercentage = (value: number | string) => {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    const sign = numValue >= 0 ? '+' : '';
    return `${sign}${numValue.toFixed(2)}%`;
  };

  // Set action buttons in layout
  React.useEffect(() => {
    setActions(
      <>
        {selectedAssetIds.size > 0 && (
          <>
            <Button
              onClick={handleBatchUnarchive}
              variant="outline"
              size="default"
              className="w-full sm:w-auto"
            >
              <ArchiveRestore className="mr-2 h-4 w-4" />
              <span className="truncate">Unarchive Selected ({selectedAssetIds.size})</span>
            </Button>
            <Button
              onClick={handleBatchDelete}
              variant="destructive"
              size="default"
              className="w-full sm:w-auto"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              <span className="truncate">Delete Selected ({selectedAssetIds.size})</span>
            </Button>
          </>
        )}
      </>
    );

    return () => setActions(null);
  }, [selectedAssetIds.size, setActions, handleBatchUnarchive]);

  const isLoading = isLoadingAssets;
  const hasError = assetsError;

  if (hasError) {
    return (
      <ApiErrorState
        error={assetsError}
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Search and Filters */}
      {(assets.length > 0 || searchQuery || selectedCategory) && (
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex-1">
            <SearchFilter
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
              categories={uniqueAssetTypes}
              searchPlaceholder="Search archived portfolio assets..."
              categoryPlaceholder="All Asset Types"
            />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <SortFilter
              sortField={sortField}
              sortDirection={sortDirection}
              onSortFieldChange={setSortField}
              onSortDirectionChange={setSortDirection}
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

      {/* Portfolio Assets List */}
      <div>
        {isLoading ? (
          <LoadingCards count={6} />
        ) : !assets || assets.length === 0 ? (
          <EmptyState
            icon={Archive}
            title="No archived portfolio assets"
            description="Archived portfolio assets will appear here"
          />
        ) : !filteredAssets || filteredAssets.length === 0 ? (
          <EmptyState
            icon={Archive}
            title="No archived portfolio assets found"
            description="Try adjusting your search or filters"
          />
        ) : viewMode === 'card' ? (
          <>
            {filteredAssets.length > 0 && (
              <div className="flex items-center gap-2 px-1 mb-4">
                <Checkbox
                  checked={selectedAssetIds.size === filteredAssets.length}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all portfolio assets"
                />
                <span className="text-sm text-muted-foreground">
                  {selectedAssetIds.size === filteredAssets.length ? 'Deselect all' : 'Select all'}
                </span>
              </div>
            )}
            <div className="grid gap-3 md:gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredAssets.map((asset) => {
              const displayCurrency = asset.display_currency || asset.currency;
              const displayCurrentValue = asset.display_current_value ?? asset.current_value ?? 0;
              const displayTotalReturn = asset.display_total_return ?? asset.total_return ?? 0;
              const displayPurchasePrice = asset.display_purchase_price ?? asset.purchase_price;
              const displayCurrentPrice = asset.display_current_price ?? asset.current_price;
              const returnPercentage = asset.return_percentage || 0;
              const isPositive = displayTotalReturn >= 0;

              return (
                <Card key={asset.id} className="relative opacity-75">
                  <CardHeader className="pb-3 md:pb-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <Checkbox
                          checked={selectedAssetIds.has(asset.id)}
                          onCheckedChange={() => handleToggleSelect(asset.id)}
                          aria-label={`Select ${asset.asset_name}`}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base md:text-lg truncate">{asset.asset_name}</CardTitle>
                          <CardDescription className="mt-1 min-h-[20px] text-xs md:text-sm line-clamp-2">
                            {asset.symbol ? (
                              <span className="font-mono font-semibold">{asset.symbol}</span>
                            ) : asset.description ? (
                              asset.description
                            ) : (
                              ' '
                            )}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs flex-shrink-0">
                        Archived
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2 md:space-y-3">
                      {/* Current Value */}
                      <div>
                        <div className="text-xl md:text-2xl font-bold">
                          <CurrencyDisplay
                            amount={displayCurrentValue}
                            currency={displayCurrency}
                            showSymbol={true}
                            showCode={false}
                          />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Current Value
                        </p>
                        <div className="text-[10px] md:text-xs text-muted-foreground mt-1 min-h-[16px]">
                          {asset.display_currency && asset.display_currency !== asset.currency && (
                            <>
                              Original: <CurrencyDisplay
                                amount={asset.current_value || 0}
                                currency={asset.currency}
                                showSymbol={true}
                                showCode={false}
                              />
                            </>
                          )}
                        </div>
                      </div>

                      {/* Return Display */}
                      <div className="rounded-lg bg-muted p-2 md:p-3 min-h-[60px] flex items-center justify-center">
                        <div className="text-center w-full">
                          <p className="text-[10px] md:text-xs text-muted-foreground">
                            Total Return
                          </p>
                          <p className={`text-sm font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                            <CurrencyDisplay
                              amount={displayTotalReturn}
                              currency={displayCurrency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </p>
                          <p className={`text-[10px] md:text-xs ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                            {formatPercentage(returnPercentage)}
                          </p>
                        </div>
                      </div>

                      {/* Holdings Info */}
                      <div className="rounded-lg bg-muted/50 p-2 md:p-3 space-y-1">
                        <div className="flex justify-between text-xs md:text-sm">
                          <span className="text-muted-foreground">Quantity:</span>
                          <span className="font-semibold">{parseFloat(asset.quantity.toString()).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs md:text-sm">
                          <span className="text-muted-foreground">Purchase Price:</span>
                          <span className="font-semibold">
                            <CurrencyDisplay
                              amount={displayPurchasePrice}
                              currency={displayCurrency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </span>
                        </div>
                        <div className="flex justify-between text-xs md:text-sm">
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
                      </div>

                      <div className="min-h-[24px]">
                        {asset.asset_type && (
                          <Badge variant="outline" className="text-xs flex-shrink-0">{asset.asset_type}</Badge>
                        )}
                      </div>

                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUnarchive(asset.id)}
                        >
                          <ArchiveRestore className="mr-1 h-3 w-3" />
                          Unarchive
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(asset.id)}
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
          </>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={selectedAssetIds.size === filteredAssets.length && filteredAssets.length > 0}
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead className="w-[200px]">Asset</TableHead>
                    <TableHead className="hidden md:table-cell">Symbol</TableHead>
                    <TableHead className="hidden lg:table-cell">Type</TableHead>
                    <TableHead className="text-right">Current Value</TableHead>
                    <TableHead className="hidden sm:table-cell text-right">Return</TableHead>
                    <TableHead className="hidden xl:table-cell text-right">Quantity</TableHead>
                    <TableHead className="hidden xl:table-cell text-right">Current Price</TableHead>
                    <TableHead className="hidden 2xl:table-cell text-right">Original Value</TableHead>
                    <TableHead className="text-right w-[180px]">Actions</TableHead>
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
                      <TableRow key={asset.id} className="opacity-75">
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
                              <p className="text-xs text-muted-foreground font-mono md:hidden truncate">
                                {asset.symbol}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {asset.symbol ? (
                            <span className="font-mono text-sm">{asset.symbol}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
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
                        <TableCell className="hidden sm:table-cell text-right">
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
                        <TableCell className="hidden xl:table-cell text-right">
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
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleUnarchive(asset.id)}
                              className="h-8 w-8 p-0"
                            >
                              <ArchiveRestore className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(asset.id)}
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
        title="Delete Portfolio Asset Permanently"
        description="This will permanently delete this portfolio asset. This action cannot be undone."
        itemName="portfolio asset"
        isDeleting={isDeleting}
      />

      {/* Batch Delete Confirmation Dialog */}
      <BatchDeleteConfirmDialog
        open={batchDeleteDialogOpen}
        onOpenChange={setBatchDeleteDialogOpen}
        onConfirm={confirmBatchDelete}
        count={selectedAssetIds.size}
        itemName="portfolio asset"
        isDeleting={isBatchDeleting}
      />
    </div>
  );
}
