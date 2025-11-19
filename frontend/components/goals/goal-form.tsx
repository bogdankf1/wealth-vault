/**
 * Goal Form Component
 * Form for creating and editing financial goals
 */
'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import * as z from 'zod';
import {
  useCreateGoalMutation,
  useUpdateGoalMutation,
  useGetGoalQuery,
} from '@/lib/api/goalsApi';
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
      current_amount: 0,
      start_date: new Date().toISOString().split('T')[0],
    },
  });

  // Load existing goal data or reset for new goal
  useEffect(() => {
    if (isEditing && existingGoal) {
      const formData = {
        name: existingGoal.name,
        description: existingGoal.description || '',
        category: existingGoal.category || '',
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
        if (existingGoal.category) {
          setValue('category', existingGoal.category, { shouldDirty: true });
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
        currency: 'USD',
        monthly_contribution: 0,
        is_active: true,
        start_date: new Date().toISOString().split('T')[0],
        target_date: '',
      });
      setTargetAmountInput('');
      setCurrentAmountInput('');
      setMonthlyContributionInput('');
    }
  }, [isEditing, existingGoal, isOpen, reset, setValue]);

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
        // Keep date-only format to avoid timezone issues
        start_date: `${data.start_date}T00:00:00`,
        target_date: data.target_date ? `${data.target_date}T00:00:00` : undefined,
      };

      if (isEditing && goalId) {
        await updateGoal({ id: goalId, data: submitData }).unwrap();
        toast.success(tForm('updateSuccess'));
      } else {
        await createGoal(submitData).unwrap();
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
    setTargetAmountInput('');
    setCurrentAmountInput('');
    setMonthlyContributionInput('');
    reset({
      currency: 'USD',
      is_active: true,
      current_amount: 0,
      start_date: new Date().toISOString().split('T')[0],
    });
  };

  const isLoading = isCreating || isUpdating;
  const error = createError || updateError || loadError;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? tForm('editTitle') : tForm('addTitle')}
          </DialogTitle>
          <DialogDescription>
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
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{tForm('goalName')} *</Label>
              <Input
                id="name"
                placeholder={tForm('goalNamePlaceholder')}
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
                rows={2}
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="current_amount">{tForm('currentAmountSaved')}</Label>
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
                  <p className="text-sm text-destructive">{errors.current_amount.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="monthly_contribution">{tForm('monthlyContribution')}</Label>
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
                  <p className="text-sm text-destructive">
                    {errors.monthly_contribution.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="start_date">{tForm('startDate')} *</Label>
                <Input
                  id="start_date"
                  type="date"
                  {...register('start_date')}
                  className="cursor-pointer"
                  style={{ colorScheme: 'light' }}
                />
                {errors.start_date && (
                  <p className="text-sm text-destructive">
                    {errors.start_date.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="target_date">{tForm('targetDate')}</Label>
                <Input
                  id="target_date"
                  type="date"
                  {...register('target_date')}
                  className="cursor-pointer"
                  style={{ colorScheme: 'light' }}
                />
                <p className="text-xs text-muted-foreground">
                  {tForm('targetDateDescription')}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">{tForm('activeGoal')}</Label>
              <Switch
                id="is_active"
                checked={watch('is_active')}
                onCheckedChange={(checked: boolean) => setValue('is_active', checked)}
              />
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
