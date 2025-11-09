/**
 * Debt Form Component
 * Form for creating and editing debts
 */
'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
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
import { LoadingForm } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { CurrencyInput } from '@/components/currency/currency-input';
import { toast } from 'sonner';
import {
  useCreateDebtMutation,
  useUpdateDebtMutation,
  useGetDebtQuery,
} from '@/lib/api/debtsApi';

// Form validation schema
const debtSchema = z.object({
  debtor_name: z.string().min(1, 'Debtor name is required').max(100),
  description: z.string().max(500).optional(),
  amount: z.number()
    .min(0.01, 'Amount must be greater than 0')
    .refine(
      (val) => {
        const rounded = Math.round(val * 100) / 100;
        return Math.abs(val - rounded) < 0.00001;
      },
      { message: 'Amount can have at most 2 decimal places' }
    ),
  amount_paid: z.number()
    .min(0, 'Amount paid cannot be negative')
    .refine(
      (val) => {
        const rounded = Math.round(val * 100) / 100;
        return Math.abs(val - rounded) < 0.00001;
      },
      { message: 'Amount can have at most 2 decimal places' }
    ),
  currency: z.string().length(3),
  is_paid: z.boolean(),
  due_date: z.string().optional(),
  paid_date: z.string().optional(),
  notes: z.string().max(500).optional(),
});

type FormData = z.infer<typeof debtSchema>;

interface DebtFormProps {
  debtId?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function DebtForm({ debtId, isOpen, onClose }: DebtFormProps) {
  const isEditing = Boolean(debtId);
  const [amountInput, setAmountInput] = React.useState<string>('');
  const [amountPaidInput, setAmountPaidInput] = React.useState<string>('');

  const {
    data: existingDebt,
    isLoading: isLoadingDebt,
    error: loadError,
  } = useGetDebtQuery(debtId!, {
    skip: !debtId,
  });

  const [createDebt, { isLoading: isCreating, error: createError }] =
    useCreateDebtMutation();

  const [updateDebt, { isLoading: isUpdating, error: updateError }] =
    useUpdateDebtMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(debtSchema),
    defaultValues: {
      currency: 'USD',
      is_paid: false,
      amount_paid: 0,
    },
  });

  // Load existing debt data or reset for new debt
  useEffect(() => {
    if (isEditing && existingDebt) {
      const formData = {
        debtor_name: existingDebt.debtor_name,
        description: existingDebt.description || '',
        amount: typeof existingDebt.amount === 'string'
          ? parseFloat(existingDebt.amount)
          : existingDebt.amount,
        amount_paid: typeof existingDebt.amount_paid === 'string'
          ? parseFloat(existingDebt.amount_paid)
          : existingDebt.amount_paid,
        currency: existingDebt.currency,
        is_paid: existingDebt.is_paid,
        due_date: existingDebt.due_date ? existingDebt.due_date.split('T')[0] : '',
        paid_date: existingDebt.paid_date ? existingDebt.paid_date.split('T')[0] : '',
        notes: existingDebt.notes || '',
      };

      reset(formData);

      const amountNum = typeof existingDebt.amount === 'string'
        ? parseFloat(existingDebt.amount)
        : existingDebt.amount;
      setAmountInput(String(amountNum));

      const amountPaidNum = typeof existingDebt.amount_paid === 'string'
        ? parseFloat(existingDebt.amount_paid)
        : existingDebt.amount_paid;
      setAmountPaidInput(String(amountPaidNum));

      setTimeout(() => {
        setValue('currency', existingDebt.currency, { shouldDirty: true });
      }, 0);
    } else if (!isEditing && isOpen) {
      reset({
        debtor_name: '',
        description: '',
        amount: 0,
        amount_paid: 0,
        currency: 'USD',
        is_paid: false,
        due_date: '',
        paid_date: '',
        notes: '',
      });
      setAmountInput('');
      setAmountPaidInput('');
    }
  }, [isEditing, existingDebt, isOpen, reset, setValue]);

  const onSubmit = async (data: FormData) => {
    try {
      const submitData: {
        debtor_name: string;
        description?: string;
        amount: number;
        amount_paid?: number;
        currency: string;
        is_paid: boolean;
        notes?: string;
        due_date?: string;
        paid_date?: string;
      } = {
        debtor_name: data.debtor_name,
        description: data.description,
        amount: data.amount,
        amount_paid: data.amount_paid,
        currency: data.currency,
        is_paid: data.is_paid,
        notes: data.notes,
      };

      // Add dates if provided
      if (data.due_date) {
        submitData.due_date = `${data.due_date}T00:00:00`;
      }
      if (data.paid_date) {
        submitData.paid_date = `${data.paid_date}T00:00:00`;
      }

      if (isEditing && debtId) {
        await updateDebt({ id: debtId, data: submitData }).unwrap();
        toast.success('Debt updated successfully');
      } else {
        await createDebt(submitData).unwrap();
        toast.success('Debt created successfully');
      }

      onClose();
      reset();
    } catch (error) {
      console.error('Failed to save debt:', error);
      toast.error(isEditing ? 'Failed to update debt' : 'Failed to create debt');
    }
  };

  const handleClose = () => {
    onClose();
    setAmountInput('');
    setAmountPaidInput('');
    reset({
      currency: 'USD',
      is_paid: false,
      amount_paid: 0,
    });
  };

  const isLoading = isCreating || isUpdating;
  const error = createError || updateError || loadError;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Debt' : 'Add Debt'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the debt details.'
              : 'Add a new debt record for money owed to you.'}
          </DialogDescription>
        </DialogHeader>

        {isLoadingDebt ? (
          <LoadingForm count={6} />
        ) : error ? (
          <ApiErrorState error={error} />
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="debtor_name">Debtor Name *</Label>
              <Input
                id="debtor_name"
                placeholder="e.g., John Doe"
                {...register('debtor_name')}
              />
              {errors.debtor_name && (
                <p className="text-sm text-destructive">{errors.debtor_name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Brief description of the debt"
                rows={3}
                {...register('description')}
              />
              {errors.description && (
                <p className="text-sm text-destructive">
                  {errors.description.message}
                </p>
              )}
            </div>

            <CurrencyInput
              key={`currency-${existingDebt?.id || 'new'}-${watch('currency')}`}
              label="Total Amount"
              amount={amountInput}
              currency={watch('currency')}
              onAmountChange={(value) => {
                setAmountInput(value);
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
              <Label htmlFor="amount_paid">Amount Paid So Far</Label>
              <Input
                id="amount_paid"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amountPaidInput}
                onChange={(e) => {
                  setAmountPaidInput(e.target.value);
                  if (e.target.value === '') {
                    setValue('amount_paid', 0, { shouldValidate: true });
                  } else {
                    const numValue = parseFloat(e.target.value);
                    if (!isNaN(numValue)) {
                      setValue('amount_paid', numValue, { shouldValidate: true });
                    }
                  }
                }}
              />
              {errors.amount_paid && (
                <p className="text-sm text-destructive">
                  {errors.amount_paid.message}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="due_date">Due Date (Optional)</Label>
                <Input
                  id="due_date"
                  type="date"
                  {...register('due_date')}
                  className="cursor-pointer"
                  style={{ colorScheme: 'light' }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="paid_date">Paid Date (Optional)</Label>
                <Input
                  id="paid_date"
                  type="date"
                  {...register('paid_date')}
                  className="cursor-pointer"
                  style={{ colorScheme: 'light' }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Additional notes about this debt..."
                rows={3}
                {...register('notes')}
              />
              {errors.notes && (
                <p className="text-sm text-destructive">
                  {errors.notes.message}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="is_paid">Marked as Paid</Label>
              <Switch
                id="is_paid"
                checked={watch('is_paid')}
                onCheckedChange={(checked: boolean) => setValue('is_paid', checked)}
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
                  ? 'Update Debt'
                  : 'Add Debt'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
