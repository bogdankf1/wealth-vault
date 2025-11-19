/**
 * Installment Form Component
 * Form for creating and editing installments/loans
 */
'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';
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
import { CurrencyInput } from '@/components/currency/currency-input';
import { toast } from 'sonner';

interface InstallmentFormProps {
  installmentId?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function InstallmentForm({ installmentId, isOpen, onClose }: InstallmentFormProps) {
  const isEditing = Boolean(installmentId);

  // Translation hooks
  const tForm = useTranslations('installments.form');
  const tCategories = useTranslations('installments.categories');
  const tFrequencies = useTranslations('installments.frequencies');
  const tActions = useTranslations('installments.actions');

  // Form validation schema with translated error messages
  const installmentSchema = z.object({
    name: z.string().min(1, tForm('nameRequired')).max(100),
    description: z.string().max(500).optional(),
    category: z.string().max(50).optional(),
    total_amount: z.number()
      .min(0, tForm('totalAmountPositive'))
      .refine(
        (val) => {
          const rounded = Math.round(val * 100) / 100;
          return Math.abs(val - rounded) < 0.00001;
        },
        { message: tForm('amountDecimalPlaces') }
      ),
    amount_per_payment: z.number().min(0, tForm('paymentAmountPositive')),
    currency: z.string().length(3),
    interest_rate: z.number().min(0).max(100).optional(),
    frequency: z.enum(['weekly', 'biweekly', 'monthly'] as const),
    number_of_payments: z.number().min(1, tForm('totalPaymentsMin')).optional(),
    is_active: z.boolean(),
    start_date: z.string().min(1, tForm('startDateRequired')),
    first_payment_date: z.string().min(1, tForm('firstPaymentDateRequired')),
    end_date: z.string().optional(),
  });

  type FormData = z.infer<typeof installmentSchema>;

  const FREQUENCY_OPTIONS = [
    { value: 'weekly', label: tFrequencies('weekly') },
    { value: 'biweekly', label: tFrequencies('biweekly') },
    { value: 'monthly', label: tFrequencies('monthly') },
  ];

  const CATEGORY_OPTIONS = [
    { value: 'Personal Tech', label: tCategories('personalTech') },
    { value: 'Kitchen Appliances', label: tCategories('kitchenAppliances') },
    { value: 'Health Tech', label: tCategories('healthTech') },
    { value: 'Home Appliances', label: tCategories('homeAppliances') },
    { value: 'Miscellaneous', label: tCategories('miscellaneous') },
    { value: 'Fitness Equipment', label: tCategories('fitnessEquipment') },
    { value: 'Housing Goods', label: tCategories('housingGoods') },
    { value: 'Vehicle', label: tCategories('vehicle') },
    { value: 'Property & Real Estate', label: tCategories('propertyRealEstate') },
  ];

  // Local state to track the string value of total_amount while user is typing
  const [totalAmountInput, setTotalAmountInput] = React.useState<string>('');
  // Local state to track the string value of amount_per_payment while user is typing
  const [paymentAmountInput, setPaymentAmountInput] = React.useState<string>('');

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
      start_date: new Date().toISOString().split('T')[0],
      first_payment_date: new Date().toISOString().split('T')[0],
    },
  });

  // Watch fields for auto-calculation
  const totalAmount = watch('total_amount');
  const amountPerPayment = watch('amount_per_payment');
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
      const totalAmountNum = typeof existingInstallment.total_amount === 'string'
        ? parseFloat(existingInstallment.total_amount)
        : existingInstallment.total_amount;

      const paymentAmountNum = typeof existingInstallment.amount_per_payment === 'string'
        ? parseFloat(existingInstallment.amount_per_payment)
        : existingInstallment.amount_per_payment;

      const formData = {
        name: existingInstallment.name,
        description: existingInstallment.description || '',
        category: existingInstallment.category || '',
        total_amount: totalAmountNum,
        amount_per_payment: paymentAmountNum,
        currency: existingInstallment.currency,
        interest_rate: existingInstallment.interest_rate || 0,
        frequency: existingInstallment.frequency as InstallmentFrequency,
        number_of_payments: existingInstallment.number_of_payments,
        is_active: existingInstallment.is_active,
        // Extract date directly from string to avoid timezone conversion
        start_date: existingInstallment.start_date.split('T')[0],
        first_payment_date: existingInstallment.first_payment_date.split('T')[0],
        end_date: existingInstallment.end_date
          ? existingInstallment.end_date.split('T')[0]
          : '',
      };

      reset(formData);

      // Set the input string states
      setTotalAmountInput(String(totalAmountNum));
      setPaymentAmountInput(String(paymentAmountNum));

      setTimeout(() => {
        if (existingInstallment.category) {
          setValue('category', existingInstallment.category, { shouldDirty: true });
        }
        setValue('frequency', existingInstallment.frequency as InstallmentFrequency, { shouldDirty: true });
        setValue('currency', existingInstallment.currency, { shouldDirty: true });
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
        is_active: true,
        start_date: new Date().toISOString().split('T')[0],
        first_payment_date: new Date().toISOString().split('T')[0],
        end_date: '',
      });
      setTotalAmountInput('');
      setPaymentAmountInput('');
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
        is_active: data.is_active,
        // Keep date-only format to avoid timezone issues
        start_date: `${data.start_date}T00:00:00`,
        first_payment_date: `${data.first_payment_date}T00:00:00`,
        end_date: data.end_date ? `${data.end_date}T00:00:00` : undefined,
      };

      if (isEditing && installmentId) {
        await updateInstallment({ id: installmentId, data: submitData }).unwrap();
        toast.success(tForm('updateSuccess'));
      } else {
        await createInstallment(submitData).unwrap();
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
    setTotalAmountInput('');
    setPaymentAmountInput('');
    reset({
      currency: 'USD',
      frequency: 'monthly',
      is_active: true,
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
            {isEditing ? tForm('editTitle') : tForm('addTitle')}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? tForm('editDescription') : tForm('addDescription')}
          </DialogDescription>
        </DialogHeader>

        {isLoadingInstallment ? (
          <LoadingForm count={8} />
        ) : error ? (
          <ApiErrorState error={error} />
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
              key={`currency-${existingInstallment?.id || 'new'}-${watch('currency')}`}
              label={tForm('totalLoanAmount')}
              amount={totalAmountInput}
              currency={watch('currency')}
              onAmountChange={(value) => {
                // Update the local string state to allow typing decimal points
                setTotalAmountInput(value);

                // Update the form state with the numeric value
                if (value === '') {
                  setValue('total_amount', 0, { shouldValidate: true });
                } else {
                  const numValue = parseFloat(value);
                  if (!isNaN(numValue)) {
                    setValue('total_amount', numValue, { shouldValidate: true });
                  }
                }
              }}
              onCurrencyChange={(value) => setValue('currency', value)}
              required
              error={errors.total_amount?.message}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="amount_per_payment">{tForm('paymentAmount')} *</Label>
                <div className="relative">
                  <Input
                    id="amount_per_payment"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={paymentAmountInput}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '' || /^\d*\.?\d*$/.test(value)) {
                        // Update the local string state to allow typing decimal points
                        setPaymentAmountInput(value);

                        // Update the form state with the numeric value
                        if (value === '') {
                          setValue('amount_per_payment', 0, { shouldValidate: true });
                        } else {
                          const numValue = parseFloat(value);
                          if (!isNaN(numValue)) {
                            setValue('amount_per_payment', numValue, { shouldValidate: true });
                          }
                        }
                      }
                    }}
                  />
                </div>
                {errors.amount_per_payment && (
                  <p className="text-sm text-destructive">{errors.amount_per_payment.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="interest_rate">{tForm('interestRate')}</Label>
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
                <Label htmlFor="frequency">{tForm('paymentFrequency')} *</Label>
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
                <Label htmlFor="number_of_payments">{tForm('totalPayments')}</Label>
                <Input
                  id="number_of_payments"
                  type="number"
                  placeholder={tForm('totalPaymentsPlaceholder')}
                  {...register('number_of_payments', { valueAsNumber: true })}
                  disabled
                  className="bg-muted cursor-not-allowed"
                />
                <p className="text-xs text-muted-foreground">
                  {tForm('totalPaymentsDescription')}
                </p>
                {errors.number_of_payments && (
                  <p className="text-sm text-destructive">
                    {errors.number_of_payments.message}
                  </p>
                )}
              </div>
            </div>

            {isEditing && existingInstallment && (
              <div className="space-y-2">
                <Label htmlFor="payments_made">{tForm('paymentsMade')}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="payments_made"
                    type="text"
                    value={existingInstallment.payments_made}
                    disabled
                    className="bg-muted cursor-not-allowed"
                  />
                  <p className="text-xs text-muted-foreground">
                    {tForm('paymentsMadeDescription')}
                  </p>
                </div>
              </div>
            )}

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
                <Label htmlFor="first_payment_date">{tForm('firstPaymentDate')} *</Label>
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
              <Label htmlFor="end_date">{tForm('payoffDate')}</Label>
              <Input
                id="end_date"
                type="date"
                {...register('end_date')}
                className="cursor-pointer"
                style={{ colorScheme: 'light' }}
              />
              <p className="text-xs text-muted-foreground">
                {tForm('payoffDateDescription')}
              </p>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">{tForm('activeInstallment')}</Label>
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
