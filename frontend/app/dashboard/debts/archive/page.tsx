/**
 * Debts Archive Page
 * Displays archived debts with unarchive functionality
 */
'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Archive, ArchiveRestore, Trash2, LayoutGrid, List, CheckCircle2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import {
  useListDebtsQuery,
  useUpdateDebtMutation,
  useDeleteDebtMutation,
  useBatchDeleteDebtsMutation,
} from '@/lib/api/debtsApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
import { DebtsActionsContext } from '../context';

export default function DebtsArchivePage() {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingDebtId, setDeletingDebtId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedDebtIds, setSelectedDebtIds] = useState<Set<string>>(new Set());
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);

  // Use default view preferences from user settings
  const { viewMode, setViewMode } = useViewPreferences();

  // Context to set action buttons in layout
  const { setActions } = React.useContext(DebtsActionsContext);

  // Fetch only archived debts (is_active: false)
  const {
    data: debtsData,
    isLoading: isLoadingDebts,
    error: debtsError,
  } = useListDebtsQuery({ is_active: false });

  const [updateDebt] = useUpdateDebtMutation();
  const [deleteDebt, { isLoading: isDeleting }] = useDeleteDebtMutation();
  const [batchDeleteDebts, { isLoading: isBatchDeleting }] = useBatchDeleteDebtsMutation();

  const debts = useMemo(() => debtsData?.items || [], [debtsData?.items]);

  // Status categories
  const statusCategories = ['Paid', 'Unpaid', 'Overdue'];

  // Filter and sort debts
  const filteredDebts = React.useMemo(() => {
    const filtered = filterBySearchAndCategory(
      debts,
      searchQuery,
      selectedStatus,
      (debt) => debt.debtor_name,
      (debt) => {
        if (debt.is_paid) return 'Paid';
        if (debt.is_overdue) return 'Overdue';
        return 'Unpaid';
      }
    );

    // Apply sorting
    const sorted = sortItems(
      filtered,
      sortField,
      sortDirection,
      (debt) => debt.debtor_name,
      (debt) => debt.display_amount || debt.amount,
      (debt) => debt.due_date || debt.created_at
    );

    return sorted || [];
  }, [debts, searchQuery, selectedStatus, sortField, sortDirection]);

  const handleUnarchive = async (id: string) => {
    try {
      await updateDebt({ id, data: { is_active: true } }).unwrap();
      toast.success('Debt unarchived successfully');
      setSelectedDebtIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    } catch (error) {
      console.error('Failed to unarchive debt:', error);
      toast.error('Failed to unarchive debt');
    }
  };

  const handleBatchUnarchive = useCallback(async () => {
    const idsToUnarchive = Array.from(selectedDebtIds);
    let successCount = 0;
    let failCount = 0;

    for (const id of idsToUnarchive) {
      try {
        await updateDebt({ id, data: { is_active: true } }).unwrap();
        successCount++;
      } catch (error) {
        console.error(`Failed to unarchive debt ${id}:`, error);
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(`Successfully unarchived ${successCount} debt(s)`);
    }
    if (failCount > 0) {
      toast.error(`Failed to unarchive ${failCount} debt(s)`);
    }

    setSelectedDebtIds(new Set());
  }, [selectedDebtIds, updateDebt]);

  const handleDelete = (id: string) => {
    setDeletingDebtId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingDebtId) return;

    try {
      await deleteDebt(deletingDebtId).unwrap();
      toast.success('Debt deleted permanently');
      setDeleteDialogOpen(false);
      setDeletingDebtId(null);
      setSelectedDebtIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(deletingDebtId);
        return newSet;
      });
    } catch (error) {
      console.error('Failed to delete debt:', error);
      toast.error('Failed to delete debt');
    }
  };

  const handleToggleSelect = (debtId: string) => {
    setSelectedDebtIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(debtId)) {
        newSet.delete(debtId);
      } else {
        newSet.add(debtId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedDebtIds.size === filteredDebts.length && filteredDebts.length > 0) {
      setSelectedDebtIds(new Set());
    } else {
      setSelectedDebtIds(new Set(filteredDebts.map((debt) => debt.id)));
    }
  };

  const handleBatchDelete = () => {
    setBatchDeleteDialogOpen(true);
  };

  const confirmBatchDelete = async () => {
    if (selectedDebtIds.size === 0) return;

    try {
      const result = await batchDeleteDebts({
        ids: Array.from(selectedDebtIds),
      }).unwrap();

      if (result.failed_ids.length > 0) {
        toast.error(`Failed to delete ${result.failed_ids.length} debt(s)`);
      } else {
        toast.success(`Successfully deleted ${result.deleted_count} debt(s) permanently`);
      }

      setBatchDeleteDialogOpen(false);
      setSelectedDebtIds(new Set());
    } catch (error) {
      console.error('Failed to delete debts:', error);
      toast.error('Failed to delete debts');
    }
  };

  // Set action buttons in layout
  React.useEffect(() => {
    setActions(
      <>
        {selectedDebtIds.size > 0 && (
          <>
            <Button
              onClick={handleBatchUnarchive}
              variant="outline"
              size="default"
              className="w-full sm:w-auto"
            >
              <ArchiveRestore className="mr-2 h-4 w-4" />
              <span className="truncate">Unarchive Selected ({selectedDebtIds.size})</span>
            </Button>
            <Button
              onClick={handleBatchDelete}
              variant="destructive"
              size="default"
              className="w-full sm:w-auto"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              <span className="truncate">Delete Selected ({selectedDebtIds.size})</span>
            </Button>
          </>
        )}
      </>
    );

    return () => setActions(null);
  }, [selectedDebtIds.size, setActions, handleBatchUnarchive]);

  const isLoading = isLoadingDebts;
  const hasError = debtsError;

  if (hasError) {
    return (
      <ApiErrorState
        error={debtsError}
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Search and Filters */}
      {(debts.length > 0 || searchQuery || selectedStatus) && (
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex-1">
            <SearchFilter
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedCategory={selectedStatus}
              onCategoryChange={setSelectedStatus}
              categories={statusCategories}
              searchPlaceholder="Search archived debts..."
              categoryPlaceholder="All Statuses"
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

      {/* Debts List */}
      <div>
        {isLoading ? (
          <LoadingCards count={6} />
        ) : !debts || debts.length === 0 ? (
          <EmptyState
            icon={Archive}
            title="No archived debts"
            description="Archived debts will appear here"
          />
        ) : !filteredDebts || filteredDebts.length === 0 ? (
          <EmptyState
            icon={Archive}
            title="No archived debts found"
            description="Try adjusting your search or filters"
          />
        ) : viewMode === 'card' ? (
          <>
            {filteredDebts.length > 0 && (
              <div className="flex items-center gap-2 px-1 mb-4">
                <Checkbox
                  checked={selectedDebtIds.size === filteredDebts.length}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all debts"
                />
                <span className="text-sm text-muted-foreground">
                  {selectedDebtIds.size === filteredDebts.length ? 'Deselect all' : 'Select all'}
                </span>
              </div>
            )}
            <div className="grid gap-3 md:gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredDebts.map((debt) => (
              <Card key={debt.id} className="relative opacity-75">
                <CardHeader className="pb-3 md:pb-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <Checkbox
                        checked={selectedDebtIds.has(debt.id)}
                        onCheckedChange={() => handleToggleSelect(debt.id)}
                        aria-label={`Select ${debt.debtor_name}`}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base md:text-lg truncate">{debt.debtor_name}</CardTitle>
                        <CardDescription className="mt-1 min-h-[20px] text-xs md:text-sm line-clamp-2">
                          {debt.description || ' '}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      <Badge variant="secondary" className="text-xs flex-shrink-0">
                        Archived
                      </Badge>
                      {debt.is_paid ? (
                        <Badge variant="default" className="bg-green-600 text-xs flex-shrink-0">
                          Paid
                        </Badge>
                      ) : debt.is_overdue ? (
                        <Badge variant="destructive" className="text-xs flex-shrink-0">
                          Overdue
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2 md:space-y-3">
                    {/* Total and Paid Amounts */}
                    <div className="rounded-lg border bg-muted/50 p-3">
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="text-xs text-muted-foreground">Paid</span>
                        <span className="text-2xl font-bold">
                          <CurrencyDisplay
                            amount={debt.display_amount_paid ?? debt.amount_paid}
                            currency={debt.display_currency ?? debt.currency}
                            showSymbol={true}
                            showCode={false}
                          />
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-muted-foreground">
                          of <CurrencyDisplay
                            amount={debt.display_amount ?? debt.amount}
                            currency={debt.display_currency ?? debt.currency}
                            showSymbol={true}
                            showCode={false}
                          /> total
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground min-h-[16px]">
                        {debt.display_currency && debt.display_currency !== debt.currency && (
                          <>
                            Original: <CurrencyDisplay
                              amount={debt.amount}
                              currency={debt.currency}
                              showSymbol={true}
                              showCode={false}
                            /> total
                          </>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{Math.round(debt.progress_percentage || 0)}% paid</span>
                        {debt.amount_remaining && debt.amount_remaining > 0 && (
                          <span>
                            <CurrencyDisplay
                              amount={debt.amount_remaining}
                              currency={debt.display_currency ?? debt.currency}
                              showSymbol={true}
                              showCode={false}
                            /> remaining
                          </span>
                        )}
                      </div>
                      <Progress value={debt.progress_percentage || 0} className="h-2" />
                    </div>

                    {/* Dates */}
                    {(debt.due_date || debt.paid_date) && (
                      <div className="rounded-lg bg-muted p-2 md:p-3 min-h-[48px]">
                        {debt.paid_date && (
                          <p className="text-[10px] md:text-xs text-muted-foreground flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Paid: {new Date(debt.paid_date).toLocaleDateString()}
                          </p>
                        )}
                        {debt.due_date && !debt.is_paid && (
                          <p className="text-[10px] md:text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Due: {new Date(debt.due_date).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Notes */}
                    {debt.notes && (
                      <div className="min-h-[40px]">
                        <p className="text-sm text-muted-foreground line-clamp-2">{debt.notes}</p>
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUnarchive(debt.id)}
                      >
                        <ArchiveRestore className="mr-1 h-3 w-3" />
                        Unarchive
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(debt.id)}
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
                        checked={selectedDebtIds.size === filteredDebts.length && filteredDebts.length > 0}
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead className="w-[200px]">Debtor</TableHead>
                    <TableHead className="hidden md:table-cell">Description</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="hidden lg:table-cell text-right">Progress</TableHead>
                    <TableHead className="hidden xl:table-cell">Dates</TableHead>
                    <TableHead className="hidden 2xl:table-cell text-right">Original Total</TableHead>
                    <TableHead className="hidden sm:table-cell">Status</TableHead>
                    <TableHead className="text-right w-[180px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDebts.map((debt) => (
                    <TableRow key={debt.id} className="opacity-75">
                      <TableCell>
                        <Checkbox
                          checked={selectedDebtIds.has(debt.id)}
                          onCheckedChange={() => handleToggleSelect(debt.id)}
                          aria-label={`Select ${debt.debtor_name}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="max-w-[200px]">
                          <p className="truncate">{debt.debtor_name}</p>
                          <p className="text-xs text-muted-foreground md:hidden truncate">
                            {debt.description}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <p className="max-w-[250px] truncate text-sm text-muted-foreground">
                          {debt.description || '-'}
                        </p>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        <CurrencyDisplay
                          amount={debt.display_amount_paid ?? debt.amount_paid}
                          currency={debt.display_currency ?? debt.currency}
                          showSymbol={true}
                          showCode={false}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm text-muted-foreground">
                          <CurrencyDisplay
                            amount={debt.display_amount ?? debt.amount}
                            currency={debt.display_currency ?? debt.currency}
                            showSymbol={true}
                            showCode={false}
                          />
                        </span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-sm font-semibold">{Math.round(debt.progress_percentage || 0)}%</span>
                          <Progress value={debt.progress_percentage || 0} className="h-1 w-16" />
                        </div>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                          {debt.paid_date && (
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Paid: {new Date(debt.paid_date).toLocaleDateString()}
                            </span>
                          )}
                          {debt.due_date && !debt.is_paid && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Due: {new Date(debt.due_date).toLocaleDateString()}
                            </span>
                          )}
                          {!debt.paid_date && !debt.due_date && <span>-</span>}
                        </div>
                      </TableCell>
                      <TableCell className="hidden 2xl:table-cell text-right">
                        {debt.display_currency && debt.display_currency !== debt.currency ? (
                          <span className="text-sm text-muted-foreground">
                            {debt.amount} {debt.currency}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="flex flex-col gap-1">
                          <Badge variant="secondary" className="text-xs w-fit">
                            Archived
                          </Badge>
                          {debt.is_paid ? (
                            <Badge variant="default" className="bg-green-600 text-xs w-fit">
                              Paid
                            </Badge>
                          ) : debt.is_overdue ? (
                            <Badge variant="destructive" className="text-xs w-fit">
                              Overdue
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUnarchive(debt.id)}
                            className="h-8 w-8 p-0"
                          >
                            <ArchiveRestore className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(debt.id)}
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
        title="Delete Debt Permanently"
        description="This will permanently delete this debt. This action cannot be undone."
        itemName="debt"
        isDeleting={isDeleting}
      />

      {/* Batch Delete Confirmation Dialog */}
      <BatchDeleteConfirmDialog
        open={batchDeleteDialogOpen}
        onOpenChange={setBatchDeleteDialogOpen}
        onConfirm={confirmBatchDelete}
        count={selectedDebtIds.size}
        itemName="debt"
        isDeleting={isBatchDeleting}
      />
    </div>
  );
}
