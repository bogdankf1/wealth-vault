'use client';

import React, { useState, useCallback } from 'react';
import { UserMinus, AlertCircle, Edit, Trash2, CheckCircle2, Clock, LayoutGrid, List, Grid3x3, Rows3, DollarSign } from 'lucide-react';
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
  useDeleteDebtMutation,
  useBatchDeleteDebtsMutation,
  type Debt,
} from '@/lib/api/debtsApi';
import { SortFilter, sortItems, type SortField, type SortDirection } from '@/components/ui/sort-filter';
import { useViewPreferences } from '@/lib/hooks/use-view-preferences';
import { toast } from 'sonner';

export default function DebtsPage() {
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

  const { data: debtsData, isLoading, error, refetch } = useListDebtsQuery();
  const { data: stats } = useGetDebtStatsQuery();
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
      toast.success('Debt deleted successfully');
      setDeletingDebt(null);
    } catch (error) {
      console.error('Failed to delete debt:', error);
      toast.error('Failed to delete debt');
    }
  };

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
  }, []);

  const handleAddDebt = useCallback(() => {
    setDeletingDebt(null);
    setIsFormOpen(true);
  }, []);

  // Set action buttons in layout
  React.useEffect(() => {
    setActions(
      <>
        {selectedDebtIds.size > 0 && (
          <Button
            onClick={handleBatchDelete}
            variant="destructive"
            size="default"
            className="w-full sm:w-auto"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            <span className="truncate">Delete Selected ({selectedDebtIds.size})</span>
          </Button>
        )}
        <Button onClick={handleAddDebt} size="default" className="w-full sm:w-auto">
          <DollarSign className="mr-2 h-4 w-4" />
          <span className="truncate">Add Debt</span>
        </Button>
      </>
    );

    return () => setActions(null);
  }, [selectedDebtIds.size, setActions, handleBatchDelete, handleAddDebt]);

  const confirmBatchDelete = async () => {
    if (selectedDebtIds.size === 0) return;

    try {
      const result = await batchDeleteDebts({
        ids: Array.from(selectedDebtIds),
      }).unwrap();

      if (result.failed_ids.length > 0) {
        toast.error(`Failed to delete ${result.failed_ids.length} debt(s)`);
      } else {
        toast.success(`Successfully deleted ${result.deleted_count} debt(s)`);
      }
      setBatchDeleteDialogOpen(false);
      setSelectedDebtIds(new Set());
    } catch (error) {
      console.error('Batch delete failed:', error);
      toast.error('Failed to delete debts');
    }
  };

  const debts = debtsData?.items || [];
  const hasDebts = debts.length > 0;

  // Status categories
  const statusCategories = ['Active', 'Paid', 'Overdue'];

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
      if (selectedStatus === 'Active' && (debt.is_paid || debt.is_overdue)) return false;
      if (selectedStatus === 'Paid' && !debt.is_paid) return false;
      if (selectedStatus === 'Overdue' && (!debt.is_overdue || debt.is_paid)) return false;
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
          title: 'Total Owed',
          value: (
            <CurrencyDisplay
              amount={stats.total_amount_owed}
              currency={stats.currency}
              showSymbol={true}
              showCode={false}
            />
          ),
          description: `${stats.active_debts} active ${stats.active_debts === 1 ? 'debt' : 'debts'}`,
          icon: UserMinus,
        },
        {
          title: 'Total Paid',
          value: (
            <CurrencyDisplay
              amount={stats.total_amount_paid}
              currency={stats.currency}
              showSymbol={true}
              showCode={false}
            />
          ),
          description: `${stats.paid_debts} paid ${stats.paid_debts === 1 ? 'debt' : 'debts'}`,
          icon: CheckCircle2,
        },
        {
          title: 'Overdue',
          value: stats.overdue_debts,
          description: stats.overdue_debts > 0 ? 'Require attention' : 'All on track',
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
              searchPlaceholder="Search debts..."
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
      {isLoading ? (
        <LoadingCards count={6} />
      ) : error ? (
        <ApiErrorState error={error} onRetry={refetch} />
      ) : !hasDebts ? (
        <EmptyState
          icon={UserMinus}
          title="No debts yet"
          description="Start tracking money owed to you by adding your first debt record"
          actionLabel="Add Debt"
          onAction={() => setIsFormOpen(true)}
        />
      ) : filteredDebts.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>No debts found matching your filters.</p>
          <Button
            variant="link"
            onClick={() => {
              setSearchQuery('');
              setSelectedStatus('');
            }}
            className="mt-2"
          >
            Clear Filters
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
                {selectedDebtIds.size === filteredDebts.length ? 'Deselect all' : 'Select all'}
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
                      Paid
                    </Badge>
                  ) : debt.is_overdue ? (
                    <Badge variant="destructive" className="text-xs flex-shrink-0">
                      Overdue
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs flex-shrink-0">
                      Active
                    </Badge>
                  )}
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

                  {debt.notes && (
                    <div className="min-h-[40px]">
                      <p className="text-sm text-muted-foreground line-clamp-2">{debt.notes}</p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(debt.id)}
                    >
                      <Edit className="mr-1 h-3 w-3" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteClick(debt)}
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
                  <TableHead className="w-[200px]">Debtor</TableHead>
                  <TableHead className="hidden md:table-cell">Description</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="hidden lg:table-cell text-right">Progress</TableHead>
                  <TableHead className="hidden xl:table-cell">Dates</TableHead>
                  <TableHead className="hidden 2xl:table-cell text-right">Original Total</TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                  <TableHead className="text-right w-[140px]">Actions</TableHead>
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
                      {debt.is_paid ? (
                        <Badge variant="default" className="bg-green-600 text-xs">
                          Paid
                        </Badge>
                      ) : debt.is_overdue ? (
                        <Badge variant="destructive" className="text-xs">
                          Overdue
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          Active
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
        title="Delete Debt"
        description={`Are you sure you want to delete the debt from "${deletingDebt?.debtor_name}"? This action cannot be undone.`}
        itemName="debt"
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
