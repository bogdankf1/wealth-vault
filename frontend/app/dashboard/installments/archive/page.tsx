/**
 * Installment Archive Page
 * Displays archived installments with unarchive functionality
 */
'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Archive, ArchiveRestore, Trash2, LayoutGrid, List } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import {
  useListInstallmentsQuery,
  useUpdateInstallmentMutation,
  useDeleteInstallmentMutation,
  useBatchDeleteInstallmentsMutation,
} from '@/lib/api/installmentsApi';
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
import { InstallmentsActionsContext } from '../context';
import { Progress } from '@/components/ui/progress';
import {
  calculateNextPaymentDate,
  getPaymentUrgency,
  formatPaymentDate,
  getPaymentMessage,
  calculatePercentPaid,
} from '@/lib/utils/installment-payment';

export default function InstallmentsArchivePage() {
  // Translation hooks
  const tArchive = useTranslations('installments.archive');
  const tCommon = useTranslations('common');
  const tFrequencies = useTranslations('installments.frequencies');
  const tOverview = useTranslations('installments.overview');
  const tActions = useTranslations('installments.actions');
  const tPayment = useTranslations('installments.payment');

  const FREQUENCY_LABELS: Record<string, string> = {
    weekly: tFrequencies('weekly'),
    biweekly: tFrequencies('biweekly'),
    monthly: tFrequencies('monthly'),
  };

  // Helper function to get translated payment message
  const getTranslatedPaymentMessage = (daysUntilPayment: number, isPaidOff: boolean): string => {
    if (isPaidOff) return tPayment('paidOff');
    if (daysUntilPayment < 0) return tPayment('noUpcomingPayment');
    if (daysUntilPayment === 0) return tPayment('dueToday');
    if (daysUntilPayment === 1) return tPayment('dueIn1Day', { days: 1 });
    return tPayment('dueInDays', { days: daysUntilPayment });
  };

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingInstallmentId, setDeletingInstallmentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedInstallmentIds, setSelectedInstallmentIds] = useState<Set<string>>(new Set());
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);

  // Use default view preferences from user settings
  const { viewMode, setViewMode } = useViewPreferences();

  // Context to set action buttons in layout
  const { setActions } = React.useContext(InstallmentsActionsContext);

  // Fetch only archived installments (is_active: false)
  const {
    data: installmentsData,
    isLoading: isLoadingInstallments,
    error: installmentsError,
  } = useListInstallmentsQuery({ is_active: false });

  const [updateInstallment] = useUpdateInstallmentMutation();
  const [deleteInstallment, { isLoading: isDeleting }] = useDeleteInstallmentMutation();
  const [batchDeleteInstallments, { isLoading: isBatchDeleting }] = useBatchDeleteInstallmentsMutation();

  const installments = useMemo(() => installmentsData?.items || [], [installmentsData?.items]);

  // Get unique categories
  const uniqueCategories = React.useMemo(() => {
    const categories = installments
      .map((installment) => installment.category)
      .filter((cat): cat is string => !!cat);
    return Array.from(new Set(categories)).sort();
  }, [installments]);

  // Filter and sort installments
  const filteredInstallments = React.useMemo(() => {
    const filtered = filterBySearchAndCategory(
      installments,
      searchQuery,
      selectedCategory,
      (installment) => installment.name,
      (installment) => installment.category || undefined
    );

    // Apply sorting
    const sorted = sortItems(
      filtered,
      sortField,
      sortDirection,
      (installment) => installment.name,
      (installment) => installment.display_total_amount || installment.total_amount,
      (installment) => installment.start_date || installment.created_at
    );

    return sorted || [];
  }, [installments, searchQuery, selectedCategory, sortField, sortDirection]);

  const handleUnarchive = async (id: string) => {
    try {
      await updateInstallment({ id, data: { is_active: true } }).unwrap();
      toast.success(tArchive('unarchiveSuccess'));
      setSelectedInstallmentIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    } catch (error) {
      console.error('Failed to unarchive installment:', error);
      toast.error(tArchive('unarchiveError'));
    }
  };

  const handleBatchUnarchive = useCallback(async () => {
    const idsToUnarchive = Array.from(selectedInstallmentIds);
    let successCount = 0;
    let failCount = 0;

    for (const id of idsToUnarchive) {
      try {
        await updateInstallment({ id, data: { is_active: true } }).unwrap();
        successCount++;
      } catch (error) {
        console.error(`Failed to unarchive installment ${id}:`, error);
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(tArchive('batchUnarchiveSuccess', { count: successCount }));
    }
    if (failCount > 0) {
      toast.error(tArchive('batchUnarchiveError', { count: failCount }));
    }

    setSelectedInstallmentIds(new Set());
  }, [selectedInstallmentIds, updateInstallment, tArchive]);

  const handleDelete = (id: string) => {
    setDeletingInstallmentId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingInstallmentId) return;

    try {
      await deleteInstallment(deletingInstallmentId).unwrap();
      toast.success(tArchive('deleteSuccess'));
      setDeleteDialogOpen(false);
      setDeletingInstallmentId(null);
      setSelectedInstallmentIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(deletingInstallmentId);
        return newSet;
      });
    } catch (error) {
      console.error('Failed to delete installment:', error);
      toast.error(tArchive('deleteError'));
    }
  };

  const handleToggleSelect = (installmentId: string) => {
    setSelectedInstallmentIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(installmentId)) {
        newSet.delete(installmentId);
      } else {
        newSet.add(installmentId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedInstallmentIds.size === filteredInstallments.length && filteredInstallments.length > 0) {
      setSelectedInstallmentIds(new Set());
    } else {
      setSelectedInstallmentIds(new Set(filteredInstallments.map((installment) => installment.id)));
    }
  };

  const handleBatchDelete = () => {
    setBatchDeleteDialogOpen(true);
  };

  const confirmBatchDelete = async () => {
    if (selectedInstallmentIds.size === 0) return;

    try {
      const result = await batchDeleteInstallments({
        ids: Array.from(selectedInstallmentIds),
      }).unwrap();

      if (result.failed_ids.length > 0) {
        toast.error(tArchive('batchDeleteError', { count: result.failed_ids.length }));
      } else {
        toast.success(tArchive('batchDeleteSuccess', { count: result.deleted_count }));
      }

      setBatchDeleteDialogOpen(false);
      setSelectedInstallmentIds(new Set());
    } catch (error) {
      console.error('Failed to delete installments:', error);
      toast.error(tArchive('batchDeleteError'));
    }
  };

  // Set action buttons in layout
  React.useEffect(() => {
    setActions(
      <>
        {selectedInstallmentIds.size > 0 && (
          <>
            <Button
              onClick={handleBatchUnarchive}
              variant="outline"
              size="default"
              className="w-full sm:w-auto"
            >
              <ArchiveRestore className="mr-2 h-4 w-4" />
              <span className="truncate">{tArchive('unarchiveSelected', { count: selectedInstallmentIds.size })}</span>
            </Button>
            <Button
              onClick={handleBatchDelete}
              variant="destructive"
              size="default"
              className="w-full sm:w-auto"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              <span className="truncate">{tArchive('deleteSelected', { count: selectedInstallmentIds.size })}</span>
            </Button>
          </>
        )}
      </>
    );

    return () => setActions(null);
  }, [selectedInstallmentIds.size, setActions, handleBatchUnarchive, tArchive]);

  const isLoading = isLoadingInstallments;
  const hasError = installmentsError;

  if (hasError) {
    return (
      <ApiErrorState
        error={installmentsError}
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Search and Filters */}
      {(installments.length > 0 || searchQuery || selectedCategory) && (
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex-1">
            <SearchFilter
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
              categories={uniqueCategories}
              searchPlaceholder={tArchive('searchPlaceholder')}
              categoryPlaceholder={tCommon('common.allCategories')}
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

      {/* Installment List */}
      <div>
        {isLoading ? (
          <LoadingCards count={6} />
        ) : !installments || installments.length === 0 ? (
          <EmptyState
            icon={Archive}
            title={tArchive('noInstallments')}
            description={tArchive('noInstallmentsDescription')}
          />
        ) : !filteredInstallments || filteredInstallments.length === 0 ? (
          <EmptyState
            icon={Archive}
            title={tArchive('noFilterResults')}
            description={tArchive('noFilterResultsDescription')}
          />
        ) : viewMode === 'card' ? (
          <>
            {filteredInstallments.length > 0 && (
              <div className="flex items-center gap-2 px-1 mb-4">
                <Checkbox
                  checked={selectedInstallmentIds.size === filteredInstallments.length}
                  onCheckedChange={handleSelectAll}
                  aria-label={tCommon('common.selectAll')}
                />
                <span className="text-sm text-muted-foreground">
                  {selectedInstallmentIds.size === filteredInstallments.length ? tCommon('common.deselectAll') : tCommon('common.selectAll')}
                </span>
              </div>
            )}
            <div className="grid gap-3 md:gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredInstallments.map((installment) => {
              // Calculate payment progress
              const percentPaid = calculatePercentPaid(
                installment.payments_made,
                installment.number_of_payments
              );

              // Calculate next payment date
              const { nextPayment, isPaidOff, daysUntilPayment } = calculateNextPaymentDate(
                installment.first_payment_date,
                installment.frequency,
                installment.payments_made,
                installment.number_of_payments,
                installment.end_date
              );
              const urgency = getPaymentUrgency(daysUntilPayment);
              const paymentMessage = getTranslatedPaymentMessage(daysUntilPayment, isPaidOff);

              // Get payment badge variant based on urgency
              const getPaymentBadgeVariant = (urgency: string): 'default' | 'secondary' | 'destructive' => {
                switch (urgency) {
                  case 'high':
                    return 'destructive';
                  case 'medium':
                    return 'default';
                  default:
                    return 'secondary';
                }
              };

              return (
                <Card key={installment.id} className="relative opacity-75">
                  <CardHeader className="pb-3 md:pb-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <Checkbox
                          checked={selectedInstallmentIds.has(installment.id)}
                          onCheckedChange={() => handleToggleSelect(installment.id)}
                          aria-label={`Select ${installment.name}`}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base md:text-lg truncate">{installment.name}</CardTitle>
                          <CardDescription className="mt-1 min-h-[20px] text-xs md:text-sm line-clamp-2">
                            {installment.description || ' '}
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
                      {/* Total and Remaining Balance */}
                      <div className="rounded-lg border bg-muted/50 p-2 md:p-3">
                        <div className="flex items-baseline justify-between mb-1">
                          <span className="text-[10px] md:text-xs text-muted-foreground">{tOverview('remaining')}</span>
                          <span className="text-xl md:text-2xl font-bold">
                            <CurrencyDisplay
                              amount={installment.display_remaining_balance ?? installment.remaining_balance ?? installment.display_total_amount ?? installment.total_amount}
                              currency={installment.display_currency ?? installment.currency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between">
                          <span className="text-[10px] md:text-xs text-muted-foreground">
                            {tOverview('of')}{' '}
                            <CurrencyDisplay
                              amount={installment.display_total_amount ?? installment.total_amount}
                              currency={installment.display_currency ?? installment.currency}
                              showSymbol={true}
                              showCode={false}
                            />{' '}
                            {tOverview('total')}
                          </span>
                          <span className="text-xs md:text-sm text-muted-foreground">
                            <CurrencyDisplay
                              amount={installment.display_amount_per_payment ?? installment.amount_per_payment}
                              currency={installment.display_currency ?? installment.currency}
                              showSymbol={true}
                              showCode={false}
                            />{' '}
                            {FREQUENCY_LABELS[installment.frequency] || installment.frequency}
                          </span>
                        </div>
                        <div className="mt-2 text-[10px] md:text-xs text-muted-foreground min-h-[16px]">
                          {installment.display_currency && installment.display_currency !== installment.currency && (
                            <>
                              {tOverview('original')}: <CurrencyDisplay
                                amount={installment.total_amount}
                                currency={installment.currency}
                                showSymbol={true}
                                showCode={false}
                              /> {tOverview('total')}, <CurrencyDisplay
                                amount={installment.amount_per_payment}
                                currency={installment.currency}
                                showSymbol={true}
                                showCode={false}
                              /> {FREQUENCY_LABELS[installment.frequency] || installment.frequency}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Payment Progress */}
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>
                            {installment.payments_made} {tOverview('of')} {installment.number_of_payments} {tOverview('payments')}
                          </span>
                          <span>{percentPaid}%</span>
                        </div>
                        <Progress value={percentPaid} className="h-2" />
                      </div>

                      {/* Next Payment Date */}
                      <div className="rounded-lg bg-muted p-2 md:p-3 min-h-[60px]">
                        {nextPayment ? (
                          <>
                            <p className="text-[10px] md:text-xs text-muted-foreground">{tOverview('nextPayment')}</p>
                            <p className="text-xs md:text-sm font-semibold">
                              {formatPaymentDate(nextPayment)}
                            </p>
                            <Badge
                              variant={getPaymentBadgeVariant(urgency)}
                              className="mt-1 text-xs flex-shrink-0"
                            >
                              {paymentMessage}
                            </Badge>
                          </>
                        ) : (
                          <>
                            <p className="text-[10px] md:text-xs text-muted-foreground">{tOverview('status')}</p>
                            <p className="text-xs md:text-sm font-semibold">
                              {isPaidOff ? tOverview('paidOff') : tOverview('noUpcomingPayment')}
                            </p>
                          </>
                        )}
                      </div>

                      <div className="min-h-[24px]">
                        {installment.category && (
                          <Badge variant="outline" className="text-xs flex-shrink-0">{installment.category}</Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUnarchive(installment.id)}
                        >
                          <ArchiveRestore className="mr-1 h-3 w-3" />
                          {tActions('unarchive')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(installment.id)}
                          disabled={isDeleting}
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
                          {tActions('delete')}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
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
                        checked={selectedInstallmentIds.size === filteredInstallments.length && filteredInstallments.length > 0}
                        onCheckedChange={handleSelectAll}
                        aria-label={tCommon('common.selectAll')}
                      />
                    </TableHead>
                    <TableHead className="w-[200px]">{tCommon('common.name')}</TableHead>
                    <TableHead className="hidden md:table-cell">{tCommon('common.description')}</TableHead>
                    <TableHead className="hidden lg:table-cell">{tCommon('common.category')}</TableHead>
                    <TableHead className="text-right">{tOverview('remaining')}</TableHead>
                    <TableHead className="hidden sm:table-cell text-right">{tOverview('payment')}</TableHead>
                    <TableHead className="hidden xl:table-cell text-right">{tOverview('progress')}</TableHead>
                    <TableHead className="hidden 2xl:table-cell text-right">{tArchive('originalTotal')}</TableHead>
                    <TableHead className="text-right w-[180px]">{tCommon('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInstallments.map((installment) => {
                    const percentPaid = calculatePercentPaid(
                      installment.payments_made,
                      installment.number_of_payments
                    );

                    return (
                      <TableRow key={installment.id} className="opacity-75">
                        <TableCell>
                          <Checkbox
                            checked={selectedInstallmentIds.has(installment.id)}
                            onCheckedChange={() => handleToggleSelect(installment.id)}
                            aria-label={`Select ${installment.name}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="max-w-[200px]">
                            <p className="truncate">{installment.name}</p>
                            <p className="text-xs text-muted-foreground md:hidden truncate">
                              {installment.description}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <p className="max-w-[250px] truncate text-sm text-muted-foreground">
                            {installment.description || '-'}
                          </p>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {installment.category ? (
                            <Badge variant="outline" className="text-xs">{installment.category}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          <CurrencyDisplay
                            amount={installment.display_remaining_balance ?? installment.remaining_balance ?? installment.display_total_amount ?? installment.total_amount}
                            currency={installment.display_currency ?? installment.currency}
                            showSymbol={true}
                            showCode={false}
                          />
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-right">
                          <div className="flex flex-col items-end">
                            <span className="text-sm">
                              <CurrencyDisplay
                                amount={installment.display_amount_per_payment ?? installment.amount_per_payment}
                                currency={installment.display_currency ?? installment.currency}
                                showSymbol={true}
                                showCode={false}
                              />
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {FREQUENCY_LABELS[installment.frequency] || installment.frequency}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-sm">{installment.payments_made}/{installment.number_of_payments}</span>
                            <Progress value={percentPaid} className="h-1 w-16" />
                            <span className="text-xs text-muted-foreground">{percentPaid}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden 2xl:table-cell text-right">
                          {installment.display_currency && installment.display_currency !== installment.currency ? (
                            <span className="text-sm text-muted-foreground">
                              {installment.total_amount} {installment.currency}
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
                              onClick={() => handleUnarchive(installment.id)}
                              className="h-8 w-8 p-0"
                            >
                              <ArchiveRestore className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(installment.id)}
                              disabled={isDeleting}
                              className="h-8 w-8 p-0"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
        description={tCommon('deleteDialog.description', { item: tOverview('installment') })}
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
        count={selectedInstallmentIds.size}
        title={tArchive('batchDeleteTitle', { count: selectedInstallmentIds.size })}
        description={tArchive('batchDeleteDescription', { count: selectedInstallmentIds.size })}
        cancelLabel={tCommon('actions.cancel')}
        deleteLabel={tCommon('actions.delete')}
        deletingLabel={tCommon('actions.deleting')}
        isDeleting={isBatchDeleting}
      />
    </div>
  );
}
