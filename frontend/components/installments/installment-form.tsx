/**
 * Installment Form Component
 * Form for creating and editing installments/loans
 */
'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  useCreateInstallmentMutation,
  useUpdateInstallmentMutation,
  useGetInstallmentQuery,
  InstallmentFrequency,
} from '@/lib/api/installmentsApi';
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

// Form validation schema
const installmentSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  category: z.string().max(50).optional(),
  total_amount: z.number().min(0, 'Total amount must be positive'),
  amount_per_payment: z.number().min(0, 'Payment amount must be positive'),
  currency: z.string().length(3),
  interest_rate: z.number().min(0).max(100).optional(),
  frequency: z.enum(['weekly', 'biweekly', 'monthly'] as const),
  number_of_payments: z.number().min(1, 'Must have at least one payment').optional(),
  payments_made: z.number().min(0),
  is_active: z.boolean(),
  start_date: z.string().min(1, 'Start date is required'),
  first_payment_date: z.string().min(1, 'First payment date is required'),
  end_date: z.string().optional(),
});

type FormData = z.infer<typeof installmentSchema>;

interface InstallmentFormProps {
  installmentId?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

const FREQUENCY_OPTIONS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const CATEGORY_OPTIONS = [
  { value: 'Personal', label: 'Personal Loan' },
  { value: 'Auto', label: 'Auto Loan' },
  { value: 'Student', label: 'Student Loan' },
  { value: 'Credit Card', label: 'Credit Card' },
  { value: 'Mortgage', label: 'Mortgage' },
  { value: 'Home Equity', label: 'Home Equity' },
  { value: 'Medical', label: 'Medical' },
  { value: 'Business', label: 'Business Loan' },
  { value: 'Electronics', label: 'Electronics' },
  { value: 'Appliances', label: 'Appliances' },
  { value: 'Furniture', label: 'Furniture' },
  { value: 'Other', label: 'Other' },
];

export function InstallmentForm({ installmentId, isOpen, onClose }: InstallmentFormProps) {
  const isEditing = Boolean(installmentId);

  const {
    data: existingInstallment,
    isLoading: isLoadingInstallment,
    error: loadError,
  } = useGetInstallmentQuery(installmentId!, {
    skip: !installmentId,
  });

  const [createInstallment, { isLoading: isCreating, error: createError }] =
    useCreateInstallmentMutation();

  const [updateInstallment, { isLoading: isUpdating, error: updateError }] =
    useUpdateInstallmentMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(installmentSchema),
    defaultValues: {
      currency: 'USD',
      frequency: 'monthly',
      is_active: true,
      payments_made: 0,
      start_date: new Date().toISOString().split('T')[0],
      first_payment_date: new Date().toISOString().split('T')[0],
    },
  });

  // Watch fields for auto-calculation
  const totalAmount = watch('total_amount');
  const amountPerPayment = watch('amount_per_payment');
  const numberOfPayments = watch('number_of_payments');
  const interestRate = watch('interest_rate');

  // Calculate number of payments based on total amount, payment amount, and interest rate
  useEffect(() => {
    if (!isEditing && totalAmount > 0 && amountPerPayment > 0) {
      let calculatedPayments: number;

      if (interestRate && interestRate > 0) {
        // Calculate with compound interest
        // Formula: n = -log(1 - (P * r) / PMT) / log(1 + r)
        // Where: P = principal (total_amount), r = periodic interest rate, PMT = payment amount
        const periodicRate = (interestRate / 100) / 12; // Monthly rate
        const numerator = Math.log(1 - (totalAmount * periodicRate) / amountPerPayment);
        const denominator = Math.log(1 + periodicRate);

        if (numerator >= 0 || amountPerPayment <= totalAmount * periodicRate) {
          // Payment is too small to cover interest
          calculatedPayments = Math.ceil(totalAmount / amountPerPayment);
        } else {
          calculatedPayments = Math.ceil(-numerator / denominator);
        }
      } else {
        // Simple calculation without interest
        calculatedPayments = Math.ceil(totalAmount / amountPerPayment);
      }

      setValue('number_of_payments', calculatedPayments);
    }
  }, [totalAmount, amountPerPayment, interestRate, isEditing, setValue]);

  // Load existing installment data or reset for new installment
  useEffect(() => {
    if (isEditing && existingInstallment) {
      const formData = {
        name: existingInstallment.name,
        description: existingInstallment.description || '',
        category: existingInstallment.category || '',
        total_amount: existingInstallment.total_amount,
        amount_per_payment: existingInstallment.amount_per_payment,
        currency: existingInstallment.currency,
        interest_rate: existingInstallment.interest_rate || 0,
        frequency: existingInstallment.frequency as InstallmentFrequency,
        number_of_payments: existingInstallment.number_of_payments,
        payments_made: existingInstallment.payments_made,
        is_active: existingInstallment.is_active,
        // Extract date directly from string to avoid timezone conversion
        start_date: existingInstallment.start_date.split('T')[0],
        first_payment_date: existingInstallment.first_payment_date.split('T')[0],
        end_date: existingInstallment.end_date
          ? existingInstallment.end_date.split('T')[0]
          : '',
      };

      reset(formData);

      setTimeout(() => {
        if (existingInstallment.category) {
          setValue('category', existingInstallment.category, { shouldDirty: true });
        }
        setValue('frequency', existingInstallment.frequency as InstallmentFrequency, { shouldDirty: true });
      }, 0);
    } else if (!isEditing && isOpen) {
      reset({
        name: '',
        description: '',
        category: '',
        total_amount: 0,
        amount_per_payment: 0,
        currency: 'USD',
        interest_rate: 0,
        frequency: 'monthly',
        number_of_payments: undefined,
        payments_made: 0,
        is_active: true,
        start_date: new Date().toISOString().split('T')[0],
        first_payment_date: new Date().toISOString().split('T')[0],
        end_date: '',
      });
    }
  }, [isEditing, existingInstallment, isOpen, reset, setValue]);

  const onSubmit = async (data: FormData) => {
    try {
      // Ensure number_of_payments is set (should be auto-calculated)
      const finalNumberOfPayments = data.number_of_payments || Math.ceil(data.total_amount / data.amount_per_payment);

      const submitData: {
        name: string;
        description?: string;
        category?: string;
        total_amount: number;
        amount_per_payment: number;
        currency: string;
        interest_rate?: number;
        frequency: InstallmentFrequency;
        number_of_payments: number;
        payments_made: number;
        is_active: boolean;
        start_date: string;
        first_payment_date: string;
        end_date?: string;
      } = {
        name: data.name,
        description: data.description,
        category: data.category,
        total_amount: data.total_amount,
        amount_per_payment: data.amount_per_payment,
        currency: data.currency,
        interest_rate: data.interest_rate,
        frequency: data.frequency,
        number_of_payments: finalNumberOfPayments,
        payments_made: data.payments_made,
        is_active: data.is_active,
        // Keep date-only format to avoid timezone issues
        start_date: `${data.start_date}T00:00:00`,
        first_payment_date: `${data.first_payment_date}T00:00:00`,
        end_date: data.end_date ? `${data.end_date}T00:00:00` : undefined,
      };

      if (isEditing && installmentId) {
        await updateInstallment({ id: installmentId, data: submitData }).unwrap();
      } else {
        await createInstallment(submitData).unwrap();
      }

      onClose();
      reset();
    } catch (error) {
      console.error('Failed to save installment:', error);
    }
  };

  const handleClose = () => {
    onClose();
    reset({
      currency: 'USD',
      frequency: 'monthly',
      is_active: true,
      payments_made: 0,
      start_date: new Date().toISOString().split('T')[0],
      first_payment_date: new Date().toISOString().split('T')[0],
    });
  };

  const isLoading = isCreating || isUpdating;
  const error = createError || updateError || loadError;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Installment' : 'Add Installment'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the details of your installment or loan.'
              : 'Add a new installment or loan to track your payment plan.'}
          </DialogDescription>
        </DialogHeader>

        {isLoadingInstallment ? (
          <LoadingForm count={8} />
        ) : error ? (
          <ApiErrorState error={error} />
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Car Loan"
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
                placeholder="Brief description of this installment"
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="total_amount">Total Loan Amount *</Label>
                <Input
                  id="total_amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  {...register('total_amount', { valueAsNumber: true })}
                />
                {errors.total_amount && (
                  <p className="text-sm text-destructive">{errors.total_amount.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount_per_payment">Payment Amount *</Label>
                <Input
                  id="amount_per_payment"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  {...register('amount_per_payment', { valueAsNumber: true })}
                />
                {errors.amount_per_payment && (
                  <p className="text-sm text-destructive">{errors.amount_per_payment.message}</p>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
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

              <div className="space-y-2">
                <Label htmlFor="interest_rate">Interest Rate (%) (Optional)</Label>
                <Input
                  id="interest_rate"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  {...register('interest_rate', { valueAsNumber: true })}
                />
                {errors.interest_rate && (
                  <p className="text-sm text-destructive">
                    {errors.interest_rate.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="frequency">Payment Frequency *</Label>
                <Select
                  value={watch('frequency')}
                  onValueChange={(value) =>
                    setValue('frequency', value as InstallmentFrequency)
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

              <div className="space-y-2">
                <Label htmlFor="number_of_payments">Total # of Payments</Label>
                <Input
                  id="number_of_payments"
                  type="number"
                  placeholder="Auto-calculated"
                  {...register('number_of_payments', { valueAsNumber: true })}
                  disabled
                  className="bg-muted cursor-not-allowed"
                />
                <p className="text-xs text-muted-foreground">
                  Calculated automatically based on loan amount, payment amount, and interest rate
                </p>
                {errors.number_of_payments && (
                  <p className="text-sm text-destructive">
                    {errors.number_of_payments.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payments_made">Payments Made</Label>
              <Input
                id="payments_made"
                type="number"
                placeholder="0"
                {...register('payments_made', { valueAsNumber: true })}
              />
              {errors.payments_made && (
                <p className="text-sm text-destructive">
                  {errors.payments_made.message}
                </p>
              )}
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
                <Label htmlFor="first_payment_date">First Payment Date *</Label>
                <Input
                  id="first_payment_date"
                  type="date"
                  {...register('first_payment_date')}
                  className="cursor-pointer"
                  style={{ colorScheme: 'light' }}
                />
                {errors.first_payment_date && (
                  <p className="text-sm text-destructive">
                    {errors.first_payment_date.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="end_date">Payoff Date (Optional)</Label>
              <Input
                id="end_date"
                type="date"
                {...register('end_date')}
                className="cursor-pointer"
                style={{ colorScheme: 'light' }}
              />
              <p className="text-xs text-muted-foreground">
                This will be calculated automatically if not provided
              </p>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">Active Installment</Label>
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
                  ? 'Update Installment'
                  : 'Add Installment'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
