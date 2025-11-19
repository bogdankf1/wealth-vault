'use client';

import React, { useState, useCallback } from 'react';
import { FileText, DollarSign, Percent, Edit, Trash2, Archive, LayoutGrid, List, Grid3x3, Rows3 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CurrencyDisplay } from '@/components/currency/currency-display';

import { StatsCards } from '@/components/ui/stats-cards';
import { TaxesActionsContext } from '../context';
import { SearchFilter } from '@/components/ui/search-filter';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { BatchDeleteConfirmDialog } from '@/components/ui/batch-delete-confirm-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { TaxForm } from '@/components/taxes/tax-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useListTaxesQuery,
  useGetTaxStatsQuery,
  useUpdateTaxMutation,
  useDeleteTaxMutation,
  useBatchDeleteTaxRecordsMutation,
  type Tax,
} from '@/lib/api/taxesApi';
import { SortFilter, sortItems, type SortField, type SortDirection } from '@/components/ui/sort-filter';
import { useViewPreferences } from '@/lib/hooks/use-view-preferences';
import { toast } from 'sonner';

export default function TaxesPage() {
  // Translation hooks
  const tOverview = useTranslations('taxes.overview');
  const tCommon = useTranslations('common');
  const tActions = useTranslations('taxes.actions');
  const tStatus = useTranslations('taxes.status');
  const tTypes = useTranslations('taxes.types');
  const tFrequencies = useTranslations('taxes.frequencies');

  // Get context for setting actions
  const { setActions } = React.useContext(TaxesActionsContext);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTaxId, setEditingTaxId] = useState<string | null>(null);
  const [deletingTax, setDeletingTax] = useState<Tax | null>(null);
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);
  const [selectedTaxIds, setSelectedTaxIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Use default view preferences from user settings
  const { viewMode, setViewMode, statsViewMode, setStatsViewMode } = useViewPreferences();

  const { data: taxesData, isLoading, error, refetch } = useListTaxesQuery({ is_active: true });
  const { data: stats } = useGetTaxStatsQuery();
  const [updateTax] = useUpdateTaxMutation();
  const [deleteTax] = useDeleteTaxMutation();
  const [batchDeleteTaxRecords, { isLoading: isBatchDeleting }] = useBatchDeleteTaxRecordsMutation();

  const handleEdit = (taxId: string) => {
    setEditingTaxId(taxId);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingTaxId(null);
  };

  const handleDeleteClick = (tax: Tax) => {
    setDeletingTax(tax);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingTax) return;

    try {
      await deleteTax(deletingTax.id).unwrap();
      toast.success(tOverview('deleteSuccess'));
      setDeletingTax(null);
    } catch (error) {
      toast.error(tOverview('deleteError'));
    }
  };

  const handleArchiveTax = async (id: string) => {
    try {
      await updateTax({ id, data: { is_active: false } }).unwrap();
      toast.success(tOverview('archiveSuccess'));
      setSelectedTaxIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    } catch (error) {
      toast.error(tOverview('archiveError'));
    }
  };

  const handleBatchArchive = React.useCallback(async () => {
    const idsToArchive = Array.from(selectedTaxIds);
    let successCount = 0;
    let failCount = 0;

    for (const id of idsToArchive) {
      try {
        await updateTax({ id, data: { is_active: false } }).unwrap();
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

    setSelectedTaxIds(new Set());
  }, [selectedTaxIds, updateTax, tOverview]);

  const handleToggleSelect = (taxId: string) => {
    const newSelected = new Set(selectedTaxIds);
    if (newSelected.has(taxId)) {
      newSelected.delete(taxId);
    } else {
      newSelected.add(taxId);
    }
    setSelectedTaxIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedTaxIds.size === filteredTaxes.length) {
      setSelectedTaxIds(new Set());
    } else {
      setSelectedTaxIds(new Set(filteredTaxes.map(tax => tax.id)));
    }
  };

  const handleBatchDelete = useCallback(() => {
    if (selectedTaxIds.size === 0) return;
    setBatchDeleteDialogOpen(true);
  }, [selectedTaxIds]);

  const handleAddTax = useCallback(() => {
    setDeletingTax(null);
    setIsFormOpen(true);
  }, []);

  // Set action buttons in layout
  React.useEffect(() => {
    setActions(
      <div className="flex gap-2 flex-wrap">
        {selectedTaxIds.size > 0 && (
          <>
            <Button
              onClick={handleBatchArchive}
              variant="outline"
              size="default"
              className="w-full sm:w-auto"
            >
              <Archive className="mr-2 h-4 w-4" />
              <span className="truncate">{tOverview('archiveSelected', { count: selectedTaxIds.size })}</span>
            </Button>
            <Button
              onClick={handleBatchDelete}
              variant="destructive"
              size="default"
              className="w-full sm:w-auto"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              <span className="truncate">{tOverview('deleteSelected', { count: selectedTaxIds.size })}</span>
            </Button>
          </>
        )}
        <Button onClick={handleAddTax} size="default" className="w-full sm:w-auto">
          <DollarSign className="mr-2 h-4 w-4" />
          <span className="truncate">{tOverview('addTax')}</span>
        </Button>
      </div>
    );

    return () => setActions(null);
  }, [selectedTaxIds.size, setActions, handleBatchArchive, handleBatchDelete, handleAddTax, tOverview]);

  const confirmBatchDelete = async () => {
    if (selectedTaxIds.size === 0) return;

    try {
      const result = await batchDeleteTaxRecords({
        ids: Array.from(selectedTaxIds),
      }).unwrap();

      if (result.failed_ids.length > 0) {
        toast.error(tOverview('batchDeleteError', { count: result.failed_ids.length }));
      } else {
        toast.success(tOverview('batchDeleteSuccess', { count: result.deleted_count }));
      }
      setBatchDeleteDialogOpen(false);
      setSelectedTaxIds(new Set());
    } catch (error) {
      toast.error(tOverview('batchDeleteError', { count: selectedTaxIds.size }));
    }
  };

  const taxes = taxesData?.items || [];
  const hasTaxes = taxes.length > 0;

  // Type categories
  const typeCategories = ['Fixed', 'Percentage'];

  // Filter taxes
  const searchFilteredTaxes = taxes.filter((tax) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesName = tax.name.toLowerCase().includes(query);
      const matchesDescription = tax.description?.toLowerCase().includes(query);
      if (!matchesName && !matchesDescription) return false;
    }

    // Type filter
    if (selectedType) {
      if (selectedType.toLowerCase() !== tax.tax_type) return false;
    }

    return true;
  });

  // Apply sorting (using calculated_amount for currency-aware sorting)
  const filteredTaxes = sortItems(
    searchFilteredTaxes,
    sortField,
    sortDirection,
    (tax) => tax.name,
    (tax) => tax.calculated_amount || tax.fixed_amount || 0,
    (tax) => tax.created_at
  ) || [];

  // Stats cards
  const statsCards = stats
    ? [
        {
          title: tOverview('totalTaxes'),
          value: (
            <CurrencyDisplay
              amount={stats.total_tax_amount}
              currency={stats.currency}
              showSymbol={true}
              showCode={false}
            />
          ),
          description: `${stats.active_taxes} ${stats.active_taxes === 1 ? tOverview('activeTaxSingular') : tOverview('activeTaxesPlural')}`,
          icon: FileText,
        },
        {
          title: tOverview('fixedTaxes'),
          value: (
            <CurrencyDisplay
              amount={stats.total_fixed_taxes}
              currency={stats.currency}
              showSymbol={true}
              showCode={false}
            />
          ),
          description: tOverview('monthlyFixedAmount'),
          icon: DollarSign,
        },
        {
          title: tOverview('percentageBased'),
          value: (
            <CurrencyDisplay
              amount={stats.total_percentage_taxes}
              currency={stats.currency}
              showSymbol={true}
              showCode={false}
            />
          ),
          description: tOverview('basedOnIncome'),
          icon: Percent,
        },
      ]
    : [];

  return (
    <div className="space-y-4 md:space-y-6">
      

      {/* Statistics Cards */}
      {isLoading ? (
        <LoadingCards count={3} />
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

      {/* Search and Filters */}
      {hasTaxes && (
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="flex-1">
            <SearchFilter
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedCategory={selectedType}
              onCategoryChange={(type) => setSelectedType(type || '')}
              categories={typeCategories}
              searchPlaceholder={tOverview('searchPlaceholder')}
              categoryPlaceholder={tOverview('allTypes')}
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

      {/* Taxes List */}
      {isLoading ? (
        <LoadingCards count={6} />
      ) : error ? (
        <ApiErrorState error={error} onRetry={refetch} />
      ) : !hasTaxes ? (
        <EmptyState
          icon={FileText}
          title={tOverview('noTaxes')}
          description={tOverview('noTaxesDescription')}
          actionLabel={tOverview('addTax')}
          onAction={() => setIsFormOpen(true)}
        />
      ) : filteredTaxes.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>{tOverview('noFilterResults')}</p>
          <Button
            variant="link"
            onClick={() => {
              setSearchQuery('');
              setSelectedType('');
            }}
            className="mt-2"
          >
            {tOverview('clearFilters')}
          </Button>
        </div>
      ) : viewMode === 'card' ? (
        <div className="space-y-3">
          {filteredTaxes.length > 0 && (
            <div className="flex items-center gap-2 px-1">
              <Checkbox
                checked={selectedTaxIds.size === filteredTaxes.length}
                onCheckedChange={handleSelectAll}
                aria-label="Select all taxes"
              />
              <span className="text-sm text-muted-foreground">
                {selectedTaxIds.size === filteredTaxes.length ? tCommon('common.deselectAll') : tCommon('common.selectAll')}
              </span>
            </div>
          )}
          <div className="grid gap-3 md:gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredTaxes.map((tax) => (
            <Card key={tax.id} className="relative">
              <CardHeader className="pb-3 md:pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <Checkbox
                      checked={selectedTaxIds.has(tax.id)}
                      onCheckedChange={() => handleToggleSelect(tax.id)}
                      aria-label={`Select ${tax.name}`}
                      className="mt-1"
                    />
                    <div className="flex-1">
                    <CardTitle className="text-base md:text-lg truncate">
                      {tax.name}
                    </CardTitle>
                    <CardDescription className="mt-1 min-h-[20px] text-xs md:text-sm line-clamp-2">
                      {tax.description || ' '}
                    </CardDescription>
                    </div>
                  </div>
                  {tax.is_active ? (
                    <Badge variant="default" className="bg-green-600 text-xs flex-shrink-0">
                      {tStatus('active')}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs flex-shrink-0">
                      {tStatus('inactive')}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2 md:space-y-3">
                  {/* Tax Type and Frequency Badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {tax.tax_type === 'fixed' ? (
                      <Badge variant="outline" className="text-xs">
                        <DollarSign className="h-3 w-3 mr-1" />
                        {tTypes('fixed')}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        <Percent className="h-3 w-3 mr-1" />
                        {tTypes('percentage')}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-xs capitalize">
                      {tFrequencies(tax.frequency as 'monthly' | 'quarterly' | 'annually')}
                    </Badge>
                  </div>

                  {/* Tax Amount */}
                  <div className="rounded-lg border bg-muted/50 p-3">
                    {tax.tax_type === 'fixed' && tax.fixed_amount ? (
                      <>
                        <div className="flex items-baseline justify-between mb-1">
                          <span className="text-xs text-muted-foreground">{tOverview('amount')}</span>
                          <span className="text-2xl font-bold">
                            <CurrencyDisplay
                              amount={tax.display_fixed_amount ?? tax.fixed_amount}
                              currency={tax.display_currency ?? tax.currency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </span>
                        </div>
                        {tax.display_currency && tax.display_currency !== tax.currency && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            {tCommon('common.originalAmount')}: <CurrencyDisplay
                              amount={tax.fixed_amount}
                              currency={tax.currency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </div>
                        )}
                      </>
                    ) : tax.tax_type === 'percentage' && tax.percentage ? (
                      <>
                        <div className="flex items-baseline justify-between mb-1">
                          <span className="text-xs text-muted-foreground">{tOverview('type')}</span>
                          <span className="text-2xl font-bold">{tax.percentage}%</span>
                        </div>
                        {tax.calculated_amount !== undefined && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            {tFrequencies('monthly')}: <CurrencyDisplay
                              amount={tax.calculated_amount}
                              currency={tax.display_currency ?? 'USD'}
                              showSymbol={true}
                              showCode={false}
                            />
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>

                  {tax.notes && (
                    <div className="min-h-[40px] rounded-lg bg-muted p-2 md:p-3">
                      <p className="text-sm text-muted-foreground line-clamp-2">{tax.notes}</p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(tax.id)}
                    >
                      <Edit className="mr-1 h-3 w-3" />
                      {tActions('edit')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleArchiveTax(tax.id)}
                    >
                      <Archive className="mr-1 h-3 w-3" />
                      {tActions('archive')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteClick(tax)}
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
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">
                  <Checkbox
                    checked={selectedTaxIds.size === filteredTaxes.length}
                    onCheckedChange={handleSelectAll}
                    aria-label="Select all taxes"
                  />
                </TableHead>
                <TableHead>{tOverview('name')}</TableHead>
                <TableHead className="hidden md:table-cell">{tOverview('description')}</TableHead>
                <TableHead>{tOverview('type')}</TableHead>
                <TableHead className="text-right">{tOverview('amount')}</TableHead>
                <TableHead className="hidden lg:table-cell">{tOverview('frequency')}</TableHead>
                <TableHead className="hidden xl:table-cell">{tCommon('common.description')}</TableHead>
                <TableHead className="hidden 2xl:table-cell text-right">{tCommon('common.originalAmount')}</TableHead>
                <TableHead className="hidden sm:table-cell">{tOverview('status')}</TableHead>
                <TableHead className="text-right w-[180px]">{tOverview('actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTaxes.map((tax) => (
                <TableRow key={tax.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedTaxIds.has(tax.id)}
                      onCheckedChange={() => handleToggleSelect(tax.id)}
                      aria-label={`Select ${tax.name}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{tax.name}</span>
                      <span className="text-xs text-muted-foreground md:hidden line-clamp-1">
                        {tax.description}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="text-sm line-clamp-2">{tax.description || '-'}</span>
                  </TableCell>
                  <TableCell>
                    {tax.tax_type === 'fixed' ? (
                      <Badge variant="outline" className="text-xs">
                        <DollarSign className="h-3 w-3 mr-1" />
                        {tTypes('fixed')}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        <Percent className="h-3 w-3 mr-1" />
                        {tTypes('percentage')}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {tax.tax_type === 'fixed' && tax.fixed_amount ? (
                      <div className="flex flex-col items-end">
                        <span className="font-semibold">
                          <CurrencyDisplay
                            amount={tax.display_fixed_amount ?? tax.fixed_amount}
                            currency={tax.display_currency ?? tax.currency}
                            showSymbol={true}
                            showCode={false}
                          />
                        </span>
                      </div>
                    ) : tax.tax_type === 'percentage' && tax.percentage ? (
                      <div className="flex flex-col items-end">
                        <span className="font-semibold">{tax.percentage}%</span>
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
                  <TableCell className="hidden lg:table-cell">
                    <Badge variant="secondary" className="text-xs capitalize">
                      {tFrequencies(tax.frequency as 'monthly' | 'quarterly' | 'annually')}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">
                    <span className="text-sm line-clamp-2">{tax.notes || '-'}</span>
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
                  <TableCell className="hidden sm:table-cell">
                    {tax.is_active ? (
                      <Badge variant="default" className="bg-green-600 text-xs">
                        {tStatus('active')}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        {tStatus('inactive')}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(tax.id)}
                        className="h-8 w-8 p-0"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleArchiveTax(tax.id)}
                        className="h-8 w-8 p-0"
                      >
                        <Archive className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(tax)}
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
      )}

      {/* Tax Form Dialog */}
      {isFormOpen && (
        <TaxForm
          taxId={editingTaxId}
          isOpen={isFormOpen}
          onClose={handleCloseForm}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={!!deletingTax}
        onOpenChange={(open) => !open && setDeletingTax(null)}
        onConfirm={handleDeleteConfirm}
        title={tOverview('deleteConfirmTitle')}
        description={`${deletingTax?.name}`}
        itemName={tOverview('tax')}
      />

      {/* Batch Delete Confirmation Dialog */}
      <BatchDeleteConfirmDialog
        open={batchDeleteDialogOpen}
        onOpenChange={setBatchDeleteDialogOpen}
        onConfirm={confirmBatchDelete}
        count={selectedTaxIds.size}
        itemName={tOverview('tax')}
        isDeleting={isBatchDeleting}
      />
    </div>
  );
}
