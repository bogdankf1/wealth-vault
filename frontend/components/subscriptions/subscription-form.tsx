/**
 * Subscription Form Component
 * Form for creating and editing subscriptions
 */
'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';
import {
  useCreateSubscriptionMutation,
  useUpdateSubscriptionMutation,
  useGetSubscriptionQuery,
  SubscriptionFrequency,
} from '@/lib/api/subscriptionsApi';
import { useListAccountsQuery } from '@/lib/api/savingsApi';
import { formatCurrency } from '@/lib/utils/currency';
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
import { toast } from 'sonner';

// Form validation schema
const subscriptionSchema = z.object({
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
  frequency: z.enum(['monthly', 'quarterly', 'biannually', 'annually'] as const),
  is_active: z.boolean(),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().optional(),
  // Payment integration fields
  payment_account_id: z.string().optional().nullable(),
  auto_pay: z.boolean().optional(),
  sync_historical: z.boolean().optional(),
  reminder_days_before: z.number().min(0).max(30).optional(),
});

type FormData = z.infer<typeof subscriptionSchema>;

interface SubscriptionFormProps {
  subscriptionId?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function SubscriptionForm({ subscriptionId, isOpen, onClose }: SubscriptionFormProps) {
  // Translation hooks
  const tForm = useTranslations('subscriptions.form');
  const tActions = useTranslations('subscriptions.actions');
  const tCategories = useTranslations('subscriptions.categories');
  const tFrequencies = useTranslations('subscriptions.frequencies');

  const FREQUENCY_OPTIONS = [
    { value: 'monthly', label: tFrequencies('monthly') },
    { value: 'quarterly', label: tFrequencies('quarterly') },
    { value: 'biannually', label: tFrequencies('biannually') },
    { value: 'annually', label: tFrequencies('annually') },
  ];

  const CATEGORY_OPTIONS = [
    { value: 'Cloud Storage', label: tCategories('cloudStorage') },
    { value: 'Music', label: tCategories('music') },
    { value: 'Video', label: tCategories('video') },
    { value: 'Education', label: tCategories('education') },
    { value: 'Cell Service', label: tCategories('cellService') },
    { value: 'Side Projects', label: tCategories('sideProjects') },
    { value: 'AI Tools', label: tCategories('aiTools') },
    { value: 'Gaming', label: tCategories('gaming') },
    { value: 'Miscellaneous', label: tCategories('miscellaneous') },
  ];

  const isEditing = Boolean(subscriptionId);

  // Local state to track the string value of amount while user is typing
  const [amountInput, setAmountInput] = React.useState<string>('');

  // Get savings accounts for payment account dropdown
  const { data: accountsData } = useListAccountsQuery({
    is_active: true,
    page_size: 100,
  });

  const {
    data: existingSubscription,
    isLoading: isLoadingSubscription,
    error: loadError,
  } = useGetSubscriptionQuery(subscriptionId!, {
    skip: !subscriptionId,
  });

  const [createSubscription, { isLoading: isCreating, error: createError }] =
    useCreateSubscriptionMutation();

  const [updateSubscription, { isLoading: isUpdating, error: updateError }] =
    useUpdateSubscriptionMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(subscriptionSchema),
    defaultValues: {
      currency: 'USD',
      frequency: 'monthly',
      is_active: true,
      start_date: new Date().toISOString().split('T')[0],
      payment_account_id: null,
      auto_pay: false,
      sync_historical: false,
      reminder_days_before: 3,
    },
  });

  // Load existing subscription data or reset for new subscription
  useEffect(() => {
    if (isEditing && existingSubscription) {
      const formData = {
        name: existingSubscription.name,
        description: existingSubscription.description || '',
        category: existingSubscription.category || '',
        amount: typeof existingSubscription.amount === 'string'
          ? parseFloat(existingSubscription.amount)
          : existingSubscription.amount,
        currency: existingSubscription.currency,
        frequency: existingSubscription.frequency as SubscriptionFrequency,
        is_active: existingSubscription.is_active,
        // Extract date directly from string to avoid timezone conversion
        start_date: existingSubscription.start_date.split('T')[0],
        end_date: existingSubscription.end_date
          ? existingSubscription.end_date.split('T')[0]
          : '',
        // Payment integration fields
        payment_account_id: existingSubscription.payment_account_id || null,
        auto_pay: existingSubscription.auto_pay || false,
        sync_historical: false, // Always reset sync_historical when editing
        reminder_days_before: existingSubscription.reminder_days_before ?? 3,
      };

      reset(formData);

      // Set the amount input string
      const amountNum = typeof existingSubscription.amount === 'string'
        ? parseFloat(existingSubscription.amount)
        : existingSubscription.amount;
      setAmountInput(String(amountNum));

      // Use setTimeout to ensure controlled components (Select, Switch) are properly updated
      setTimeout(() => {
        if (existingSubscription.category) {
          setValue('category', existingSubscription.category, { shouldDirty: true });
        }
        setValue('frequency', existingSubscription.frequency as SubscriptionFrequency, { shouldDirty: true });
        setValue('currency', existingSubscription.currency, { shouldDirty: true });
        if (existingSubscription.payment_account_id) {
          setValue('payment_account_id', existingSubscription.payment_account_id, { shouldDirty: true });
        }
        // Explicitly set auto_pay and reminder_days_before for controlled components
        setValue('auto_pay', Boolean(existingSubscription.auto_pay), { shouldDirty: true });
        setValue('reminder_days_before', existingSubscription.reminder_days_before ?? 3, { shouldDirty: true });
      }, 10);
    } else if (!isEditing && isOpen) {
      reset({
        name: '',
        description: '',
        category: '',
        amount: 0,
        currency: 'USD',
        frequency: 'monthly',
        is_active: true,
        start_date: new Date().toISOString().split('T')[0],
        end_date: '',
        payment_account_id: null,
        auto_pay: false,
        sync_historical: false,
        reminder_days_before: 3,
      });
      setAmountInput('');
    }
  }, [isEditing, existingSubscription, isOpen, reset, setValue, tForm]);

  const onSubmit = async (data: FormData) => {
    try {
      const submitData: {
        name: string;
        description?: string;
        category?: string;
        amount: number;
        currency: string;
        frequency: SubscriptionFrequency;
        is_active: boolean;
        start_date: string;
        end_date?: string;
        payment_account_id?: string | null;
        auto_pay?: boolean;
        sync_historical?: boolean;
        reminder_days_before?: number;
      } = {
        name: data.name,
        description: data.description,
        category: data.category,
        amount: data.amount,
        currency: data.currency,
        frequency: data.frequency,
        is_active: data.is_active,
        // Keep date-only format to avoid timezone issues
        start_date: `${data.start_date}T00:00:00`,
        end_date: data.end_date ? `${data.end_date}T00:00:00` : undefined,
        // Payment integration fields
        payment_account_id: data.payment_account_id || null,
        auto_pay: data.auto_pay,
        sync_historical: data.sync_historical,
        reminder_days_before: data.reminder_days_before,
      };

      if (isEditing && subscriptionId) {
        await updateSubscription({ id: subscriptionId, data: submitData }).unwrap();
        toast.success(tForm('updateSuccess'));
      } else {
        await createSubscription(submitData).unwrap();
        toast.success(tForm('createSuccess'));
      }

      onClose();
      reset();
    } catch (error) {
      toast.error(isEditing ? tForm('updateError') : tForm('createError'));
    }
  };

  const handleClose = () => {
    onClose();
    setAmountInput('');
    reset({
      currency: 'USD',
      frequency: 'monthly',
      is_active: true,
      start_date: new Date().toISOString().split('T')[0],
      payment_account_id: null,
      auto_pay: false,
      sync_historical: false,
      reminder_days_before: 3,
    });
  };

  const isLoading = isCreating || isUpdating;
  const error = createError || updateError || loadError;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? tForm('editTitle') : tForm('addTitle')}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? tForm('editDescription') : tForm('addDescription')}
          </DialogDescription>
        </DialogHeader>

        {isLoadingSubscription ? (
          <LoadingForm count={6} />
        ) : error ? (
          <ApiErrorState error={error} />
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{tForm('subscriptionName')} *</Label>
              <Input
                id="name"
                placeholder={tForm('subscriptionNamePlaceholder')}
                {...register('name')}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{tForm('description')}</Label>
              <Textarea
                id="description"
                placeholder={tForm('descriptionPlaceholder')}
                rows={3}
                {...register('description')}
              />
              {errors.description && (
                <p className="text-sm text-destructive">
                  {errors.description.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">{tForm('category')}</Label>
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
              key={`currency-${existingSubscription?.id || 'new'}-${watch('currency')}`}
              label={tForm('amount')}
              amount={amountInput}
              currency={watch('currency')}
              onAmountChange={(value) => {
                // Update the local string state to allow typing decimal points
                setAmountInput(value);

                // Update the form state with the numeric value
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

            <div className="space-y-2">
              <Label htmlFor="frequency">{tForm('frequency')} *</Label>
              <Select
                value={watch('frequency')}
                onValueChange={(value) =>
                  setValue('frequency', value as SubscriptionFrequency)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={tForm('frequencyPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="start_date">{tForm('startDate')} *</Label>
                <Input
                  id="start_date"
                  type="date"
                  {...register('start_date')}
                  className="cursor-pointer"
                                  />
                {errors.start_date && (
                  <p className="text-sm text-destructive">
                    {errors.start_date.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">{tForm('endDate')}</Label>
                <Input
                  id="end_date"
                  type="date"
                  {...register('end_date')}
                  className="cursor-pointer"
                                  />
                <p className="text-xs text-muted-foreground">{tForm('endDateDescription')}</p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">{tForm('activeSubscription')}</Label>
              <Switch
                id="is_active"
                checked={watch('is_active')}
                onCheckedChange={(checked: boolean) => setValue('is_active', checked)}
              />
            </div>

            {/* Payment Integration Section */}
            <div className="space-y-4 border-t pt-4 mt-4">
              <h3 className="text-base font-semibold text-foreground">{tForm('accountIntegration')}</h3>

              {/* Payment Account */}
              <div className="space-y-2">
                <Label htmlFor="payment_account_id">{tForm('paymentAccount')}</Label>
                <Select
                  value={watch('payment_account_id') || 'none'}
                  onValueChange={(value) => {
                    const accountId = value === 'none' ? null : value;
                    setValue('payment_account_id', accountId);
                    // Auto-enable auto_pay and sync_historical when account is selected
                    if (accountId) {
                      setValue('auto_pay', true);
                      setValue('sync_historical', true);
                    } else {
                      setValue('auto_pay', false);
                      setValue('sync_historical', false);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={tForm('paymentAccountPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{tForm('noPaymentAccount')}</SelectItem>
                    {accountsData?.items?.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        <div className="flex justify-between items-center w-full gap-2">
                          <span>{account.name}</span>
                          <span className="text-muted-foreground text-xs">
                            {formatCurrency(account.current_balance || 0, account.currency)}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {tForm('paymentAccountHelp')}
                </p>
              </div>

              {/* Auto Pay Toggle - only visible when payment account is selected */}
              {watch('payment_account_id') && watch('payment_account_id') !== 'none' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="auto_pay">{tForm('autoPay')}</Label>
                      <p className="text-xs text-muted-foreground">
                        {tForm('autoPayHelp')}
                      </p>
                    </div>
                    <Switch
                      id="auto_pay"
                      checked={watch('auto_pay') || false}
                      onCheckedChange={(checked: boolean) => {
                        setValue('auto_pay', checked);
                        // Auto-enable sync_historical when auto_pay is turned on
                        if (checked) {
                          setValue('sync_historical', true);
                        }
                      }}
                    />
                  </div>

                  {/* Sync Historical Checkbox - only visible when auto_pay is enabled */}
                  {watch('auto_pay') && (
                    <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50">
                      <input
                        type="checkbox"
                        id="sync_historical"
                        checked={watch('sync_historical') || false}
                        onChange={(e) => setValue('sync_historical', e.target.checked)}
                        className="mt-1"
                      />
                      <div className="space-y-0.5">
                        <Label htmlFor="sync_historical" className="text-sm font-normal cursor-pointer">
                          {tForm('syncHistorical')}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {tForm('syncHistoricalHelp')}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Reminder Days Before */}
                  <div className="space-y-2">
                    <Label htmlFor="reminder_days_before">{tForm('reminderDaysBefore')}</Label>
                    <Input
                      id="reminder_days_before"
                      type="number"
                      min={0}
                      max={30}
                      {...register('reminder_days_before', { valueAsNumber: true })}
                    />
                    <p className="text-xs text-muted-foreground">
                      {tForm('reminderDaysBeforeHelp')}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                {tActions('cancel')}
              </Button>
              <Button type="submit" disabled={isLoading}>
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
