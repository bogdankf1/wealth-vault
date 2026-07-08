/**
 * Portfolio Page
 * Displays user's investment portfolio with performance tracking
 */
'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { TrendingUp, TrendingDown, Target, Edit, Trash2, Archive, LayoutGrid, List, Upload, Plus, Search, Filter, ArrowUp, ArrowDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  useListPortfolioAssetsQuery,
  useGetPortfolioStatsQuery,
  useUpdatePortfolioAssetMutation,
  useDeletePortfolioAssetMutation,
  useBatchDeleteAssetsMutation,
} from '@/lib/api/portfolioApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { SplitButton } from '@/components/ui/split-button';
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
import { PortfolioActionsContext } from '../context';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { BatchDeleteConfirmDialog } from '@/components/ui/batch-delete-confirm-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { filterBySearchAndCategory } from '@/components/ui/search-filter';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { sortItems, type SortField, type SortDirection } from '@/components/ui/sort-filter';
import { useColumnVisibility, type ColumnConfig } from '@/hooks/use-column-visibility';
import { useViewPreferences } from '@/hooks/use-view-preferences';
import { useRowSelection } from '@/hooks/use-row-selection';
import { toast } from 'sonner';

export default function PortfolioPage() {
  const router = useRouter();

  // Get context for setting actions
  const { setActions } = React.useContext(PortfolioActionsContext);

  // Translation hooks
  const tOverview = useTranslations('portfolio.overview');
  const tActions = useTranslations('portfolio.actions');
  const tCommon = useTranslations('common');
  const tAssetTypes = useTranslations('portfolio.assetTypes');
  const tStatus = useTranslations('portfolio.status');

  // Helper to translate asset type
  const translateAssetType = (assetType: string | undefined | null): string => {
    if (!assetType) return '';
    // Convert to camelCase: handle spaces and snake_case
    // "Real Estate" -> "realEstate", "mutual_funds" -> "mutualFunds"
    const key = assetType
      .split(/[\s_]+/) // Split by spaces or underscores
      .map((word, index) =>
        index === 0
          ? word.toLowerCase()
          : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      )
      .join('');
    try {
      return tAssetTypes(key as Parameters<typeof tAssetTypes>[0]);
    } catch {
      return assetType;
    }
  };

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);
  const selection = useRowSelection();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Use default view preferences from user settings
  const { viewMode, setViewMode } = useViewPreferences();

  // Column visibility configuration
  const columnConfig: ColumnConfig[] = React.useMemo(() => [
    { id: 'asset', label: tOverview('asset'), locked: true },
    { id: 'type', label: tOverview('type') },
    { id: 'currentValue', label: tOverview('currentValue') },
    { id: 'return', label: tOverview('return') },
    { id: 'quantity', label: tOverview('quantity') },
    { id: 'currentPrice', label: tOverview('currentPrice') },
    { id: 'originalValue', label: tOverview('originalValue') },
    { id: 'status', label: tCommon('common.status') },
  ], [tOverview, tCommon]);

  const { visibleColumns, toggleColumn, showAllColumns, isColumnVisible } = useColumnVisibility('portfolio', columnConfig);

  const {
    data: portfolioData,
    isLoading: isLoadingAssets,
    error: assetsError,
    refetch: refetchAssets,
  } = useListPortfolioAssetsQuery({ is_active: true });

  const {
    data: stats,
  } = useGetPortfolioStatsQuery();

  const [updateAsset] = useUpdatePortfolioAssetMutation();
  const [deleteAsset, { isLoading: isDeleting }] = useDeletePortfolioAssetMutation();
  const [batchDeleteAssets, { isLoading: isBatchDeleting }] = useBatchDeleteAssetsMutation();

  const handleAddAsset = useCallback(() => {
    setEditingAssetId(null);
    setIsFormOpen(true);
  }, []);

  const handleImportAssets = useCallback(() => {
    router.push('/dashboard/portfolio/import');
  }, [router]);

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
      selection.deselect(id);
    } catch (error) {
      toast.error(tOverview('archiveError'));
    }
  };

  const handleViewAsset = (id: string) => {
    router.push(`/dashboard/portfolio/${id}`);
  };

  const handleBatchArchive = useCallback(async () => {
    const idsToArchive = Array.from(selection.selectedIds);
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

    selection.clear();
  }, [selection, updateAsset, tOverview]);

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

  const handleBatchDelete = useCallback(() => {
    if (selection.size === 0) return;
    setBatchDeleteDialogOpen(true);
  }, [selection.size]);

  // Set action buttons in layout
  React.useEffect(() => {
    setActions(
      <>
        {selection.size > 0 && (
          <>
            {/* Archive hidden for now
            <Button
              onClick={handleBatchArchive}
              variant="outline"
              size="default"
              className="w-full sm:w-auto"
            >
              <Archive className="mr-2 h-4 w-4" />
              <span className="truncate">{tOverview('archiveSelected', { count: selectedAssetIds.size })}</span>
            </Button>
            */}
            <Button
              onClick={handleBatchDelete}
              variant="destructive"
              size="default"
              className="w-full sm:w-auto"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              <span className="truncate">{tOverview('deleteSelected', { count: selection.size })}</span>
            </Button>
          </>
        )}
        <SplitButton
          primaryLabel={tOverview('importAssets')}
          onPrimaryClick={handleImportAssets}
          primaryIcon={<Upload className="h-4 w-4" />}
          options={[
            {
              label: tOverview('addManually'),
              onClick: handleAddAsset,
              icon: <Plus className="h-4 w-4" />,
            },
          ]}
          className="w-full sm:w-auto"
        />
      </>
    );

    return () => setActions(null);
  }, [selection.size, setActions, handleBatchArchive, handleBatchDelete, handleAddAsset, handleImportAssets, tOverview]);

  const confirmBatchDelete = async () => {
    if (selection.size === 0) return;

    try {
      const result = await batchDeleteAssets({
        ids: Array.from(selection.selectedIds),
      }).unwrap();

      if (result.failed_ids.length > 0) {
        toast.error(tOverview('batchDeleteError', { count: result.failed_ids.length }));
      } else {
        toast.success(tOverview('batchDeleteSuccess', { count: result.deleted_count }));
      }
      setBatchDeleteDialogOpen(false);
      selection.clear();
    } catch (error) {
      toast.error(tOverview('batchDeleteError', { count: selection.size }));
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

  const activeFilterCount = React.useMemo(() => {
    let count = 0;
    if (selectedCategory !== null) count++;
    if (sortField !== 'name' || sortDirection !== 'asc') count++;
    return count;
  }, [selectedCategory, sortField, sortDirection]);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Search and Filters */}
      {(portfolioData?.items && portfolioData.items.length > 0) && (
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={tOverview('searchPlaceholder')}
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
              <PopoverContent className="w-64 p-0" align="end">
              {/* FILTER section */}
              <div className="p-2 space-y-1.5">
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
                      <SelectItem key={type} value={type}>{translateAssetType(type)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              {/* SORT section */}
              <div className="p-2 space-y-1.5">
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
              <div className="p-2 space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.view')}</p>
                <div className="inline-flex items-center gap-1 border rounded-md p-0.5" style={{ height: '32px' }}>
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
              {/* COLUMNS section - only when list view */}
              {viewMode === 'list' && (
                <>
                  <Separator />
                  <div className="p-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.columns')}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={showAllColumns}
                      >
                        {tCommon('common.showAll')}
                      </Button>
                    </div>
                    <div className="space-y-1">
                      {columnConfig.map((col) => (
                        <label key={col.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={isColumnVisible(col.id)}
                            onCheckedChange={() => toggleColumn(col.id)}
                            disabled={col.locked}
                          />
                          <span className={col.locked ? 'text-muted-foreground' : ''}>{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
              </PopoverContent>
            </Popover>
          </div>
          {/* Inline stats */}
          {stats && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground flex-shrink-0 max-w-xs">
              <span><span className="font-semibold text-foreground"><CurrencyDisplay amount={stats.current_value} currency={stats.currency} decimals={0} /></span> value</span>
              <span>·</span>
              <span><span className="font-semibold text-foreground"><CurrencyDisplay amount={stats.total_return} currency={stats.currency} decimals={0} /></span> return</span>
              <span>·</span>
              <span><span className="font-semibold text-foreground">{stats.total_assets}</span> assets</span>
            </div>
          )}
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
            actionLabel={tOverview('importAssets')}
            onAction={handleImportAssets}
          />
        ) : !filteredAssets || filteredAssets.length === 0 ? (
          <EmptyState
            icon={Target}
            title={tCommon('common.noResults')}
            description={tOverview('noFilterResults')}
            actionLabel={tOverview('importAssets')}
            onAction={handleImportAssets}
          />
        ) : viewMode === 'card' ? (
          <div className="space-y-3">
            {filteredAssets.length > 0 && (
              <div className="flex items-center gap-2 px-1">
                <Checkbox
                  checked={selection.size === filteredAssets.length}
                  onCheckedChange={() => selection.selectAll(filteredAssets.map(asset => asset.id))}
                  aria-label="Select all assets"
                />
                <span className="text-sm text-muted-foreground">
                  {selection.size === filteredAssets.length ? tOverview('deselectAll') : tOverview('selectAll')}
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
                <Card key={asset.id} className="relative cursor-pointer hover:border-primary/50 transition-colors" onClick={() => handleViewAsset(asset.id)}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <Checkbox
                          checked={selection.selectedIds.has(asset.id)}
                          onCheckedChange={() => selection.toggle(asset.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select ${asset.asset_name}`}
                          className="mt-1"
                        />
                        <div className="flex-1">
                        <CardTitle
                          className="text-lg cursor-pointer hover:text-primary transition-colors"
                          onClick={() => handleViewAsset(asset.id)}
                        >
                          {asset.asset_name}
                        </CardTitle>
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
                          <span className="text-lg md:text-2xl font-bold">
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
                          <span className={`text-sm font-semibold ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
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
                      <div className={`rounded-lg p-3 ${isPositive ? 'bg-green-50 dark:bg-green-950' : 'bg-red-50 dark:bg-red-950'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {isPositive ? (
                              <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                            ) : (
                              <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                            )}
                            <span className="text-xs text-muted-foreground">{tOverview('totalReturn')}</span>
                          </div>
                          <span className={`font-bold ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
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
                          <Badge variant="outline">{translateAssetType(asset.asset_type)}</Badge>
                        )}
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
                        checked={selection.size === filteredAssets.length}
                        onCheckedChange={() => selection.selectAll(filteredAssets.map(asset => asset.id))}
                        aria-label="Select all assets"
                      />
                    </TableHead>
                    {isColumnVisible('asset') && (
                      <TableHead className="w-[200px]">{tOverview('asset')}</TableHead>
                    )}
                    {isColumnVisible('type') && (
                      <TableHead className="hidden lg:table-cell">{tOverview('type')}</TableHead>
                    )}
                    {isColumnVisible('currentValue') && (
                      <TableHead className="text-right">{tOverview('currentValue')}</TableHead>
                    )}
                    {isColumnVisible('return') && (
                      <TableHead className="hidden md:table-cell text-right">{tOverview('return')}</TableHead>
                    )}
                    {isColumnVisible('quantity') && (
                      <TableHead className="hidden sm:table-cell text-right">{tOverview('quantity')}</TableHead>
                    )}
                    {isColumnVisible('currentPrice') && (
                      <TableHead className="hidden xl:table-cell text-right">{tOverview('currentPrice')}</TableHead>
                    )}
                    {isColumnVisible('originalValue') && (
                      <TableHead className="hidden 2xl:table-cell text-right">{tOverview('originalValue')}</TableHead>
                    )}
                    {isColumnVisible('status') && (
                      <TableHead className="hidden sm:table-cell">{tCommon('common.status')}</TableHead>
                    )}
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
                      <TableRow key={asset.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleViewAsset(asset.id)}>
                        <TableCell>
                          <Checkbox
                            checked={selection.selectedIds.has(asset.id)}
                            onCheckedChange={() => selection.toggle(asset.id)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Select ${asset.asset_name}`}
                          />
                        </TableCell>
                        {isColumnVisible('asset') && (
                          <TableCell className="font-medium">
                            <div className="max-w-[200px]">
                              <p
                                className="truncate cursor-pointer hover:text-primary transition-colors"
                                onClick={() => handleViewAsset(asset.id)}
                              >
                                {asset.asset_name}
                              </p>
                              {asset.symbol && (
                                <p className="text-xs text-muted-foreground font-mono truncate">
                                  {asset.symbol}
                                </p>
                              )}
                            </div>
                          </TableCell>
                        )}
                        {isColumnVisible('type') && (
                          <TableCell className="hidden lg:table-cell">
                            {asset.asset_type ? (
                              <Badge variant="outline" className="text-xs">{translateAssetType(asset.asset_type)}</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        )}
                        {isColumnVisible('currentValue') && (
                          <TableCell className="text-right font-semibold">
                            <CurrencyDisplay
                              amount={displayCurrentValue}
                              currency={displayCurrency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </TableCell>
                        )}
                        {isColumnVisible('return') && (
                          <TableCell className="hidden md:table-cell text-right">
                            <div className="flex flex-col items-end">
                              <span className={`font-semibold ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                <CurrencyDisplay
                                  amount={displayTotalReturn}
                                  currency={displayCurrency}
                                  showSymbol={true}
                                  showCode={false}
                                />
                              </span>
                              <span className={`text-xs ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {formatPercentage(returnPercentage)}
                              </span>
                            </div>
                          </TableCell>
                        )}
                        {isColumnVisible('quantity') && (
                          <TableCell className="hidden sm:table-cell text-right">
                            <span className="text-sm">
                              {parseFloat(asset.quantity.toString()).toFixed(2)}
                            </span>
                          </TableCell>
                        )}
                        {isColumnVisible('currentPrice') && (
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
                        )}
                        {isColumnVisible('originalValue') && (
                          <TableCell className="hidden 2xl:table-cell text-right">
                            {asset.display_currency && asset.display_currency !== asset.currency ? (
                              <span className="text-sm text-muted-foreground">
                                {asset.current_value || 0} {asset.currency}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        )}
                        {isColumnVisible('status') && (
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant={asset.is_active ? 'secondary' : 'outline'} className="text-xs">
                              {asset.is_active ? tStatus('active') : tStatus('inactive')}
                            </Badge>
                          </TableCell>
                        )}
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
        count={selection.size}
        itemName="asset"
        isDeleting={isBatchDeleting}
        cancelLabel={tActions('cancel')}
        deleteLabel={tActions('delete')}
      />
    </div>
  );
}
