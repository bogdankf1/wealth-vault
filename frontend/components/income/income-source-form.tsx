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
  { value: 'Business', label: 'Business' },
  { value: 'Freelance', label: 'Freelance' },
  { value: 'Side Projects', label: 'Side Projects' },
  { value: 'Investments', label: 'Investments' },
  { value: 'Gifts', label: 'Gifts' },
  { value: 'Refunds & Reimbursements', label: 'Refunds & Reimbursements' },
  { value: 'Rental', label: 'Rental' },
  { value: 'Other', label: 'Other' },
];

export function IncomeSourceForm({ sourceId, isOpen, onClose }: IncomeSourceFormProps) {
  const isEditing = Boolean(sourceId);
  const tForm = useTranslations('income.form');
  const tActions = useTranslations('income.actions');
  const tFrequency = useTranslations('income.frequency');

  // Local state to track the string value of amount while user is typing
  const [amountInput, setAmountInput] = React.useState<string>('');

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
      };

      // Reset the form with the data
      reset(formData);

      // Set the amount input string
      const amountNum = typeof existingSource.amount === 'string'
        ? parseFloat(existingSource.amount)
        : existingSource.amount;
      setAmountInput(String(amountNum));

      // Explicitly set category, frequency, and currency to ensure Select components update
      // Use setTimeout to ensure this happens after render
      setTimeout(() => {
        if (existingSource.category) {
          setValue('category', existingSource.category, { shouldDirty: true });
        }
        setValue('frequency', existingSource.frequency as IncomeFrequency, { shouldDirty: true });
        setValue('currency', existingSource.currency, { shouldDirty: true });
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
      setAmountInput('');
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
            {isEditing ? tForm('editTitle') : tForm('addTitle')}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? tForm('editDescription') : tForm('addDescription')}
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
              <Label htmlFor="name">{tForm('name')} *</Label>
              <Input
                id="name"
                placeholder={tForm('namePlaceholder')}
                {...register('name')}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            {/* Description */}
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

            {/* Category */}
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
              <Label htmlFor="frequency">{tForm('frequency')} *</Label>
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
                <Label htmlFor="date">{tForm('date')}</Label>
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
                  <Label htmlFor="start_date">{tForm('startDate')}</Label>
                  <Input
                    id="start_date"
                    type="date"
                    {...register('start_date')}
                    className="cursor-pointer"
                    style={{ colorScheme: 'light' }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_date">{tForm('endDate')}</Label>
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
            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">{tForm('isActive')}</Label>
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
                {isLoading ? tForm('saving') : tActions('save')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
