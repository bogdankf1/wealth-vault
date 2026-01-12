/**
 * Transfer Dialog Component
 * Form for creating transfers between savings accounts
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
import { ArrowRight, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  useCreateTransferMutation,
  useListAccountsQuery,
  type SavingsAccount,
} from '@/lib/api/savingsApi';
import { useGetExchangeRateQuery } from '@/lib/api/currenciesApi';
import { formatCurrency } from '@/lib/utils/currency';

const transferSchema = z.object({
  from_account_id: z.string().min(1, 'Source account is required'),
  to_account_id: z.string().min(1, 'Destination account is required'),
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
  exchange_rate: z.number().min(0.000001).optional(),
  transfer_date: z.string().optional(),
}).refine((data) => data.from_account_id !== data.to_account_id, {
  message: 'Source and destination accounts must be different',
  path: ['to_account_id'],
});

type FormData = z.infer<typeof transferSchema>;

interface TransferDialogProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedFromAccountId?: string;
  preselectedToAccountId?: string;
}

export function TransferDialog({
  isOpen,
  onClose,
  preselectedFromAccountId,
  preselectedToAccountId,
}: TransferDialogProps) {
  const [amountInput, setAmountInput] = React.useState<string>('');
  const [exchangeRateInput, setExchangeRateInput] = React.useState<string>('');

  // Translation hooks
  const t = useTranslations('savings.transfers.form');
  const tActions = useTranslations('savings.actions');

  // Get accounts list
  const { data: accountsData } = useListAccountsQuery({ is_active: true });
  const accounts = accountsData?.items || [];

  const [createTransfer, { isLoading }] = useCreateTransferMutation();

  const {
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      from_account_id: preselectedFromAccountId || '',
      to_account_id: preselectedToAccountId || '',
      amount: 0,
      description: '',
      transfer_date: new Date().toISOString().split('T')[0],
    },
  });

  const fromAccountId = watch('from_account_id');
  const toAccountId = watch('to_account_id');
  const amount = watch('amount');
  const exchangeRate = watch('exchange_rate');

  const fromAccount = accounts.find((a) => a.id === fromAccountId);
  const toAccount = accounts.find((a) => a.id === toAccountId);
  const isCrossCurrency = fromAccount && toAccount && fromAccount.currency !== toAccount.currency;
  const convertedAmount = isCrossCurrency && exchangeRate ? amount * exchangeRate : undefined;

  // Auto-fetch exchange rate for cross-currency transfers
  const { data: exchangeRateData, isFetching: isFetchingRate } = useGetExchangeRateQuery(
    { from: fromAccount?.currency || '', to: toAccount?.currency || '' },
    { skip: !isCrossCurrency || !fromAccount?.currency || !toAccount?.currency }
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

  // Reset form when opening
  useEffect(() => {
    if (isOpen) {
      reset({
        from_account_id: preselectedFromAccountId || '',
        to_account_id: preselectedToAccountId || '',
        amount: 0,
        description: '',
        transfer_date: new Date().toISOString().split('T')[0],
      });
      setAmountInput('');
      setExchangeRateInput('');
    }
  }, [isOpen, reset, preselectedFromAccountId, preselectedToAccountId]);

  const onSubmit = async (data: FormData) => {
    try {
      const submitData = {
        from_account_id: data.from_account_id,
        to_account_id: data.to_account_id,
        amount: data.amount,
        description: data.description || undefined,
        exchange_rate: isCrossCurrency ? data.exchange_rate : undefined,
        transfer_date: data.transfer_date ? `${data.transfer_date}T00:00:00Z` : undefined,
      };

      await createTransfer(submitData).unwrap();
      toast.success(t('success'));

      onClose();
      reset();
    } catch (error: unknown) {
      const errorMessage = (error as { data?: { detail?: string } })?.data?.detail;
      toast.error(errorMessage || t('error'));
    }
  };

  const handleClose = () => {
    onClose();
    setAmountInput('');
    setExchangeRateInput('');
    reset();
  };

  const renderAccountOption = (account: SavingsAccount) => (
    <SelectItem key={account.id} value={account.id}>
      <div className="flex items-center justify-between w-full">
        <span>{account.name}</span>
        <span className="text-muted-foreground ml-2">
          {formatCurrency(account.current_balance, account.currency)}
        </span>
      </div>
    </SelectItem>
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* From/To Accounts - Inline Layout */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {/* From Account */}
              <div className="flex-1 space-y-1">
                <Label className="text-xs text-muted-foreground">{t('fromAccount')}</Label>
                <Select
                  value={fromAccountId}
                  onValueChange={(value) => setValue('from_account_id', value)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={t('selectAccount')} />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts
                      .filter((a) => a.id !== toAccountId)
                      .map(renderAccountOption)}
                  </SelectContent>
                </Select>
              </div>

              {/* Arrow */}
              <div className="flex items-center justify-center pt-5">
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>

              {/* To Account */}
              <div className="flex-1 space-y-1">
                <Label className="text-xs text-muted-foreground">{t('toAccount')}</Label>
                <Select
                  value={toAccountId}
                  onValueChange={(value) => setValue('to_account_id', value)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={t('selectAccount')} />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts
                      .filter((a) => a.id !== fromAccountId)
                      .map(renderAccountOption)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Errors */}
            {errors.from_account_id && (
              <p className="text-sm text-destructive">{errors.from_account_id.message}</p>
            )}
            {errors.to_account_id && (
              <p className="text-sm text-destructive">{errors.to_account_id.message}</p>
            )}
          </div>

          {/* Cross-currency info - show exchange rate status */}
          {isCrossCurrency && (
            <Alert variant={isFetchingRate ? 'default' : 'default'}>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {isFetchingRate
                  ? t('fetchingExchangeRate')
                  : t('exchangeRateLoaded', {
                      fromCurrency: fromAccount?.currency,
                      toCurrency: toAccount?.currency,
                      rate: exchangeRateData?.rate ? Number(exchangeRateData.rate).toFixed(4) : '...',
                    })}
              </AlertDescription>
            </Alert>
          )}

          {/* Amount */}
          <div className="space-y-2">
            <Label>{t('amount')} *</Label>
            <div className="relative">
              <Input
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
                {fromAccount?.currency || 'USD'}
              </span>
            </div>
            {errors.amount && (
              <p className="text-sm text-destructive">{errors.amount.message}</p>
            )}
            {fromAccount && amount > fromAccount.current_balance && (
              <p className="text-sm text-destructive">{t('insufficientFunds')}</p>
            )}
          </div>

          {/* Exchange Rate (for cross-currency transfers) */}
          {isCrossCurrency && (
            <div className="space-y-2">
              <Label>{t('exchangeRate')}</Label>
              <div className="relative">
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
              </div>
              <p className="text-xs text-muted-foreground">
                {t('exchangeRateHelp', {
                  fromCurrency: fromAccount?.currency,
                  toCurrency: toAccount?.currency,
                })}
              </p>
              {convertedAmount !== undefined && (
                <p className="text-sm font-medium">
                  {t('convertedAmount')}: {formatCurrency(convertedAmount, toAccount?.currency)}
                </p>
              )}
            </div>
          )}

          {/* Description */}
          <div className="space-y-2">
            <Label>{t('descriptionLabel')}</Label>
            <Textarea
              placeholder={t('descriptionPlaceholder')}
              rows={2}
              onChange={(e) => setValue('description', e.target.value)}
            />
          </div>

          {/* Transfer Date */}
          <div className="space-y-2">
            <Label>{t('transferDate')}</Label>
            <Input
              type="date"
              defaultValue={new Date().toISOString().split('T')[0]}
              onChange={(e) => setValue('transfer_date', e.target.value)}
              className="cursor-pointer"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              {tActions('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isLoading || (fromAccount ? amount > fromAccount.current_balance : false)}
            >
              {isLoading ? t('processing') : t('submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
