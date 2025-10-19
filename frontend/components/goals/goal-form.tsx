/**
 * Goal Form Component
 * Form for creating and editing financial goals
 */
'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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

const CATEGORY_OPTIONS = [
  { value: 'Home', label: 'Home/Property' },
  { value: 'Vehicle', label: 'Vehicle' },
  { value: 'Education', label: 'Education' },
  { value: 'Wedding', label: 'Wedding' },
  { value: 'Travel', label: 'Travel/Vacation' },
  { value: 'Emergency Fund', label: 'Emergency Fund' },
  { value: 'Major Purchase', label: 'Major Purchase' },
  { value: 'General Savings', label: 'General Savings' },
  { value: 'Retirement', label: 'Retirement' },
  { value: 'Other', label: 'Other' },
];

export function GoalForm({ goalId, isOpen, onClose }: GoalFormProps) {
  const isEditing = Boolean(goalId);

  // Local state to track the string value of target_amount while user is typing
  const [targetAmountInput, setTargetAmountInput] = React.useState<string>('');

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
        current_amount: existingGoal.current_amount,
        currency: existingGoal.currency,
        monthly_contribution: existingGoal.monthly_contribution || 0,
        is_active: existingGoal.is_active,
        // Extract date directly from string to avoid timezone conversion
        start_date: existingGoal.start_date.split('T')[0],
        target_date: existingGoal.target_date
          ? existingGoal.target_date.split('T')[0]
          : '',
      };

      reset(formData);

      // Set the target amount input string
      const targetAmountNum = typeof existingGoal.target_amount === 'string'
        ? parseFloat(existingGoal.target_amount)
        : existingGoal.target_amount;
      setTargetAmountInput(String(targetAmountNum));

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
      } else {
        await createGoal(submitData).unwrap();
      }

      onClose();
      reset();
    } catch (error) {
      console.error('Failed to save goal:', error);
    }
  };

  const handleClose = () => {
    onClose();
    setTargetAmountInput('');
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
            {isEditing ? 'Edit Goal' : 'Add Goal'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the details of your financial goal.'
              : 'Add a new financial goal to track your savings progress.'}
          </DialogDescription>
        </DialogHeader>

        {isLoadingGoal ? (
          <LoadingForm count={6} />
        ) : error ? (
          <ApiErrorState error={error} />
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Goal Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Hawaii Vacation 2026"
                {...register('name')}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Brief description of this goal"
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
              <Label htmlFor="category">Category</Label>
              <Select
                value={watch('category') || ''}
                onValueChange={(value) => setValue('category', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
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
              label="Target Amount"
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
                <Label htmlFor="current_amount">Current Amount Saved</Label>
                <Input
                  id="current_amount"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={watch('current_amount')?.toString() || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || /^\d*\.?\d*$/.test(value)) {
                      setValue('current_amount', parseFloat(value) || 0);
                    }
                  }}
                />
                {errors.current_amount && (
                  <p className="text-sm text-destructive">{errors.current_amount.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="monthly_contribution">Monthly Contribution (Optional)</Label>
                <Input
                  id="monthly_contribution"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={watch('monthly_contribution')?.toString() || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || /^\d*\.?\d*$/.test(value)) {
                      setValue('monthly_contribution', parseFloat(value) || 0);
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
                <Label htmlFor="start_date">Start Date *</Label>
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
                <Label htmlFor="target_date">Target Date (Optional)</Label>
                <Input
                  id="target_date"
                  type="date"
                  {...register('target_date')}
                  className="cursor-pointer"
                  style={{ colorScheme: 'light' }}
                />
                <p className="text-xs text-muted-foreground">
                  When you plan to achieve this goal
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">Active Goal</Label>
              <Switch
                id="is_active"
                checked={watch('is_active')}
                onCheckedChange={(checked: boolean) => setValue('is_active', checked)}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading
                  ? 'Saving...'
                  : isEditing
                  ? 'Update Goal'
                  : 'Add Goal'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
