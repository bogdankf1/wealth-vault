/**
 * Income Source Form Component
 * Form for creating and editing income sources
 */
'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';
import {
  useCreateIncomeSourceMutation,
  useUpdateIncomeSourceMutation,
  useGetIncomeSourceQuery,
  IncomeFrequency,
} from '@/lib/api/incomeApi';
import { useGetMyPreferencesQuery } from '@/lib/api/preferencesApi';
import { useListAccountsQuery } from '@/lib/api/savingsApi';
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
import { AccountSelect } from '@/components/ui/account-select';
import { toast } from 'sonner';
import { INCOME_CATEGORY_KEYS, INCOME_CATEGORY_NAME_TO_KEY } from '@/lib/constants/income-categories';

// Form validation schema
const incomeSourceSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  category: z.string().max(50).optional(),
  amount: z.number()
    .min(0, 'Amount must be positive')
    .refine(
      (val) => {
        // Check if number has more than 2 decimal places
        // Use toFixed to round to 2 decimals and compare
        const rounded = Math.round(val * 100) / 100;
        return Math.abs(val - rounded) < 0.00001; // Allow for floating point precision
      },
      { message: 'Amount can have at most 2 decimal places' }
    ),
  currency: z.string().length(3),
  frequency: z.enum([
    'one_time',
    'weekly',
    'biweekly',
    'monthly',
    'quarterly',
    'annually',
  ] as const),
  is_active: z.boolean(),
  date: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  // Account integration fields
  target_account_id: z.string().optional().nullable(),
  auto_deposit: z.boolean(),
  // Sync historical - when enabled, recreates all transactions with new values
  sync_historical: z.boolean(),
});

type FormData = z.infer<typeof incomeSourceSchema>;

interface IncomeSourceFormProps {
  sourceId?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

const FREQUENCY_OPTIONS = [
  { value: 'one_time', label: 'One-time' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually', label: 'Annually' },
];


export function IncomeSourceForm({ sourceId, isOpen, onClose }: IncomeSourceFormProps) {
  const isEditing = Boolean(sourceId);
  const tForm = useTranslations('income.form');
  const tActions = useTranslations('income.actions');
  const tFrequency = useTranslations('income.frequency');
  const tCategories = useTranslations('income.categories');

  const { data: preferences } = useGetMyPreferencesQuery();
  const defaultCurrency = preferences?.display_currency || preferences?.currency || 'USD';

  // Local state to track the string value of amount while user is typing
  const [amountInput, setAmountInput] = React.useState<string>('');

  // Get savings accounts for target account dropdown
  const { data: accountsData } = useListAccountsQuery({
    is_active: true,
    page_size: 100,
  });

  const {
    data: existingSource,
    isLoading: isLoadingSource,
    error: loadError,
  } = useGetIncomeSourceQuery(sourceId!, {
    skip: !sourceId,
  });

  const [createSource, { isLoading: isCreating, error: createError }] =
    useCreateIncomeSourceMutation();

  const [updateSource, { isLoading: isUpdating, error: updateError }] =
    useUpdateIncomeSourceMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(incomeSourceSchema),
    defaultValues: {
      currency: 'USD',
      frequency: 'monthly',
      is_active: true,
      date: new Date().toISOString().split('T')[0],
      target_account_id: null,
      auto_deposit: false,
      sync_historical: false,
    },
  });

  // Helper to convert legacy category name to key
  const getCategoryKey = (category: string | undefined | null): string => {
    if (!category) return '';
    // If it's already a valid key, return it
    if (INCOME_CATEGORY_KEYS.includes(category as typeof INCOME_CATEGORY_KEYS[number])) {
      return category;
    }
    // Convert legacy name to key
    return INCOME_CATEGORY_NAME_TO_KEY[category] || category;
  };

  // Load existing source data or reset for new source
  useEffect(() => {
    if (isEditing && existingSource) {
      const isOneTime = existingSource.frequency === 'one_time';
      const categoryKey = getCategoryKey(existingSource.category);
      const formData = {
        name: existingSource.name,
        description: existingSource.description || '',
        category: categoryKey,
        // Ensure amount is always a number, even if API sends string
        amount: typeof existingSource.amount === 'string'
          ? parseFloat(existingSource.amount)
          : existingSource.amount,
        currency: existingSource.currency,
        frequency: existingSource.frequency as IncomeFrequency,
        is_active: existingSource.is_active,
        // Extract date directly from string to avoid timezone conversion
        date: isOneTime && existingSource.date
          ? existingSource.date.split('T')[0]
          : '',
        start_date: !isOneTime && existingSource.start_date
          ? existingSource.start_date.split('T')[0]
          : '',
        end_date: !isOneTime && existingSource.end_date
          ? existingSource.end_date.split('T')[0]
          : '',
        // Account integration fields
        target_account_id: existingSource.target_account_id || null,
        auto_deposit: existingSource.auto_deposit || false,
        sync_historical: false, // Always start with sync disabled
      };

      // Reset the form with the data
      reset(formData);

      // Set the amount input string
      const amountNum = typeof existingSource.amount === 'string'
        ? parseFloat(existingSource.amount)
        : existingSource.amount;
      setAmountInput(String(amountNum));

      // Explicitly set category, frequency, currency, and target_account_id to ensure Select components update
      // Use setTimeout to ensure this happens after render
      setTimeout(() => {
        if (categoryKey) {
          setValue('category', categoryKey, { shouldDirty: true });
        }
        setValue('frequency', existingSource.frequency as IncomeFrequency, { shouldDirty: true });
        setValue('currency', existingSource.currency, { shouldDirty: true });
        if (existingSource.target_account_id) {
          setValue('target_account_id', existingSource.target_account_id, { shouldDirty: true });
        }
      }, 0);
    } else if (!isEditing && isOpen) {
      // Reset to defaults when creating new source
      reset({
        name: '',
        description: '',
        category: '',
        amount: 0,
        currency: defaultCurrency,
        frequency: 'monthly',
        is_active: true,
        date: '',
        start_date: new Date().toISOString().split('T')[0],
        end_date: '',
        target_account_id: null,
        auto_deposit: false,
        sync_historical: false,
      });
      setAmountInput('');
    }
  }, [isEditing, existingSource, isOpen, reset, setValue, defaultCurrency]);

  const onSubmit = async (data: FormData) => {
    try {
      const isOneTime = data.frequency === 'one_time';

      // Prepare submit data based on frequency type
      const submitData: {
        name: string;
        description?: string;
        category?: string;
        amount: number;
        currency: string;
        frequency: IncomeFrequency;
        is_active: boolean;
        date?: string;
        start_date?: string;
        end_date?: string;
        target_account_id?: string | null;
        auto_deposit: boolean;
        sync_historical?: boolean;
      } = {
        name: data.name,
        description: data.description,
        category: data.category,
        amount: data.amount,
        currency: data.currency,
        frequency: data.frequency,
        is_active: data.is_active,
        target_account_id: data.target_account_id || null,
        auto_deposit: data.auto_deposit,
      };

      // Only include sync_historical when editing
      if (isEditing && data.sync_historical) {
        submitData.sync_historical = true;
      }

      if (isOneTime) {
        // For one-time: use date field (keep date-only format to avoid timezone issues)
        submitData.date = data.date ? `${data.date}T00:00:00` : undefined;
      } else {
        // For recurring: use start_date and end_date (keep date-only format to avoid timezone issues)
        submitData.start_date = data.start_date ? `${data.start_date}T00:00:00` : undefined;
        submitData.end_date = data.end_date ? `${data.end_date}T00:00:00` : undefined;
      }

      if (isEditing && sourceId) {
        await updateSource({ id: sourceId, data: submitData }).unwrap();
        toast.success('Income source updated successfully');
      } else {
        await createSource(submitData).unwrap();
        toast.success('Income source created successfully');
      }

      onClose();
      reset();
    } catch (error) {
      toast.error(isEditing ? 'Failed to update income source' : 'Failed to create income source');
    }
  };

  const handleClose = () => {
    onClose();
    setAmountInput('');
    reset({
      currency: defaultCurrency,
      frequency: 'monthly',
      is_active: true,
      date: new Date().toISOString().split('T')[0],
      target_account_id: null,
      auto_deposit: false,
      sync_historical: false,
    });
  };

  const isLoading = isCreating || isUpdating;
  const error = createError || updateError || loadError;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base lg:text-lg">
            {isEditing ? tForm('editTitle') : tForm('addTitle')}
          </DialogTitle>
          <DialogDescription className="text-xs lg:text-sm">
            {isEditing ? tForm('editDescription') : tForm('addDescription')}
          </DialogDescription>
        </DialogHeader>

        {isLoadingSource ? (
          <LoadingForm count={6} />
        ) : error ? (
          <ApiErrorState error={error} />
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 lg:space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs lg:text-sm">{tForm('name')} *</Label>
              <Input
                id="name"
                placeholder={tForm('namePlaceholder')}
                {...register('name')}
              />
              {errors.name && (
                <p className="text-xs lg:text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description" className="text-xs lg:text-sm">{tForm('description')}</Label>
              <Textarea
                id="description"
                placeholder={tForm('descriptionPlaceholder')}
                rows={3}
                {...register('description')}
              />
              {errors.description && (
                <p className="text-xs lg:text-sm text-destructive">
                  {errors.description.message}
                </p>
              )}
            </div>

            {/* Category */}
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
                  {INCOME_CATEGORY_KEYS.map((key) => (
                    <SelectItem key={key} value={key}>
                      {tCategories(key)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Amount and Currency */}
            <CurrencyInput
              key={`currency-${existingSource?.id || 'new'}-${watch('currency')}`}
              label={tForm('amount')}
              amount={amountInput}
              currency={watch('currency')}
              onAmountChange={(value) => {
                // Update the local string state to allow typing decimal points
                setAmountInput(value);

                // Update the form state with the numeric value
                // Allow empty string, otherwise parse the number
                if (value === '') {
                  setValue('amount', 0, { shouldValidate: true });
                } else {
                  const numValue = parseFloat(value);
                  if (!isNaN(numValue)) {
                    setValue('amount', numValue, { shouldValidate: true });
                  }
                }
              }}
              onCurrencyChange={(value) => setValue('currency', value)}
              required
              error={errors.amount?.message}
            />

            {/* Frequency */}
            <div className="space-y-2">
              <Label htmlFor="frequency" className="text-xs lg:text-sm">{tForm('frequency')} *</Label>
              <Select
                value={watch('frequency')}
                onValueChange={(value) =>
                  setValue('frequency', value as IncomeFrequency)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {tFrequency(option.value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Fields - Conditional based on frequency */}
            {watch('frequency') === 'one_time' ? (
              <div className="space-y-2">
                <Label htmlFor="date" className="text-xs lg:text-sm">{tForm('date')}</Label>
                <Input
                  id="date"
                  type="date"
                  {...register('date')}
                  className="cursor-pointer"
                                  />
              </div>
            ) : (
              <div className="grid gap-3 lg:gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="start_date" className="text-xs lg:text-sm">{tForm('startDate')}</Label>
                  <Input
                    id="start_date"
                    type="date"
                    {...register('start_date')}
                    className="cursor-pointer"
                                      />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_date" className="text-xs lg:text-sm">{tForm('endDate')}</Label>
                  <Input
                    id="end_date"
                    type="date"
                    {...register('end_date')}
                    className="cursor-pointer"
                                      />
                </div>
              </div>
            )}

            {/* Active Status */}
            <div className="flex items-center justify-between">
              <Label htmlFor="is_active" className="text-xs lg:text-sm">{tForm('isActive')}</Label>
              <Switch
                id="is_active"
                checked={watch('is_active')}
                onCheckedChange={(checked: boolean) => setValue('is_active', checked)}
              />
            </div>

            {/* Account Integration Section */}
            <div className="border-t pt-3 lg:pt-4 mt-3 lg:mt-4 space-y-3 lg:space-y-4">
              <h4 className="text-xs lg:text-sm font-medium text-muted-foreground">
                {tForm('accountIntegration')}
              </h4>

              {/* Target Account */}
              <AccountSelect
                value={watch('target_account_id')}
                onChange={(accountId) => setValue('target_account_id', accountId)}
                accounts={accountsData?.items}
                label={tForm('targetAccount')}
                placeholder={tForm('targetAccountPlaceholder')}
                noAccountLabel={tForm('noTargetAccount')}
                helpText={tForm('targetAccountHelp')}
              />

              {/* Auto Deposit */}
              {watch('target_account_id') && watch('target_account_id') !== 'none' && (
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="auto_deposit" className="text-xs lg:text-sm">{tForm('autoDeposit')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {tForm('autoDepositHelp')}
                    </p>
                  </div>
                  <Switch
                    id="auto_deposit"
                    checked={watch('auto_deposit')}
                    onCheckedChange={(checked: boolean) => setValue('auto_deposit', checked)}
                  />
                </div>
              )}

              {/* Sync Historical - only show when editing with auto_deposit enabled */}
              {isEditing && watch('auto_deposit') && watch('target_account_id') && watch('target_account_id') !== 'none' && (
                <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="sync_historical" className="text-xs lg:text-sm text-amber-800 dark:text-amber-200">
                      {tForm('syncHistorical')}
                    </Label>
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      {tForm('syncHistoricalHelp')}
                    </p>
                  </div>
                  <Switch
                    id="sync_historical"
                    checked={watch('sync_historical')}
                    onCheckedChange={(checked: boolean) => setValue('sync_historical', checked)}
                  />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} className="text-xs lg:text-sm">
                {tActions('cancel')}
              </Button>
              <Button type="submit" disabled={isLoading} className="text-xs lg:text-sm">
                {isLoading ? tForm('saving') : tActions('save')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
