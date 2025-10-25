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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { CurrencyInput } from '@/components/currency/currency-input';
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
  is_active: z.boolean(),
  notes: z.string().max(500).optional(),
});

type FormData = z.infer<typeof accountSchema>;

interface SavingsAccountFormProps {
  accountId?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'crypto', label: 'Cryptocurrency' },
  { value: 'cash', label: 'Cash' },
  { value: 'business', label: 'Business Account' },
  { value: 'personal', label: 'Personal Account' },
  { value: 'fixed_deposit', label: 'Fixed Deposits' },
  { value: 'other', label: 'Other' },
];

export function SavingsAccountForm({ accountId, isOpen, onClose }: SavingsAccountFormProps) {
  const isEditing = Boolean(accountId);

  // Local state to track the string value of current_balance while user is typing
  const [currentBalanceInput, setCurrentBalanceInput] = React.useState<string>('');

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
      is_active: true,
    },
  });

  // Load existing account data
  useEffect(() => {
    if (isEditing && existingAccount) {
      reset({
        name: existingAccount.name,
        account_type: existingAccount.account_type as AccountType,
        institution: existingAccount.institution || '',
        account_number_last4: existingAccount.account_number_last4 || '',
        current_balance: typeof existingAccount.current_balance === 'string'
          ? parseFloat(existingAccount.current_balance)
          : existingAccount.current_balance,
        currency: existingAccount.currency,
        is_active: existingAccount.is_active,
        notes: existingAccount.notes || '',
      });

      // Set the current balance input string
      const balanceNum = typeof existingAccount.current_balance === 'string'
        ? parseFloat(existingAccount.current_balance)
        : existingAccount.current_balance;
      setCurrentBalanceInput(String(balanceNum));

      setTimeout(() => {
        setValue('account_type', existingAccount.account_type as AccountType, { shouldDirty: true });
        setValue('currency', existingAccount.currency, { shouldDirty: true });
      }, 0);
    } else if (!isEditing && isOpen) {
      reset({
        name: '',
        account_type: 'personal',
        institution: '',
        account_number_last4: '',
        current_balance: 0,
        currency: 'USD',
        is_active: true,
        notes: '',
      });
      setCurrentBalanceInput('');
    }
  }, [isEditing, existingAccount, isOpen, reset, setValue]);

  const onSubmit = async (data: FormData) => {
    try {
      const submitData = {
        ...data,
        institution: data.institution || undefined,
        account_number_last4: data.account_number_last4 || undefined,
        notes: data.notes || undefined,
      };

      if (isEditing && accountId) {
        await updateAccount({ id: accountId, data: submitData }).unwrap();
      } else {
        await createAccount(submitData).unwrap();
      }

      onClose();
      reset();
    } catch (error) {
      console.error('Failed to save account:', error);
    }
  };

  const handleClose = () => {
    onClose();
    setCurrentBalanceInput('');
  };

  const accountType = watch('account_type');
  const isActive = watch('is_active');

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Account' : 'Add New Account'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update your savings account details' : 'Create a new savings account to track'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" autoComplete="off">
          {/* Account Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Account Name *</Label>
            <Input
              id="name"
              {...register('name')}
              placeholder="e.g., Emergency Fund"
              autoComplete="off"
            />
            {errors.name && (
              <p className="text-sm text-red-500">{errors.name.message}</p>
            )}
          </div>

          {/* Account Type */}
          <div className="space-y-2">
            <Label htmlFor="account_type">Account Type *</Label>
            <Select
              value={accountType}
              onValueChange={(value) => setValue('account_type', value as AccountType)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select account type" />
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
            <Label htmlFor="institution">Bank/Institution</Label>
            <Input
              id="institution"
              {...register('institution')}
              placeholder="e.g., Chase Bank"
            />
          </div>

          {/* Last 4 Digits */}
          <div className="space-y-2">
            <Label htmlFor="account_number_last4">Last 4 Digits</Label>
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
            label="Current Balance"
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

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              {...register('notes')}
              placeholder="Optional notes about this account..."
              rows={3}
            />
          </div>

          {/* Active Status */}
          <div className="flex items-center justify-between">
            <Label htmlFor="is_active">Account Active</Label>
            <Switch
              id="is_active"
              checked={isActive}
              onCheckedChange={(checked: boolean) => setValue('is_active', checked)}
            />
          </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isCreating || isUpdating || isLoadingAccount}
              >
                {isCreating || isUpdating ? 'Saving...' : isEditing ? 'Update Account' : 'Add Account'}
              </Button>
            </DialogFooter>
          </form>
      </DialogContent>
    </Dialog>
  );
}
