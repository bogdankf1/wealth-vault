/**
 * Income Archive Page
 * Displays archived income sources with unarchive functionality
 */
'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Archive, ArchiveRestore, Trash2, LayoutGrid, List } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import {
  useListIncomeSourcesQuery,
  useUpdateIncomeSourceMutation,
  useDeleteIncomeSourceMutation,
  useBatchDeleteIncomeSourcesMutation,
} from '@/lib/api/incomeApi';
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
import { IncomeActionsContext } from '../context';

export default function IncomeArchivePage() {
  const tArchive = useTranslations('income.archive');
  const tActions = useTranslations('income.actions');
  const tFrequency = useTranslations('income.frequency');
  const tCommon = useTranslations('common');
  const tOverview = useTranslations('income.overview');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingSourceId, setDeletingSourceId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set());
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);

  // Use default view preferences from user settings
  const { viewMode, setViewMode } = useViewPreferences();

  // Context to set action buttons in layout
  const { setActions } = React.useContext(IncomeActionsContext);

  // Fetch only archived income sources (is_active: false)
  const {
    data: sourcesData,
    isLoading: isLoadingSources,
    error: sourcesError,
  } = useListIncomeSourcesQuery({ is_active: false });

  const [updateSource] = useUpdateIncomeSourceMutation();
  const [deleteSource, { isLoading: isDeleting }] = useDeleteIncomeSourceMutation();
  const [batchDeleteSources, { isLoading: isBatchDeleting }] = useBatchDeleteIncomeSourcesMutation();

  const sources = useMemo(() => sourcesData?.items || [], [sourcesData?.items]);

  // Get unique categories
  const uniqueCategories = React.useMemo(() => {
    const categories = sources
      .map((source) => source.category)
      .filter((cat): cat is string => !!cat);
    return Array.from(new Set(categories)).sort();
  }, [sources]);

  // Filter and sort sources
  const filteredSources = React.useMemo(() => {
    const filtered = filterBySearchAndCategory(
      sources,
      searchQuery,
      selectedCategory,
      (source) => source.name,
      (source) => source.category || undefined
    );

    // Apply sorting
    const sorted = sortItems(
      filtered,
      sortField,
      sortDirection,
      (source) => source.name,
      (source) => source.display_amount || source.amount,
      (source) => source.date || source.start_date || source.created_at
    );

    return sorted || [];
  }, [sources, searchQuery, selectedCategory, sortField, sortDirection]);

  const handleUnarchive = async (id: string) => {
    try {
      await updateSource({ id, data: { is_active: true } }).unwrap();
      toast.success(tArchive('unarchiveSuccess'));
      setSelectedSourceIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    } catch (error) {
      toast.error(tArchive('unarchiveError'));
    }
  };

  const handleBatchUnarchive = useCallback(async () => {
    const idsToUnarchive = Array.from(selectedSourceIds);
    let successCount = 0;
    let failCount = 0;

    for (const id of idsToUnarchive) {
      try {
        await updateSource({ id, data: { is_active: true } }).unwrap();
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

    setSelectedSourceIds(new Set());
  }, [selectedSourceIds, updateSource, tArchive]);

  const handleDelete = (id: string) => {
    setDeletingSourceId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingSourceId) return;

    try {
      await deleteSource(deletingSourceId).unwrap();
      toast.success(tArchive('deleteSuccess'));
      setDeleteDialogOpen(false);
      setDeletingSourceId(null);
      setSelectedSourceIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(deletingSourceId);
        return newSet;
      });
    } catch (error) {
      toast.error(tArchive('deleteError'));
    }
  };

  const handleToggleSelect = (sourceId: string) => {
    setSelectedSourceIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sourceId)) {
        newSet.delete(sourceId);
      } else {
        newSet.add(sourceId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedSourceIds.size === filteredSources.length && filteredSources.length > 0) {
      setSelectedSourceIds(new Set());
    } else {
      setSelectedSourceIds(new Set(filteredSources.map((source) => source.id)));
    }
  };

  const handleBatchDelete = React.useCallback(() => {
    setBatchDeleteDialogOpen(true);
  }, []);

  const confirmBatchDelete = async () => {
    if (selectedSourceIds.size === 0) return;

    try {
      const result = await batchDeleteSources({
        source_ids: Array.from(selectedSourceIds),
      }).unwrap();

      if (result.failed_ids.length > 0) {
        toast.error(tArchive('batchDeleteError', { count: result.failed_ids.length }));
      } else {
        toast.success(tArchive('batchDeleteSuccess', { count: result.deleted_count }));
      }

      setBatchDeleteDialogOpen(false);
      setSelectedSourceIds(new Set());
    } catch (error) {
      toast.error(tArchive('deleteError'));
    }
  };

  // Set action buttons in layout
  React.useEffect(() => {
    setActions(
      <>
        {selectedSourceIds.size > 0 && (
          <>
            <Button
              onClick={handleBatchUnarchive}
              variant="outline"
              size="default"
              className="w-full sm:w-auto"
            >
              <ArchiveRestore className="mr-2 h-4 w-4" />
              <span className="truncate">{tArchive('unarchiveSelected', { count: selectedSourceIds.size })}</span>
            </Button>
            <Button
              onClick={handleBatchDelete}
              variant="destructive"
              size="default"
              className="w-full sm:w-auto"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              <span className="truncate">{tArchive('deleteSelected', { count: selectedSourceIds.size })}</span>
            </Button>
          </>
        )}
      </>
    );

    return () => setActions(null);
  }, [selectedSourceIds.size, setActions, tArchive]);

  const isLoading = isLoadingSources;
  const hasError = sourcesError;

  if (hasError) {
    return (
      <ApiErrorState
        error={sourcesError}
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Search and Filters */}
      {(sources.length > 0 || searchQuery || selectedCategory) && (
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex-1">
            <SearchFilter
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
              categories={uniqueCategories}
              searchPlaceholder={tArchive('searchPlaceholder')}
              categoryPlaceholder={tOverview('allCategories')}
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

      {/* Income Sources List */}
      <div>
        {isLoading ? (
          <LoadingCards count={6} />
        ) : !sources || sources.length === 0 ? (
          <EmptyState
            icon={Archive}
            title={tArchive('noArchived')}
            description={tArchive('noArchivedDescription')}
          />
        ) : !filteredSources || filteredSources.length === 0 ? (
          <EmptyState
            icon={Archive}
            title={tArchive('noFound')}
            description={tArchive('noFoundDescription')}
          />
        ) : viewMode === 'card' ? (
          <>
            {filteredSources.length > 0 && (
              <div className="flex items-center gap-2 px-1 mb-4">
                <Checkbox
                  checked={selectedSourceIds.size === filteredSources.length}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all income sources"
                />
                <span className="text-sm text-muted-foreground">
                  {selectedSourceIds.size === filteredSources.length ? tArchive('deselectAll') : tArchive('selectAll')}
                </span>
              </div>
            )}
            <div className="grid gap-3 md:gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredSources.map((source) => (
              <Card key={source.id} className="relative opacity-75">
                <CardHeader className="pb-3 md:pb-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <Checkbox
                        checked={selectedSourceIds.has(source.id)}
                        onCheckedChange={() => handleToggleSelect(source.id)}
                        aria-label={`Select ${source.name}`}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base md:text-lg truncate">{source.name}</CardTitle>
                        <CardDescription className="mt-1 min-h-[20px] text-xs md:text-sm line-clamp-2">
                          {source.description || ' '}
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
                      <div className="text-xl md:text-2xl font-bold">
                        <CurrencyDisplay
                          amount={source.display_amount ?? source.amount}
                          currency={source.display_currency ?? source.currency}
                          showSymbol={true}
                          showCode={false}
                        />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {tFrequency('' + source.frequency)}
                      </p>
                      <div className="text-[10px] md:text-xs text-muted-foreground mt-1 min-h-[16px]">
                        {source.display_currency && source.display_currency !== source.currency && (
                          <>
                            Original: <CurrencyDisplay
                              amount={source.amount}
                              currency={source.currency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </>
                        )}
                      </div>
                    </div>

                    {source.frequency !== 'one_time' && (
                      <div className="rounded-lg bg-muted p-2 md:p-3 min-h-[60px] flex items-center justify-center">
                        {(source.display_monthly_equivalent ?? source.monthly_equivalent) ? (
                          <div className="text-center w-full">
                            <p className="text-[10px] md:text-xs text-muted-foreground">
                              {tOverview('monthlyEquivalent')}
                            </p>
                            <p className="text-sm font-semibold">
                              <CurrencyDisplay
                                amount={source.display_monthly_equivalent ?? source.monthly_equivalent ?? 0}
                                currency={source.display_currency ?? source.currency}
                                showSymbol={true}
                                showCode={false}
                              />
                            </p>
                          </div>
                        ) : (
                          <p className="text-[10px] md:text-xs text-muted-foreground">-</p>
                        )}
                      </div>
                    )}

                    <div className="min-h-[24px]">
                      {source.category && (
                        <Badge variant="outline" className="text-xs flex-shrink-0">{source.category}</Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUnarchive(source.id)}
                      >
                        <ArchiveRestore className="mr-1 h-3 w-3" />
                        {tArchive('unarchive')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(source.id)}
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
                        checked={selectedSourceIds.size === filteredSources.length && filteredSources.length > 0}
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead className="w-[200px]">{tArchive('name')}</TableHead>
                    <TableHead className="hidden md:table-cell">{tArchive('description')}</TableHead>
                    <TableHead className="hidden lg:table-cell">{tArchive('category')}</TableHead>
                    <TableHead className="text-right">{tArchive('amount')}</TableHead>
                    <TableHead className="hidden sm:table-cell">{tArchive('frequency')}</TableHead>
                    <TableHead className="hidden xl:table-cell text-right">{tOverview('monthlyEquivalent')}</TableHead>
                    <TableHead className="hidden 2xl:table-cell text-right">{tOverview('originalAmount')}</TableHead>
                    <TableHead className="text-right w-[180px]">{tArchive('actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSources.map((source) => (
                    <TableRow key={source.id} className="opacity-75">
                      <TableCell>
                        <Checkbox
                          checked={selectedSourceIds.has(source.id)}
                          onCheckedChange={() => handleToggleSelect(source.id)}
                          aria-label={`Select ${source.name}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="max-w-[200px]">
                          <p className="truncate">{source.name}</p>
                          <p className="text-xs text-muted-foreground md:hidden truncate">
                            {source.description}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <p className="max-w-[250px] truncate text-sm text-muted-foreground">
                          {source.description || '-'}
                        </p>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {source.category ? (
                          <Badge variant="outline" className="text-xs">{source.category}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        <CurrencyDisplay
                          amount={source.display_amount ?? source.amount}
                          currency={source.display_currency ?? source.currency}
                          showSymbol={true}
                          showCode={false}
                        />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="text-sm text-muted-foreground">
                          {tFrequency('' + source.frequency)}
                        </span>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-right">
                        {(source.display_monthly_equivalent ?? source.monthly_equivalent) ? (
                          <span className="text-sm">
                            <CurrencyDisplay
                              amount={source.display_monthly_equivalent ?? source.monthly_equivalent ?? 0}
                              currency={source.display_currency ?? source.currency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden 2xl:table-cell text-right">
                        {source.display_currency && source.display_currency !== source.currency ? (
                          <span className="text-sm text-muted-foreground">
                            {source.amount} {source.currency}
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
                            onClick={() => handleUnarchive(source.id)}
                            className="h-8 w-8 p-0"
                          >
                            <ArchiveRestore className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(source.id)}
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
        title={tArchive('deleteConfirmTitle')}
        description={tArchive('deleteConfirmDescription')}
        cancelLabel={tActions('cancel')}
        deleteLabel={tActions('delete')}
        deletingLabel={tCommon('actions.deleting')}
        isDeleting={isDeleting}
      />

      {/* Batch Delete Confirmation Dialog */}
      <BatchDeleteConfirmDialog
        open={batchDeleteDialogOpen}
        onOpenChange={setBatchDeleteDialogOpen}
        onConfirm={confirmBatchDelete}
        count={selectedSourceIds.size}
        itemName="income source"
        isDeleting={isBatchDeleting}
      />
    </div>
  );
}
