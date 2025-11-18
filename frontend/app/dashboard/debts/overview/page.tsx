'use client';

import React, { useState, useCallback } from 'react';
import { UserMinus, AlertCircle, Edit, Trash2, Archive, CheckCircle2, Clock, LayoutGrid, List, Grid3x3, Rows3, DollarSign } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CurrencyDisplay } from '@/components/currency/currency-display';

import { StatsCards } from '@/components/ui/stats-cards';
import { DebtsActionsContext } from '../context';
import { SearchFilter } from '@/components/ui/search-filter';
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
import {
  useListDebtsQuery,
  useGetDebtStatsQuery,
  useUpdateDebtMutation,
  useDeleteDebtMutation,
  useBatchDeleteDebtsMutation,
  type Debt,
} from '@/lib/api/debtsApi';
import { SortFilter, sortItems, type SortField, type SortDirection } from '@/components/ui/sort-filter';
import { useViewPreferences } from '@/lib/hooks/use-view-preferences';
import { toast } from 'sonner';

export default function DebtsPage() {
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
  const [selectedDebtIds, setSelectedDebtIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Use default view preferences from user settings
  const { viewMode, setViewMode, statsViewMode, setStatsViewMode } = useViewPreferences();

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
      console.error('Failed to delete debt:', error);
      toast.error(tOverview('deleteError'));
    }
  };

  const handleArchiveDebt = async (id: string) => {
    try {
      await updateDebt({ id, data: { is_active: false } }).unwrap();
      toast.success(tOverview('archiveSuccess'));
      setSelectedDebtIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    } catch (error) {
      console.error('Failed to archive debt:', error);
      toast.error(tOverview('archiveError'));
    }
  };

  const handleBatchArchive = React.useCallback(async () => {
    const idsToArchive = Array.from(selectedDebtIds);
    let successCount = 0;
    let failCount = 0;

    for (const id of idsToArchive) {
      try {
        await updateDebt({ id, data: { is_active: false } }).unwrap();
        successCount++;
      } catch (error) {
        console.error(`Failed to archive debt ${id}:`, error);
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(tOverview('batchArchiveSuccess', { count: successCount }));
    }
    if (failCount > 0) {
      toast.error(tOverview('batchArchiveError', { count: failCount }));
    }

    setSelectedDebtIds(new Set());
  }, [selectedDebtIds, updateDebt, tOverview]);

  const handleToggleSelect = (debtId: string) => {
    const newSelected = new Set(selectedDebtIds);
    if (newSelected.has(debtId)) {
      newSelected.delete(debtId);
    } else {
      newSelected.add(debtId);
    }
    setSelectedDebtIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedDebtIds.size === filteredDebts.length) {
      setSelectedDebtIds(new Set());
    } else {
      setSelectedDebtIds(new Set(filteredDebts.map(debt => debt.id)));
    }
  };

  const handleBatchDelete = useCallback(() => {
    if (selectedDebtIds.size === 0) return;
    setBatchDeleteDialogOpen(true);
  }, [selectedDebtIds]);

  const handleAddDebt = useCallback(() => {
    setDeletingDebt(null);
    setIsFormOpen(true);
  }, []);

  // Set action buttons in layout
  React.useEffect(() => {
    setActions(
      <>
        {selectedDebtIds.size > 0 && (
          <>
            <Button
              onClick={handleBatchArchive}
              variant="outline"
              size="default"
              className="w-full sm:w-auto"
            >
              <Archive className="mr-2 h-4 w-4" />
              <span className="truncate">{tOverview('archiveSelected', { count: selectedDebtIds.size })}</span>
            </Button>
            <Button
              onClick={handleBatchDelete}
              variant="destructive"
              size="default"
              className="w-full sm:w-auto"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              <span className="truncate">{tOverview('deleteSelected', { count: selectedDebtIds.size })}</span>
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
  }, [selectedDebtIds.size, setActions, handleBatchArchive, handleBatchDelete, handleAddDebt, tOverview]);

  const confirmBatchDelete = async () => {
    if (selectedDebtIds.size === 0) return;

    try {
      const result = await batchDeleteDebts({
        ids: Array.from(selectedDebtIds),
      }).unwrap();

      if (result.failed_ids.length > 0) {
        toast.error(tOverview('batchDeleteError', { count: result.failed_ids.length }));
      } else {
        toast.success(tOverview('batchDeleteSuccess', { count: result.deleted_count }));
      }
      setBatchDeleteDialogOpen(false);
      setSelectedDebtIds(new Set());
    } catch (error) {
      console.error('Batch delete failed:', error);
      toast.error(tOverview('batchDeleteError', { count: selectedDebtIds.size }));
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

  // Stats cards
  const statsCards = stats
    ? [
        {
          title: tOverview('totalOwed'),
          value: (
            <CurrencyDisplay
              amount={stats.total_amount_owed}
              currency={stats.currency}
              showSymbol={true}
              showCode={false}
            />
          ),
          description: `${stats.active_debts} ${stats.active_debts === 1 ? tOverview('activeDebtSingular') : tOverview('activeDebtsPlural')}`,
          icon: UserMinus,
        },
        {
          title: tOverview('totalPaid'),
          value: (
            <CurrencyDisplay
              amount={stats.total_amount_paid}
              currency={stats.currency}
              showSymbol={true}
              showCode={false}
            />
          ),
          description: `${stats.paid_debts} ${stats.paid_debts === 1 ? tOverview('paidDebtSingular') : tOverview('paidDebtsPlural')}`,
          icon: CheckCircle2,
        },
        {
          title: tOverview('overdue'),
          value: stats.overdue_debts,
          description: stats.overdue_debts > 0 ? tOverview('requireAttention') : tOverview('allOnTrack'),
          icon: AlertCircle,
          valueClassName: stats.overdue_debts > 0 ? 'text-red-600 dark:text-red-400' : undefined,
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

      {/* Search, Filters, and View Toggle */}
      {hasDebts && (
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex-1">
            <SearchFilter
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedCategory={selectedStatus}
              onCategoryChange={(status) => setSelectedStatus(status || '')}
              categories={statusCategories}
              searchPlaceholder={tOverview('searchPlaceholder')}
              categoryPlaceholder={tOverview('allStatuses')}
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
        <div className="text-center py-8 text-muted-foreground">
          <p>{tOverview('noFilterResults')}</p>
          <Button
            variant="link"
            onClick={() => {
              setSearchQuery('');
              setSelectedStatus('');
            }}
            className="mt-2"
          >
            {tOverview('clearFilters')}
          </Button>
        </div>
      ) : viewMode === 'card' ? (
        <div className="space-y-3">
          {filteredDebts.length > 0 && (
            <div className="flex items-center gap-2 px-1">
              <Checkbox
                checked={selectedDebtIds.size === filteredDebts.length}
                onCheckedChange={handleSelectAll}
                aria-label="Select all debts"
              />
              <span className="text-sm text-muted-foreground">
                {selectedDebtIds.size === filteredDebts.length ? tCommon('common.deselectAll') : tCommon('common.selectAll')}
              </span>
            </div>
          )}
          <div className="grid gap-3 md:gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredDebts.map((debt) => (
            <Card key={debt.id} className="relative">
              <CardHeader className="pb-3 md:pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <Checkbox
                      checked={selectedDebtIds.has(debt.id)}
                      onCheckedChange={() => handleToggleSelect(debt.id)}
                      aria-label={`Select ${debt.debtor_name}`}
                      className="mt-1"
                    />
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
                    <Badge variant="default" className="bg-green-600 text-xs flex-shrink-0">
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
                  <div className="space-y-2">
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

                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(debt.id)}
                    >
                      <Edit className="mr-1 h-3 w-3" />
                      {tActions('edit')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleArchiveDebt(debt.id)}
                    >
                      <Archive className="mr-1 h-3 w-3" />
                      {tActions('archive')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteClick(debt)}
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
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={selectedDebtIds.size === filteredDebts.length}
                      onCheckedChange={handleSelectAll}
                      aria-label="Select all debts"
                    />
                  </TableHead>
                  <TableHead className="w-[200px]">{tOverview('debtor')}</TableHead>
                  <TableHead className="hidden md:table-cell">{tOverview('description')}</TableHead>
                  <TableHead className="text-right">{tOverview('paid')}</TableHead>
                  <TableHead className="text-right">{tOverview('total')}</TableHead>
                  <TableHead className="hidden lg:table-cell text-right">{tOverview('progress')}</TableHead>
                  <TableHead className="hidden xl:table-cell">{tOverview('dates')}</TableHead>
                  <TableHead className="hidden 2xl:table-cell text-right">{tOverview('originalTotal')}</TableHead>
                  <TableHead className="hidden sm:table-cell">{tOverview('status')}</TableHead>
                  <TableHead className="text-right w-[180px]">{tOverview('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDebts.map((debt) => (
                  <TableRow key={debt.id}>
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
                      {debt.is_paid ? (
                        <Badge variant="default" className="bg-green-600 text-xs">
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
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(debt.id)}
                          className="h-8 w-8 p-0"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleArchiveDebt(debt.id)}
                          className="h-8 w-8 p-0"
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteClick(debt)}
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
        count={selectedDebtIds.size}
        title={tOverview('batchDeleteTitle', { count: selectedDebtIds.size })}
        description={tOverview('batchDeleteDescription', { count: selectedDebtIds.size })}
        cancelLabel={tCommon('actions.cancel')}
        deleteLabel={tCommon('actions.delete')}
        deletingLabel={tCommon('actions.deleting')}
        isDeleting={isBatchDeleting}
      />
    </div>
  );
}
