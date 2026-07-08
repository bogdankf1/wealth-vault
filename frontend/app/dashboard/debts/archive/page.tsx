/**
 * Debts Archive Page
 * Displays archived debts with unarchive functionality
 */
'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, Trash2, CheckCircle2, Clock, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
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
import { filterBySearchAndCategory } from '@/components/ui/search-filter';
import { sortItems, type SortField, type SortDirection } from '@/components/ui/sort-filter';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CurrencyDisplay } from '@/components/currency';
import { useViewPreferences } from '@/hooks/use-view-preferences';
import { ListControlsPopover } from '@/components/ui/list-controls-popover';
import { useRowSelection } from '@/hooks/use-row-selection';
import { DebtsActionsContext } from '../context';

export default function DebtsArchivePage() {
  const router = useRouter();

  // Translation hooks
  const tArchive = useTranslations('debts.archive');
  const tCommon = useTranslations('common');
  const tActions = useTranslations('debts.actions');
  const tStatus = useTranslations('debts.status');

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingDebtId, setDeletingDebtId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const selection = useRowSelection();
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
  const statusCategories = [tStatus('paid'), tStatus('unpaid'), tStatus('overdue')];

  // Filter and sort debts
  const filteredDebts = React.useMemo(() => {
    const filtered = filterBySearchAndCategory(
      debts,
      searchQuery,
      selectedStatus,
      (debt) => debt.debtor_name,
      (debt) => {
        if (debt.is_paid) return tStatus('paid');
        if (debt.is_overdue) return tStatus('overdue');
        return tStatus('unpaid');
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
  }, [debts, searchQuery, selectedStatus, sortField, sortDirection, tStatus]);

  const handleUnarchive = async (id: string) => {
    try {
      await updateDebt({ id, data: { is_active: true } }).unwrap();
      toast.success(tArchive('unarchiveSuccess'));
      selection.deselect(id);
    } catch (error) {
      toast.error(tArchive('unarchiveError'));
    }
  };

  const handleBatchUnarchive = useCallback(async () => {
    const idsToUnarchive = Array.from(selection.selectedIds);
    let successCount = 0;
    let failCount = 0;

    for (const id of idsToUnarchive) {
      try {
        await updateDebt({ id, data: { is_active: true } }).unwrap();
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

    selection.clear();
  }, [selection, updateDebt, tArchive]);

  const handleDelete = (id: string) => {
    setDeletingDebtId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingDebtId) return;

    try {
      await deleteDebt(deletingDebtId).unwrap();
      toast.success(tArchive('deleteSuccess'));
      setDeleteDialogOpen(false);
      setDeletingDebtId(null);
      selection.deselect(deletingDebtId);
    } catch (error) {
      toast.error(tArchive('deleteError'));
    }
  };

  const handleBatchDelete = () => {
    setBatchDeleteDialogOpen(true);
  };

  const confirmBatchDelete = async () => {
    if (selection.size === 0) return;

    try {
      const result = await batchDeleteDebts({
        ids: Array.from(selection.selectedIds),
      }).unwrap();

      if (result.failed_ids.length > 0) {
        toast.error(tArchive('batchDeleteError', { count: result.failed_ids.length }));
      } else {
        toast.success(tArchive('batchDeleteSuccess', { count: result.deleted_count }));
      }

      setBatchDeleteDialogOpen(false);
      selection.clear();
    } catch (error) {
      toast.error(tArchive('batchDeleteError'));
    }
  };

  // Set action buttons in layout
  React.useEffect(() => {
    setActions(
      <>
        {selection.size > 0 && (
          <>
            <Button
              onClick={handleBatchUnarchive}
              variant="outline"
              size="default"
              className="w-full sm:w-auto"
            >
              <ArchiveRestore className="mr-2 h-4 w-4" />
              <span className="truncate">{tArchive('unarchiveSelected', { count: selection.size })}</span>
            </Button>
            <Button
              onClick={handleBatchDelete}
              variant="destructive"
              size="default"
              className="w-full sm:w-auto"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              <span className="truncate">{tArchive('deleteSelected', { count: selection.size })}</span>
            </Button>
          </>
        )}
      </>
    );

    return () => setActions(null);
  }, [selection.size, setActions, handleBatchUnarchive, tArchive]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedStatus !== null) count++;
    if (sortField !== 'name' || sortDirection !== 'asc') count++;
    return count;
  }, [selectedStatus, sortField, sortDirection]);

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
        <div className="flex items-center gap-2">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder={tArchive('searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-9"
            />
          </div>

          {/* Filters Popover */}
          <ListControlsPopover
            activeFilterCount={activeFilterCount}
            filterSlot={
              <div className="p-2 space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.filter')}</p>

                {/* Status */}
                <div className="space-y-1">
                  <label className="text-sm font-medium">{tArchive('status') || tCommon('common.status')}</label>
                  <Select
                    value={selectedStatus || 'all'}
                    onValueChange={(value) => setSelectedStatus(value === 'all' ? null : value)}
                  >
                    <SelectTrigger className="h-8 w-full text-sm">
                      <SelectValue placeholder={tArchive('allStatuses')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{tArchive('allStatuses')}</SelectItem>
                      {statusCategories.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            }
            sortField={sortField}
            setSortField={setSortField}
            sortDirection={sortDirection}
            setSortDirection={setSortDirection}
            viewMode={viewMode}
            setViewMode={setViewMode}
          />
        </div>
      )}

      {/* Debts List */}
      <div>
        {isLoading ? (
          <LoadingCards count={6} />
        ) : !debts || debts.length === 0 ? (
          <EmptyState
            icon={Archive}
            title={tArchive('noDebts')}
            description={tArchive('noDebtsDescription')}
          />
        ) : !filteredDebts || filteredDebts.length === 0 ? (
          <EmptyState
            icon={Archive}
            title={tArchive('noFilterResults')}
            description={tArchive('noFilterResultsDescription')}
          />
        ) : viewMode === 'card' ? (
          <>
            {filteredDebts.length > 0 && (
              <div className="flex items-center gap-2 px-1 mb-4">
                <Checkbox
                  checked={selection.isAllSelected(filteredDebts.length)}
                  onCheckedChange={() => selection.selectAll(filteredDebts.map((debt) => debt.id))}
                  aria-label={tCommon('common.selectAll')}
                />
                <span className="text-sm text-muted-foreground">
                  {selection.isAllSelected(filteredDebts.length) ? tCommon('common.deselectAll') : tCommon('common.selectAll')}
                </span>
              </div>
            )}
            <div className="grid gap-3 md:gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredDebts.map((debt) => (
              <Card
                key={debt.id}
                className="relative opacity-75 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => router.push(`/dashboard/debts/${debt.id}`)}
              >
                <CardHeader className="pb-3 md:pb-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selection.selectedIds.has(debt.id)}
                          onCheckedChange={() => selection.toggle(debt.id)}
                          aria-label={`Select ${debt.debtor_name}`}
                          className="mt-1"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base md:text-lg truncate">{debt.debtor_name}</CardTitle>
                        <CardDescription className="mt-1 min-h-[20px] text-xs md:text-sm line-clamp-2">
                          {debt.description || ' '}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      <Badge variant="secondary" className="text-xs flex-shrink-0">
                        {tArchive('archived')}
                      </Badge>
                      {debt.is_paid ? (
                        <Badge variant="default" className="bg-green-600 text-xs flex-shrink-0">
                          {tStatus('paid')}
                        </Badge>
                      ) : debt.is_overdue ? (
                        <Badge variant="destructive" className="text-xs flex-shrink-0">
                          {tStatus('overdue')}
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
                        <span className="text-xs text-muted-foreground">{tArchive('paid')}</span>
                        <span className="text-lg md:text-2xl font-bold">
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
                          {tArchive('of')} <CurrencyDisplay
                            amount={debt.display_amount ?? debt.amount}
                            currency={debt.display_currency ?? debt.currency}
                            showSymbol={true}
                            showCode={false}
                          /> {tArchive('total')}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground min-h-[16px]">
                        {debt.display_currency && debt.display_currency !== debt.currency && (
                          <>
                            {tArchive('original')}: <CurrencyDisplay
                              amount={debt.amount}
                              currency={debt.currency}
                              showSymbol={true}
                              showCode={false}
                            /> {tArchive('total')}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{tArchive('percentPaid', { percent: Math.round(debt.progress_percentage || 0) })}</span>
                        {debt.amount_remaining && debt.amount_remaining > 0 && (
                          <span>
                            <CurrencyDisplay
                              amount={debt.amount_remaining}
                              currency={debt.display_currency ?? debt.currency}
                              showSymbol={true}
                              showCode={false}
                            /> {tArchive('remaining')}
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
                            {tArchive('paidDate', { date: new Date(debt.paid_date).toLocaleDateString() })}
                          </p>
                        )}
                        {debt.due_date && !debt.is_paid && (
                          <p className="text-[10px] md:text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {tArchive('dueDate', { date: new Date(debt.due_date).toLocaleDateString() })}
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
                        checked={selection.isAllSelected(filteredDebts.length) && filteredDebts.length > 0}
                        onCheckedChange={() => selection.selectAll(filteredDebts.map((debt) => debt.id))}
                        aria-label={tCommon('common.selectAll')}
                      />
                    </TableHead>
                    <TableHead className="w-[200px]">{tArchive('debtor')}</TableHead>
                    <TableHead className="hidden md:table-cell">{tCommon('common.description')}</TableHead>
                    <TableHead className="text-right">{tArchive('paid')}</TableHead>
                    <TableHead className="text-right">{tArchive('total')}</TableHead>
                    <TableHead className="hidden lg:table-cell text-right">{tArchive('progress')}</TableHead>
                    <TableHead className="hidden xl:table-cell">{tArchive('dates')}</TableHead>
                    <TableHead className="hidden 2xl:table-cell text-right">{tArchive('originalTotal')}</TableHead>
                    <TableHead className="hidden sm:table-cell">{tArchive('status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDebts.map((debt) => (
                    <TableRow
                      key={debt.id}
                      className="opacity-75 cursor-pointer"
                      onClick={() => router.push(`/dashboard/debts/${debt.id}`)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selection.selectedIds.has(debt.id)}
                          onCheckedChange={() => selection.toggle(debt.id)}
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
                              {tArchive('paidDate', { date: new Date(debt.paid_date).toLocaleDateString() })}
                            </span>
                          )}
                          {debt.due_date && !debt.is_paid && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {tArchive('dueDate', { date: new Date(debt.due_date).toLocaleDateString() })}
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
                            {tArchive('archived')}
                          </Badge>
                          {debt.is_paid ? (
                            <Badge variant="default" className="bg-green-600 text-xs w-fit">
                              {tStatus('paid')}
                            </Badge>
                          ) : debt.is_overdue ? (
                            <Badge variant="destructive" className="text-xs w-fit">
                              {tStatus('overdue')}
                            </Badge>
                          ) : null}
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
        title={tCommon('deleteDialog.title')}
        description={tCommon('deleteDialog.description', { item: tArchive('debt') })}
        cancelLabel={tCommon('actions.cancel')}
        deleteLabel={tCommon('actions.delete')}
        deletingLabel={tCommon('actions.deleting')}
        isDeleting={isDeleting}
      />

      {/* Batch Delete Confirmation Dialog */}
      <BatchDeleteConfirmDialog
        open={batchDeleteDialogOpen}
        onOpenChange={setBatchDeleteDialogOpen}
        onConfirm={confirmBatchDelete}
        count={selection.size}
        title={tArchive('batchDeleteTitle', { count: selection.size })}
        description={tArchive('batchDeleteDescription', { count: selection.size })}
        cancelLabel={tCommon('actions.cancel')}
        deleteLabel={tCommon('actions.delete')}
        deletingLabel={tCommon('actions.deleting')}
        isDeleting={isBatchDeleting}
      />
    </div>
  );
}
