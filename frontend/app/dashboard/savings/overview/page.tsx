'use client';

import React, { useState, useCallback } from 'react';
import { Wallet, TrendingUp, PiggyBank, Edit, Trash2, Archive, LayoutGrid, List, Grid3x3, Rows3 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { StatsCards } from '@/components/ui/stats-cards';
import { SavingsActionsContext } from '../context';
import { SearchFilter, filterBySearchAndCategory } from '@/components/ui/search-filter';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { BatchDeleteConfirmDialog } from '@/components/ui/batch-delete-confirm-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { SavingsAccountForm } from '@/components/savings/savings-account-form';
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
  useListAccountsQuery,
  useGetSavingsStatsQuery,
  useUpdateAccountMutation,
  useDeleteAccountMutation,
  useBatchDeleteSavingsAccountsMutation,
  type SavingsAccount,
} from '@/lib/api/savingsApi';
import { SortFilter, sortItems, type SortField, type SortDirection } from '@/components/ui/sort-filter';
import { useViewPreferences } from '@/lib/hooks/use-view-preferences';
import { toast } from 'sonner';

export default function SavingsPage() {
  // Get context for setting actions
  const { setActions } = React.useContext(SavingsActionsContext);

  // Translation hooks
  const tOverview = useTranslations('savings.overview');
  const tActions = useTranslations('savings.actions');
  const tCommon = useTranslations('common');
  const tAccountTypes = useTranslations('savings.accountTypes');
  const tStatus = useTranslations('savings.status');

  const ACCOUNT_TYPE_LABELS: Record<string, string> = {
    crypto: tAccountTypes('other'),
    cash: tAccountTypes('other'),
    business: tAccountTypes('other'),
    personal: tAccountTypes('other'),
    fixed_deposit: tAccountTypes('cd'),
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
  const { viewMode, setViewMode, statsViewMode, setStatsViewMode } = useViewPreferences();

  const { data: accountsData, isLoading, error, refetch } = useListAccountsQuery({ is_active: true });
  const { data: stats } = useGetSavingsStatsQuery();
  const [updateAccount] = useUpdateAccountMutation();
  const [deleteAccount] = useDeleteAccountMutation();
  const [batchDeleteAccounts, { isLoading: isBatchDeleting }] = useBatchDeleteSavingsAccountsMutation();

  const handleEdit = (accountId: string) => {
    setEditingAccountId(accountId);
    setIsFormOpen(true);
  };

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
      console.error('Failed to archive account:', error);
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
        console.error(`Failed to archive account ${id}:`, error);
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
        console.error('Failed to delete account:', error);
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

  // Set action buttons in layout
  React.useEffect(() => {
    setActions(
      <>
        {selectedAccountIds.size > 0 && (
          <>
            <Button
              onClick={handleBatchArchive}
              variant="outline"
              size="default"
              className="w-full sm:w-auto"
            >
              <Archive className="mr-2 h-4 w-4" />
              <span className="truncate">{tOverview('archiveSelected', { count: selectedAccountIds.size })}</span>
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
        <Button onClick={handleAddAccount} size="default" className="w-full sm:w-auto">
          <Wallet className="mr-2 h-4 w-4" />
          <span className="truncate">{tOverview('addAccount')}</span>
        </Button>
      </>
    );

    return () => setActions(null);
  }, [selectedAccountIds.size, setActions, handleBatchArchive, handleBatchDelete, handleAddAccount, tOverview]);

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

  // Stats
  const statsCards = [
    {
      title: tOverview('totalAccounts'),
      value: stats?.total_accounts.toString() || '0',
      description: `${stats?.active_accounts || 0} ${tOverview('activeAccounts').toLowerCase()}`,
      icon: Wallet,
    },
    {
      title: tOverview('totalSavings'),
      value: stats ? (
        <CurrencyDisplay
          amount={stats.net_worth}
          currency={stats.currency}
          showSymbol={true}
          showCode={false}
        />
      ) : '0',
      description: tOverview('currentBalance'),
      icon: TrendingUp,
    },
    {
      title: tOverview('totalGrowth'),
      value: stats ? `${Math.round((stats.active_accounts / Math.max(stats.total_accounts, 1)) * 100)}%` : '0%',
      description: tOverview('activeAccounts'),
      icon: PiggyBank,
    },
  ];

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
      

      {stats && (
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
      )}

      {/* Search, Filters, and View Toggle */}
      {hasAccounts && (
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex-1">
            <SearchFilter
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedCategory={selectedType}
              onCategoryChange={(cat) => setSelectedType(cat || '')}
              categories={accountTypes}
              searchPlaceholder={tOverview('searchPlaceholder')}
              categoryPlaceholder={tOverview('allAccountTypes')}
              categoryLabels={ACCOUNT_TYPE_LABELS}
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

      {/* Accounts List */}
      <div>

        {!hasAccounts ? (
        <EmptyState
          icon={Wallet}
          title={tOverview('noAccounts')}
          description={tOverview('noAccountsDescription')}
          actionLabel={tOverview('addAccount')}
          onAction={() => setIsFormOpen(true)}
        />
      ) : !hasFilteredResults ? (
        <EmptyState
          icon={Wallet}
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
                aria-label="Select all accounts"
              />
              <span className="text-sm text-muted-foreground">
                {selectedAccountIds.size === filteredAccounts.length ? tOverview('deselectAll') : tOverview('selectAll')}
              </span>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredAccounts.map((account) => (
            <Card key={account.id} className="relative">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <Checkbox
                      checked={selectedAccountIds.has(account.id)}
                      onCheckedChange={() => handleToggleSelect(account.id)}
                      aria-label={`Select ${account.name}`}
                      className="mt-1"
                    />
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
                    <div className="text-2xl font-bold">
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

                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(account.id)}
                    >
                      <Edit className="mr-1 h-3 w-3" />
                      {tActions('edit')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleArchive(account.id)}
                    >
                      <Archive className="mr-1 h-3 w-3" />
                      {tActions('archive')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeletingAccount(account)}
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
                  <TableHead className="hidden sm:table-cell">{tOverview('status')}</TableHead>
                  <TableHead className="text-right w-[180px]">{tOverview('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAccounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell>
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
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant={account.is_active ? 'default' : 'secondary'} className="text-xs">
                        {account.is_active ? tStatus('active') : tStatus('inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(account.id)}
                          className="h-8 w-8 p-0"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleArchive(account.id)}
                          className="h-8 w-8 p-0"
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingAccount(account)}
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
