/**
 * Income Source Form Component
 * Form for creating and editing income sources
 */
'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  useCreateIncomeSourceMutation,
  useUpdateIncomeSourceMutation,
  useGetIncomeSourceQuery,
  IncomeFrequency,
} from '@/lib/api/incomeApi';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingForm } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';

// Form validation schema
const incomeSourceSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  category: z.string().max(50).optional(),
  amount: z.number().min(0, 'Amount must be positive'),
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

const CATEGORY_OPTIONS = [
  { value: 'Salary', label: 'Salary' },
  { value: 'Freelance', label: 'Freelance' },
  { value: 'Business', label: 'Business' },
  { value: 'Investment', label: 'Investment' },
  { value: 'Rental', label: 'Rental' },
  { value: 'Dividends', label: 'Dividends' },
  { value: 'Interest', label: 'Interest' },
  { value: 'Gift', label: 'Gift' },
  { value: 'Other', label: 'Other' },
];

export function IncomeSourceForm({ sourceId, isOpen, onClose }: IncomeSourceFormProps) {
  const isEditing = Boolean(sourceId);

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
    },
  });

  // Load existing source data or reset for new source
  useEffect(() => {
    if (isEditing && existingSource) {
      const isOneTime = existingSource.frequency === 'one_time';
      const formData = {
        name: existingSource.name,
        description: existingSource.description || '',
        category: existingSource.category || '',
        amount: existingSource.amount,
        currency: existingSource.currency,
        frequency: existingSource.frequency as IncomeFrequency,
        is_active: existingSource.is_active,
        date: isOneTime && existingSource.date
          ? new Date(existingSource.date).toISOString().split('T')[0]
          : '',
        start_date: !isOneTime && existingSource.start_date
          ? new Date(existingSource.start_date).toISOString().split('T')[0]
          : '',
        end_date: !isOneTime && existingSource.end_date
          ? new Date(existingSource.end_date).toISOString().split('T')[0]
          : '',
      };

      // Reset the form with the data
      reset(formData);

      // Explicitly set category and frequency to ensure Select components update
      // Use setTimeout to ensure this happens after render
      setTimeout(() => {
        if (existingSource.category) {
          setValue('category', existingSource.category, { shouldDirty: true });
        }
        setValue('frequency', existingSource.frequency as IncomeFrequency, { shouldDirty: true });
      }, 0);
    } else if (!isEditing && isOpen) {
      // Reset to defaults when creating new source
      reset({
        name: '',
        description: '',
        category: '',
        amount: 0,
        currency: 'USD',
        frequency: 'monthly',
        is_active: true,
        date: '',
        start_date: new Date().toISOString().split('T')[0],
        end_date: '',
      });
    }
  }, [isEditing, existingSource, isOpen, reset, setValue]);

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
        // For one-time: use date field
        submitData.date = data.date ? new Date(data.date).toISOString() : undefined;
      } else {
        // For recurring: use start_date and end_date
        submitData.start_date = data.start_date ? new Date(data.start_date).toISOString() : undefined;
        submitData.end_date = data.end_date ? new Date(data.end_date).toISOString() : undefined;
      }

      if (isEditing && sourceId) {
        await updateSource({ id: sourceId, data: submitData }).unwrap();
      } else {
        await createSource(submitData).unwrap();
      }

      onClose();
      reset();
    } catch (error) {
      console.error('Failed to save income source:', error);
    }
  };

  const handleClose = () => {
    onClose();
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
            {isEditing ? 'Edit Income Source' : 'Add Income Source'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the details of your income source.'
              : 'Add a new income source to track your earnings.'}
          </DialogDescription>
        </DialogHeader>

        {isLoadingSource ? (
          <LoadingForm count={6} />
        ) : error ? (
          <ApiErrorState error={error} />
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Full-time Salary"
                {...register('name')}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Brief description of this income source"
                rows={3}
                {...register('description')}
              />
              {errors.description && (
                <p className="text-sm text-destructive">
                  {errors.description.message}
                </p>
              )}
            </div>

            {/* Category */}
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

            {/* Amount and Currency */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  {...register('amount', { valueAsNumber: true })}
                />
                {errors.amount && (
                  <p className="text-sm text-destructive">{errors.amount.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Input
                  id="currency"
                  placeholder="USD"
                  maxLength={3}
                  {...register('currency')}
                />
                {errors.currency && (
                  <p className="text-sm text-destructive">
                    {errors.currency.message}
                  </p>
                )}
              </div>
            </div>

            {/* Frequency */}
            <div className="space-y-2">
              <Label htmlFor="frequency">Frequency *</Label>
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
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Fields - Conditional based on frequency */}
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

            {/* Active Status */}
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="is_active"
                className="h-4 w-4 rounded border-gray-300"
                {...register('is_active')}
              />
              <Label htmlFor="is_active" className="cursor-pointer">
                Active income source
              </Label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading
                  ? 'Saving...'
                  : isEditing
                  ? 'Update Source'
                  : 'Add Source'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
