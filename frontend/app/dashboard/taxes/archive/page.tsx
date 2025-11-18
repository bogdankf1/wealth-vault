/**
 * Taxes Archive Page
 * Displays archived tax records with unarchive functionality
 */
'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Archive, ArchiveRestore, Trash2, LayoutGrid, List } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import {
  useListTaxesQuery,
  useUpdateTaxMutation,
  useDeleteTaxMutation,
  useBatchDeleteTaxRecordsMutation,
} from '@/lib/api/taxesApi';
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
import { TaxesActionsContext } from '../context';

export default function TaxesArchivePage() {
  const tArchive = useTranslations('taxes.archive');
  const tCommon = useTranslations('common');
  const tActions = useTranslations('taxes.actions');
  const tStatus = useTranslations('taxes.status');
  const tTypes = useTranslations('taxes.types');
  const tFrequencies = useTranslations('taxes.frequencies');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingTaxId, setDeletingTaxId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedTaxIds, setSelectedTaxIds] = useState<Set<string>>(new Set());
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);

  // Use default view preferences from user settings
  const { viewMode, setViewMode } = useViewPreferences();

  // Context to set action buttons in layout
  const { setActions } = React.useContext(TaxesActionsContext);

  // Fetch only archived taxes (is_active: false)
  const {
    data: taxesData,
    isLoading: isLoadingTaxes,
    error: taxesError,
  } = useListTaxesQuery({ is_active: false });

  const [updateTax] = useUpdateTaxMutation();
  const [deleteTax, { isLoading: isDeleting }] = useDeleteTaxMutation();
  const [batchDeleteTaxes, { isLoading: isBatchDeleting }] = useBatchDeleteTaxRecordsMutation();

  const taxes = useMemo(() => taxesData?.items || [], [taxesData?.items]);

  // Get unique categories (tax types)
  const uniqueCategories = React.useMemo(() => {
    const categories = taxes
      .map((tax) => tax.tax_type === 'fixed' ? tTypes('fixed') : tTypes('percentage'))
      .filter((cat): cat is string => !!cat);
    return Array.from(new Set(categories)).sort();
  }, [taxes, tTypes]);

  // Filter and sort taxes
  const filteredTaxes = React.useMemo(() => {
    const filtered = filterBySearchAndCategory(
      taxes,
      searchQuery,
      selectedCategory,
      (tax) => tax.name,
      (tax) => tax.tax_type === 'fixed' ? tTypes('fixed') : tTypes('percentage')
    );

    // Apply sorting
    const sorted = sortItems(
      filtered,
      sortField,
      sortDirection,
      (tax) => tax.name,
      (tax) => tax.calculated_amount || tax.fixed_amount || 0,
      (tax) => tax.created_at
    );

    return sorted || [];
  }, [taxes, searchQuery, selectedCategory, sortField, sortDirection, tTypes]);

  const handleUnarchive = async (id: string) => {
    try {
      await updateTax({ id, data: { is_active: true } }).unwrap();
      toast.success(tArchive('unarchiveSuccess'));
      setSelectedTaxIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    } catch (error) {
      console.error('Failed to unarchive tax record:', error);
      toast.error(tArchive('unarchiveError'));
    }
  };

  const handleBatchUnarchive = useCallback(async () => {
    const idsToUnarchive = Array.from(selectedTaxIds);
    let successCount = 0;
    let failCount = 0;

    for (const id of idsToUnarchive) {
      try {
        await updateTax({ id, data: { is_active: true } }).unwrap();
        successCount++;
      } catch (error) {
        console.error(`Failed to unarchive tax record ${id}:`, error);
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(tArchive('batchUnarchiveSuccess', { count: successCount }));
    }
    if (failCount > 0) {
      toast.error(tArchive('batchUnarchiveError', { count: failCount }));
    }

    setSelectedTaxIds(new Set());
  }, [selectedTaxIds, updateTax, tArchive]);

  const handleDelete = (id: string) => {
    setDeletingTaxId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingTaxId) return;

    try {
      await deleteTax(deletingTaxId).unwrap();
      toast.success(tArchive('deleteSuccess'));
      setDeleteDialogOpen(false);
      setDeletingTaxId(null);
      setSelectedTaxIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(deletingTaxId);
        return newSet;
      });
    } catch (error) {
      console.error('Failed to delete tax record:', error);
      toast.error(tArchive('deleteError'));
    }
  };

  const handleToggleSelect = (taxId: string) => {
    setSelectedTaxIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(taxId)) {
        newSet.delete(taxId);
      } else {
        newSet.add(taxId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedTaxIds.size === filteredTaxes.length && filteredTaxes.length > 0) {
      setSelectedTaxIds(new Set());
    } else {
      setSelectedTaxIds(new Set(filteredTaxes.map((tax) => tax.id)));
    }
  };

  const handleBatchDelete = () => {
    setBatchDeleteDialogOpen(true);
  };

  const confirmBatchDelete = async () => {
    if (selectedTaxIds.size === 0) return;

    try {
      const result = await batchDeleteTaxes({
        ids: Array.from(selectedTaxIds),
      }).unwrap();

      if (result.failed_ids.length > 0) {
        toast.error(tArchive('batchDeleteError', { count: result.failed_ids.length }));
      } else {
        toast.success(tArchive('batchDeleteSuccess', { count: result.deleted_count }));
      }

      setBatchDeleteDialogOpen(false);
      setSelectedTaxIds(new Set());
    } catch (error) {
      console.error('Failed to delete tax records:', error);
      toast.error(tArchive('batchDeleteError', { count: selectedTaxIds.size }));
    }
  };

  // Set action buttons in layout
  React.useEffect(() => {
    setActions(
      <>
        {selectedTaxIds.size > 0 && (
          <>
            <Button
              onClick={handleBatchUnarchive}
              variant="outline"
              size="default"
              className="w-full sm:w-auto"
            >
              <ArchiveRestore className="mr-2 h-4 w-4" />
              <span className="truncate">{tArchive('unarchiveSelected', { count: selectedTaxIds.size })}</span>
            </Button>
            <Button
              onClick={handleBatchDelete}
              variant="destructive"
              size="default"
              className="w-full sm:w-auto"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              <span className="truncate">{tArchive('deleteSelected', { count: selectedTaxIds.size })}</span>
            </Button>
          </>
        )}
      </>
    );

    return () => setActions(null);
  }, [selectedTaxIds.size, setActions, handleBatchUnarchive, tArchive]);

  const isLoading = isLoadingTaxes;
  const hasError = taxesError;

  if (hasError) {
    return (
      <ApiErrorState
        error={taxesError}
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Search and Filters */}
      {(taxes.length > 0 || searchQuery || selectedCategory) && (
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex-1">
            <SearchFilter
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
              categories={uniqueCategories}
              searchPlaceholder={tArchive('searchPlaceholder')}
              categoryPlaceholder={tArchive('allStatuses')}
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

      {/* Tax Records List */}
      <div>
        {isLoading ? (
          <LoadingCards count={6} />
        ) : !taxes || taxes.length === 0 ? (
          <EmptyState
            icon={Archive}
            title={tArchive('noTaxes')}
            description={tArchive('noTaxesDescription')}
          />
        ) : !filteredTaxes || filteredTaxes.length === 0 ? (
          <EmptyState
            icon={Archive}
            title={tArchive('noFilterResults')}
            description={tArchive('noFilterResultsDescription')}
          />
        ) : viewMode === 'card' ? (
          <>
            {filteredTaxes.length > 0 && (
              <div className="flex items-center gap-2 px-1 mb-4">
                <Checkbox
                  checked={selectedTaxIds.size === filteredTaxes.length}
                  onCheckedChange={handleSelectAll}
                  aria-label={tCommon('common.selectAll')}
                />
                <span className="text-sm text-muted-foreground">
                  {selectedTaxIds.size === filteredTaxes.length ? tCommon('common.deselectAll') : tCommon('common.selectAll')}
                </span>
              </div>
            )}
            <div className="grid gap-3 md:gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredTaxes.map((tax) => (
              <Card key={tax.id} className="relative opacity-75">
                <CardHeader className="pb-3 md:pb-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <Checkbox
                        checked={selectedTaxIds.has(tax.id)}
                        onCheckedChange={() => handleToggleSelect(tax.id)}
                        aria-label={`Select ${tax.name}`}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base md:text-lg truncate">{tax.name}</CardTitle>
                        <CardDescription className="mt-1 min-h-[20px] text-xs md:text-sm line-clamp-2">
                          {tax.description || ' '}
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
                      {tax.tax_type === 'fixed' && tax.fixed_amount !== undefined ? (
                        <>
                          <div className="text-xl md:text-2xl font-bold">
                            <CurrencyDisplay
                              amount={tax.display_fixed_amount ?? tax.fixed_amount}
                              currency={tax.display_currency ?? tax.currency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {tFrequencies(tax.frequency)}
                          </p>
                          <div className="text-[10px] md:text-xs text-muted-foreground mt-1 min-h-[16px]">
                            {tax.display_currency && tax.display_currency !== tax.currency && (
                              <>
                                {tCommon('common.originalAmount')}: <CurrencyDisplay
                                  amount={tax.fixed_amount}
                                  currency={tax.currency}
                                  showSymbol={true}
                                  showCode={false}
                                />
                              </>
                            )}
                          </div>
                        </>
                      ) : tax.tax_type === 'percentage' && tax.percentage !== undefined ? (
                        <>
                          <div className="text-xl md:text-2xl font-bold">
                            {tax.percentage}%
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {tFrequencies(tax.frequency)}
                          </p>
                          {tax.calculated_amount !== undefined && (
                            <div className="text-[10px] md:text-xs text-muted-foreground mt-1 min-h-[16px]">
                              {tArchive('estimated')} <CurrencyDisplay
                                amount={tax.calculated_amount}
                                currency={tax.display_currency ?? 'USD'}
                                showSymbol={true}
                                showCode={false}
                              /> {tFrequencies('monthly')}
                            </div>
                          )}
                        </>
                      ) : null}
                    </div>

                    <div className="rounded-lg bg-muted p-2 md:p-3 min-h-[60px] flex items-center justify-center">
                      {tax.notes ? (
                        <p className="text-xs text-muted-foreground line-clamp-2 w-full">{tax.notes}</p>
                      ) : (
                        <p className="text-[10px] md:text-xs text-muted-foreground">{tCommon('common.noData')}</p>
                      )}
                    </div>

                    <div className="min-h-[24px]">
                      <Badge variant="outline" className="text-xs flex-shrink-0">
                        {tax.tax_type === 'fixed' ? tTypes('fixed') : tTypes('percentage')}
                      </Badge>
                    </div>

                    <div className="flex gap-2 pt-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUnarchive(tax.id)}
                      >
                        <ArchiveRestore className="mr-1 h-3 w-3" />
                        {tActions('unarchive')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(tax.id)}
                        disabled={isDeleting}
                      >
                        <Trash2 className="mr-1 h-3 w-3" />
                        {tActions('delete')}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
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
                        checked={selectedTaxIds.size === filteredTaxes.length && filteredTaxes.length > 0}
                        onCheckedChange={handleSelectAll}
                        aria-label={tCommon('common.selectAll')}
                      />
                    </TableHead>
                    <TableHead className="w-[200px]">{tArchive('name')}</TableHead>
                    <TableHead className="hidden md:table-cell">{tArchive('description')}</TableHead>
                    <TableHead className="hidden lg:table-cell">{tArchive('type')}</TableHead>
                    <TableHead className="text-right">{tCommon('common.amount')}</TableHead>
                    <TableHead className="hidden sm:table-cell">{tArchive('frequency')}</TableHead>
                    <TableHead className="hidden xl:table-cell">Notes</TableHead>
                    <TableHead className="hidden 2xl:table-cell text-right">{tCommon('common.originalAmount')}</TableHead>
                    <TableHead className="text-right w-[180px]">{tArchive('actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTaxes.map((tax) => (
                    <TableRow key={tax.id} className="opacity-75">
                      <TableCell>
                        <Checkbox
                          checked={selectedTaxIds.has(tax.id)}
                          onCheckedChange={() => handleToggleSelect(tax.id)}
                          aria-label={`Select ${tax.name}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="max-w-[200px]">
                          <p className="truncate">{tax.name}</p>
                          <p className="text-xs text-muted-foreground md:hidden truncate">
                            {tax.description}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <p className="max-w-[250px] truncate text-sm text-muted-foreground">
                          {tax.description || '-'}
                        </p>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <Badge variant="outline" className="text-xs">
                          {tax.tax_type === 'fixed' ? tTypes('fixed') : tTypes('percentage')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {tax.tax_type === 'fixed' && tax.fixed_amount !== undefined ? (
                          <CurrencyDisplay
                            amount={tax.display_fixed_amount ?? tax.fixed_amount}
                            currency={tax.display_currency ?? tax.currency}
                            showSymbol={true}
                            showCode={false}
                          />
                        ) : tax.tax_type === 'percentage' && tax.percentage !== undefined ? (
                          <div className="flex flex-col items-end">
                            <span>{tax.percentage}%</span>
                            {tax.calculated_amount !== undefined && (
                              <span className="text-xs text-muted-foreground">
                                ~<CurrencyDisplay
                                  amount={tax.calculated_amount}
                                  currency={tax.display_currency ?? 'USD'}
                                  showSymbol={true}
                                  showCode={false}
                                />
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="text-sm text-muted-foreground">
                          {tFrequencies(tax.frequency)}
                        </span>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <p className="max-w-[200px] truncate text-sm text-muted-foreground">
                          {tax.notes || '-'}
                        </p>
                      </TableCell>
                      <TableCell className="hidden 2xl:table-cell text-right">
                        {tax.display_currency && tax.display_currency !== tax.currency && tax.tax_type === 'fixed' ? (
                          <span className="text-sm text-muted-foreground">
                            {tax.fixed_amount} {tax.currency}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end flex-wrap">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUnarchive(tax.id)}
                            className="h-8 w-8 p-0"
                            aria-label={tActions('unarchive')}
                          >
                            <ArchiveRestore className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(tax.id)}
                            disabled={isDeleting}
                            className="h-8 w-8 p-0"
                            aria-label={tActions('delete')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
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
        itemName={tArchive('tax')}
        isDeleting={isDeleting}
      />

      {/* Batch Delete Confirmation Dialog */}
      <BatchDeleteConfirmDialog
        open={batchDeleteDialogOpen}
        onOpenChange={setBatchDeleteDialogOpen}
        onConfirm={confirmBatchDelete}
        count={selectedTaxIds.size}
        itemName={tArchive('tax')}
        isDeleting={isBatchDeleting}
      />
    </div>
  );
}
