/**
 * Savings Archive Page
 * Displays archived savings accounts with unarchive functionality
 */
'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, Trash2, LayoutGrid, List, Filter, Search, ArrowUp, ArrowDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  useListAccountsQuery,
  useUpdateAccountMutation,
  useDeleteAccountMutation,
  useBatchDeleteSavingsAccountsMutation,
  type AccountType,
} from '@/lib/api/savingsApi';
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
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { CurrencyDisplay } from '@/components/currency';
import { useViewPreferences } from '@/lib/hooks/use-view-preferences';
import { SavingsActionsContext } from '../context';

export default function SavingsArchivePage() {
  const router = useRouter();

  // Translation hooks
  const tArchive = useTranslations('savings.archive');
  const tOverview = useTranslations('savings.overview');
  const tActions = useTranslations('savings.actions');
  const tCommon = useTranslations('common');
  const tAccountTypes = useTranslations('savings.accountTypes');

  const ACCOUNT_TYPE_LABELS: Record<string, string> = {
    crypto: tAccountTypes('other'),
    cash: tAccountTypes('other'),
    business: tAccountTypes('other'),
    personal: tAccountTypes('other'),
    fixed_deposit: tAccountTypes('cd'),
    other: tAccountTypes('other'),
  };
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);

  // Use default view preferences from user settings
  const { viewMode, setViewMode } = useViewPreferences();

  // Context to set action buttons in layout
  const { setActions } = React.useContext(SavingsActionsContext);

  // Fetch only archived savings accounts (is_active: false)
  const {
    data: accountsData,
    isLoading: isLoadingAccounts,
    error: accountsError,
  } = useListAccountsQuery({ is_active: false });

  const [updateAccount] = useUpdateAccountMutation();
  const [deleteAccount, { isLoading: isDeleting }] = useDeleteAccountMutation();
  const [batchDeleteAccounts, { isLoading: isBatchDeleting }] = useBatchDeleteSavingsAccountsMutation();

  const accounts = useMemo(() => accountsData?.items || [], [accountsData?.items]);

  // Get unique account types
  const uniqueAccountTypes = React.useMemo(() => {
    const types = accounts
      .map((account) => account.account_type)
      .filter((type): type is AccountType => !!type);
    return Array.from(new Set(types)).sort();
  }, [accounts]);

  // Filter and sort accounts
  const filteredAccounts = React.useMemo(() => {
    const filtered = filterBySearchAndCategory(
      accounts,
      searchQuery,
      selectedType,
      (account) => account.name,
      (account) => account.account_type || undefined
    );

    // Apply sorting
    const sorted = sortItems(
      filtered,
      sortField,
      sortDirection,
      (account) => account.name,
      (account) => account.display_current_balance || account.current_balance,
      (account) => account.created_at
    );

    return sorted || [];
  }, [accounts, searchQuery, selectedType, sortField, sortDirection]);

  const handleUnarchive = async (id: string) => {
    try {
      await updateAccount({ id, data: { is_active: true } }).unwrap();
      toast.success(tArchive('unarchiveSuccess'));
      setSelectedAccountIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    } catch (error) {
      toast.error(tArchive('unarchiveError'));
    }
  };

  const handleBatchUnarchive = useCallback(async () => {
    const idsToUnarchive = Array.from(selectedAccountIds);
    let successCount = 0;
    let failCount = 0;

    for (const id of idsToUnarchive) {
      try {
        await updateAccount({ id, data: { is_active: true } }).unwrap();
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

    setSelectedAccountIds(new Set());
  }, [selectedAccountIds, updateAccount, tArchive]);

  const handleDelete = (id: string) => {
    setDeletingAccountId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingAccountId) return;

    try {
      await deleteAccount(deletingAccountId).unwrap();
      toast.success(tOverview('deleteSuccess'));
      setDeleteDialogOpen(false);
      setDeletingAccountId(null);
      setSelectedAccountIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(deletingAccountId);
        return newSet;
      });
    } catch (error) {
      toast.error(tOverview('deleteError'));
    }
  };

  const handleToggleSelect = (accountId: string) => {
    setSelectedAccountIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(accountId)) {
        newSet.delete(accountId);
      } else {
        newSet.add(accountId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedAccountIds.size === filteredAccounts.length && filteredAccounts.length > 0) {
      setSelectedAccountIds(new Set());
    } else {
      setSelectedAccountIds(new Set(filteredAccounts.map((account) => account.id)));
    }
  };

  const handleBatchDelete = () => {
    setBatchDeleteDialogOpen(true);
  };

  const confirmBatchDelete = async () => {
    if (selectedAccountIds.size === 0) return;

    try {
      const result = await batchDeleteAccounts({
        ids: Array.from(selectedAccountIds),
      }).unwrap();

      if (result.failed_ids.length > 0) {
        toast.error(tOverview('batchDeleteError', { count: result.failed_ids.length }));
      } else {
        toast.success(tOverview('batchDeleteSuccess', { count: result.deleted_count }));
      }

      setBatchDeleteDialogOpen(false);
      setSelectedAccountIds(new Set());
    } catch (error) {
      toast.error(tOverview('batchDeleteError', { count: selectedAccountIds.size }));
    }
  };

  // Set action buttons in layout
  React.useEffect(() => {
    setActions(
      <>
        {selectedAccountIds.size > 0 && (
          <>
            <Button
              onClick={handleBatchUnarchive}
              variant="outline"
              size="default"
              className="w-full sm:w-auto"
            >
              <ArchiveRestore className="mr-2 h-4 w-4" />
              <span className="truncate">{tArchive('unarchiveSelected', { count: selectedAccountIds.size })}</span>
            </Button>
            <Button
              onClick={handleBatchDelete}
              variant="destructive"
              size="default"
              className="w-full sm:w-auto"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              <span className="truncate">{tOverview('deleteSelected', { count: selectedAccountIds.size })}</span>
            </Button>
          </>
        )}
      </>
    );

    return () => setActions(null);
  }, [selectedAccountIds.size, setActions, handleBatchUnarchive, tArchive, tOverview]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedType !== null) count++;
    if (sortField !== 'name' || sortDirection !== 'asc') count++;
    return count;
  }, [selectedType, sortField, sortDirection]);

  const isLoading = isLoadingAccounts;
  const hasError = accountsError;

  if (hasError) {
    return (
      <ApiErrorState
        error={accountsError}
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Search and Filters */}
      {(accounts.length > 0 || searchQuery || selectedType) && (
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
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="relative">
                <Filter className="h-4 w-4" />
                {activeFilterCount > 0 && (
                  <Badge className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="end">
              {/* Filter section */}
              <div className="p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.filter')}</p>

                {/* Category (Account Type) */}
                <div className="space-y-1">
                  <label className="text-sm font-medium">{tOverview('accountType')}</label>
                  <Select
                    value={selectedType || 'all'}
                    onValueChange={(value) => setSelectedType(value === 'all' ? null : value)}
                  >
                    <SelectTrigger className="h-8 w-full text-sm">
                      <SelectValue placeholder={tOverview('allAccountTypes')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{tOverview('allAccountTypes')}</SelectItem>
                      {uniqueAccountTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {ACCOUNT_TYPE_LABELS[type] || type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {/* Sort section */}
              <div className="p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.sort')}</p>
                <div className="flex items-center gap-2">
                  <Select value={sortField} onValueChange={(value) => setSortField(value as SortField)}>
                    <SelectTrigger className="h-8 flex-1 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">{tCommon('common.name')}</SelectItem>
                      <SelectItem value="amount">{tCommon('common.amount')}</SelectItem>
                      <SelectItem value="date">{tCommon('common.date')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
                    className="h-8 gap-1.5 flex-shrink-0"
                  >
                    {sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                    <span className="text-sm">
                      {sortField === 'name'
                        ? (sortDirection === 'asc' ? tCommon('common.sortAZ') : tCommon('common.sortZA'))
                        : sortField === 'amount'
                          ? (sortDirection === 'asc' ? tCommon('common.sortLowToHigh') : tCommon('common.sortHighToLow'))
                          : (sortDirection === 'asc' ? tCommon('common.sortOldestFirst') : tCommon('common.sortNewestFirst'))
                      }
                    </span>
                  </Button>
                </div>
              </div>

              <Separator />

              {/* View section */}
              <div className="p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.view')}</p>
                <div className="inline-flex items-center gap-1 border rounded-md p-0.5" style={{ height: '36px' }}>
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
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Savings Accounts List */}
      <div>
        {isLoading ? (
          <LoadingCards count={6} />
        ) : !accounts || accounts.length === 0 ? (
          <EmptyState
            icon={Archive}
            title={tArchive('noAccounts')}
            description={tArchive('noAccountsDescription')}
          />
        ) : !filteredAccounts || filteredAccounts.length === 0 ? (
          <EmptyState
            icon={Archive}
            title={tCommon('common.noResults')}
            description={tOverview('noFilterResults')}
          />
        ) : viewMode === 'card' ? (
          <>
            {filteredAccounts.length > 0 && (
              <div className="flex items-center gap-2 px-1 mb-4">
                <Checkbox
                  checked={selectedAccountIds.size === filteredAccounts.length}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all savings accounts"
                />
                <span className="text-sm text-muted-foreground">
                  {selectedAccountIds.size === filteredAccounts.length ? tOverview('deselectAll') : tOverview('selectAll')}
                </span>
              </div>
            )}
            <div className="grid gap-3 md:gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredAccounts.map((account) => (
              <Card
                key={account.id}
                className="relative opacity-75 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => router.push(`/dashboard/accounts/${account.id}`)}
              >
                <CardHeader className="pb-3 md:pb-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedAccountIds.has(account.id)}
                          onCheckedChange={() => handleToggleSelect(account.id)}
                          aria-label={`Select ${account.name}`}
                          className="mt-1"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base md:text-lg truncate">{account.name}</CardTitle>
                        <CardDescription className="mt-1 min-h-[20px] text-xs md:text-sm line-clamp-2">
                          {account.institution || ' '}
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
                          amount={account.display_current_balance ?? account.current_balance}
                          currency={account.display_currency ?? account.currency}
                          showSymbol={true}
                          showCode={false}
                        />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {ACCOUNT_TYPE_LABELS[account.account_type] || account.account_type}
                      </p>
                      <div className="text-[10px] md:text-xs text-muted-foreground mt-1 min-h-[16px]">
                        {account.display_currency && account.display_currency !== account.currency && (
                          <>
                            Original: <CurrencyDisplay
                              amount={account.current_balance}
                              currency={account.currency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </>
                        )}
                      </div>
                    </div>

                    <div className="rounded-lg bg-muted p-2 md:p-3 min-h-[60px] flex items-center justify-center">
                      {account.account_number_last4 ? (
                        <div className="text-center w-full">
                          <p className="text-[10px] md:text-xs text-muted-foreground">
                            Account Number
                          </p>
                          <p className="text-sm font-semibold">
                            ••••{account.account_number_last4}
                          </p>
                        </div>
                      ) : (
                        <p className="text-[10px] md:text-xs text-muted-foreground">-</p>
                      )}
                    </div>

                    <div className="min-h-[24px]">
                      {account.notes && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{account.notes}</p>
                      )}
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
                        checked={selectedAccountIds.size === filteredAccounts.length && filteredAccounts.length > 0}
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead className="w-[200px]">{tOverview('name')}</TableHead>
                    <TableHead className="hidden md:table-cell">{tCommon('common.institution')}</TableHead>
                    <TableHead className="hidden lg:table-cell">{tOverview('accountType')}</TableHead>
                    <TableHead className="text-right">{tOverview('currentBalance')}</TableHead>
                    <TableHead className="hidden sm:table-cell">{tCommon('common.accountNumber')}</TableHead>
                    <TableHead className="hidden 2xl:table-cell text-right">{tCommon('common.originalAmount')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAccounts.map((account) => (
                    <TableRow
                      key={account.id}
                      className="opacity-75 cursor-pointer"
                      onClick={() => router.push(`/dashboard/accounts/${account.id}`)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedAccountIds.has(account.id)}
                          onCheckedChange={() => handleToggleSelect(account.id)}
                          aria-label={`Select ${account.name}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="max-w-[200px]">
                          <p className="truncate">{account.name}</p>
                          <p className="text-xs text-muted-foreground md:hidden truncate">
                            {account.institution}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <p className="max-w-[250px] truncate text-sm text-muted-foreground">
                          {account.institution || '-'}
                        </p>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <Badge variant="outline" className="text-xs">
                          {ACCOUNT_TYPE_LABELS[account.account_type] || account.account_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        <CurrencyDisplay
                          amount={account.display_current_balance ?? account.current_balance}
                          currency={account.display_currency ?? account.currency}
                          showSymbol={true}
                          showCode={false}
                        />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {account.account_number_last4 ? (
                          <span className="text-sm text-muted-foreground">
                            ••••{account.account_number_last4}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden 2xl:table-cell text-right">
                        {account.display_currency && account.display_currency !== account.currency ? (
                          <span className="text-sm text-muted-foreground">
                            {account.current_balance} {account.currency}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
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
        itemName="savings account"
        isDeleting={isDeleting}
        cancelLabel={tActions('cancel')}
        deleteLabel={tActions('delete')}
      />

      {/* Batch Delete Confirmation Dialog */}
      <BatchDeleteConfirmDialog
        open={batchDeleteDialogOpen}
        onOpenChange={setBatchDeleteDialogOpen}
        onConfirm={confirmBatchDelete}
        count={selectedAccountIds.size}
        itemName="savings account"
        isDeleting={isBatchDeleting}
        cancelLabel={tActions('cancel')}
        deleteLabel={tActions('delete')}
      />
    </div>
  );
}
