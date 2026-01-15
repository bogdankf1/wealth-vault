/**
 * Debt Form Component
 * Form for creating and editing debts with payment integration
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
import { AccountSelect } from '@/components/ui/account-select';
import { formatCurrency } from '@/lib/utils/currency';
import { toast } from 'sonner';
import {
  useCreateDebtMutation,
  useUpdateDebtMutation,
  useGetDebtQuery,
  DebtCreate,
} from '@/lib/api/debtsApi';
import { useListAccountsQuery } from '@/lib/api/savingsApi';

interface DebtFormProps {
  debtId?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function DebtForm({ debtId, isOpen, onClose }: DebtFormProps) {
  const isEditing = Boolean(debtId);
  const [amountInput, setAmountInput] = React.useState<string>('');
  const [amountPaidInput, setAmountPaidInput] = React.useState<string>('');
  const [expectedPaymentInput, setExpectedPaymentInput] = React.useState<string>('');

  // Translation hooks
  const tForm = useTranslations('debts.form');
  const tActions = useTranslations('debts.actions');

  const FREQUENCY_OPTIONS = [
    { value: 'weekly', label: 'Weekly' },
    { value: 'biweekly', label: 'Bi-weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'annually', label: 'Annually' },
  ];

  // Form validation schema with translated error messages
  const debtSchema = z.object({
    debtor_name: z.string().min(1, tForm('debtorNameRequired')).max(100),
    description: z.string().max(500).optional(),
    amount: z.number()
      .min(0.01, tForm('amountPositive'))
      .refine(
        (val) => {
          const rounded = Math.round(val * 100) / 100;
          return Math.abs(val - rounded) < 0.00001;
        },
        { message: tForm('amountDecimalPlaces') }
      ),
    amount_paid: z.number()
      .min(0, tForm('amountPaidNonNegative'))
      .refine(
        (val) => {
          const rounded = Math.round(val * 100) / 100;
          return Math.abs(val - rounded) < 0.00001;
        },
        { message: tForm('amountDecimalPlaces') }
      ),
    currency: z.string().length(3),
    is_paid: z.boolean(),
    due_date: z.string().optional(),
    paid_date: z.string().optional(),
    notes: z.string().max(500).optional(),
    // Payment integration fields
    deposit_account_id: z.string().nullable().optional(),
    auto_deposit: z.boolean().optional(),
    interest_rate: z.number().min(0).max(100).nullable().optional(),
    reminder_days_before: z.number().min(0).max(30).optional(),
    next_payment_date: z.string().optional(),
    payment_frequency: z.string().optional(),
    expected_payment_amount: z.number().min(0).nullable().optional(),
    sync_historical: z.boolean().optional(),
  });

  type FormData = z.infer<typeof debtSchema>;

  const {
    data: existingDebt,
    isLoading: isLoadingDebt,
    error: loadError,
  } = useGetDebtQuery(debtId!, {
    skip: !debtId,
  });

  // Fetch user's savings accounts for payment integration
  const { data: accountsData } = useListAccountsQuery({ page_size: 100 });

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
      // Payment integration defaults
      deposit_account_id: null,
      auto_deposit: false,
      reminder_days_before: 3,
      sync_historical: false,
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
        // Payment integration fields
        deposit_account_id: existingDebt.deposit_account_id || null,
        auto_deposit: existingDebt.auto_deposit || false,
        interest_rate: existingDebt.interest_rate || null,
        reminder_days_before: existingDebt.reminder_days_before || 3,
        next_payment_date: existingDebt.next_payment_date ? existingDebt.next_payment_date.split('T')[0] : '',
        payment_frequency: existingDebt.payment_frequency || '',
        expected_payment_amount: existingDebt.expected_payment_amount || null,
        sync_historical: false,
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

      if (existingDebt.expected_payment_amount) {
        setExpectedPaymentInput(String(existingDebt.expected_payment_amount));
      }

      // Set Select values after reset
      setTimeout(() => {
        setValue('currency', existingDebt.currency, { shouldDirty: true });
        if (existingDebt.payment_frequency) {
          setValue('payment_frequency', existingDebt.payment_frequency, { shouldDirty: true });
        }
        if (existingDebt.deposit_account_id && accountsData?.items) {
          setValue('deposit_account_id', existingDebt.deposit_account_id, { shouldDirty: true });
        }
        setValue('auto_deposit', existingDebt.auto_deposit || false, { shouldDirty: true });
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
        deposit_account_id: null,
        auto_deposit: false,
        interest_rate: null,
        reminder_days_before: 3,
        next_payment_date: '',
        payment_frequency: '',
        expected_payment_amount: null,
        sync_historical: false,
      });
      setAmountInput('');
      setAmountPaidInput('');
      setExpectedPaymentInput('');
    }
  }, [isEditing, existingDebt, isOpen, reset, setValue, accountsData]);

  const onSubmit = async (data: FormData) => {
    try {
      const submitData: DebtCreate = {
        debtor_name: data.debtor_name,
        description: data.description || undefined,
        amount: data.amount,
        amount_paid: data.amount_paid,
        currency: data.currency,
        is_paid: data.is_paid,
        notes: data.notes || undefined,
        // Payment integration fields
        deposit_account_id: data.deposit_account_id || undefined,
        auto_deposit: data.auto_deposit || false,
        interest_rate: data.interest_rate || undefined,
        reminder_days_before: data.reminder_days_before || 3,
        payment_frequency: data.payment_frequency || undefined,
        expected_payment_amount: data.expected_payment_amount || undefined,
        sync_historical: data.sync_historical || false,
      };

      // Add dates if provided
      if (data.due_date) {
        submitData.due_date = `${data.due_date}T00:00:00`;
      }
      if (data.paid_date) {
        submitData.paid_date = `${data.paid_date}T00:00:00`;
      }
      if (data.next_payment_date) {
        submitData.next_payment_date = `${data.next_payment_date}T00:00:00`;
      }

      if (isEditing && debtId) {
        await updateDebt({ id: debtId, data: submitData }).unwrap();
        toast.success(tForm('updateSuccess'));
      } else {
        await createDebt(submitData).unwrap();
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
    setAmountPaidInput('');
    setExpectedPaymentInput('');
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
            {isEditing ? tForm('editTitle') : tForm('addTitle')}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? tForm('editDescription') : tForm('addDescription')}
          </DialogDescription>
        </DialogHeader>

        {isLoadingDebt ? (
          <LoadingForm count={6} />
        ) : error ? (
          <ApiErrorState error={error} />
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="debtor_name">{tForm('debtorName')} *</Label>
              <Input
                id="debtor_name"
                placeholder={tForm('debtorNamePlaceholder')}
                {...register('debtor_name')}
              />
              {errors.debtor_name && (
                <p className="text-sm text-destructive">{errors.debtor_name.message}</p>
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

            <CurrencyInput
              key={`currency-${existingDebt?.id || 'new'}-${watch('currency')}`}
              label={tForm('totalAmount')}
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
              <Label htmlFor="amount_paid">{tForm('amountPaid')}</Label>
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
                <Label htmlFor="due_date">{tForm('dueDate')}</Label>
                <Input
                  id="due_date"
                  type="date"
                  {...register('due_date')}
                  className="cursor-pointer"
                                  />
              </div>
              <div className="space-y-2">
                <Label htmlFor="paid_date">{tForm('paidDate')}</Label>
                <Input
                  id="paid_date"
                  type="date"
                  {...register('paid_date')}
                  className="cursor-pointer"
                                  />
              </div>
            </div>

            {/* Payment Integration Section */}
            <div className="space-y-4 border-t pt-4 mt-4">
              <h3 className="text-base font-semibold text-foreground">{tForm('paymentIntegration')}</h3>

              <div className="space-y-4">
                <AccountSelect
                  value={watch('deposit_account_id')}
                  onChange={(accountId) => setValue('deposit_account_id', accountId)}
                  accounts={accountsData?.items}
                  label={tForm('depositAccount')}
                  placeholder={tForm('depositAccountPlaceholder')}
                  noAccountLabel={tForm('noDepositAccount')}
                  helpText={tForm('depositAccountHelp')}
                />

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="auto_deposit">{tForm('autoDeposit')}</Label>
                    <p className="text-xs text-muted-foreground">{tForm('autoDepositHelp')}</p>
                  </div>
                  <Switch
                    id="auto_deposit"
                    checked={watch('auto_deposit') || false}
                    onCheckedChange={(checked: boolean) => setValue('auto_deposit', checked)}
                    disabled={!watch('deposit_account_id')}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="sync_historical">{tForm('syncHistorical')}</Label>
                    <p className="text-xs text-muted-foreground">{tForm('syncHistoricalHelp')}</p>
                  </div>
                  <Switch
                    id="sync_historical"
                    checked={watch('sync_historical') || false}
                    onCheckedChange={(checked: boolean) => setValue('sync_historical', checked)}
                    disabled={!watch('deposit_account_id')}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="interest_rate">{tForm('interestRate')}</Label>
                    <Input
                      id="interest_rate"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      placeholder="0.00"
                      {...register('interest_rate', { valueAsNumber: true })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reminder_days_before">{tForm('reminderDaysBefore')}</Label>
                    <Input
                      id="reminder_days_before"
                      type="number"
                      min="0"
                      max="30"
                      {...register('reminder_days_before', { valueAsNumber: true })}
                    />
                    <p className="text-xs text-muted-foreground">{tForm('reminderDaysBeforeHelp')}</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="payment_frequency">{tForm('paymentFrequency')}</Label>
                    <Select
                      value={watch('payment_frequency') || ''}
                      onValueChange={(value) => setValue('payment_frequency', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={tForm('paymentFrequencyPlaceholder')} />
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
                    <Label htmlFor="next_payment_date">{tForm('nextPaymentDate')}</Label>
                    <Input
                      id="next_payment_date"
                      type="date"
                      {...register('next_payment_date')}
                      className="cursor-pointer"
                                          />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expected_payment_amount">{tForm('expectedPaymentAmount')}</Label>
                  <Input
                    id="expected_payment_amount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={expectedPaymentInput}
                    onChange={(e) => {
                      setExpectedPaymentInput(e.target.value);
                      if (e.target.value === '') {
                        setValue('expected_payment_amount', null, { shouldValidate: true });
                      } else {
                        const numValue = parseFloat(e.target.value);
                        if (!isNaN(numValue)) {
                          setValue('expected_payment_amount', numValue, { shouldValidate: true });
                        }
                      }
                    }}
                  />
                  <p className="text-xs text-muted-foreground">{tForm('expectedPaymentAmountHelp')}</p>
                </div>
              </div>
            </div>

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
              <Label htmlFor="is_paid">{tForm('markedAsPaid')}</Label>
              <Switch
                id="is_paid"
                checked={watch('is_paid')}
                onCheckedChange={(checked: boolean) => setValue('is_paid', checked)}
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
