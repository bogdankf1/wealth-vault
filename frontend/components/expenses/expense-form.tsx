/**
 * Expense Form Component
 * Form for creating and editing expenses
 */
'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import {
  useCreateExpenseMutation,
  useUpdateExpenseMutation,
  useGetExpenseQuery,
  ExpenseFrequency,
  PaymentMethod,
} from '@/lib/api/expensesApi';
import { useListAccountsQuery } from '@/lib/api/savingsApi';
import { useGetExchangeRateQuery } from '@/lib/api/currenciesApi';
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
import { EXPENSE_CATEGORY_KEYS, CATEGORY_NAME_TO_KEY } from '@/lib/constants/expense-categories';
import { CurrencyInput } from '@/components/currency';
import { formatCurrency } from '@/lib/utils/currency';
import { AlertTriangle } from 'lucide-react';

interface ExpenseFormProps {
  expenseId?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

// Separate component to handle exchange rate query for insufficient balance warning
interface InsufficientBalanceWarningProps {
  selectedAccountId: string | null | undefined;
  expenseAmount: number;
  expenseCurrency: string;
  accounts: Array<{ id: string; currency: string; current_balance: number | null }>;
  warningMessage: string;
}

function InsufficientBalanceWarning({
  selectedAccountId,
  expenseAmount,
  expenseCurrency,
  accounts,
  warningMessage,
}: InsufficientBalanceWarningProps) {
  // Find selected account
  const selectedAccount = selectedAccountId && selectedAccountId !== 'none'
    ? accounts.find(a => a.id === selectedAccountId)
    : null;

  // Determine if we need currency conversion
  const needsConversion = selectedAccount && selectedAccount.currency !== expenseCurrency;

  // Fetch exchange rate only when needed
  const { data: exchangeRate } = useGetExchangeRateQuery(
    { from: expenseCurrency, to: selectedAccount?.currency || 'USD' },
    { skip: !needsConversion || !selectedAccount }
  );

  if (!selectedAccount || expenseAmount <= 0) return null;

  const accountBalance = selectedAccount.current_balance || 0;

  // Convert expense amount to account currency if needed
  let convertedExpenseAmount = expenseAmount;
  if (needsConversion && exchangeRate?.rate) {
    convertedExpenseAmount = expenseAmount * parseFloat(exchangeRate.rate);
  }

  // Don't show warning if currencies differ and we don't have the rate yet
  if (needsConversion && !exchangeRate?.rate) return null;

  // Check if expense exceeds balance
  if (convertedExpenseAmount <= accountBalance) return null;

  // Format the message with actual values
  const formattedMessage = warningMessage
    .replace('{amount}', formatCurrency(expenseAmount, expenseCurrency))
    .replace('{balance}', formatCurrency(accountBalance, selectedAccount.currency));

  return (
    <div className="flex items-center gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
      <p className="text-xs text-amber-700 dark:text-amber-300">
        {formattedMessage}
      </p>
    </div>
  );
}

export function ExpenseForm({ expenseId, isOpen, onClose }: ExpenseFormProps) {
  const isEditing = Boolean(expenseId);
  const tForm = useTranslations('expenses.form');
  const tFrequency = useTranslations('expenses.frequency');
  const tActions = useTranslations('expenses.actions');
  const tOverview = useTranslations('expenses.overview');
  const tCategories = useTranslations('expenses.categories');

  // Form validation schema with translated messages
  const expenseSchema = z.object({
    name: z.string().min(1, tForm('nameRequired')).max(100),
    description: z.string().max(500).optional(),
    category: z.string().max(50).optional(),
    amount: z.number()
      .min(0, tForm('amountPositive'))
      .refine(
        (val) => {
          const rounded = Math.round(val * 100) / 100;
          return Math.abs(val - rounded) < 0.00001;
        },
        { message: tForm('amountDecimals') }
      ),
    currency: z.string().length(3),
    frequency: z.enum([
      'one_time',
      'daily',
      'weekly',
      'biweekly',
      'monthly',
      'quarterly',
      'annually',
    ] as const),
    is_active: z.boolean(),
    date: z.string().optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    // Payment integration fields
    payment_account_id: z.string().optional().nullable(),
    payment_method: z.enum(['cash', 'card', 'transfer', 'check', 'other'] as const).optional().nullable(),
    auto_pay: z.boolean().optional(),
    sync_historical: z.boolean().optional(),
  });

  type FormData = z.infer<typeof expenseSchema>;

  // Local state to track the string value of amount while user is typing
  const [amountInput, setAmountInput] = React.useState<string>('');

  // Get savings accounts for payment account dropdown
  const { data: accountsData } = useListAccountsQuery({
    is_active: true,
    page_size: 100,
  });

  const {
    data: existingExpense,
    isLoading: isLoadingExpense,
    error: loadError,
  } = useGetExpenseQuery(expenseId!, {
    skip: !expenseId,
  });

  const [createExpense, { isLoading: isCreating, error: createError }] =
    useCreateExpenseMutation();

  const [updateExpense, { isLoading: isUpdating, error: updateError }] =
    useUpdateExpenseMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      currency: 'USD',
      frequency: 'one_time',
      is_active: true,
      date: new Date().toISOString().split('T')[0],
      payment_account_id: null,
      payment_method: null,
      auto_pay: false,
      sync_historical: false,
    },
  });

  // Helper to convert legacy category name to key
  const getCategoryKey = (category: string | undefined | null): string => {
    if (!category) return '';
    // If it's already a valid key, return it
    if (EXPENSE_CATEGORY_KEYS.includes(category as typeof EXPENSE_CATEGORY_KEYS[number])) {
      return category;
    }
    // Convert legacy name to key
    return CATEGORY_NAME_TO_KEY[category] || category;
  };

  // Load existing expense data or reset for new expense
  useEffect(() => {
    if (isEditing && existingExpense) {
      const isOneTime = existingExpense.frequency === 'one_time';
      const categoryKey = getCategoryKey(existingExpense.category);
      const formData = {
        name: existingExpense.name,
        description: existingExpense.description || '',
        category: categoryKey,
        amount: typeof existingExpense.amount === 'string'
          ? parseFloat(existingExpense.amount)
          : existingExpense.amount,
        currency: existingExpense.currency,
        frequency: existingExpense.frequency as ExpenseFrequency,
        is_active: existingExpense.is_active,
        // Extract date directly from string to avoid timezone conversion
        date: isOneTime && existingExpense.date
          ? existingExpense.date.split('T')[0]
          : '',
        start_date: !isOneTime && existingExpense.start_date
          ? existingExpense.start_date.split('T')[0]
          : '',
        end_date: !isOneTime && existingExpense.end_date
          ? existingExpense.end_date.split('T')[0]
          : '',
        // Payment integration fields
        payment_account_id: existingExpense.payment_account_id || null,
        payment_method: existingExpense.payment_method || null,
        auto_pay: existingExpense.auto_pay || false,
        sync_historical: false, // Always reset sync_historical when editing
      };

      reset(formData);

      // Set the amount input string
      const amountNum = typeof existingExpense.amount === 'string'
        ? parseFloat(existingExpense.amount)
        : existingExpense.amount;
      setAmountInput(String(amountNum));

      setTimeout(() => {
        if (categoryKey) {
          setValue('category', categoryKey, { shouldDirty: true });
        }
        setValue('frequency', existingExpense.frequency as ExpenseFrequency, { shouldDirty: true });
        setValue('currency', existingExpense.currency, { shouldDirty: true });
        if (existingExpense.payment_account_id) {
          setValue('payment_account_id', existingExpense.payment_account_id, { shouldDirty: true });
        }
        if (existingExpense.payment_method) {
          setValue('payment_method', existingExpense.payment_method, { shouldDirty: true });
        }
      }, 0);
    } else if (!isEditing && isOpen) {
      reset({
        currency: 'USD',
        frequency: 'one_time',
        is_active: true,
        date: new Date().toISOString().split('T')[0],
        payment_account_id: null,
        payment_method: null,
        auto_pay: false,
        sync_historical: false,
      });
      setAmountInput('');
    }
  }, [isEditing, existingExpense, isOpen, reset, setValue]);

  const onSubmit = async (data: FormData) => {
    try {
      const isOneTime = data.frequency === 'one_time';

      const submitData: {
        name: string;
        description?: string;
        category?: string;
        amount: number;
        currency: string;
        frequency: ExpenseFrequency;
        is_active: boolean;
        date?: string;
        start_date?: string;
        end_date?: string;
        payment_account_id?: string | null;
        payment_method?: PaymentMethod;
        auto_pay?: boolean;
        sync_historical?: boolean;
      } = {
        name: data.name,
        description: data.description,
        category: data.category,
        amount: data.amount,
        currency: data.currency,
        frequency: data.frequency,
        is_active: data.is_active,
        payment_account_id: data.payment_account_id || null,
        payment_method: data.payment_method || undefined,
        auto_pay: data.auto_pay,
        sync_historical: data.sync_historical,
      };

      if (isOneTime) {
        // For one-time: use date field (keep date-only format to avoid timezone issues)
        submitData.date = data.date ? `${data.date}T00:00:00` : undefined;
      } else {
        // For recurring: use start_date and end_date (keep date-only format to avoid timezone issues)
        submitData.start_date = data.start_date ? `${data.start_date}T00:00:00` : undefined;
        submitData.end_date = data.end_date ? `${data.end_date}T00:00:00` : undefined;
      }

      if (isEditing && expenseId) {
        await updateExpense({ id: expenseId, data: submitData }).unwrap();
        toast.success(tForm('updateSuccess'));
      } else {
        await createExpense(submitData).unwrap();
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
    reset({
      currency: 'USD',
      frequency: 'monthly',
      is_active: true,
      date: new Date().toISOString().split('T')[0],
      payment_account_id: null,
      payment_method: null,
      auto_pay: false,
      sync_historical: false,
    });
  };

  // Payment method options
  const paymentMethodOptions: PaymentMethod[] = ['cash', 'card', 'transfer', 'check', 'other'];

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

        {isLoadingExpense ? (
          <LoadingForm count={6} />
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
                rows={3}
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
                  {EXPENSE_CATEGORY_KEYS.map((key) => (
                    <SelectItem key={key} value={key}>
                      {tCategories(key)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <CurrencyInput
              key={`currency-${existingExpense?.id || 'new'}-${watch('currency')}`}
              label={tForm('amount')}
              amount={amountInput}
              currency={watch('currency')}
              onAmountChange={(value) => {
                // Update the local string state to allow typing decimal points
                setAmountInput(value);

                // Update the form state with the numeric value
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
              <Label htmlFor="frequency">{tForm('frequency')} *</Label>
              <Select
                value={watch('frequency')}
                onValueChange={(value) =>
                  setValue('frequency', value as ExpenseFrequency)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['one_time', 'daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'annually'] as const).map((freq) => (
                    <SelectItem key={freq} value={freq}>
                      {tFrequency(freq)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {watch('frequency') === 'one_time' ? (
              <div className="space-y-2">
                <Label htmlFor="date">{tForm('date')}</Label>
                <Input
                  id="date"
                  type="date"
                  {...register('date')}
                  className="cursor-pointer"
                  style={{ colorScheme: 'light' }}
                />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="start_date">{tForm('startDate')}</Label>
                  <Input
                    id="start_date"
                    type="date"
                    {...register('start_date')}
                    className="cursor-pointer"
                    style={{ colorScheme: 'light' }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_date">{tForm('endDate')} (Optional)</Label>
                  <Input
                    id="end_date"
                    type="date"
                    {...register('end_date')}
                    className="cursor-pointer"
                    style={{ colorScheme: 'light' }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">{tForm('isActive')}</Label>
              <Switch
                id="is_active"
                checked={watch('is_active')}
                onCheckedChange={(checked: boolean) => setValue('is_active', checked)}
              />
            </div>

            {/* Payment Integration Section */}
            <div className="space-y-4 pt-4 border-t">
              <h4 className="text-sm font-medium">{tForm('accountIntegration')}</h4>

              {/* Payment Account */}
              <div className="space-y-2">
                <Label htmlFor="payment_account_id">{tForm('paymentAccount')}</Label>
                <Select
                  value={watch('payment_account_id') || 'none'}
                  onValueChange={(value) => {
                    const accountId = value === 'none' ? null : value;
                    setValue('payment_account_id', accountId);
                    // Auto-enable auto_pay and sync_historical when account is selected
                    if (accountId) {
                      setValue('auto_pay', true);
                      setValue('sync_historical', true);
                    } else {
                      setValue('auto_pay', false);
                      setValue('sync_historical', false);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={tForm('paymentAccountPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{tForm('noPaymentAccount')}</SelectItem>
                    {accountsData?.items?.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        <div className="flex justify-between items-center w-full gap-2">
                          <span>{account.name}</span>
                          <span className="text-muted-foreground text-xs">
                            {formatCurrency(account.current_balance || 0, account.currency)}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {tForm('paymentAccountHelp')}
                </p>

                {/* Warning if expense amount exceeds account balance */}
                <InsufficientBalanceWarning
                  selectedAccountId={watch('payment_account_id')}
                  expenseAmount={watch('amount') || 0}
                  expenseCurrency={watch('currency')}
                  accounts={accountsData?.items || []}
                  warningMessage={tForm('insufficientBalanceWarning', {
                    amount: '{amount}',
                    balance: '{balance}'
                  })}
                />
              </div>

              {/* Auto Pay Toggle - only visible when payment account is selected */}
              {watch('payment_account_id') && watch('payment_account_id') !== 'none' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="auto_pay">{tForm('autoPay')}</Label>
                      <p className="text-xs text-muted-foreground">
                        {tForm('autoPayHelp')}
                      </p>
                    </div>
                    <Switch
                      id="auto_pay"
                      checked={watch('auto_pay') || false}
                      onCheckedChange={(checked: boolean) => {
                        setValue('auto_pay', checked);
                        // Auto-enable sync_historical when auto_pay is turned on
                        if (checked) {
                          setValue('sync_historical', true);
                        }
                      }}
                    />
                  </div>

                  {/* Sync Historical Checkbox - only visible when auto_pay is enabled */}
                  {watch('auto_pay') && (
                    <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50">
                      <input
                        type="checkbox"
                        id="sync_historical"
                        checked={watch('sync_historical') || false}
                        onChange={(e) => setValue('sync_historical', e.target.checked)}
                        className="mt-1"
                      />
                      <div className="space-y-0.5">
                        <Label htmlFor="sync_historical" className="text-sm font-normal cursor-pointer">
                          {tForm('syncHistorical')}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {tForm('syncHistoricalHelp')}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Payment Method */}
              <div className="space-y-2">
                <Label htmlFor="payment_method">{tForm('paymentMethod')}</Label>
                <Select
                  value={watch('payment_method') || 'none'}
                  onValueChange={(value) => setValue('payment_method', value === 'none' ? null : value as PaymentMethod)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={tForm('paymentMethodPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{tForm('noPaymentMethod')}</SelectItem>
                    {paymentMethodOptions.map((method) => (
                      <SelectItem key={method} value={method}>
                        {tForm(`paymentMethods.${method}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                {tActions('cancel')}
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading
                  ? tForm('saving')
                  : isEditing
                  ? tActions('save')
                  : tOverview('addExpense')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
