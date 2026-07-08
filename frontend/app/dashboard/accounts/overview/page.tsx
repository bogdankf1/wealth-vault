'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet, Trash2, Archive, LayoutGrid, List, Upload, Plus, Filter, Search, ArrowUp, ArrowDown, Lock, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { SavingsActionsContext } from '../context';
import { filterBySearchAndCategory } from '@/components/ui/search-filter';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { BatchDeleteConfirmDialog } from '@/components/ui/batch-delete-confirm-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { SavingsAccountForm } from '@/components/savings/savings-account-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SplitButton } from '@/components/ui/split-button';
import { Badge } from '@/components/ui/badge';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useListAccountsQuery,
  useGetSavingsStatsQuery,
  useUpdateAccountMutation,
  useDeleteAccountMutation,
  useBatchDeleteSavingsAccountsMutation,
  type SavingsAccount,
} from '@/lib/api/savingsApi';
import { sortItems, type SortField, type SortDirection } from '@/components/ui/sort-filter';
import { useViewPreferences } from '@/hooks/use-view-preferences';
import { useColumnVisibility, type ColumnConfig } from '@/hooks/use-column-visibility';
import { toast } from 'sonner';

export default function SavingsPage() {
  const router = useRouter();

  // Get context for setting actions
  const { setActions } = React.useContext(SavingsActionsContext);

  // Translation hooks
  const tOverview = useTranslations('savings.overview');
  const tActions = useTranslations('savings.actions');
  const tCommon = useTranslations('common');
  const tAccountTypes = useTranslations('savings.accountTypes');
  const tStatus = useTranslations('savings.status');

  const ACCOUNT_TYPE_LABELS: Record<string, string> = {
    personal: tAccountTypes('personal'),
    business: tAccountTypes('business'),
    cash: tAccountTypes('cash'),
    crypto: tAccountTypes('crypto'),
    fixed_deposit: tAccountTypes('fixedDeposit'),
    other: tAccountTypes('other'),
  };

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<SavingsAccount | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);

  // Use default view preferences from user settings
  const { viewMode, setViewMode } = useViewPreferences();
  // Column configuration for list view
  const columnConfig: ColumnConfig[] = React.useMemo(() => [
    { id: 'name', label: tOverview('name'), locked: true },
    { id: 'institution', label: tCommon('common.institution') },
    { id: 'accountType', label: tOverview('accountType') },
    { id: 'currentBalance', label: tOverview('currentBalance') },
    { id: 'accountNumber', label: tCommon('common.accountNumber') },
    { id: 'originalAmount', label: tCommon('common.originalAmount') },
    { id: 'status', label: tOverview('status') },
  ], [tOverview, tCommon]);

  const {
    visibleColumns,
    toggleColumn,
    showAllColumns,
    isColumnVisible,
  } = useColumnVisibility('accounts', columnConfig);

  const { data: accountsData, isLoading, error, refetch } = useListAccountsQuery({ is_active: true });
  const { data: stats } = useGetSavingsStatsQuery();
  const [updateAccount] = useUpdateAccountMutation();
  const [deleteAccount] = useDeleteAccountMutation();
  const [batchDeleteAccounts, { isLoading: isBatchDeleting }] = useBatchDeleteSavingsAccountsMutation();

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingAccountId(null);
  };

  const handleArchive = async (accountId: string) => {
    try {
      await updateAccount({ id: accountId, data: { is_active: false } }).unwrap();
      toast.success(tOverview('archiveSuccess'));
      setSelectedAccountIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(accountId);
        return newSet;
      });
    } catch (error) {
      toast.error(tOverview('archiveError'));
    }
  };

  const handleBatchArchive = useCallback(async () => {
    const idsToArchive = Array.from(selectedAccountIds);
    let successCount = 0;
    let failCount = 0;

    for (const id of idsToArchive) {
      try {
        await updateAccount({ id, data: { is_active: false } }).unwrap();
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

    setSelectedAccountIds(new Set());
  }, [selectedAccountIds, updateAccount, tOverview]);

  const handleDelete = async () => {
    if (deletingAccount) {
      try {
        await deleteAccount(deletingAccount.id).unwrap();
        toast.success(tOverview('deleteSuccess'));
        setDeletingAccount(null);
      } catch (error) {
        toast.error(tOverview('deleteError'));
      }
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

  const handleBatchDelete = useCallback(() => {
    setBatchDeleteDialogOpen(true);
  }, []);

  const handleAddAccount = useCallback(() => {
    setEditingAccountId(null);
    setIsFormOpen(true);
  }, []);

  const handleImportAccounts = useCallback(() => {
    router.push('/dashboard/accounts/import');
  }, [router]);

  // Set action buttons in layout
  React.useEffect(() => {
    setActions(
      <>
        {selectedAccountIds.size > 0 && (
          <>
            {/* Archive hidden for now
            <Button
              onClick={handleBatchArchive}
              variant="outline"
              size="default"
              className="w-full sm:w-auto"
            >
              <Archive className="mr-2 h-4 w-4" />
              <span className="truncate">{tOverview('archiveSelected', { count: selectedAccountIds.size })}</span>
            </Button>
            */}
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
        <SplitButton
          primaryLabel={tOverview('importAccounts')}
          onPrimaryClick={handleImportAccounts}
          primaryIcon={<Upload className="h-4 w-4" />}
          options={[
            {
              label: tOverview('addManually'),
              onClick: handleAddAccount,
              icon: <Plus className="h-4 w-4" />,
            },
          ]}
          className="w-full sm:w-auto"
        />
      </>
    );

    return () => setActions(null);
  }, [selectedAccountIds.size, setActions, handleBatchArchive, handleBatchDelete, handleAddAccount, handleImportAccounts, tOverview]);

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
    } catch {
      toast.error(tOverview('batchDeleteError', { count: selectedAccountIds.size }));
    }
  };

  // Filter accounts
  const accounts = accountsData?.items || [];
  const accountTypes = Array.from(new Set(accounts.map(a => a.account_type)));
  const searchFilteredAccounts = filterBySearchAndCategory(
    accounts,
    searchQuery,
    selectedType,
    (account) => account.name,
    (account) => account.account_type
  );

  // Apply sorting (using display_current_balance for currency-aware sorting)
  const filteredAccounts = sortItems(
    searchFilteredAccounts,
    sortField,
    sortDirection,
    (account) => account.name,
    (account) => account.display_current_balance || account.current_balance,
    (account) => account.created_at
  ) || [];

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedType !== '') count++;
    if (sortField !== 'name' || sortDirection !== 'asc') count++;
    return count;
  }, [selectedType, sortField, sortDirection]);

  if (isLoading) {
    return (
      <div className="space-y-4 md:space-y-6">

        <LoadingCards count={3} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 md:space-y-6">

        <ApiErrorState error={error} onRetry={refetch} />
      </div>
    );
  }

  const hasAccounts = accounts.length > 0;
  const hasFilteredResults = filteredAccounts.length > 0;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Search and Filters */}
      {hasAccounts && (
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
              <PopoverContent className="w-64 p-0" align="end">
                {/* Filter section */}
                <div className="p-2 space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.filter')}</p>

                  {/* Category (Account Type) */}
                  <div className="space-y-1">
                    <label className="text-sm font-medium">{tOverview('accountType')}</label>
                    <Select
                      value={selectedType || 'all'}
                      onValueChange={(value) => setSelectedType(value === 'all' ? '' : value)}
                    >
                      <SelectTrigger className="h-8 w-full text-sm">
                        <SelectValue placeholder={tOverview('allAccountTypes')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{tOverview('allAccountTypes')}</SelectItem>
                        {accountTypes.map((type) => (
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
                <div className="p-2 space-y-1.5">
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
                <div className="p-2 space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.view')}</p>
                  <div className="inline-flex items-center gap-1 border rounded-md p-0.5" style={{ height: '32px' }}>
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

                {/* Columns section (list view only) */}
                {viewMode === 'list' && (
                  <>
                    <Separator />
                    <div className="p-2 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.columns')}</p>
                        {Object.values(visibleColumns).filter(Boolean).length < columnConfig.length && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                            onClick={showAllColumns}
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            {tCommon('common.showAll')}
                          </Button>
                        )}
                      </div>
                      <div className="space-y-1">
                        {columnConfig.map((column) => (
                          <label
                            key={column.id}
                            className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                              column.locked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-muted'
                            }`}
                          >
                            <Checkbox
                              checked={visibleColumns[column.id] ?? true}
                              onCheckedChange={() => toggleColumn(column.id)}
                              disabled={column.locked}
                            />
                            <span className="flex-1">{column.label}</span>
                            {column.locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                          </label>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </PopoverContent>
            </Popover>
          </div>

          {/* Inline stats */}
          {stats && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground flex-shrink-0 max-w-xs">
              <span><span className="font-semibold text-foreground">{stats.total_accounts}</span> accounts</span>
              <span>·</span>
              <span><span className="font-semibold text-foreground"><CurrencyDisplay amount={stats.net_worth} currency={stats.currency} decimals={0} /></span> net</span>
              <span>·</span>
              <span><span className="font-semibold text-foreground">{stats.active_accounts}</span> active</span>
            </div>
          )}
        </div>
      )}

      {/* Accounts List */}
      <div>

        {!hasAccounts ? (
        <EmptyState
          icon={Wallet}
          title={tOverview('noAccounts')}
          description={tOverview('noAccountsDescription')}
          actionLabel={tOverview('importAccounts')}
          onAction={handleImportAccounts}
        />
      ) : !hasFilteredResults ? (
        <EmptyState
          icon={Wallet}
          title={tCommon('common.noResults')}
          description={tOverview('noFilterResults')}
          actionLabel={tOverview('importAccounts')}
          onAction={handleImportAccounts}
        />
      ) : viewMode === 'card' ? (
        <>
          {filteredAccounts.length > 0 && (
            <div className="flex items-center gap-2 px-1 mb-4">
              <Checkbox
                checked={selectedAccountIds.size === filteredAccounts.length}
                onCheckedChange={handleSelectAll}
                aria-label="Select all accounts"
              />
              <span className="text-sm text-muted-foreground">
                {selectedAccountIds.size === filteredAccounts.length ? tOverview('deselectAll') : tOverview('selectAll')}
              </span>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredAccounts.map((account) => (
            <Card
              key={account.id}
              className="relative cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => router.push(`/dashboard/accounts/${account.id}`)}
            >
              <CardHeader>
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
                      <CardTitle className="text-lg">{account.name}</CardTitle>
                      <CardDescription className="mt-1 min-h-[20px]">
                        {account.institution || <>&nbsp;</>}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant={account.is_active ? 'default' : 'secondary'} className="flex-shrink-0">
                    {account.is_active ? tStatus('active') : tStatus('inactive')}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <div className="text-lg md:text-2xl font-bold">
                      <CurrencyDisplay
                        amount={account.display_current_balance ?? account.current_balance}
                        currency={account.display_currency ?? account.currency}
                        showSymbol={true}
                        showCode={false}
                      />
                    </div>
                    {account.display_currency && account.display_currency !== account.currency && (
                      <p className="text-sm text-muted-foreground">
                        Original: <CurrencyDisplay
                          amount={account.current_balance}
                          currency={account.currency}
                          showSymbol={true}
                          showCode={false}
                        />
                      </p>
                    )}
                  </div>

                  <div className="min-h-[24px] flex items-center gap-2">
                    <Badge variant="outline">{ACCOUNT_TYPE_LABELS[account.account_type] || account.account_type}</Badge>
                    {account.account_number_last4 && (
                      <span className="text-xs text-muted-foreground">
                        ••••{account.account_number_last4}
                      </span>
                    )}
                  </div>

                  <div className="min-h-[40px]">
                    {account.notes && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{account.notes}</p>
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
                  {isColumnVisible('name') && (
                    <TableHead className="w-[200px]">{tOverview('name')}</TableHead>
                  )}
                  {isColumnVisible('institution') && (
                    <TableHead className="hidden md:table-cell">{tCommon('common.institution')}</TableHead>
                  )}
                  {isColumnVisible('accountType') && (
                    <TableHead className="hidden lg:table-cell">{tOverview('accountType')}</TableHead>
                  )}
                  {isColumnVisible('currentBalance') && (
                    <TableHead className="text-right">{tOverview('currentBalance')}</TableHead>
                  )}
                  {isColumnVisible('accountNumber') && (
                    <TableHead className="hidden sm:table-cell">{tCommon('common.accountNumber')}</TableHead>
                  )}
                  {isColumnVisible('originalAmount') && (
                    <TableHead className="hidden 2xl:table-cell text-right">{tCommon('common.originalAmount')}</TableHead>
                  )}
                  {isColumnVisible('status') && (
                    <TableHead className="hidden sm:table-cell">{tOverview('status')}</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAccounts.map((account) => (
                  <TableRow
                    key={account.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/dashboard/accounts/${account.id}`)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedAccountIds.has(account.id)}
                        onCheckedChange={() => handleToggleSelect(account.id)}
                        aria-label={`Select ${account.name}`}
                      />
                    </TableCell>
                    {isColumnVisible('name') && (
                      <TableCell className="font-medium">
                        <div className="max-w-[200px]">
                          <p className="truncate">{account.name}</p>
                          {!isColumnVisible('institution') && (
                            <p className="text-xs text-muted-foreground md:hidden truncate">
                              {account.institution}
                            </p>
                          )}
                        </div>
                      </TableCell>
                    )}
                    {isColumnVisible('institution') && (
                      <TableCell className="hidden md:table-cell">
                        <p className="max-w-[250px] truncate text-sm text-muted-foreground">
                          {account.institution || '-'}
                        </p>
                      </TableCell>
                    )}
                    {isColumnVisible('accountType') && (
                      <TableCell className="hidden lg:table-cell">
                        <Badge variant="outline" className="text-xs">
                          {ACCOUNT_TYPE_LABELS[account.account_type] || account.account_type}
                        </Badge>
                      </TableCell>
                    )}
                    {isColumnVisible('currentBalance') && (
                      <TableCell className="text-right font-semibold">
                        <CurrencyDisplay
                          amount={account.display_current_balance ?? account.current_balance}
                          currency={account.display_currency ?? account.currency}
                          showSymbol={true}
                          showCode={false}
                        />
                      </TableCell>
                    )}
                    {isColumnVisible('accountNumber') && (
                      <TableCell className="hidden sm:table-cell">
                        {account.account_number_last4 ? (
                          <span className="text-sm text-muted-foreground">
                            ••••{account.account_number_last4}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    )}
                    {isColumnVisible('originalAmount') && (
                      <TableCell className="hidden 2xl:table-cell text-right">
                        {account.display_currency && account.display_currency !== account.currency ? (
                          <span className="text-sm text-muted-foreground">
                            {account.current_balance} {account.currency}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    )}
                    {isColumnVisible('status') && (
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant={account.is_active ? 'default' : 'secondary'} className="text-xs">
                          {account.is_active ? tStatus('active') : tStatus('inactive')}
                        </Badge>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
      </div>

      <SavingsAccountForm
        accountId={editingAccountId}
        isOpen={isFormOpen}
        onClose={handleCloseForm}
      />

      <DeleteConfirmDialog
        open={!!deletingAccount}
        onOpenChange={(open) => !open && setDeletingAccount(null)}
        onConfirm={handleDelete}
        title={tOverview('deleteConfirmTitle')}
        description={deletingAccount ? tOverview('deleteConfirmDescription') : ''}
        itemName="account"
        cancelLabel={tActions('cancel')}
        deleteLabel={tActions('delete')}
      />

      {/* Batch Delete Confirmation Dialog */}
      <BatchDeleteConfirmDialog
        open={batchDeleteDialogOpen}
        onOpenChange={setBatchDeleteDialogOpen}
        onConfirm={confirmBatchDelete}
        count={selectedAccountIds.size}
        itemName="account"
        isDeleting={isBatchDeleting}
        cancelLabel={tActions('cancel')}
        deleteLabel={tActions('delete')}
      />
    </div>
  );
}
