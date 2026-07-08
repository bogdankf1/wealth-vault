'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { UserMinus, Trash2, Archive, CheckCircle2, Clock, DollarSign, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CurrencyDisplay } from '@/components/currency/currency-display';

import { DebtsActionsContext } from '../context';
import { filterBySearchAndCategory } from '@/components/ui/search-filter';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { BatchDeleteConfirmDialog } from '@/components/ui/batch-delete-confirm-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { DebtForm } from '@/components/debts/debt-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useListDebtsQuery,
  useGetDebtStatsQuery,
  useUpdateDebtMutation,
  useDeleteDebtMutation,
  useBatchDeleteDebtsMutation,
  type Debt,
} from '@/lib/api/debtsApi';
import { sortItems, type SortField, type SortDirection } from '@/components/ui/sort-filter';
import { useViewPreferences } from '@/hooks/use-view-preferences';
import { useColumnVisibility, type ColumnConfig } from '@/hooks/use-column-visibility';
import { ListControlsPopover } from '@/components/ui/list-controls-popover';
import { useRowSelection } from '@/hooks/use-row-selection';
import { toast } from 'sonner';

export default function DebtsPage() {
  const router = useRouter();
  // Translation hooks
  const tOverview = useTranslations('debts.overview');
  const tCommon = useTranslations('common');
  const tActions = useTranslations('debts.actions');
  const tStatus = useTranslations('debts.status');

  // Get context for setting actions
  const { setActions } = React.useContext(DebtsActionsContext);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDebtId, setEditingDebtId] = useState<string | null>(null);
  const [deletingDebt, setDeletingDebt] = useState<Debt | null>(null);
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);
  const selection = useRowSelection();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Use default view preferences from user settings
  const { viewMode, setViewMode } = useViewPreferences();

  // Column configuration for list view
  const columnConfig: ColumnConfig[] = React.useMemo(() => [
    { id: 'debtor', label: tOverview('debtor'), locked: true },
    { id: 'description', label: tOverview('description') },
    { id: 'paid', label: tOverview('paid') },
    { id: 'total', label: tOverview('total') },
    { id: 'progress', label: tOverview('progress') },
    { id: 'dates', label: tOverview('dates') },
    { id: 'originalTotal', label: tOverview('originalTotal') },
    { id: 'status', label: tOverview('status') },
  ], [tOverview]);

  const {
    visibleColumns,
    toggleColumn,
    showAllColumns,
    isColumnVisible,
  } = useColumnVisibility('debts', columnConfig);

  const { data: debtsData, isLoading, error, refetch } = useListDebtsQuery({ is_active: true });
  const { data: stats } = useGetDebtStatsQuery();
  const [updateDebt] = useUpdateDebtMutation();
  const [deleteDebt] = useDeleteDebtMutation();
  const [batchDeleteDebts, { isLoading: isBatchDeleting }] = useBatchDeleteDebtsMutation();

  const handleEdit = (debtId: string) => {
    setEditingDebtId(debtId);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingDebtId(null);
  };

  const handleDeleteClick = (debt: Debt) => {
    setDeletingDebt(debt);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingDebt) return;

    try {
      await deleteDebt(deletingDebt.id).unwrap();
      toast.success(tOverview('deleteSuccess'));
      setDeletingDebt(null);
    } catch (error) {
      toast.error(tOverview('deleteError'));
    }
  };

  const handleArchiveDebt = async (id: string) => {
    try {
      await updateDebt({ id, data: { is_active: false } }).unwrap();
      toast.success(tOverview('archiveSuccess'));
      selection.deselect(id);
    } catch (error) {
      toast.error(tOverview('archiveError'));
    }
  };

  const handleBatchArchive = React.useCallback(async () => {
    const idsToArchive = Array.from(selection.selectedIds);
    let successCount = 0;
    let failCount = 0;

    for (const id of idsToArchive) {
      try {
        await updateDebt({ id, data: { is_active: false } }).unwrap();
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
  }, [selection, updateDebt, tOverview]);

  const handleBatchDelete = useCallback(() => {
    if (selection.size === 0) return;
    setBatchDeleteDialogOpen(true);
  }, [selection.size]);

  const handleAddDebt = useCallback(() => {
    setDeletingDebt(null);
    setIsFormOpen(true);
  }, []);

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
              <span className="truncate">{tOverview('archiveSelected', { count: selectedDebtIds.size })}</span>
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
        <Button onClick={handleAddDebt} size="default" className="w-full sm:w-auto">
          <DollarSign className="mr-2 h-4 w-4" />
          <span className="truncate">{tOverview('addDebt')}</span>
        </Button>
      </>
    );

    return () => setActions(null);
  }, [selection.size, setActions, handleBatchArchive, handleBatchDelete, handleAddDebt, tOverview]);

  const confirmBatchDelete = async () => {
    if (selection.size === 0) return;

    try {
      const result = await batchDeleteDebts({
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

  const debts = debtsData?.items || [];
  const hasDebts = debts.length > 0;

  // Status categories
  const statusCategories = [tStatus('active'), tStatus('paid'), tStatus('overdue')];

  // Filter debts
  const searchFilteredDebts = debts.filter((debt) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesName = debt.debtor_name.toLowerCase().includes(query);
      const matchesDescription = debt.description?.toLowerCase().includes(query);
      if (!matchesName && !matchesDescription) return false;
    }

    // Status filter
    if (selectedStatus) {
      if (selectedStatus === tStatus('active') && (debt.is_paid || debt.is_overdue)) return false;
      if (selectedStatus === tStatus('paid') && !debt.is_paid) return false;
      if (selectedStatus === tStatus('overdue') && (!debt.is_overdue || debt.is_paid)) return false;
    }

    return true;
  });

  // Apply sorting (using display_amount for currency-aware sorting)
  const filteredDebts = sortItems(
    searchFilteredDebts,
    sortField,
    sortDirection,
    (debt) => debt.debtor_name,
    (debt) => debt.display_amount || debt.amount,
    (debt) => debt.due_date
  ) || [];

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedStatus) count++;
    if (sortField !== 'name' || sortDirection !== 'asc') count++;
    return count;
  }, [selectedStatus, sortField, sortDirection]);

  return (
    <div className="space-y-4 md:space-y-6">

      {/* Search and Filters */}
      {hasDebts && (
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder={tOverview('searchPlaceholder')}
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
                    <label className="text-sm font-medium">{tOverview('status')}</label>
                    <Select
                      value={selectedStatus || 'all'}
                      onValueChange={(value) => setSelectedStatus(value === 'all' ? '' : value)}
                    >
                      <SelectTrigger className="h-8 w-full text-sm">
                        <SelectValue placeholder={tOverview('allStatuses')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{tOverview('allStatuses')}</SelectItem>
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
              columnControls={{ columns: columnConfig, visibleColumns, toggleColumn, showAllColumns }}
            />
          </div>

          {/* Inline stats */}
          {stats && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground flex-shrink-0 max-w-xs">
              <span><span className="font-semibold text-foreground"><CurrencyDisplay amount={stats.total_amount_owed} currency={stats.currency} decimals={0} /></span> owed</span>
              <span>·</span>
              <span><span className="font-semibold text-foreground"><CurrencyDisplay amount={stats.total_amount_paid} currency={stats.currency} decimals={0} /></span> paid</span>
              <span>·</span>
              <span><span className="font-semibold text-foreground">{stats.overdue_debts}</span> overdue</span>
            </div>
          )}
        </div>
      )}

      {/* Debts List */}
      {isLoading ? (
        <LoadingCards count={6} />
      ) : error ? (
        <ApiErrorState error={error} onRetry={refetch} />
      ) : !hasDebts ? (
        <EmptyState
          icon={UserMinus}
          title={tOverview('noDebts')}
          description={tOverview('noDebtsDescription')}
          actionLabel={tOverview('addDebt')}
          onAction={() => setIsFormOpen(true)}
        />
      ) : filteredDebts.length === 0 ? (
        <EmptyState
          icon={UserMinus}
          title={tOverview('noFilterResults')}
          description={tOverview('noDebtsDescription')}
          actionLabel={tOverview('addDebt')}
          onAction={() => setIsFormOpen(true)}
        />
      ) : viewMode === 'card' ? (
        <div className="space-y-3">
          {filteredDebts.length > 0 && (
            <div className="flex items-center gap-2 px-1">
              <Checkbox
                checked={selection.isAllSelected(filteredDebts.length)}
                onCheckedChange={() => selection.selectAll(filteredDebts.map((debt) => debt.id))}
                aria-label="Select all debts"
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
              className="relative cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => router.push(`/dashboard/debts/${debt.id}`)}
            >
              <CardHeader className="pb-3 md:pb-4">
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
                    <div className="flex-1">
                      <CardTitle className="text-base md:text-lg truncate">
                        {debt.debtor_name}
                      </CardTitle>
                    <CardDescription className="mt-1 min-h-[20px] text-xs md:text-sm line-clamp-2">
                      {debt.description || ' '}
                    </CardDescription>
                    </div>
                  </div>
                  {debt.is_paid ? (
                    <Badge variant="default" className="bg-green-600 dark:bg-green-500 text-xs flex-shrink-0">
                      {tStatus('paid')}
                    </Badge>
                  ) : debt.is_overdue ? (
                    <Badge variant="destructive" className="text-xs flex-shrink-0">
                      {tStatus('overdue')}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs flex-shrink-0">
                      {tStatus('active')}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2 md:space-y-3">
                  {/* Total and Paid Amounts */}
                  <div className="rounded-lg border bg-muted/50 p-3">
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-xs text-muted-foreground">{tOverview('paid')}</span>
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
                        {tOverview('of')} <CurrencyDisplay
                          amount={debt.display_amount ?? debt.amount}
                          currency={debt.display_currency ?? debt.currency}
                          showSymbol={true}
                          showCode={false}
                        /> {tOverview('total')}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground min-h-[16px]">
                      {debt.display_currency && debt.display_currency !== debt.currency && (
                        <>
                          {tOverview('original')}: <CurrencyDisplay
                            amount={debt.amount}
                            currency={debt.currency}
                            showSymbol={true}
                            showCode={false}
                          /> {tOverview('total')}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{tOverview('percentPaid', { percent: Math.round(debt.progress_percentage || 0) })}</span>
                      {debt.amount_remaining && debt.amount_remaining > 0 && (
                        <span>
                          <CurrencyDisplay
                            amount={debt.amount_remaining}
                            currency={debt.display_currency ?? debt.currency}
                            showSymbol={true}
                            showCode={false}
                          /> {tOverview('remaining')}
                        </span>
                      )}
                    </div>
                    <Progress value={debt.progress_percentage || 0} className="h-2" />
                  </div>

                  {(debt.due_date || debt.paid_date) && (
                    <div className="rounded-lg bg-muted p-2 md:p-3 min-h-[48px]">
                      {debt.paid_date && (
                        <p className="text-[10px] md:text-xs text-muted-foreground flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          {tOverview('paidDate', { date: new Date(debt.paid_date).toLocaleDateString() })}
                        </p>
                      )}
                      {debt.due_date && !debt.is_paid && (
                        <p className="text-[10px] md:text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {tOverview('dueDate', { date: new Date(debt.due_date).toLocaleDateString() })}
                        </p>
                      )}
                    </div>
                  )}

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
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={selection.isAllSelected(filteredDebts.length)}
                      onCheckedChange={() => selection.selectAll(filteredDebts.map((debt) => debt.id))}
                      aria-label="Select all debts"
                    />
                  </TableHead>
                  {isColumnVisible('debtor') && (
                    <TableHead className="w-[200px]">{tOverview('debtor')}</TableHead>
                  )}
                  {isColumnVisible('description') && (
                    <TableHead className="hidden md:table-cell">{tOverview('description')}</TableHead>
                  )}
                  {isColumnVisible('paid') && (
                    <TableHead className="text-right">{tOverview('paid')}</TableHead>
                  )}
                  {isColumnVisible('total') && (
                    <TableHead className="text-right">{tOverview('total')}</TableHead>
                  )}
                  {isColumnVisible('progress') && (
                    <TableHead className="hidden lg:table-cell text-right">{tOverview('progress')}</TableHead>
                  )}
                  {isColumnVisible('dates') && (
                    <TableHead className="hidden xl:table-cell">{tOverview('dates')}</TableHead>
                  )}
                  {isColumnVisible('originalTotal') && (
                    <TableHead className="hidden 2xl:table-cell text-right">{tOverview('originalTotal')}</TableHead>
                  )}
                  {isColumnVisible('status') && (
                    <TableHead className="hidden sm:table-cell">{tOverview('status')}</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDebts.map((debt) => (
                  <TableRow
                    key={debt.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/dashboard/debts/${debt.id}`)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selection.selectedIds.has(debt.id)}
                        onCheckedChange={() => selection.toggle(debt.id)}
                        aria-label={`Select ${debt.debtor_name}`}
                      />
                    </TableCell>
                    {isColumnVisible('debtor') && (
                      <TableCell className="font-medium">
                        <div className="max-w-[200px]">
                          <p className="truncate">{debt.debtor_name}</p>
                          {!isColumnVisible('description') && (
                            <p className="text-xs text-muted-foreground md:hidden truncate">
                              {debt.description}
                            </p>
                          )}
                        </div>
                      </TableCell>
                    )}
                    {isColumnVisible('description') && (
                      <TableCell className="hidden md:table-cell">
                        <p className="max-w-[250px] truncate text-sm text-muted-foreground">
                          {debt.description || '-'}
                        </p>
                      </TableCell>
                    )}
                    {isColumnVisible('paid') && (
                      <TableCell className="text-right font-semibold">
                        <CurrencyDisplay
                          amount={debt.display_amount_paid ?? debt.amount_paid}
                          currency={debt.display_currency ?? debt.currency}
                          showSymbol={true}
                          showCode={false}
                        />
                      </TableCell>
                    )}
                    {isColumnVisible('total') && (
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
                    )}
                    {isColumnVisible('progress') && (
                      <TableCell className="hidden lg:table-cell text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-sm font-semibold">{Math.round(debt.progress_percentage || 0)}%</span>
                          <Progress value={debt.progress_percentage || 0} className="h-1 w-16" />
                        </div>
                      </TableCell>
                    )}
                    {isColumnVisible('dates') && (
                      <TableCell className="hidden xl:table-cell">
                        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                          {debt.paid_date && (
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              {tOverview('paidDate', { date: new Date(debt.paid_date).toLocaleDateString() })}
                            </span>
                          )}
                          {debt.due_date && !debt.is_paid && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {tOverview('dueDate', { date: new Date(debt.due_date).toLocaleDateString() })}
                            </span>
                          )}
                          {!debt.paid_date && !debt.due_date && <span>-</span>}
                        </div>
                      </TableCell>
                    )}
                    {isColumnVisible('originalTotal') && (
                      <TableCell className="hidden 2xl:table-cell text-right">
                        {debt.display_currency && debt.display_currency !== debt.currency ? (
                          <span className="text-sm text-muted-foreground">
                            {debt.amount} {debt.currency}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    )}
                    {isColumnVisible('status') && (
                      <TableCell className="hidden sm:table-cell">
                        {debt.is_paid ? (
                          <Badge variant="default" className="bg-green-600 dark:bg-green-500 text-xs">
                            {tStatus('paid')}
                          </Badge>
                        ) : debt.is_overdue ? (
                          <Badge variant="destructive" className="text-xs">
                            {tStatus('overdue')}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            {tStatus('active')}
                          </Badge>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Debt Form Dialog */}
      {isFormOpen && (
        <DebtForm
          debtId={editingDebtId}
          isOpen={isFormOpen}
          onClose={handleCloseForm}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={!!deletingDebt}
        onOpenChange={(open) => !open && setDeletingDebt(null)}
        onConfirm={handleDeleteConfirm}
        title={tCommon('deleteDialog.title')}
        description={tCommon('deleteDialog.description', { item: tOverview('debt') })}
        cancelLabel={tCommon('actions.cancel')}
        deleteLabel={tCommon('actions.delete')}
        deletingLabel={tCommon('actions.deleting')}
      />

      {/* Batch Delete Confirmation Dialog */}
      <BatchDeleteConfirmDialog
        open={batchDeleteDialogOpen}
        onOpenChange={setBatchDeleteDialogOpen}
        onConfirm={confirmBatchDelete}
        count={selection.size}
        title={tOverview('batchDeleteTitle', { count: selection.size })}
        description={tOverview('batchDeleteDescription', { count: selection.size })}
        cancelLabel={tCommon('actions.cancel')}
        deleteLabel={tCommon('actions.delete')}
        deletingLabel={tCommon('actions.deleting')}
        isDeleting={isBatchDeleting}
      />
    </div>
  );
}
