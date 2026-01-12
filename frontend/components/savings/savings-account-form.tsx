'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { CurrencyInput } from '@/components/currency/currency-input';
import { toast } from 'sonner';
import {
  useCreateAccountMutation,
  useUpdateAccountMutation,
  useGetAccountQuery,
  type AccountType,
} from '@/lib/api/savingsApi';

const accountSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  account_type: z.enum(['crypto', 'cash', 'business', 'personal', 'fixed_deposit', 'other']),
  institution: z.string().max(100).optional(),
  account_number_last4: z.string().length(4, 'Must be exactly 4 digits').optional().or(z.literal('')),
  current_balance: z.number()
    .min(0, 'Balance must be positive')
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
  // Interest settings
  interest_rate_percent: z.number().min(0).max(100).optional(),
  interest_frequency: z.enum(['daily', 'monthly', 'quarterly', 'annually']),
  interest_accrual_method: z.enum(['simple', 'compound']),
  is_active: z.boolean(),
  notes: z.string().max(500).optional(),
});

type FormData = z.infer<typeof accountSchema>;

interface SavingsAccountFormProps {
  accountId?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function SavingsAccountForm({ accountId, isOpen, onClose }: SavingsAccountFormProps) {
  const isEditing = Boolean(accountId);

  // Translation hooks
  const tForm = useTranslations('savings.form');
  const tActions = useTranslations('savings.actions');
  const tAccountTypes = useTranslations('savings.accountTypes');
  const tInterest = useTranslations('savings.interest');

  const ACCOUNT_TYPE_OPTIONS = [
    { value: 'personal', label: tAccountTypes('personal') },
    { value: 'business', label: tAccountTypes('business') },
    { value: 'cash', label: tAccountTypes('cash') },
    { value: 'crypto', label: tAccountTypes('crypto') },
    { value: 'fixed_deposit', label: tAccountTypes('fixedDeposit') },
    { value: 'other', label: tAccountTypes('other') },
  ];

  const INTEREST_FREQUENCY_OPTIONS = [
    { value: 'monthly', label: tInterest('frequencyMonthly') },
    { value: 'daily', label: tInterest('frequencyDaily') },
    { value: 'quarterly', label: tInterest('frequencyQuarterly') },
    { value: 'annually', label: tInterest('frequencyAnnually') },
  ];

  const INTEREST_METHOD_OPTIONS = [
    { value: 'compound', label: tInterest('methodCompound') },
    { value: 'simple', label: tInterest('methodSimple') },
  ];

  // Local state to track the string value while user is typing
  const [currentBalanceInput, setCurrentBalanceInput] = React.useState<string>('');
  const [interestRateInput, setInterestRateInput] = React.useState<string>('');

  const {
    data: existingAccount,
    isLoading: isLoadingAccount,
  } = useGetAccountQuery(accountId!, {
    skip: !accountId,
  });

  const [createAccount, { isLoading: isCreating }] = useCreateAccountMutation();
  const [updateAccount, { isLoading: isUpdating }] = useUpdateAccountMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      currency: 'USD',
      account_type: 'personal',
      interest_frequency: 'monthly',
      interest_accrual_method: 'compound',
      is_active: true,
    },
  });

  // Load existing account data
  useEffect(() => {
    if (isEditing && existingAccount) {
      // Convert interest rate from decimal to percentage
      const interestRatePercent = existingAccount.interest_rate
        ? existingAccount.interest_rate * 100
        : undefined;

      reset({
        name: existingAccount.name,
        account_type: existingAccount.account_type as AccountType,
        institution: existingAccount.institution || '',
        account_number_last4: existingAccount.account_number_last4 || '',
        current_balance: typeof existingAccount.current_balance === 'string'
          ? parseFloat(existingAccount.current_balance)
          : existingAccount.current_balance,
        currency: existingAccount.currency,
        interest_rate_percent: interestRatePercent,
        interest_frequency: (existingAccount.interest_frequency || 'monthly') as 'daily' | 'monthly' | 'quarterly' | 'annually',
        interest_accrual_method: (existingAccount.interest_accrual_method || 'compound') as 'simple' | 'compound',
        is_active: existingAccount.is_active,
        notes: existingAccount.notes || '',
      });

      // Set the current balance input string
      const balanceNum = typeof existingAccount.current_balance === 'string'
        ? parseFloat(existingAccount.current_balance)
        : existingAccount.current_balance;
      setCurrentBalanceInput(String(balanceNum));

      // Set interest rate input string
      if (interestRatePercent !== undefined) {
        setInterestRateInput(String(interestRatePercent));
      } else {
        setInterestRateInput('');
      }

      setTimeout(() => {
        setValue('account_type', existingAccount.account_type as AccountType, { shouldDirty: true });
        setValue('currency', existingAccount.currency, { shouldDirty: true });
        setValue('interest_frequency', (existingAccount.interest_frequency || 'monthly') as 'daily' | 'monthly' | 'quarterly' | 'annually', { shouldDirty: true });
        setValue('interest_accrual_method', (existingAccount.interest_accrual_method || 'compound') as 'simple' | 'compound', { shouldDirty: true });
      }, 0);
    } else if (!isEditing && isOpen) {
      reset({
        name: '',
        account_type: 'personal',
        institution: '',
        account_number_last4: '',
        current_balance: 0,
        currency: 'USD',
        interest_rate_percent: undefined,
        interest_frequency: 'monthly',
        interest_accrual_method: 'compound',
        is_active: true,
        notes: '',
      });
      setCurrentBalanceInput('');
      setInterestRateInput('');
    }
  }, [isEditing, existingAccount, isOpen, reset, setValue]);

  const onSubmit = async (data: FormData) => {
    try {
      // Convert interest rate from percentage to decimal (e.g., 4.5% -> 0.045)
      const interestRateDecimal = data.interest_rate_percent
        ? data.interest_rate_percent / 100
        : undefined;

      const submitData = {
        name: data.name,
        account_type: data.account_type,
        institution: data.institution || undefined,
        account_number_last4: data.account_number_last4 || undefined,
        current_balance: data.current_balance,
        currency: data.currency,
        interest_rate: interestRateDecimal,
        interest_frequency: data.interest_frequency,
        interest_accrual_method: data.interest_accrual_method,
        is_active: data.is_active,
        notes: data.notes || undefined,
      };

      if (isEditing && accountId) {
        await updateAccount({ id: accountId, data: submitData }).unwrap();
        toast.success(tForm('updateSuccess'));
      } else {
        await createAccount(submitData).unwrap();
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
    setCurrentBalanceInput('');
    setInterestRateInput('');
  };

  const accountType = watch('account_type');
  const interestFrequency = watch('interest_frequency');
  const interestMethod = watch('interest_accrual_method');
  const isActive = watch('is_active');

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? tForm('editTitle') : tForm('addTitle')}</DialogTitle>
          <DialogDescription>
            {isEditing ? tForm('editDescription') : tForm('addDescription')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" autoComplete="off">
          {/* Account Name */}
          <div className="space-y-2">
            <Label htmlFor="name">{tForm('name')}</Label>
            <Input
              id="name"
              {...register('name')}
              placeholder={tForm('namePlaceholder')}
              autoComplete="off"
            />
            {errors.name && (
              <p className="text-sm text-red-500">{errors.name.message}</p>
            )}
          </div>

          {/* Account Type */}
          <div className="space-y-2">
            <Label htmlFor="account_type">{tForm('accountType')}</Label>
            <Select
              value={accountType}
              onValueChange={(value) => setValue('account_type', value as AccountType)}
            >
              <SelectTrigger>
                <SelectValue placeholder={tForm('accountTypePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.account_type && (
              <p className="text-sm text-red-500">{errors.account_type.message}</p>
            )}
          </div>

          {/* Institution */}
          <div className="space-y-2">
            <Label htmlFor="institution">{tForm('institution')}</Label>
            <Input
              id="institution"
              {...register('institution')}
              placeholder={tForm('institutionPlaceholder')}
            />
          </div>

          {/* Last 4 Digits */}
          <div className="space-y-2">
            <Label htmlFor="account_number_last4">{tForm('accountNumberLast4')}</Label>
            <Input
              id="account_number_last4"
              {...register('account_number_last4')}
              placeholder="1234"
              maxLength={4}
            />
            {errors.account_number_last4 && (
              <p className="text-sm text-red-500">{errors.account_number_last4.message}</p>
            )}
          </div>

          {/* Current Balance with Currency */}
          <CurrencyInput
            key={`currency-${existingAccount?.id || 'new'}-${watch('currency')}`}
            label={tForm('balance')}
            amount={currentBalanceInput}
            currency={watch('currency')}
            onAmountChange={(value) => {
              // Update the local string state to allow typing decimal points
              setCurrentBalanceInput(value);

              // Update the form state with the numeric value
              if (value === '') {
                setValue('current_balance', 0, { shouldValidate: true });
              } else {
                const numValue = parseFloat(value);
                if (!isNaN(numValue)) {
                  setValue('current_balance', numValue, { shouldValidate: true });
                }
              }
            }}
            onCurrencyChange={(value) => setValue('currency', value)}
            required
            error={errors.current_balance?.message}
          />

          {/* Interest Settings Section */}
          <div className="space-y-4 border-t pt-4 mt-4">
            <h3 className="text-base font-semibold text-foreground">{tInterest('settings')}</h3>

            {/* Interest Rate */}
            <div className="space-y-2">
              <Label htmlFor="interest_rate_percent">{tInterest('rate')}</Label>
              <div className="relative">
                <Input
                  id="interest_rate_percent"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={interestRateInput}
                  onChange={(e) => {
                    const value = e.target.value;
                    setInterestRateInput(value);
                    if (value === '') {
                      setValue('interest_rate_percent', undefined, { shouldValidate: true });
                    } else {
                      const numValue = parseFloat(value);
                      if (!isNaN(numValue)) {
                        setValue('interest_rate_percent', numValue, { shouldValidate: true });
                      }
                    }
                  }}
                  placeholder={tInterest('ratePlaceholder')}
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">{tInterest('rateHelp')}</p>
              {errors.interest_rate_percent && (
                <p className="text-sm text-red-500">{errors.interest_rate_percent.message}</p>
              )}
            </div>

            {/* Interest Frequency and Method */}
            <div className="grid grid-cols-2 gap-4">
              {/* Interest Frequency */}
              <div className="space-y-2">
                <Label htmlFor="interest_frequency">{tInterest('frequency')}</Label>
                <Select
                  value={interestFrequency}
                  onValueChange={(value) => setValue('interest_frequency', value as 'daily' | 'monthly' | 'quarterly' | 'annually')}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={tInterest('frequencyPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {INTEREST_FREQUENCY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Interest Accrual Method */}
              <div className="space-y-2">
                <Label htmlFor="interest_accrual_method">{tInterest('method')}</Label>
                <Select
                  value={interestMethod}
                  onValueChange={(value) => setValue('interest_accrual_method', value as 'simple' | 'compound')}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={tInterest('methodPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {INTEREST_METHOD_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">{tForm('notes')}</Label>
            <Textarea
              id="notes"
              {...register('notes')}
              placeholder={tForm('notesPlaceholder')}
              rows={3}
            />
          </div>

          {/* Active Status */}
          <div className="flex items-center justify-between">
            <Label htmlFor="is_active">{tForm('isActive')}</Label>
            <Switch
              id="is_active"
              checked={isActive}
              onCheckedChange={(checked: boolean) => setValue('is_active', checked)}
            />
          </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                {tActions('cancel')}
              </Button>
              <Button
                type="submit"
                disabled={isCreating || isUpdating || isLoadingAccount}
              >
                {isCreating || isUpdating ? tForm('saving') : isEditing ? tForm('update') : tForm('create')}
              </Button>
            </DialogFooter>
          </form>
      </DialogContent>
    </Dialog>
  );
}
