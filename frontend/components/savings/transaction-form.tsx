/**
 * Transaction Form Component
 * Form for creating deposits and withdrawals for savings accounts
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  useCreateDepositMutation,
  useCreateWithdrawalMutation,
  useGetAccountQuery,
} from '@/lib/api/savingsApi';
import { formatCurrency } from '@/lib/utils/currency';

const transactionSchema = z.object({
  amount: z.number()
    .min(0.01, 'Amount must be greater than 0')
    .refine(
      (val) => {
        const rounded = Math.round(val * 100) / 100;
        return Math.abs(val - rounded) < 0.00001;
      },
      { message: 'Amount can have at most 2 decimal places' }
    ),
  description: z.string().max(500).optional(),
  category: z.string().max(50).optional(),
  reference_number: z.string().max(100).optional(),
  transaction_date: z.string().optional(),
});

type FormData = z.infer<typeof transactionSchema>;

export type TransactionFormType = 'deposit' | 'withdrawal';

interface TransactionFormProps {
  accountId: string;
  type: TransactionFormType;
  isOpen: boolean;
  onClose: () => void;
}

export function TransactionForm({ accountId, type, isOpen, onClose }: TransactionFormProps) {
  const [amountInput, setAmountInput] = React.useState<string>('');

  // Translation hooks
  const tForm = useTranslations('savings.transactions.form');
  const tActions = useTranslations('savings.actions');
  const tCategories = useTranslations('savings.transactions.categories');

  // Category options based on transaction type
  const DEPOSIT_CATEGORIES = [
    { value: 'salary', label: tCategories('salary') },
    { value: 'bonus', label: tCategories('bonus') },
    { value: 'gift', label: tCategories('gift') },
    { value: 'refund', label: tCategories('refund') },
    { value: 'investment_return', label: tCategories('investmentReturn') },
    { value: 'savings_transfer', label: tCategories('savingsTransfer') },
    { value: 'other', label: tCategories('other') },
  ];

  const WITHDRAWAL_CATEGORIES = [
    { value: 'bills', label: tCategories('bills') },
    { value: 'shopping', label: tCategories('shopping') },
    { value: 'food', label: tCategories('food') },
    { value: 'transport', label: tCategories('transport') },
    { value: 'healthcare', label: tCategories('healthcare') },
    { value: 'entertainment', label: tCategories('entertainment') },
    { value: 'investment', label: tCategories('investment') },
    { value: 'savings_transfer', label: tCategories('savingsTransfer') },
    { value: 'other', label: tCategories('other') },
  ];

  const categoryOptions = type === 'deposit' ? DEPOSIT_CATEGORIES : WITHDRAWAL_CATEGORIES;

  // Get account info for currency display
  const { data: account } = useGetAccountQuery(accountId, {
    skip: !accountId,
  });

  const [createDeposit, { isLoading: isDepositing }] = useCreateDepositMutation();
  const [createWithdrawal, { isLoading: isWithdrawing }] = useCreateWithdrawalMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      amount: 0,
      description: '',
      category: '',
      reference_number: '',
      transaction_date: new Date().toISOString().split('T')[0],
    },
  });

  const selectedCategory = watch('category');

  // Reset form when opening
  useEffect(() => {
    if (isOpen) {
      reset({
        amount: 0,
        description: '',
        category: '',
        reference_number: '',
        transaction_date: new Date().toISOString().split('T')[0],
      });
      setAmountInput('');
    }
  }, [isOpen, reset]);

  const onSubmit = async (data: FormData) => {
    try {
      const submitData = {
        amount: data.amount,
        description: data.description || undefined,
        category: data.category || undefined,
        reference_number: data.reference_number || undefined,
        transaction_date: data.transaction_date ? `${data.transaction_date}T00:00:00Z` : undefined,
      };

      if (type === 'deposit') {
        await createDeposit({ accountId, data: submitData }).unwrap();
        toast.success(tForm('depositSuccess'));
      } else {
        await createWithdrawal({ accountId, data: submitData }).unwrap();
        toast.success(tForm('withdrawalSuccess'));
      }

      onClose();
      reset();
    } catch (error: unknown) {
      const errorMessage = (error as { data?: { detail?: string } })?.data?.detail;
      if (type === 'deposit') {
        toast.error(errorMessage || tForm('depositError'));
      } else {
        toast.error(errorMessage || tForm('withdrawalError'));
      }
    }
  };

  const handleClose = () => {
    onClose();
    setAmountInput('');
    reset();
  };

  const isLoading = isDepositing || isWithdrawing;
  const isDeposit = type === 'deposit';

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isDeposit ? tForm('depositTitle') : tForm('withdrawalTitle')}
          </DialogTitle>
          <DialogDescription>
            {isDeposit ? tForm('depositDescription') : tForm('withdrawalDescription')}
            {account && (
              <span className="block mt-1 font-medium">
                {account.name} ({formatCurrency(account.current_balance, account.currency)})
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">{tForm('amount')} *</Label>
            <div className="relative">
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                value={amountInput}
                onChange={(e) => {
                  setAmountInput(e.target.value);
                  if (e.target.value === '') {
                    setValue('amount', 0, { shouldValidate: true });
                  } else {
                    const numValue = parseFloat(e.target.value);
                    if (!isNaN(numValue)) {
                      setValue('amount', numValue, { shouldValidate: true });
                    }
                  }
                }}
                placeholder="0.00"
                className="pr-16"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {account?.currency || 'USD'}
              </span>
            </div>
            {errors.amount && (
              <p className="text-sm text-destructive">{errors.amount.message}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">{tForm('description')}</Label>
            <Textarea
              id="description"
              placeholder={tForm('descriptionPlaceholder')}
              rows={2}
              {...register('description')}
            />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description.message}</p>
            )}
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="category">{tForm('category')}</Label>
            <Select
              value={selectedCategory || ''}
              onValueChange={(value) => setValue('category', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={isDeposit ? tForm('depositCategoryPlaceholder') : tForm('withdrawalCategoryPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reference Number */}
          <div className="space-y-2">
            <Label htmlFor="reference_number">{tForm('referenceNumber')}</Label>
            <Input
              id="reference_number"
              placeholder={tForm('referenceNumberPlaceholder')}
              {...register('reference_number')}
            />
          </div>

          {/* Transaction Date */}
          <div className="space-y-2">
            <Label htmlFor="transaction_date">{tForm('transactionDate')}</Label>
            <Input
              id="transaction_date"
              type="date"
              {...register('transaction_date')}
              className="cursor-pointer"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              {tActions('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              variant={isDeposit ? 'default' : 'destructive'}
            >
              {isLoading
                ? tForm('processing')
                : isDeposit
                ? tForm('submitDeposit')
                : tForm('submitWithdrawal')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
