/**
 * Transaction Form Component
 * Form for creating deposits and withdrawals for savings accounts
 * Supports currency conversion when entering amounts in different currencies
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  useCreateDepositMutation,
  useCreateWithdrawalMutation,
  useGetAccountQuery,
} from '@/lib/api/savingsApi';
import { useGetExchangeRateQuery } from '@/lib/api/currenciesApi';
import { formatCurrency } from '@/lib/utils/currency';
import { CurrencyInput } from '@/components/currency/currency-input';

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
  currency: z.string().length(3),
  description: z.string().max(500).optional(),
  category: z.string().max(50).optional(),
  reference_number: z.string().max(100).optional(),
  transaction_date: z.string().optional(),
  exchange_rate: z.number().min(0.000001).optional(),
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
  const [exchangeRateInput, setExchangeRateInput] = React.useState<string>('');

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
      currency: 'USD',
      description: '',
      category: '',
      reference_number: '',
      transaction_date: new Date().toISOString().split('T')[0],
    },
  });

  const selectedCategory = watch('category');
  const selectedCurrency = watch('currency');
  const amount = watch('amount');
  const exchangeRate = watch('exchange_rate');

  // Check if currency conversion is needed
  const isCrossCurrency = account && selectedCurrency && selectedCurrency !== account.currency;
  const convertedAmount = isCrossCurrency && exchangeRate ? amount * exchangeRate : undefined;

  // Auto-fetch exchange rate for cross-currency transactions
  const { data: exchangeRateData, isFetching: isFetchingRate } = useGetExchangeRateQuery(
    { from: selectedCurrency || '', to: account?.currency || '' },
    { skip: !isCrossCurrency || !selectedCurrency || !account?.currency }
  );

  // Auto-set exchange rate when fetched
  useEffect(() => {
    if (exchangeRateData?.rate && isCrossCurrency) {
      const rate = typeof exchangeRateData.rate === 'string'
        ? parseFloat(exchangeRateData.rate)
        : exchangeRateData.rate;
      setValue('exchange_rate', rate);
      setExchangeRateInput(String(rate));
    }
  }, [exchangeRateData, isCrossCurrency, setValue]);

  // Reset form when opening - use account currency as default
  useEffect(() => {
    if (isOpen && account) {
      reset({
        amount: 0,
        currency: account.currency,
        description: '',
        category: '',
        reference_number: '',
        transaction_date: new Date().toISOString().split('T')[0],
      });
      setAmountInput('');
      setExchangeRateInput('');
    }
  }, [isOpen, reset, account]);

  const onSubmit = async (data: FormData) => {
    try {
      // Build submit data with optional currency conversion fields
      const needsConversion = data.currency !== account?.currency;
      const submitData = {
        amount: data.amount,
        description: data.description || undefined,
        category: data.category || undefined,
        reference_number: data.reference_number || undefined,
        transaction_date: data.transaction_date ? `${data.transaction_date}T00:00:00Z` : undefined,
        // Include currency conversion data if currencies differ
        source_currency: needsConversion ? data.currency : undefined,
        exchange_rate: needsConversion ? data.exchange_rate : undefined,
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
    setExchangeRateInput('');
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
          {/* Amount with Currency Selection */}
          <CurrencyInput
            label={tForm('amount')}
            amount={amountInput}
            currency={selectedCurrency || account?.currency || 'USD'}
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

          {/* Cross-currency conversion info */}
          {isCrossCurrency && (
            <Alert variant={isFetchingRate ? 'default' : 'default'}>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {isFetchingRate
                  ? tForm('fetchingExchangeRate')
                  : tForm('exchangeRateLoaded', {
                      fromCurrency: selectedCurrency,
                      toCurrency: account?.currency,
                      rate: exchangeRateData?.rate ? Number(exchangeRateData.rate).toFixed(4) : '...',
                    })}
              </AlertDescription>
            </Alert>
          )}

          {/* Exchange Rate (for cross-currency transactions) */}
          {isCrossCurrency && (
            <div className="space-y-2">
              <Label>{tForm('exchangeRate')}</Label>
              <Input
                type="number"
                step="0.000001"
                min="0.000001"
                value={exchangeRateInput}
                onChange={(e) => {
                  setExchangeRateInput(e.target.value);
                  if (e.target.value === '') {
                    setValue('exchange_rate', undefined);
                  } else {
                    const numValue = parseFloat(e.target.value);
                    if (!isNaN(numValue)) {
                      setValue('exchange_rate', numValue);
                    }
                  }
                }}
                placeholder="1.0"
              />
              <p className="text-xs text-muted-foreground">
                {tForm('exchangeRateHelp', {
                  fromCurrency: selectedCurrency,
                  toCurrency: account?.currency,
                })}
              </p>
              {convertedAmount !== undefined && (
                <p className="text-sm font-medium">
                  {tForm('convertedAmount')}: {formatCurrency(convertedAmount, account?.currency)}
                </p>
              )}
            </div>
          )}

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
