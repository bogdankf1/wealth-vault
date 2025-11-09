/**
 * Expense Form Component
 * Form for creating and editing expenses
 */
'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import {
  useCreateExpenseMutation,
  useUpdateExpenseMutation,
  useGetExpenseQuery,
  ExpenseFrequency,
} from '@/lib/api/expensesApi';
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
import { CATEGORY_OPTIONS } from '@/lib/constants/expense-categories';
import { CurrencyInput } from '@/components/currency';

// Form validation schema
const expenseSchema = z.object({
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
    'daily',
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
});

type FormData = z.infer<typeof expenseSchema>;

interface ExpenseFormProps {
  expenseId?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

const FREQUENCY_OPTIONS = [
  { value: 'one_time', label: 'One-time' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually', label: 'Annually' },
];

export function ExpenseForm({ expenseId, isOpen, onClose }: ExpenseFormProps) {
  const isEditing = Boolean(expenseId);

  // Local state to track the string value of amount while user is typing
  const [amountInput, setAmountInput] = React.useState<string>('');

  const {
    data: existingExpense,
    isLoading: isLoadingExpense,
    error: loadError,
  } = useGetExpenseQuery(expenseId!, {
    skip: !expenseId,
  });

  const [createExpense, { isLoading: isCreating, error: createError }] =
    useCreateExpenseMutation();

  const [updateExpense, { isLoading: isUpdating, error: updateError }] =
    useUpdateExpenseMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      currency: 'USD',
      frequency: 'one_time',
      is_active: true,
      date: new Date().toISOString().split('T')[0],
    },
  });

  // Load existing expense data or reset for new expense
  useEffect(() => {
    if (isEditing && existingExpense) {
      const isOneTime = existingExpense.frequency === 'one_time';
      const formData = {
        name: existingExpense.name,
        description: existingExpense.description || '',
        category: existingExpense.category || '',
        amount: typeof existingExpense.amount === 'string'
          ? parseFloat(existingExpense.amount)
          : existingExpense.amount,
        currency: existingExpense.currency,
        frequency: existingExpense.frequency as ExpenseFrequency,
        is_active: existingExpense.is_active,
        // Extract date directly from string to avoid timezone conversion
        date: isOneTime && existingExpense.date
          ? existingExpense.date.split('T')[0]
          : '',
        start_date: !isOneTime && existingExpense.start_date
          ? existingExpense.start_date.split('T')[0]
          : '',
        end_date: !isOneTime && existingExpense.end_date
          ? existingExpense.end_date.split('T')[0]
          : '',
      };

      reset(formData);

      // Set the amount input string
      const amountNum = typeof existingExpense.amount === 'string'
        ? parseFloat(existingExpense.amount)
        : existingExpense.amount;
      setAmountInput(String(amountNum));

      setTimeout(() => {
        if (existingExpense.category) {
          setValue('category', existingExpense.category, { shouldDirty: true });
        }
        setValue('frequency', existingExpense.frequency as ExpenseFrequency, { shouldDirty: true });
        setValue('currency', existingExpense.currency, { shouldDirty: true });
      }, 0);
    } else if (!isEditing && isOpen) {
      reset({
        currency: 'USD',
        frequency: 'one_time',
        is_active: true,
        date: new Date().toISOString().split('T')[0],
      });
      setAmountInput('');
    }
  }, [isEditing, existingExpense, isOpen, reset, setValue]);

  const onSubmit = async (data: FormData) => {
    try {
      const isOneTime = data.frequency === 'one_time';

      const submitData: {
        name: string;
        description?: string;
        category?: string;
        amount: number;
        currency: string;
        frequency: ExpenseFrequency;
        is_active: boolean;
        date?: string;
        start_date?: string;
        end_date?: string;
      } = {
        name: data.name,
        description: data.description,
        category: data.category,
        amount: data.amount,
        currency: data.currency,
        frequency: data.frequency,
        is_active: data.is_active,
      };

      if (isOneTime) {
        // For one-time: use date field (keep date-only format to avoid timezone issues)
        submitData.date = data.date ? `${data.date}T00:00:00` : undefined;
      } else {
        // For recurring: use start_date and end_date (keep date-only format to avoid timezone issues)
        submitData.start_date = data.start_date ? `${data.start_date}T00:00:00` : undefined;
        submitData.end_date = data.end_date ? `${data.end_date}T00:00:00` : undefined;
      }

      if (isEditing && expenseId) {
        await updateExpense({ id: expenseId, data: submitData }).unwrap();
        toast.success('Expense updated successfully');
      } else {
        await createExpense(submitData).unwrap();
        toast.success('Expense created successfully');
      }

      onClose();
      reset();
    } catch (error) {
      console.error('Failed to save expense:', error);
      toast.error(isEditing ? 'Failed to update expense' : 'Failed to create expense');
    }
  };

  const handleClose = () => {
    onClose();
    setAmountInput('');
    reset({
      currency: 'USD',
      frequency: 'monthly',
      is_active: true,
      date: new Date().toISOString().split('T')[0],
    });
  };

  const isLoading = isCreating || isUpdating;
  const error = createError || updateError || loadError;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Expense' : 'Add Expense'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the details of your expense.'
              : 'Add a new expense to track your spending.'}
          </DialogDescription>
        </DialogHeader>

        {isLoadingExpense ? (
          <LoadingForm count={6} />
        ) : error ? (
          <ApiErrorState error={error} />
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Grocery Shopping"
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
                placeholder="Brief description of this expense"
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
              key={`currency-${existingExpense?.id || 'new'}-${watch('currency')}`}
              label="Amount"
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
              <Label htmlFor="frequency">Frequency *</Label>
              <Select
                value={watch('frequency')}
                onValueChange={(value) =>
                  setValue('frequency', value as ExpenseFrequency)
                }
              >
                <SelectTrigger>
                  <SelectValue />
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

            {watch('frequency') === 'one_time' ? (
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  {...register('date')}
                  className="cursor-pointer"
                  style={{ colorScheme: 'light' }}
                />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="start_date">Start Date</Label>
                  <Input
                    id="start_date"
                    type="date"
                    {...register('start_date')}
                    className="cursor-pointer"
                    style={{ colorScheme: 'light' }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_date">End Date (Optional)</Label>
                  <Input
                    id="end_date"
                    type="date"
                    {...register('end_date')}
                    className="cursor-pointer"
                    style={{ colorScheme: 'light' }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">Active Expense</Label>
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
                  ? 'Update Expense'
                  : 'Add Expense'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
