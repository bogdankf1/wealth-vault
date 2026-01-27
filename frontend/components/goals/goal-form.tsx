/**
 * Goal Form Component
 * Form for creating and editing financial goals
 */
'use client';

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import * as z from 'zod';
import {
  useCreateGoalMutation,
  useUpdateGoalMutation,
  useGetGoalQuery,
  useGetLinkedAccountsQuery,
  useLinkAccountToGoalMutation,
  useUnlinkAccountFromGoalMutation,
  useRefreshGoalProgressMutation,
} from '@/lib/api/goalsApi';
import { useListAccountsQuery } from '@/lib/api/savingsApi';
import { useGetMyPreferencesQuery } from '@/lib/api/preferencesApi';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingForm } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { CurrencyInput } from '@/components/currency/currency-input';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils/currency';
import { AccountSelect } from '@/components/ui/account-select';

// Form validation schema
const goalSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  category: z.string().max(50).optional(),
  target_amount: z.number()
    .gt(0, 'Target amount must be greater than 0')
    .refine(
      (val) => {
        // Check if number has more than 2 decimal places
        // Use toFixed to round to 2 decimals and compare
        const rounded = Math.round(val * 100) / 100;
        return Math.abs(val - rounded) < 0.00001; // Allow for floating point precision
      },
      { message: 'Amount can have at most 2 decimal places' }
    ),
  current_amount: z.number().min(0, 'Current amount cannot be negative'),
  currency: z.string().length(3),
  monthly_contribution: z.number().min(0).optional(),
  is_active: z.boolean(),
  auto_track_progress: z.boolean(),
  start_date: z.string().min(1, 'Start date is required'),
  target_date: z.string().optional(),
});

type FormData = z.infer<typeof goalSchema>;

interface GoalFormProps {
  goalId?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function GoalForm({ goalId, isOpen, onClose }: GoalFormProps) {
  const isEditing = Boolean(goalId);

  // Translations
  const tForm = useTranslations('goals.form');
  const tActions = useTranslations('goals.actions');
  const tCategories = useTranslations('goals.categories');

  // User preferences for default currency
  const { data: preferences } = useGetMyPreferencesQuery();
  const defaultCurrency = preferences?.display_currency || preferences?.currency || 'USD';

  // Category options with translations
  const CATEGORY_OPTIONS = [
    { value: 'home_property', label: tCategories('homeProperty') },
    { value: 'vehicle', label: tCategories('vehicle') },
    { value: 'education', label: tCategories('education') },
    { value: 'wedding', label: tCategories('wedding') },
    { value: 'travel_vacation', label: tCategories('travelVacation') },
    { value: 'emergency_fund', label: tCategories('emergencyFund') },
    { value: 'major_purchase', label: tCategories('majorPurchase') },
    { value: 'general_savings', label: tCategories('generalSavings') },
    { value: 'retirement', label: tCategories('retirement') },
    { value: 'other', label: tCategories('other') },
  ];

  // Legacy mapping for old category values to new keys
  const GOAL_CATEGORY_MAP: Record<string, string> = {
    'Home/Property': 'home_property',
    'Vehicle': 'vehicle',
    'Education': 'education',
    'Wedding': 'wedding',
    'Travel': 'travel_vacation',
    'Travel/Vacation': 'travel_vacation',
    'Emergency Fund': 'emergency_fund',
    'Major Purchase': 'major_purchase',
    'General Savings': 'general_savings',
    'Retirement': 'retirement',
    'Other': 'other',
  };

  // Helper to convert legacy category name to key
  const getCategoryKey = (category: string | undefined | null): string => {
    if (!category) return '';
    // Check legacy mapping first
    if (GOAL_CATEGORY_MAP[category]) {
      return GOAL_CATEGORY_MAP[category];
    }
    // If it's already a valid key, return it
    const validKeys = CATEGORY_OPTIONS.map(opt => opt.value);
    if (validKeys.includes(category)) {
      return category;
    }
    return category;
  };

  // Local state to track the string value of inputs while user is typing
  const [targetAmountInput, setTargetAmountInput] = React.useState<string>('');
  const [currentAmountInput, setCurrentAmountInput] = React.useState<string>('');
  const [monthlyContributionInput, setMonthlyContributionInput] = React.useState<string>('');

  const {
    data: existingGoal,
    isLoading: isLoadingGoal,
    error: loadError,
  } = useGetGoalQuery(goalId!, {
    skip: !goalId,
  });

  const [createGoal, { isLoading: isCreating, error: createError }] =
    useCreateGoalMutation();

  const [updateGoal, { isLoading: isUpdating, error: updateError }] =
    useUpdateGoalMutation();

  // Account linking hooks
  const { data: linkedAccounts = [] } = useGetLinkedAccountsQuery(
    goalId!,
    { skip: !goalId }
  );

  // Always load accounts (for both new and edit)
  const { data: savingsAccountsData } = useListAccountsQuery(
    { page_size: 100, is_active: true }
  );

  const [linkAccount, { isLoading: isLinking }] = useLinkAccountToGoalMutation();
  const [unlinkAccount, { isLoading: isUnlinking }] = useUnlinkAccountFromGoalMutation();
  const [refreshProgress] = useRefreshGoalProgressMutation();

  // Selected account for new goals (will be linked after creation)
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');

  // State for adding accounts with allocation options (edit mode)
  const [addingAccountId, setAddingAccountId] = useState<string>('');
  const [addingAllocationType, setAddingAllocationType] = useState<'full' | 'percentage' | 'fixed'>('full');
  const [addingPercentage, setAddingPercentage] = useState<string>('100');
  const [addingFixedAmount, setAddingFixedAmount] = useState<string>('');

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(goalSchema),
    defaultValues: {
      currency: 'USD',
      is_active: true,
      auto_track_progress: true,
      current_amount: 0,
      start_date: new Date().toISOString().split('T')[0],
    },
  });

  // Load existing goal data or reset for new goal
  useEffect(() => {
    if (isEditing && existingGoal) {
      const categoryKey = getCategoryKey(existingGoal.category);
      const formData = {
        name: existingGoal.name,
        description: existingGoal.description || '',
        category: categoryKey,
        target_amount: typeof existingGoal.target_amount === 'string'
          ? parseFloat(existingGoal.target_amount)
          : existingGoal.target_amount,
        current_amount: typeof existingGoal.current_amount === 'string'
          ? parseFloat(existingGoal.current_amount)
          : existingGoal.current_amount,
        currency: existingGoal.currency,
        monthly_contribution: existingGoal.monthly_contribution
          ? (typeof existingGoal.monthly_contribution === 'string'
            ? parseFloat(existingGoal.monthly_contribution)
            : existingGoal.monthly_contribution)
          : 0,
        is_active: existingGoal.is_active,
        auto_track_progress: existingGoal.auto_track_progress || false,
        // Extract date directly from string to avoid timezone conversion
        start_date: existingGoal.start_date.split('T')[0],
        target_date: existingGoal.target_date
          ? existingGoal.target_date.split('T')[0]
          : '',
      };

      reset(formData);

      // Set the input string values - parse to number first to remove any .00
      const targetAmountNum = typeof existingGoal.target_amount === 'string'
        ? parseFloat(existingGoal.target_amount)
        : existingGoal.target_amount;
      setTargetAmountInput(String(targetAmountNum));

      const currentAmountNum = typeof existingGoal.current_amount === 'string'
        ? parseFloat(existingGoal.current_amount)
        : (existingGoal.current_amount || 0);
      setCurrentAmountInput(String(currentAmountNum));

      const monthlyContribNum = existingGoal.monthly_contribution
        ? (typeof existingGoal.monthly_contribution === 'string'
          ? parseFloat(existingGoal.monthly_contribution)
          : existingGoal.monthly_contribution)
        : 0;
      setMonthlyContributionInput(String(monthlyContribNum));

      setTimeout(() => {
        if (categoryKey) {
          setValue('category', categoryKey, { shouldDirty: true });
        }
        setValue('currency', existingGoal.currency, { shouldDirty: true });
      }, 0);
    } else if (!isEditing && isOpen) {
      reset({
        name: '',
        description: '',
        category: '',
        target_amount: 0,
        current_amount: 0,
        currency: defaultCurrency,
        monthly_contribution: 0,
        is_active: true,
        auto_track_progress: true,
        start_date: new Date().toISOString().split('T')[0],
        target_date: '',
      });
      setTargetAmountInput('');
      setCurrentAmountInput('');
      setMonthlyContributionInput('');
      setSelectedAccountId('');
    }
  }, [isEditing, existingGoal, isOpen, reset, setValue, defaultCurrency]);

  // Set selected account from linked accounts when editing
  useEffect(() => {
    if (isEditing && linkedAccounts.length > 0) {
      setSelectedAccountId(linkedAccounts[0].account_id);
    }
  }, [isEditing, linkedAccounts]);

  const onSubmit = async (data: FormData) => {
    try {
      const submitData: {
        name: string;
        description?: string;
        category?: string;
        target_amount: number;
        current_amount: number;
        currency: string;
        monthly_contribution?: number;
        is_active: boolean;
        auto_track_progress: boolean;
        start_date: string;
        target_date?: string;
      } = {
        name: data.name,
        description: data.description,
        category: data.category,
        target_amount: data.target_amount,
        current_amount: data.current_amount,
        currency: data.currency,
        monthly_contribution: data.monthly_contribution,
        is_active: data.is_active,
        auto_track_progress: data.auto_track_progress,
        // Keep date-only format to avoid timezone issues
        start_date: `${data.start_date}T00:00:00`,
        target_date: data.target_date ? `${data.target_date}T00:00:00` : undefined,
      };

      if (isEditing && goalId) {
        await updateGoal({ id: goalId, data: submitData }).unwrap();
        toast.success(tForm('updateSuccess'));
      } else {
        // Create goal and link account if selected
        const newGoal = await createGoal(submitData).unwrap();

        // Link account after goal creation if auto-track is enabled and account selected
        if (data.auto_track_progress && selectedAccountId && selectedAccountId !== 'none') {
          try {
            await linkAccount({
              goalId: newGoal.id,
              data: {
                account_id: selectedAccountId,
                allocation_type: 'full',
              },
            }).unwrap();

            // Refresh progress to update current amount from linked account
            await refreshProgress(newGoal.id).catch(() => {});
          } catch {
            // Goal created but account linking failed - show warning
            toast.warning(tForm('createSuccessLinkFailed'));
          }
        }

        toast.success(tForm('createSuccess'));
      }

      onClose();
      reset();
      setSelectedAccountId('');
    } catch {
      toast.error(isEditing ? tForm('updateError') : tForm('createError'));
    }
  };

  const handleClose = () => {
    onClose();
    setTargetAmountInput('');
    setCurrentAmountInput('');
    setMonthlyContributionInput('');
    setSelectedAccountId('');
    reset({
      currency: defaultCurrency,
      is_active: true,
      auto_track_progress: true,
      current_amount: 0,
      start_date: new Date().toISOString().split('T')[0],
    });
  };

  const isLoading = isCreating || isUpdating;
  const error = createError || updateError || loadError;

  // Get all available savings accounts
  const allAccounts = savingsAccountsData?.items || [];

  // Get linked account IDs for editing mode
  const linkedAccountIds = linkedAccounts.map(link => link.account_id);

  // Handle unlinking an account (for edit mode)
  const handleUnlinkAccount = async (accountId: string) => {
    if (!goalId) return;

    try {
      await unlinkAccount({ goalId, accountId }).unwrap();
      toast.success(tForm('accountUnlinked'));
      // Clear selection if it was the unlinked account
      if (selectedAccountId === accountId) {
        setSelectedAccountId('');
      }
    } catch {
      toast.error(tForm('unlinkError'));
    }
  };

  // Handle adding a new linked account (for edit mode)
  const handleAddLinkedAccount = async () => {
    if (!goalId || !addingAccountId || addingAccountId === 'none') return;

    try {
      const linkData: {
        account_id: string;
        allocation_type: 'full' | 'percentage' | 'fixed';
        allocation_percentage?: number;
        allocation_amount?: number;
      } = {
        account_id: addingAccountId,
        allocation_type: addingAllocationType,
      };

      if (addingAllocationType === 'percentage') {
        linkData.allocation_percentage = parseFloat(addingPercentage) || 100;
      } else if (addingAllocationType === 'fixed') {
        linkData.allocation_amount = parseFloat(addingFixedAmount) || 0;
      }

      await linkAccount({ goalId, data: linkData }).unwrap();

      // Refresh progress to update current amount from linked accounts
      await refreshProgress(goalId).catch(() => {});

      toast.success(tForm('accountLinked'));

      // Reset adding state
      setAddingAccountId('');
      setAddingAllocationType('full');
      setAddingPercentage('100');
      setAddingFixedAmount('');
    } catch {
      toast.error(tForm('linkError'));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base lg:text-lg">
            {isEditing ? tForm('editTitle') : tForm('addTitle')}
          </DialogTitle>
          <DialogDescription className="text-xs lg:text-sm">
            {isEditing
              ? tForm('editDescription')
              : tForm('addDescription')}
          </DialogDescription>
        </DialogHeader>

        {isLoadingGoal ? (
          <LoadingForm count={6} />
        ) : error ? (
          <ApiErrorState error={error} />
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 lg:space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs lg:text-sm">{tForm('goalName')} *</Label>
              <Input
                id="name"
                placeholder={tForm('goalNamePlaceholder')}
                {...register('name')}
              />
              {errors.name && (
                <p className="text-xs lg:text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-xs lg:text-sm">{tForm('description')}</Label>
              <Textarea
                id="description"
                placeholder={tForm('descriptionPlaceholder')}
                rows={2}
                {...register('description')}
              />
              {errors.description && (
                <p className="text-xs lg:text-sm text-destructive">
                  {errors.description.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="category" className="text-xs lg:text-sm">{tForm('category')}</Label>
              <Select
                value={watch('category') || ''}
                onValueChange={(value) => setValue('category', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={tForm('categoryPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <CurrencyInput
              key={`currency-${existingGoal?.id || 'new'}-${watch('currency')}`}
              label={tForm('targetAmount')}
              amount={targetAmountInput}
              currency={watch('currency')}
              onAmountChange={(value) => {
                // Update the local string state to allow typing decimal points
                setTargetAmountInput(value);

                // Update the form state with the numeric value
                if (value === '') {
                  setValue('target_amount', 0, { shouldValidate: true });
                } else {
                  const numValue = parseFloat(value);
                  if (!isNaN(numValue)) {
                    setValue('target_amount', numValue, { shouldValidate: true });
                  }
                }
              }}
              onCurrencyChange={(value) => setValue('currency', value)}
              required
              error={errors.target_amount?.message}
            />

            {/* Only show Current Amount and Monthly Contribution when auto-track is disabled */}
            {!watch('auto_track_progress') && (
              <div className="grid gap-3 lg:gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="current_amount" className="text-xs lg:text-sm">{tForm('currentAmountSaved')}</Label>
                  <Input
                    id="current_amount"
                    type="text"
                    inputMode="decimal"
                    placeholder={tForm('currentAmountPlaceholder')}
                    value={currentAmountInput}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '' || /^\d*\.?\d*$/.test(value)) {
                        setCurrentAmountInput(value);
                        const numValue = value === '' ? 0 : parseFloat(value);
                        setValue('current_amount', isNaN(numValue) ? 0 : numValue, { shouldValidate: true });
                      }
                    }}
                  />
                  {errors.current_amount && (
                    <p className="text-xs lg:text-sm text-destructive">{errors.current_amount.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="monthly_contribution" className="text-xs lg:text-sm">{tForm('monthlyContribution')}</Label>
                  <Input
                    id="monthly_contribution"
                    type="text"
                    inputMode="decimal"
                    placeholder={tForm('monthlyContributionPlaceholder')}
                    value={monthlyContributionInput}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '' || /^\d*\.?\d*$/.test(value)) {
                        setMonthlyContributionInput(value);
                        const numValue = value === '' ? 0 : parseFloat(value);
                        setValue('monthly_contribution', isNaN(numValue) ? 0 : numValue, { shouldValidate: true });
                      }
                    }}
                  />
                  {errors.monthly_contribution && (
                    <p className="text-xs lg:text-sm text-destructive">
                      {errors.monthly_contribution.message}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="grid gap-3 lg:gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="start_date" className="text-xs lg:text-sm">{tForm('startDate')} *</Label>
                <Input
                  id="start_date"
                  type="date"
                  {...register('start_date')}
                  className="cursor-pointer"
                                  />
                {errors.start_date && (
                  <p className="text-xs lg:text-sm text-destructive">
                    {errors.start_date.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="target_date" className="text-xs lg:text-sm">{tForm('targetDate')}</Label>
                <Input
                  id="target_date"
                  type="date"
                  {...register('target_date')}
                  className="cursor-pointer"
                                  />
                <p className="text-xs text-muted-foreground">
                  {tForm('targetDateDescription')}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="is_active" className="text-xs lg:text-sm">{tForm('activeGoal')}</Label>
              <Switch
                id="is_active"
                checked={watch('is_active')}
                onCheckedChange={(checked: boolean) => setValue('is_active', checked)}
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto_track_progress" className="text-xs lg:text-sm">{tForm('autoTrackProgress')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {tForm('autoTrackProgressDescription')}
                  </p>
                </div>
                <Switch
                  id="auto_track_progress"
                  checked={watch('auto_track_progress')}
                  onCheckedChange={(checked: boolean) => setValue('auto_track_progress', checked)}
                />
              </div>

              {/* Savings Account Selection - shows when auto-track is enabled */}
              {watch('auto_track_progress') && (
                <div className="space-y-2">
                  {/* For new goals: simple dropdown using AccountSelect */}
                  {!isEditing && (
                    <AccountSelect
                      value={selectedAccountId || null}
                      onChange={(accountId) => setSelectedAccountId(accountId || '')}
                      accounts={allAccounts}
                      label={tForm('savingsAccount')}
                      placeholder={tForm('selectAccountPlaceholder')}
                      noAccountLabel={tForm('noAccountSelected')}
                    />
                  )}

                  {/* For editing: show linked accounts with ability to add/remove */}
                  {isEditing && (
                    <>
                    <Label>{tForm('savingsAccount')}</Label>
                    <div className="space-y-2">
                      {/* Show currently linked accounts */}
                      {linkedAccounts.length > 0 && (
                        <div className="space-y-1">
                          {linkedAccounts.map((link) => (
                            <div
                              key={link.id}
                              className="flex items-center justify-between p-2 bg-muted/50 rounded border"
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-sm truncate">
                                  {link.account?.name || tForm('unknownAccount')}
                                </span>
                                <Badge variant="secondary" className="text-xs shrink-0">
                                  {link.allocation_type === 'full'
                                    ? '100%'
                                    : link.allocation_type === 'percentage'
                                    ? `${link.allocation_percentage}%`
                                    : formatCurrency(link.allocation_amount || 0, existingGoal?.currency || 'USD')}
                                </Badge>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleUnlinkAccount(link.account_id)}
                                disabled={isUnlinking}
                                className="h-6 w-6 p-0 shrink-0 ml-2"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Form to add more accounts with allocation options */}
                      {allAccounts.filter(a => !linkedAccountIds.includes(a.id)).length > 0 && (
                        <div className="space-y-2 p-2 border rounded bg-muted/30">
                          <Select
                            value={addingAccountId}
                            onValueChange={setAddingAccountId}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder={tForm('addAnotherAccount')} />
                            </SelectTrigger>
                            <SelectContent>
                              {allAccounts
                                .filter(account => !linkedAccountIds.includes(account.id))
                                .map((account) => (
                                  <SelectItem key={account.id} value={account.id}>
                                    {account.name} ({formatCurrency(account.current_balance, account.currency)})
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>

                          {/* Show allocation options when account is selected */}
                          {addingAccountId && (
                            <div className="space-y-2">
                              <Select
                                value={addingAllocationType}
                                onValueChange={(v) => setAddingAllocationType(v as 'full' | 'percentage' | 'fixed')}
                              >
                                <SelectTrigger className="h-8 text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="full">{tForm('allocationFull')}</SelectItem>
                                  <SelectItem value="percentage">{tForm('allocationPercentage')}</SelectItem>
                                  <SelectItem value="fixed">{tForm('allocationFixed')}</SelectItem>
                                </SelectContent>
                              </Select>

                              {addingAllocationType === 'percentage' && (
                                <Input
                                  type="number"
                                  min="1"
                                  max="100"
                                  placeholder={tForm('percentageValue')}
                                  value={addingPercentage}
                                  onChange={(e) => setAddingPercentage(e.target.value)}
                                  className="h-8 text-sm"
                                />
                              )}

                              {addingAllocationType === 'fixed' && (
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder={tForm('fixedAmount')}
                                  value={addingFixedAmount}
                                  onChange={(e) => setAddingFixedAmount(e.target.value)}
                                  className="h-8 text-sm"
                                />
                              )}

                              <Button
                                type="button"
                                size="sm"
                                onClick={handleAddLinkedAccount}
                                disabled={isLinking}
                                className="w-full h-8 text-sm"
                              >
                                {tForm('linkAccount')}
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} className="text-xs lg:text-sm">
                {tActions('cancel')}
              </Button>
              <Button type="submit" disabled={isLoading} className="text-xs lg:text-sm">
                {isLoading
                  ? tForm('saving')
                  : isEditing
                  ? tForm('update')
                  : tForm('create')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
