'use client';

import { useState } from 'react';
import { Wallet, TrendingUp, PiggyBank, Edit, Trash2 } from 'lucide-react';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { ModuleHeader } from '@/components/ui/module-header';
import { StatsCards } from '@/components/ui/stats-cards';
import { SearchFilter, filterBySearchAndCategory } from '@/components/ui/search-filter';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { SavingsAccountForm } from '@/components/savings/savings-account-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  useListAccountsQuery,
  useGetSavingsStatsQuery,
  useDeleteAccountMutation,
  type SavingsAccount,
} from '@/lib/api/savingsApi';

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  checking: 'Checking Account',
  savings: 'Savings Account',
  investment: 'Investment Account',
  cash: 'Cash',
  crypto: 'Cryptocurrency',
  other: 'Other',
};

export default function SavingsPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<SavingsAccount | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('');

  const { data: accountsData, isLoading, error, refetch } = useListAccountsQuery();
  const { data: stats } = useGetSavingsStatsQuery();
  const [deleteAccount] = useDeleteAccountMutation();

  const handleEdit = (accountId: string) => {
    setEditingAccountId(accountId);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingAccountId(null);
  };

  const handleDelete = async () => {
    if (deletingAccount) {
      try {
        await deleteAccount(deletingAccount.id).unwrap();
        setDeletingAccount(null);
      } catch (error) {
        console.error('Failed to delete account:', error);
      }
    }
  };

  // Filter accounts
  const accounts = accountsData?.items || [];
  const accountTypes = Array.from(new Set(accounts.map(a => a.account_type)));
  const filteredAccounts = filterBySearchAndCategory(
    accounts,
    searchQuery,
    selectedType,
    (account) => account.name,
    (account) => account.account_type
  ) || [];

  // Stats
  const statsCards = [
    {
      title: 'Total Accounts',
      value: stats?.total_accounts.toString() || '0',
      description: `${stats?.active_accounts || 0} active`,
      icon: Wallet,
    },
    {
      title: 'Net Worth',
      value: stats ? (
        <CurrencyDisplay
          amount={stats.net_worth}
          currency={stats.currency}
          showSymbol={true}
          showCode={false}
        />
      ) : '0',
      description: 'Total balance',
      icon: TrendingUp,
    },
    {
      title: 'Savings Rate',
      value: stats ? `${Math.round((stats.active_accounts / Math.max(stats.total_accounts, 1)) * 100)}%` : '0%',
      description: 'Active accounts',
      icon: PiggyBank,
    },
  ];

  if (isLoading) {
    return (
      <div className="container mx-auto space-y-6 p-6">
        <ModuleHeader
          title="Savings & Accounts"
          description="Track your savings accounts, investments, and net worth"
          actionLabel="Add Account"
          onAction={() => setIsFormOpen(true)}
        />
        <LoadingCards count={3} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto space-y-6 p-6">
        <ModuleHeader
          title="Savings & Accounts"
          description="Track your savings accounts, investments, and net worth"
        />
        <ApiErrorState error={error} onRetry={refetch} />
      </div>
    );
  }

  const hasAccounts = accounts.length > 0;
  const hasFilteredResults = filteredAccounts.length > 0;

  return (
    <div className="container mx-auto space-y-6 p-6">
      <ModuleHeader
        title="Savings & Accounts"
        description="Track your savings accounts, investments, and net worth"
        actionLabel="Add Account"
        onAction={() => setIsFormOpen(true)}
      />

      {stats && <StatsCards stats={statsCards} />}

      {/* Accounts List */}
      <div>
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between min-h-[38px]">
          <h2 className="text-xl font-semibold">Accounts</h2>
        </div>

        {/* Search and Type Filter */}
        {hasAccounts && (
          <div className="mb-4">
            <SearchFilter
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedCategory={selectedType}
              onCategoryChange={(cat) => setSelectedType(cat || '')}
              categories={accountTypes}
              searchPlaceholder="Search accounts..."
              categoryPlaceholder="All Types"
              categoryLabels={ACCOUNT_TYPE_LABELS}
            />
          </div>
        )}

        {!hasAccounts ? (
        <EmptyState
          icon={Wallet}
          title="No savings accounts yet"
          description="Start tracking your savings by adding your first account"
          actionLabel="Add Account"
          onAction={() => setIsFormOpen(true)}
        />
      ) : !hasFilteredResults ? (
        <EmptyState
          icon={Wallet}
          title="No accounts found"
          description="Try adjusting your search or filters"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredAccounts.map((account) => (
            <Card key={account.id} className="relative">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{account.name}</CardTitle>
                    <CardDescription className="mt-1 min-h-[20px]">
                      {account.institution || '\u00A0'}
                    </CardDescription>
                  </div>
                  <Badge variant={account.is_active ? 'default' : 'secondary'}>
                    {account.is_active ? 'Active' : 'Inactive'}
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

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(account.id)}
                    >
                      <Edit className="mr-1 h-3 w-3" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeletingAccount(account)}
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
        title="Delete Account"
        description={deletingAccount ? `Are you sure you want to delete "${deletingAccount.name}"? This action cannot be undone.` : ''}
        itemName="account"
      />
    </div>
  );
}
