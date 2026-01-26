'use client';

import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useEffect, useRef } from 'react';
import {
  useGetGoalQuery,
  useRefreshGoalProgressMutation,
  useLinkAccountToGoalMutation,
  useUnlinkAccountFromGoalMutation,
  useUpdateAccountLinkMutation,
  useGetProgressHistoryQuery,
  useDeleteGoalMutation,
  GoalAccountLink,
  GoalAccountLinkCreate,
} from '@/lib/api/goalsApi';
import { useListAccountsQuery } from '@/lib/api/savingsApi';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiErrorState } from '@/components/ui/error-state';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Target,
  Wallet,
  TrendingUp,
  Calendar,
  Link2,
  Unlink,
  RefreshCw,
  Edit,
  Trash2,
  PiggyBank,
  History,
  Plus,
  Percent,
  DollarSign,
  CheckCircle2,
} from 'lucide-react';
import { GoalForm } from '@/components/goals/goal-form';

export default function GoalDetailPage() {
  const params = useParams();
  const router = useRouter();
  const goalId = params.id as string;

  const t = useTranslations('goals.detail');
  const tForm = useTranslations('goals.form');
  const tCategories = useTranslations('goals.categories');

  // State
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isLinkAccountDialogOpen, setIsLinkAccountDialogOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [allocationType, setAllocationType] = useState<'full' | 'percentage' | 'fixed'>('full');
  const [allocationPercentage, setAllocationPercentage] = useState<string>('100');
  const [allocationAmount, setAllocationAmount] = useState<string>('');

  // Queries
  const { data: goal, isLoading, error, refetch } = useGetGoalQuery(goalId);
  const { data: accountsData } = useListAccountsQuery({ is_active: true });
  const { data: progressHistory } = useGetProgressHistoryQuery({ goalId, page: 1, pageSize: 10 });

  // Mutations
  const [refreshProgress, { isLoading: isRefreshing }] = useRefreshGoalProgressMutation();
  const [linkAccount, { isLoading: isLinking }] = useLinkAccountToGoalMutation();
  const [unlinkAccount] = useUnlinkAccountFromGoalMutation();
  const [deleteGoal, { isLoading: isDeleting }] = useDeleteGoalMutation();

  // Auto-refresh progress on page load for auto-tracking goals
  const hasRefreshedRef = useRef(false);
  useEffect(() => {
    if (goal?.auto_track_progress && goal?.linked_accounts?.length && !hasRefreshedRef.current) {
      hasRefreshedRef.current = true;
      // Silently refresh progress on page load
      refreshProgress(goalId).catch(() => {
        // Silently fail - the data is still shown from the API
      });
    }
  }, [goal?.auto_track_progress, goal?.linked_accounts?.length, goalId, refreshProgress]);

  // Get available accounts (not already linked)
  const linkedAccountIds = goal?.linked_accounts?.map(link => link.account_id) || [];
  const availableAccounts = accountsData?.items.filter(
    account => !linkedAccountIds.includes(account.id)
  ) || [];

  const handleRefreshProgress = async () => {
    try {
      await refreshProgress(goalId).unwrap();
      toast.success(t('progressRefreshed'));
    } catch (error) {
      toast.error(t('refreshError'));
    }
  };

  const handleLinkAccount = async () => {
    if (!selectedAccountId) return;

    const linkData: GoalAccountLinkCreate = {
      account_id: selectedAccountId,
      allocation_type: allocationType,
      allocation_percentage: allocationType === 'percentage' ? parseFloat(allocationPercentage) : undefined,
      allocation_amount: allocationType === 'fixed' ? parseFloat(allocationAmount) : undefined,
    };

    try {
      await linkAccount({ goalId, data: linkData }).unwrap();
      toast.success(t('accountLinked'));
      setIsLinkAccountDialogOpen(false);
      resetLinkForm();
    } catch (error) {
      toast.error(t('linkError'));
    }
  };

  const handleUnlinkAccount = async (accountId: string) => {
    try {
      await unlinkAccount({ goalId, accountId }).unwrap();
      toast.success(t('accountUnlinked'));
    } catch (error) {
      toast.error(t('unlinkError'));
    }
  };

  const handleDeleteGoal = async () => {
    try {
      await deleteGoal(goalId).unwrap();
      toast.success(t('deleteSuccess'));
      router.push('/dashboard/goals/overview');
    } catch (error) {
      toast.error(t('deleteError'));
    }
  };

  const resetLinkForm = () => {
    setSelectedAccountId('');
    setAllocationType('full');
    setAllocationPercentage('100');
    setAllocationAmount('');
  };

  const getCategoryLabel = (category: string | undefined): string => {
    if (!category) return '';
    const key = category
      .split(/[\s_]+/)
      .map((word, index) =>
        index === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      )
      .join('');
    try {
      return tCategories(key as Parameters<typeof tCategories>[0]);
    } catch {
      return category;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !goal) {
    return <ApiErrorState error={error} />;
  }

  const progressValue = Number(goal.progress_percentage) || 0;
  const isCompleted = goal.is_completed;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{goal.name}</h1>
            {goal.description && (
              <p className="text-muted-foreground">{goal.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsEditDialogOpen(true)}>
            <Edit className="h-4 w-4 mr-2" />
            {t('edit')}
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setIsDeleteDialogOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" />
            {t('delete')}
          </Button>
        </div>
      </div>

      {/* Status Badges */}
      <div className="flex gap-2 flex-wrap">
        {goal.category && (
          <Badge variant="secondary">{getCategoryLabel(goal.category)}</Badge>
        )}
        {goal.is_active ? (
          <Badge variant="default">{t('active')}</Badge>
        ) : (
          <Badge variant="outline">{t('inactive')}</Badge>
        )}
        {isCompleted && (
          <Badge variant="default" className="bg-green-600">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {t('completed')}
          </Badge>
        )}
        {goal.auto_track_progress && (
          <Badge variant="outline" className="border-blue-500 text-blue-600">
            <Link2 className="h-3 w-3 mr-1" />
            {t('autoTracking')}
          </Badge>
        )}
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('targetAmount')}</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <CurrencyDisplay
                amount={goal.display_target_amount || goal.target_amount}
                currency={goal.display_currency || goal.currency}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('currentAmount')}</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <CurrencyDisplay
                amount={goal.display_current_amount || goal.current_amount}
                currency={goal.display_currency || goal.currency}
              />
            </div>
            {goal.auto_track_progress && goal.linked_accounts_total !== undefined && (
              <p className="text-xs text-muted-foreground mt-1">
                {t('fromLinkedAccounts')}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('progress')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{progressValue.toFixed(1)}%</div>
            <Progress value={progressValue} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('remaining')}</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <CurrencyDisplay
                amount={Math.max(0, (goal.display_target_amount || goal.target_amount) - (goal.display_current_amount || goal.current_amount))}
                currency={goal.display_currency || goal.currency}
              />
            </div>
            {goal.target_date && (
              <p className="text-xs text-muted-foreground mt-1">
                {t('targetDate')}: {new Date(goal.target_date).toLocaleDateString()}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Linked Accounts Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <PiggyBank className="h-5 w-5" />
              {t('linkedAccounts')}
            </CardTitle>
            <CardDescription>{t('linkedAccountsDescription')}</CardDescription>
          </div>
          <div className="flex gap-2">
            {goal.auto_track_progress && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshProgress}
                disabled={isRefreshing}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                {t('refreshProgress')}
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => setIsLinkAccountDialogOpen(true)}
              disabled={availableAccounts.length === 0}
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('linkAccount')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {goal.linked_accounts && goal.linked_accounts.length > 0 ? (
            <div className="space-y-3">
              {goal.linked_accounts.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-full">
                      <Wallet className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{link.account?.name || t('unknownAccount')}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {link.allocation_type === 'full' && (
                          <span>{t('fullAllocation')}</span>
                        )}
                        {link.allocation_type === 'percentage' && (
                          <span className="flex items-center">
                            <Percent className="h-3 w-3 mr-1" />
                            {link.allocation_percentage}%
                          </span>
                        )}
                        {link.allocation_type === 'fixed' && (
                          <span className="flex items-center">
                            <DollarSign className="h-3 w-3 mr-1" />
                            <CurrencyDisplay
                              amount={link.allocation_amount || 0}
                              currency={link.account?.currency || 'USD'}
                            />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-medium">
                        <CurrencyDisplay
                          amount={link.allocated_amount || 0}
                          currency={link.account?.currency || 'USD'}
                        />
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t('allocatedAmount')}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleUnlinkAccount(link.account_id)}
                    >
                      <Unlink className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}

              {goal.linked_accounts_total !== undefined && (
                <div className="flex justify-between items-center pt-3 border-t">
                  <span className="font-medium">{t('totalFromAccounts')}</span>
                  <span className="text-lg font-bold">
                    <CurrencyDisplay
                      amount={goal.linked_accounts_total}
                      currency={goal.currency}
                    />
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Link2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('noLinkedAccounts')}</p>
              <p className="text-sm mt-1">{t('noLinkedAccountsHint')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Progress History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            {t('progressHistory')}
          </CardTitle>
          <CardDescription>{t('progressHistoryDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {progressHistory && progressHistory.items.length > 0 ? (
            <div className="space-y-3">
              {progressHistory.items.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">
                      <CurrencyDisplay amount={entry.current_amount} currency={goal.currency} />
                      <span className="text-muted-foreground mx-2">/</span>
                      <CurrencyDisplay amount={entry.target_amount} currency={goal.currency} />
                    </p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{new Date(entry.recorded_date).toLocaleDateString()}</span>
                      <Badge variant="outline" className="text-xs">
                        {t(`triggerTypes.${entry.trigger_type}`)}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">{Number(entry.progress_percentage).toFixed(1)}%</p>
                    <Progress value={Number(entry.progress_percentage)} className="w-20 h-2" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('noProgressHistory')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Goal Dialog */}
      <GoalForm
        goalId={goalId}
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
      />

      {/* Link Account Dialog */}
      <Dialog open={isLinkAccountDialogOpen} onOpenChange={setIsLinkAccountDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('linkAccountTitle')}</DialogTitle>
            <DialogDescription>{t('linkAccountDescription')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('selectAccount')}</Label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('selectAccountPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {availableAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      <div className="flex items-center justify-between w-full">
                        <span>{account.name}</span>
                        <span className="text-muted-foreground ml-4">
                          <CurrencyDisplay amount={account.current_balance} currency={account.currency} />
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('allocationType')}</Label>
              <Select
                value={allocationType}
                onValueChange={(value: 'full' | 'percentage' | 'fixed') => setAllocationType(value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">{t('allocationFull')}</SelectItem>
                  <SelectItem value="percentage">{t('allocationPercentage')}</SelectItem>
                  <SelectItem value="fixed">{t('allocationFixed')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {allocationType === 'percentage' && (
              <div className="space-y-2">
                <Label>{t('percentageValue')}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={allocationPercentage}
                    onChange={(e) => setAllocationPercentage(e.target.value)}
                  />
                  <span>%</span>
                </div>
              </div>
            )}

            {allocationType === 'fixed' && (
              <div className="space-y-2">
                <Label>{t('fixedAmount')}</Label>
                <Input
                  type="number"
                  min="0"
                  value={allocationAmount}
                  onChange={(e) => setAllocationAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLinkAccountDialogOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleLinkAccount} disabled={!selectedAccountId || isLinking}>
              {isLinking ? t('linking') : t('link')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteConfirmDescription', { name: goal.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteGoal}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? t('deleting') : t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
