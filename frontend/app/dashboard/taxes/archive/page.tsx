/**
 * Taxes Archive Page
 * Displays archived tax records with unarchive functionality
 */
'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Archive, ArchiveRestore, Trash2, LayoutGrid, List } from 'lucide-react';
import { toast } from 'sonner';
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

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annually: 'Annually',
};

export default function TaxesArchivePage() {
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
      .map((tax) => tax.tax_type === 'fixed' ? 'Fixed' : 'Percentage')
      .filter((cat): cat is "Fixed" | "Percentage" => !!cat);
    return Array.from(new Set(categories)).sort();
  }, [taxes]);

  // Filter and sort taxes
  const filteredTaxes = React.useMemo(() => {
    const filtered = filterBySearchAndCategory(
      taxes,
      searchQuery,
      selectedCategory,
      (tax) => tax.name,
      (tax) => tax.tax_type === 'fixed' ? 'Fixed' : 'Percentage'
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
  }, [taxes, searchQuery, selectedCategory, sortField, sortDirection]);

  const handleUnarchive = async (id: string) => {
    try {
      await updateTax({ id, data: { is_active: true } }).unwrap();
      toast.success('Tax record unarchived successfully');
      setSelectedTaxIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    } catch (error) {
      console.error('Failed to unarchive tax record:', error);
      toast.error('Failed to unarchive tax record');
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
      toast.success(`Successfully unarchived ${successCount} tax record(s)`);
    }
    if (failCount > 0) {
      toast.error(`Failed to unarchive ${failCount} tax record(s)`);
    }

    setSelectedTaxIds(new Set());
  }, [selectedTaxIds, updateTax]);

  const handleDelete = (id: string) => {
    setDeletingTaxId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingTaxId) return;

    try {
      await deleteTax(deletingTaxId).unwrap();
      toast.success('Tax record deleted permanently');
      setDeleteDialogOpen(false);
      setDeletingTaxId(null);
      setSelectedTaxIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(deletingTaxId);
        return newSet;
      });
    } catch (error) {
      console.error('Failed to delete tax record:', error);
      toast.error('Failed to delete tax record');
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
        toast.error(`Failed to delete ${result.failed_ids.length} tax record(s)`);
      } else {
        toast.success(`Successfully deleted ${result.deleted_count} tax record(s) permanently`);
      }

      setBatchDeleteDialogOpen(false);
      setSelectedTaxIds(new Set());
    } catch (error) {
      console.error('Failed to delete tax records:', error);
      toast.error('Failed to delete tax records');
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
              <span className="truncate">Unarchive Selected ({selectedTaxIds.size})</span>
            </Button>
            <Button
              onClick={handleBatchDelete}
              variant="destructive"
              size="default"
              className="w-full sm:w-auto"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              <span className="truncate">Delete Selected ({selectedTaxIds.size})</span>
            </Button>
          </>
        )}
      </>
    );

    return () => setActions(null);
  }, [selectedTaxIds.size, setActions, handleBatchUnarchive]);

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
              searchPlaceholder="Search archived tax records..."
              categoryPlaceholder="All Types"
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

      {/* Tax Records List */}
      <div>
        {isLoading ? (
          <LoadingCards count={6} />
        ) : !taxes || taxes.length === 0 ? (
          <EmptyState
            icon={Archive}
            title="No archived tax records"
            description="Archived tax records will appear here"
          />
        ) : !filteredTaxes || filteredTaxes.length === 0 ? (
          <EmptyState
            icon={Archive}
            title="No archived tax records found"
            description="Try adjusting your search or filters"
          />
        ) : viewMode === 'card' ? (
          <>
            {filteredTaxes.length > 0 && (
              <div className="flex items-center gap-2 px-1 mb-4">
                <Checkbox
                  checked={selectedTaxIds.size === filteredTaxes.length}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all tax records"
                />
                <span className="text-sm text-muted-foreground">
                  {selectedTaxIds.size === filteredTaxes.length ? 'Deselect all' : 'Select all'}
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
                      Archived
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
                            {FREQUENCY_LABELS[tax.frequency] || tax.frequency}
                          </p>
                          <div className="text-[10px] md:text-xs text-muted-foreground mt-1 min-h-[16px]">
                            {tax.display_currency && tax.display_currency !== tax.currency && (
                              <>
                                Original: <CurrencyDisplay
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
                            {FREQUENCY_LABELS[tax.frequency] || tax.frequency}
                          </p>
                          {tax.calculated_amount !== undefined && (
                            <div className="text-[10px] md:text-xs text-muted-foreground mt-1 min-h-[16px]">
                              Estimated: <CurrencyDisplay
                                amount={tax.calculated_amount}
                                currency={tax.display_currency ?? 'USD'}
                                showSymbol={true}
                                showCode={false}
                              /> monthly
                            </div>
                          )}
                        </>
                      ) : null}
                    </div>

                    <div className="rounded-lg bg-muted p-2 md:p-3 min-h-[60px] flex items-center justify-center">
                      {tax.notes ? (
                        <p className="text-xs text-muted-foreground line-clamp-2 w-full">{tax.notes}</p>
                      ) : (
                        <p className="text-[10px] md:text-xs text-muted-foreground">No notes</p>
                      )}
                    </div>

                    <div className="min-h-[24px]">
                      <Badge variant="outline" className="text-xs flex-shrink-0">
                        {tax.tax_type === 'fixed' ? 'Fixed Amount' : 'Percentage-Based'}
                      </Badge>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUnarchive(tax.id)}
                      >
                        <ArchiveRestore className="mr-1 h-3 w-3" />
                        Unarchive
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(tax.id)}
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
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead className="w-[200px]">Name</TableHead>
                    <TableHead className="hidden md:table-cell">Description</TableHead>
                    <TableHead className="hidden lg:table-cell">Type</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="hidden sm:table-cell">Frequency</TableHead>
                    <TableHead className="hidden xl:table-cell">Notes</TableHead>
                    <TableHead className="hidden 2xl:table-cell text-right">Original Amount</TableHead>
                    <TableHead className="text-right w-[180px]">Actions</TableHead>
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
                          {tax.tax_type === 'fixed' ? 'Fixed' : 'Percentage'}
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
                          {FREQUENCY_LABELS[tax.frequency] || tax.frequency}
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
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUnarchive(tax.id)}
                            className="h-8 w-8 p-0"
                          >
                            <ArchiveRestore className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(tax.id)}
                            disabled={isDeleting}
                            className="h-8 w-8 p-0"
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
        title="Delete Tax Record Permanently"
        description="This will permanently delete this tax record. This action cannot be undone."
        itemName="tax record"
        isDeleting={isDeleting}
      />

      {/* Batch Delete Confirmation Dialog */}
      <BatchDeleteConfirmDialog
        open={batchDeleteDialogOpen}
        onOpenChange={setBatchDeleteDialogOpen}
        onConfirm={confirmBatchDelete}
        count={selectedTaxIds.size}
        itemName="tax record"
        isDeleting={isBatchDeleting}
      />
    </div>
  );
}
