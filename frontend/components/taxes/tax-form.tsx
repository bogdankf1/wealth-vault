/**
 * Tax Form Component
 * Form for creating and editing taxes
 */
'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';
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
import {
  useCreateTaxMutation,
  useUpdateTaxMutation,
  useGetTaxQuery,
} from '@/lib/api/taxesApi';

interface TaxFormProps {
  taxId?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function TaxForm({ taxId, isOpen, onClose }: TaxFormProps) {
  const tForm = useTranslations('taxes.form');
  const tActions = useTranslations('taxes.actions');

  const isEditing = Boolean(taxId);
  const [amountInput, setAmountInput] = React.useState<string>('');

  // Form validation schema (moved inside component to access translations)
  const taxSchema = z.object({
    name: z.string().min(1, tForm('taxNameRequired')).max(100),
    description: z.string().max(500).optional(),
    tax_type: z.enum(['fixed', 'percentage']),
    frequency: z.enum(['monthly', 'quarterly', 'annually']),
    fixed_amount: z.number().min(0, tForm('amountNegativeError')).optional(),
    currency: z.string().length(3).or(z.literal('')).optional(),
    percentage: z.number().min(0, tForm('percentageNegativeError')).max(100, tForm('percentageMaxError')).optional(),
    is_active: z.boolean(),
    notes: z.string().max(500).optional(),
  }).refine(
    (data) => {
      if (data.tax_type === 'fixed') {
        return data.fixed_amount !== undefined && data.fixed_amount > 0 && data.currency && data.currency.length === 3;
      } else if (data.tax_type === 'percentage') {
        return data.percentage !== undefined && data.percentage > 0;
      }
      return true;
    },
    {
      message: tForm('fixedAmountOrPercentageError'),
      path: ['fixed_amount'],
    }
  );

  type FormData = z.infer<typeof taxSchema>;

  const {
    data: existingTax,
    isLoading: isLoadingTax,
    error: loadError,
  } = useGetTaxQuery(taxId!, {
    skip: !taxId,
  });

  const [createTax, { isLoading: isCreating, error: createError }] =
    useCreateTaxMutation();

  const [updateTax, { isLoading: isUpdating, error: updateError }] =
    useUpdateTaxMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(taxSchema),
    defaultValues: {
      tax_type: 'fixed',
      frequency: 'annually',
      currency: 'USD',
      is_active: true,
      fixed_amount: undefined,
      percentage: undefined,
    },
  });

  const taxType = watch('tax_type');

  // Load existing tax data or reset for new tax
  useEffect(() => {
    if (isEditing && existingTax) {
      const formData = {
        name: existingTax.name,
        description: existingTax.description || '',
        tax_type: existingTax.tax_type,
        frequency: existingTax.frequency,
        fixed_amount: existingTax.fixed_amount
          ? (typeof existingTax.fixed_amount === 'string'
              ? parseFloat(existingTax.fixed_amount)
              : existingTax.fixed_amount)
          : undefined,
        currency: existingTax.currency,
        percentage: existingTax.percentage
          ? (typeof existingTax.percentage === 'string'
              ? parseFloat(existingTax.percentage)
              : existingTax.percentage)
          : undefined,
        is_active: existingTax.is_active,
        notes: existingTax.notes || '',
      };

      reset(formData);

      if (existingTax.tax_type === 'fixed' && existingTax.fixed_amount) {
        const amountNum = typeof existingTax.fixed_amount === 'string'
          ? parseFloat(existingTax.fixed_amount)
          : existingTax.fixed_amount;
        setAmountInput(String(amountNum));
      }

      setTimeout(() => {
        setValue('currency', existingTax.currency, { shouldDirty: true });
      }, 0);
    } else if (!isEditing && isOpen) {
      reset({
        name: '',
        description: '',
        tax_type: 'fixed',
        frequency: 'annually',
        fixed_amount: undefined,
        currency: 'USD',
        percentage: undefined,
        is_active: true,
        notes: '',
      });
      setAmountInput('');
    }
  }, [isEditing, existingTax, isOpen, reset, setValue]);

  const onSubmit = async (data: FormData) => {
    try {
      const submitData: {
        name: string;
        description?: string;
        tax_type: 'fixed' | 'percentage';
        frequency: 'monthly' | 'quarterly' | 'annually';
        currency: string;
        is_active: boolean;
        notes?: string;
        fixed_amount?: number;
        percentage?: number;
      } = {
        name: data.name,
        description: data.description,
        tax_type: data.tax_type,
        frequency: data.frequency,
        currency: data.currency || 'USD', // Default to USD for percentage taxes
        is_active: data.is_active,
        notes: data.notes,
      };

      // Add fixed amount or percentage based on type
      if (data.tax_type === 'fixed') {
        submitData.fixed_amount = data.fixed_amount;
        submitData.percentage = undefined;
      } else if (data.tax_type === 'percentage') {
        submitData.percentage = data.percentage;
        submitData.fixed_amount = undefined;
      }

      if (isEditing && taxId) {
        await updateTax({ id: taxId, data: submitData }).unwrap();
        toast.success(tForm('updateSuccess'));
      } else {
        await createTax(submitData).unwrap();
        toast.success(tForm('createSuccess'));
      }

      onClose();
      reset();
      setAmountInput('');
    } catch (error) {
      toast.error(isEditing ? tForm('updateError') : tForm('createError'));
    }
  };

  const handleClose = () => {
    onClose();
    setAmountInput('');
    reset({
      tax_type: 'fixed',
      frequency: 'annually',
      currency: 'USD',
      is_active: true,
      fixed_amount: undefined,
      percentage: undefined,
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

        {isLoadingTax ? (
          <LoadingForm count={6} />
        ) : error ? (
          <ApiErrorState error={error} />
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{tForm('taxName')} *</Label>
              <Input
                id="name"
                placeholder={tForm('taxNamePlaceholder')}
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="tax_type">{tForm('taxType')} *</Label>
                <Select
                  value={watch('tax_type')}
                  onValueChange={(value: 'fixed' | 'percentage') => {
                    setValue('tax_type', value);
                    // Reset the other field when switching types
                    if (value === 'fixed') {
                      setValue('percentage', undefined);
                    } else {
                      setValue('fixed_amount', undefined);
                      setAmountInput('');
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={tForm('taxTypePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">{tForm('typeFixed')}</SelectItem>
                    <SelectItem value="percentage">{tForm('typePercentage')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="frequency">{tForm('frequency')} *</Label>
                <Select
                  value={watch('frequency')}
                  onValueChange={(value: 'monthly' | 'quarterly' | 'annually') => {
                    setValue('frequency', value);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={tForm('frequencyPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">{tForm('frequencyMonthly')}</SelectItem>
                    <SelectItem value="quarterly">{tForm('frequencyQuarterly')}</SelectItem>
                    <SelectItem value="annually">{tForm('frequencyAnnually')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {taxType === 'fixed' ? (
              <CurrencyInput
                key={`currency-${existingTax?.id || 'new'}-${watch('currency')}`}
                label={tForm('fixedAmountLabel')}
                amount={amountInput}
                currency={watch('currency')}
                onAmountChange={(value) => {
                  setAmountInput(value);
                  if (value === '') {
                    setValue('fixed_amount', undefined, { shouldValidate: true });
                  } else {
                    const numValue = parseFloat(value);
                    if (!isNaN(numValue)) {
                      setValue('fixed_amount', numValue, { shouldValidate: true });
                    }
                  }
                }}
                onCurrencyChange={(value) => setValue('currency', value)}
                required
                error={errors.fixed_amount?.message}
              />
            ) : (
              <div className="space-y-2">
                <Label htmlFor="percentage">{tForm('percentageLabel')} *</Label>
                <div className="relative">
                  <Input
                    id="percentage"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    placeholder={tForm('percentagePlaceholder')}
                    {...register('percentage', { valueAsNumber: true })}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    %
                  </span>
                </div>
                {errors.percentage && (
                  <p className="text-sm text-destructive">
                    {errors.percentage.message}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {tForm('percentageHelp')}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">{tForm('notes')}</Label>
              <Textarea
                id="notes"
                placeholder={tForm('notesPlaceholder')}
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
              <div className="space-y-0.5">
                <Label htmlFor="is_active">{tForm('isActiveLabel')}</Label>
                <p className="text-xs text-muted-foreground">
                  {tForm('isActiveHelp')}
                </p>
              </div>
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
