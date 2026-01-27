/**
 * Portfolio Archive Page
 * Displays archived portfolio assets with unarchive functionality
 */
'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Archive, ArchiveRestore, Trash2, LayoutGrid, List, Search, Filter, ArrowUp, ArrowDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
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
import { Input } from '@/components/ui/input';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
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
import { filterBySearchAndCategory } from '@/components/ui/search-filter';
import { sortItems, type SortField, type SortDirection } from '@/components/ui/sort-filter';
import { CurrencyDisplay } from '@/components/currency';
import { useViewPreferences } from '@/lib/hooks/use-view-preferences';
import { PortfolioActionsContext } from '../context';

export default function PortfolioArchivePage() {
  const router = useRouter();

  // Translation hooks
  const tArchive = useTranslations('portfolio.archive');
  const tOverview = useTranslations('portfolio.overview');
  const tActions = useTranslations('portfolio.actions');
  const tCommon = useTranslations('common');
  const tAssetTypes = useTranslations('portfolio.assetTypes');

  const ASSET_TYPE_LABELS: Record<string, string> = {
    stocks: tAssetTypes('stocks'),
    bonds: tAssetTypes('bonds'),
    etfs: tAssetTypes('etfs'),
    crypto: tAssetTypes('crypto'),
    realEstate: tAssetTypes('realEstate'),
    commodities: tAssetTypes('commodities'),
    mutualFunds: tAssetTypes('mutualFunds'),
    other: tAssetTypes('other'),
  };
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
      toast.success(tArchive('unarchiveSuccess'));
      setSelectedAssetIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    } catch (error) {
      toast.error(tArchive('unarchiveError'));
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
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(tArchive('batchUnarchiveSuccess', { count: successCount }));
    }
    if (failCount > 0) {
      toast.error(tArchive('batchUnarchiveError', { count: failCount }));
    }

    setSelectedAssetIds(new Set());
  }, [selectedAssetIds, updateAsset, tArchive]);

  const handleDelete = (id: string) => {
    setDeletingAssetId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingAssetId) return;

    try {
      await deleteAsset(deletingAssetId).unwrap();
      toast.success(tOverview('deleteSuccess'));
      setDeleteDialogOpen(false);
      setDeletingAssetId(null);
      setSelectedAssetIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(deletingAssetId);
        return newSet;
      });
    } catch (error) {
      toast.error(tOverview('deleteError'));
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
              <span className="truncate">{tArchive('unarchiveSelected', { count: selectedAssetIds.size })}</span>
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
      </>
    );

    return () => setActions(null);
  }, [selectedAssetIds.size, setActions, handleBatchUnarchive, tArchive, tOverview]);

  const activeFilterCount = React.useMemo(() => {
    let count = 0;
    if (selectedCategory !== null) count++;
    if (sortField !== 'name' || sortDirection !== 'asc') count++;
    return count;
  }, [selectedCategory, sortField, sortDirection]);

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
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={tArchive('searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
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
            <PopoverContent className="w-72 p-0" align="end">
              {/* FILTER section */}
              <div className="p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.filter')}</p>
                <Select
                  value={selectedCategory ?? '__all__'}
                  onValueChange={(val) => setSelectedCategory(val === '__all__' ? null : val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={tOverview('allAssetTypes')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">{tOverview('allAssetTypes')}</SelectItem>
                    {uniqueAssetTypes.map((type) => (
                      <SelectItem key={type} value={type}>{ASSET_TYPE_LABELS[type] || type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              {/* SORT section */}
              <div className="p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.sort')}</p>
                <div className="flex items-center gap-2">
                  <Select
                    value={sortField}
                    onValueChange={(val) => setSortField(val as SortField)}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">{tOverview('asset')}</SelectItem>
                      <SelectItem value="amount">{tOverview('currentValue')}</SelectItem>
                      <SelectItem value="date">{tCommon('common.date')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
                  >
                    {sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <Separator />
              {/* VIEW section */}
              <div className="p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.view')}</p>
                <div className="inline-flex items-center gap-1 border rounded-md p-0.5" style={{ height: '36px' }}>
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
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Portfolio Assets List */}
      <div>
        {isLoading ? (
          <LoadingCards count={6} />
        ) : !assets || assets.length === 0 ? (
          <EmptyState
            icon={Archive}
            title={tArchive('noAccounts')}
            description={tArchive('noAccountsDescription')}
          />
        ) : !filteredAssets || filteredAssets.length === 0 ? (
          <EmptyState
            icon={Archive}
            title={tCommon('noResults')}
            description={tOverview('noFilterResults')}
          />
        ) : viewMode === 'card' ? (
          <>
            {filteredAssets.length > 0 && (
              <div className="flex items-center gap-2 px-1 mb-4">
                <Checkbox
                  checked={selectedAssetIds.size === filteredAssets.length}
                  onCheckedChange={handleSelectAll}
                  aria-label={tCommon('common.selectAll')}
                />
                <span className="text-sm text-muted-foreground">
                  {selectedAssetIds.size === filteredAssets.length ? tCommon('common.deselectAll') : tCommon('common.selectAll')}
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
                <Card key={asset.id} className="relative opacity-75 cursor-pointer hover:border-primary/50 transition-colors" onClick={() => router.push(`/dashboard/portfolio/${asset.id}`)}>
                  <CardHeader className="pb-3 md:pb-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <Checkbox
                          checked={selectedAssetIds.has(asset.id)}
                          onCheckedChange={() => handleToggleSelect(asset.id)}
                          onClick={(e) => e.stopPropagation()}
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
                        {tArchive('archived')}
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
                          {tOverview('currentValue')}
                        </p>
                        <div className="text-[10px] md:text-xs text-muted-foreground mt-1 min-h-[16px]">
                          {asset.display_currency && asset.display_currency !== asset.currency && (
                            <>
                              {tOverview('original')} <CurrencyDisplay
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
                            {tOverview('return')}
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
                          <span className="text-muted-foreground">{tOverview('quantity')}:</span>
                          <span className="font-semibold">{parseFloat(asset.quantity.toString()).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs md:text-sm">
                          <span className="text-muted-foreground">{tCommon('common.purchasePrice')}:</span>
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
                          <span className="text-muted-foreground">{tOverview('currentPrice')}:</span>
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
                    <TableHead className="w-[200px]">{tOverview('asset')}</TableHead>
                    <TableHead className="hidden md:table-cell">{tOverview('symbol')}</TableHead>
                    <TableHead className="hidden lg:table-cell">{tOverview('type')}</TableHead>
                    <TableHead className="text-right">{tOverview('currentValue')}</TableHead>
                    <TableHead className="hidden sm:table-cell text-right">{tOverview('return')}</TableHead>
                    <TableHead className="hidden xl:table-cell text-right">{tOverview('quantity')}</TableHead>
                    <TableHead className="hidden xl:table-cell text-right">{tOverview('currentPrice')}</TableHead>
                    <TableHead className="hidden 2xl:table-cell text-right">{tOverview('originalValue')}</TableHead>
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
                      <TableRow key={asset.id} className="opacity-75 cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/dashboard/portfolio/${asset.id}`)}>
                        <TableCell>
                          <Checkbox
                            checked={selectedAssetIds.has(asset.id)}
                            onCheckedChange={() => handleToggleSelect(asset.id)}
                            onClick={(e) => e.stopPropagation()}
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
        itemName="portfolio asset"
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
        itemName="portfolio asset"
        isDeleting={isBatchDeleting}
        cancelLabel={tActions('cancel')}
        deleteLabel={tActions('delete')}
      />
    </div>
  );
}
