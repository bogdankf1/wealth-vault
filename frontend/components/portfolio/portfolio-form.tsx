/**
 * Portfolio Asset Form Component
 * Form for creating and editing portfolio assets
 */
'use client';

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import * as z from 'zod';
import {
  useCreatePortfolioAssetMutation,
  useUpdatePortfolioAssetMutation,
  useGetPortfolioAssetQuery,
  useLazyValidateTickerQuery,
  PortfolioAssetCreate,
} from '@/lib/api/portfolioApi';
import { useListAccountsQuery } from '@/lib/api/savingsApi';
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
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { AccountSelect } from '@/components/ui/account-select';
import { formatCurrency } from '@/lib/utils/currency';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

// Form validation schema
const portfolioAssetSchema = z.object({
  asset_name: z.string().min(1, 'Asset name is required').max(100),
  asset_type: z.string().max(50).optional(),
  symbol: z.string().max(20).optional(),
  description: z.string().max(500).optional(),
  quantity: z.number().gt(0, 'Quantity must be greater than 0'),
  purchase_price: z.number()
    .gt(0, 'Purchase price must be greater than 0')
    .refine(
      (val) => {
        const rounded = Math.round(val * 100) / 100;
        return Math.abs(val - rounded) < 0.00001;
      },
      { message: 'Amount can have at most 2 decimal places' }
    ),
  current_price: z.number().min(0),
  currency: z.string().length(3),
  purchase_date: z.string().min(1, 'Purchase date is required'),
  is_active: z.boolean(),
  // Payment account integration
  payment_account_id: z.string().optional().nullable(),
  auto_transact: z.boolean(),
  sync_historical: z.boolean(),
  // Dynamic pricing
  ticker: z.string().max(20).optional(),
  use_dynamic_pricing: z.boolean(),
  // Dividend tracking
  is_dividend_paying: z.boolean(),
  dividend_yield: z.number().min(0).max(1).optional().nullable(),
  dividend_per_share: z.number().min(0).optional().nullable(),
  dividend_frequency: z.string().optional().nullable(),
  next_dividend_date: z.string().optional().nullable(),
  // Dividend deposit account
  dividend_account_id: z.string().optional().nullable(),
  auto_deposit_dividends: z.boolean(),
  // Cost basis
  cost_basis_method: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
  // Current price is required only when dynamic pricing is disabled
  if (!data.use_dynamic_pricing && data.current_price <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Current price is required when dynamic pricing is disabled',
      path: ['current_price'],
    });
  }
  // Ticker is required when dynamic pricing is enabled
  if (data.use_dynamic_pricing && !data.ticker) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Ticker is required when dynamic pricing is enabled',
      path: ['ticker'],
    });
  }
});

type FormData = z.infer<typeof portfolioAssetSchema>;

interface PortfolioFormProps {
  assetId?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

const DIVIDEND_FREQUENCY_OPTIONS = [
  { value: 'monthly', labelKey: 'monthly' },
  { value: 'quarterly', labelKey: 'quarterly' },
  { value: 'semi_annually', labelKey: 'semiAnnually' },
  { value: 'annually', labelKey: 'annually' },
];

const COST_BASIS_METHODS = [
  { value: 'average', labelKey: 'average' },
  { value: 'fifo', labelKey: 'fifo' },
  { value: 'lifo', labelKey: 'lifo' },
];

export function PortfolioForm({ assetId, isOpen, onClose }: PortfolioFormProps) {
  const isEditing = Boolean(assetId);

  // Translation hooks
  const tForm = useTranslations('portfolio.form');
  const tActions = useTranslations('portfolio.actions');
  const tAssetTypes = useTranslations('portfolio.assetTypes');

  const ASSET_TYPE_OPTIONS = [
    { value: 'Stocks', label: tAssetTypes('stocks') },
    { value: 'Bonds', label: tAssetTypes('bonds') },
    { value: 'ETFs', label: tAssetTypes('etfs') },
    { value: 'Crypto', label: tAssetTypes('crypto') },
    { value: 'Real Estate', label: tAssetTypes('realEstate') },
    { value: 'Commodities', label: tAssetTypes('commodities') },
    { value: 'Mutual Funds', label: tAssetTypes('mutualFunds') },
    { value: 'Other', label: tAssetTypes('other') },
  ];

  // Local state
  const [purchasePriceInput, setPurchasePriceInput] = useState<string>('');
  const [tickerValidationState, setTickerValidationState] = useState<'idle' | 'loading' | 'valid' | 'invalid'>('idle');
  const [tickerPrice, setTickerPrice] = useState<number | null>(null);

  // Queries
  const {
    data: existingAsset,
    isLoading: isLoadingAsset,
    error: loadError,
  } = useGetPortfolioAssetQuery(assetId!, { skip: !assetId });

  const { data: accountsData } = useListAccountsQuery({ page: 1, page_size: 100 });
  const accounts = accountsData?.items || [];

  const [validateTicker] = useLazyValidateTickerQuery();

  const [createAsset, { isLoading: isCreating, error: createError }] =
    useCreatePortfolioAssetMutation();

  const [updateAsset, { isLoading: isUpdating, error: updateError }] =
    useUpdatePortfolioAssetMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(portfolioAssetSchema),
    defaultValues: {
      currency: 'USD',
      is_active: true,
      quantity: 0,
      purchase_price: 0,
      current_price: 0,
      purchase_date: new Date().toISOString().split('T')[0],
      auto_transact: false,
      sync_historical: false,
      use_dynamic_pricing: true,
      is_dividend_paying: false,
      auto_deposit_dividends: false,
    },
  });

  // Watch values
  const watchTicker = watch('ticker');
  const watchUseDynamicPricing = watch('use_dynamic_pricing');
  const watchIsDividendPaying = watch('is_dividend_paying');
  const watchPaymentAccountId = watch('payment_account_id');
  const watchDividendAccountId = watch('dividend_account_id');

  // Load existing asset data
  useEffect(() => {
    if (isEditing && existingAsset) {
      const formData: FormData = {
        asset_name: existingAsset.asset_name,
        asset_type: existingAsset.asset_type || '',
        symbol: existingAsset.symbol || '',
        description: existingAsset.description || '',
        quantity: existingAsset.quantity,
        purchase_price: typeof existingAsset.purchase_price === 'string'
          ? parseFloat(existingAsset.purchase_price)
          : existingAsset.purchase_price,
        current_price: existingAsset.current_price,
        currency: existingAsset.currency,
        is_active: existingAsset.is_active,
        purchase_date: existingAsset.purchase_date.split('T')[0],
        // Payment integration
        payment_account_id: existingAsset.payment_account_id || null,
        auto_transact: existingAsset.auto_transact || false,
        sync_historical: false,
        // Dynamic pricing
        ticker: existingAsset.ticker || '',
        use_dynamic_pricing: existingAsset.use_dynamic_pricing || false,
        // Dividends
        is_dividend_paying: existingAsset.is_dividend_paying || false,
        dividend_yield: existingAsset.dividend_yield || null,
        dividend_per_share: existingAsset.dividend_per_share || null,
        dividend_frequency: existingAsset.dividend_frequency || null,
        next_dividend_date: existingAsset.next_dividend_date?.split('T')[0] || null,
        dividend_account_id: existingAsset.dividend_account_id || null,
        auto_deposit_dividends: existingAsset.auto_deposit_dividends || false,
        cost_basis_method: existingAsset.cost_basis_method || null,
      };

      reset(formData);
      setPurchasePriceInput(String(formData.purchase_price));

      if (existingAsset.ticker) {
        setTickerValidationState('valid');
      }
    } else if (!isEditing && isOpen) {
      reset({
        asset_name: '',
        asset_type: '',
        symbol: '',
        description: '',
        quantity: 0,
        purchase_price: 0,
        current_price: 0,
        currency: 'USD',
        is_active: true,
        purchase_date: new Date().toISOString().split('T')[0],
        payment_account_id: null,
        auto_transact: false,
        sync_historical: false,
        ticker: '',
        use_dynamic_pricing: true,
        is_dividend_paying: false,
        dividend_yield: null,
        dividend_per_share: null,
        dividend_frequency: null,
        next_dividend_date: null,
        dividend_account_id: null,
        auto_deposit_dividends: false,
        cost_basis_method: null,
      });
      setPurchasePriceInput('');
      setTickerValidationState('idle');
      setTickerPrice(null);
    }
  }, [isEditing, existingAsset, isOpen, reset]);

  // Validate ticker
  const handleValidateTicker = async () => {
    const ticker = watch('ticker');
    if (!ticker) return;

    setTickerValidationState('loading');
    try {
      const result = await validateTicker(ticker).unwrap();
      if (result.valid && result.price) {
        setTickerValidationState('valid');
        setTickerPrice(result.price);
        // Optionally auto-fill current price
        if (!isEditing || watch('current_price') === 0) {
          setValue('current_price', result.price);
        }
        toast.success(tForm('tickerValid'));
      } else {
        setTickerValidationState('invalid');
        setTickerPrice(null);
        toast.error(tForm('tickerInvalid'));
      }
    } catch {
      setTickerValidationState('invalid');
      setTickerPrice(null);
      toast.error(tForm('tickerInvalid'));
    }
  };

  const onSubmit = async (data: FormData) => {
    try {
      // When dynamic pricing is enabled and we have a ticker price, use that
      const finalCurrentPrice = data.use_dynamic_pricing && tickerPrice
        ? tickerPrice
        : data.current_price;

      const submitData: PortfolioAssetCreate = {
        asset_name: data.asset_name,
        asset_type: data.asset_type || undefined,
        symbol: data.symbol || undefined,
        description: data.description || undefined,
        quantity: data.quantity,
        purchase_price: data.purchase_price,
        current_price: finalCurrentPrice,
        currency: data.currency,
        purchase_date: `${data.purchase_date}T00:00:00`,
        is_active: data.is_active,
        // Payment integration
        payment_account_id: data.payment_account_id || undefined,
        auto_transact: data.auto_transact,
        sync_historical: data.sync_historical,
        // Dynamic pricing
        ticker: data.ticker || undefined,
        use_dynamic_pricing: data.use_dynamic_pricing,
        // Dividends
        is_dividend_paying: data.is_dividend_paying,
        dividend_yield: data.dividend_yield || undefined,
        dividend_per_share: data.dividend_per_share || undefined,
        dividend_frequency: data.dividend_frequency || undefined,
        next_dividend_date: data.next_dividend_date ? `${data.next_dividend_date}T00:00:00` : undefined,
        dividend_account_id: data.dividend_account_id || undefined,
        auto_deposit_dividends: data.auto_deposit_dividends,
        cost_basis_method: data.cost_basis_method || undefined,
      };

      if (isEditing && assetId) {
        await updateAsset({ id: assetId, data: submitData }).unwrap();
        toast.success(tForm('updateSuccess'));
      } else {
        await createAsset(submitData).unwrap();
        toast.success(tForm('createSuccess'));
      }

      onClose();
      reset();
    } catch {
      toast.error(isEditing ? tForm('updateError') : tForm('createError'));
    }
  };

  const handleClose = () => {
    onClose();
    setPurchasePriceInput('');
    setTickerValidationState('idle');
    setTickerPrice(null);
    reset();
  };

  const isLoading = isCreating || isUpdating;
  const error = createError || updateError || loadError;

  // Calculate metrics for display
  const quantity = watch('quantity') || 0;
  const purchasePrice = watch('purchase_price') || 0;
  const currentPriceInput = watch('current_price') || 0;
  const selectedCurrency = watch('currency') || 'USD';
  // Use ticker price when dynamic pricing is enabled and validated
  const effectiveCurrentPrice = watchUseDynamicPricing && tickerPrice ? tickerPrice : currentPriceInput;
  const totalInvested = quantity * purchasePrice;
  const currentValue = quantity * effectiveCurrentPrice;
  const totalReturn = currentValue - totalInvested;
  const returnPercentage = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0;

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

        {isLoadingAsset ? (
          <LoadingForm count={8} />
        ) : error ? (
          <ApiErrorState error={error} />
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Basic Info */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="asset_name">{tForm('assetName')} *</Label>
                <Input
                  id="asset_name"
                  placeholder={tForm('assetNamePlaceholder')}
                  {...register('asset_name')}
                />
                {errors.asset_name && (
                  <p className="text-sm text-destructive">{errors.asset_name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="symbol">{tForm('symbol')}</Label>
                <Input
                  id="symbol"
                  placeholder={tForm('symbolPlaceholder')}
                  {...register('symbol')}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="asset_type">{tForm('assetType')}</Label>
              <Select
                key={`asset_type_${watch('asset_type') || 'empty'}`}
                value={watch('asset_type') || undefined}
                onValueChange={(value) => setValue('asset_type', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={tForm('assetTypePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{tForm('description')}</Label>
              <Textarea
                id="description"
                placeholder={tForm('descriptionPlaceholder')}
                rows={2}
                {...register('description')}
              />
            </div>

            {/* Quantity & Prices */}
            <div className="space-y-2">
              <Label htmlFor="quantity">{tForm('quantity')} *</Label>
              <Input
                id="quantity"
                type="number"
                step="0.00000001"
                placeholder={tForm('quantityPlaceholder')}
                {...register('quantity', { valueAsNumber: true })}
              />
              {errors.quantity && (
                <p className="text-sm text-destructive">{errors.quantity.message}</p>
              )}
            </div>

            <CurrencyInput
              key={`currency-${assetId || 'new'}-${watch('currency')}`}
              label={tForm('purchasePrice')}
              amount={purchasePriceInput}
              currency={watch('currency')}
              onAmountChange={(value) => {
                setPurchasePriceInput(value);
                if (value === '') {
                  setValue('purchase_price', 0, { shouldValidate: true });
                } else {
                  const numValue = parseFloat(value);
                  if (!isNaN(numValue)) {
                    setValue('purchase_price', numValue, { shouldValidate: true });
                  }
                }
              }}
              onCurrencyChange={(value) => setValue('currency', value)}
              required
              error={errors.purchase_price?.message}
              placeholder={tForm('purchasePricePlaceholder')}
            />

            {/* Current Price - only shown when dynamic pricing is disabled */}
            {!watchUseDynamicPricing && (
              <div className="space-y-2">
                <Label htmlFor="current_price">{tForm('currentPrice')} *</Label>
                <Input
                  id="current_price"
                  type="number"
                  step="0.01"
                  placeholder={tForm('currentPricePlaceholder')}
                  {...register('current_price', { valueAsNumber: true })}
                />
                {errors.current_price && (
                  <p className="text-sm text-destructive">{errors.current_price.message}</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="purchase_date">{tForm('purchaseDate')} *</Label>
              <Input
                id="purchase_date"
                type="date"
                {...register('purchase_date')}
                className="cursor-pointer"
              />
            </div>

            {/* Calculated Metrics */}
            {(quantity > 0 && purchasePrice > 0 && effectiveCurrentPrice > 0) && (
              <div className="rounded-lg border bg-muted p-4 space-y-2">
                <h4 className="text-sm font-semibold">{tForm('calculatedMetrics')}</h4>
                <div className="grid gap-2 sm:grid-cols-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{tForm('totalInvested')}</span>
                    <CurrencyDisplay amount={totalInvested} currency={selectedCurrency} showSymbol showCode={false} />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{tForm('totalValue')}</span>
                    <CurrencyDisplay amount={currentValue} currency={selectedCurrency} showSymbol showCode={false} />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{tForm('totalReturn')}</span>
                    <span className={totalReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                      <CurrencyDisplay amount={totalReturn} currency={selectedCurrency} showSymbol showCode={false} />
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{tForm('returnPercentage')}</span>
                    <span className={returnPercentage >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                      {returnPercentage >= 0 ? '+' : ''}{returnPercentage.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Dynamic Pricing Section */}
            <div className="space-y-4 border-t pt-4 mt-4">
              <h3 className="text-base font-semibold text-foreground">{tForm('dynamicPricing')}</h3>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="use_dynamic_pricing">{tForm('useDynamicPricing')}</Label>
                  <p className="text-xs text-muted-foreground">{tForm('useDynamicPricingHelp')}</p>
                </div>
                <Switch
                  id="use_dynamic_pricing"
                  checked={watchUseDynamicPricing}
                  onCheckedChange={(checked) => setValue('use_dynamic_pricing', checked)}
                />
              </div>

              {watchUseDynamicPricing && (
                <div className="space-y-2">
                  <Label htmlFor="ticker">{tForm('ticker')} *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="ticker"
                      placeholder={tForm('tickerPlaceholder')}
                      {...register('ticker')}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleValidateTicker}
                      disabled={!watchTicker || tickerValidationState === 'loading'}
                    >
                      {tickerValidationState === 'loading' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : tickerValidationState === 'valid' ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                      ) : tickerValidationState === 'invalid' ? (
                        <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{tForm('tickerHelp')}</p>
                  {errors.ticker && (
                    <p className="text-sm text-destructive">{errors.ticker.message}</p>
                  )}
                  {tickerPrice && (
                    <p className="text-sm text-green-600 dark:text-green-400">
                      {tForm('currentApiPrice')}: {formatCurrency(tickerPrice, selectedCurrency)}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Payment Integration Section */}
            <div className="space-y-4 border-t pt-4 mt-4">
              <h3 className="text-base font-semibold text-foreground">{tForm('paymentIntegration')}</h3>

              <AccountSelect
                value={watchPaymentAccountId}
                onChange={(accountId) => setValue('payment_account_id', accountId)}
                accounts={accounts}
                label={tForm('paymentAccount')}
                placeholder={tForm('paymentAccountPlaceholder')}
                noAccountLabel={tForm('noPaymentAccount')}
                helpText={tForm('paymentAccountHelp')}
              />

              {watchPaymentAccountId && (
                <>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="auto_transact">{tForm('autoTransact')}</Label>
                      <p className="text-xs text-muted-foreground">{tForm('autoTransactHelp')}</p>
                    </div>
                    <Switch
                      id="auto_transact"
                      checked={watch('auto_transact')}
                      onCheckedChange={(checked) => setValue('auto_transact', checked)}
                    />
                  </div>

                  {!isEditing && (
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="sync_historical">{tForm('syncHistorical')}</Label>
                        <p className="text-xs text-muted-foreground">{tForm('syncHistoricalHelp')}</p>
                      </div>
                      <Switch
                        id="sync_historical"
                        checked={watch('sync_historical')}
                        onCheckedChange={(checked) => setValue('sync_historical', checked)}
                      />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Dividend Section */}
            <div className="space-y-4 border-t pt-4 mt-4">
              <h3 className="text-base font-semibold text-foreground">{tForm('dividendSettings')}</h3>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="is_dividend_paying">{tForm('isDividendPaying')}</Label>
                  <p className="text-xs text-muted-foreground">{tForm('isDividendPayingHelp')}</p>
                </div>
                <Switch
                  id="is_dividend_paying"
                  checked={watchIsDividendPaying}
                  onCheckedChange={(checked) => setValue('is_dividend_paying', checked)}
                />
              </div>

              {watchIsDividendPaying && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="dividend_yield">{tForm('dividendYield')}</Label>
                      <Input
                        id="dividend_yield"
                        type="number"
                        step="0.0001"
                        min="0"
                        max="1"
                        placeholder={tForm('dividendYieldPlaceholder')}
                        {...register('dividend_yield', { valueAsNumber: true })}
                      />
                      <p className="text-xs text-muted-foreground">{tForm('dividendYieldHelp')}</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="dividend_per_share">{tForm('dividendPerShare')}</Label>
                      <Input
                        id="dividend_per_share"
                        type="number"
                        step="0.0001"
                        min="0"
                        placeholder={tForm('dividendPerSharePlaceholder')}
                        {...register('dividend_per_share', { valueAsNumber: true })}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="dividend_frequency">{tForm('dividendFrequency')}</Label>
                      <Select
                        key={`dividend_freq_${watch('dividend_frequency') || 'empty'}`}
                        value={watch('dividend_frequency') || undefined}
                        onValueChange={(value) => setValue('dividend_frequency', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={tForm('dividendFrequencyPlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          {DIVIDEND_FREQUENCY_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {tForm(option.labelKey)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="next_dividend_date">{tForm('nextDividendDate')}</Label>
                      <Input
                        id="next_dividend_date"
                        type="date"
                        {...register('next_dividend_date')}
                        className="cursor-pointer"
                      />
                    </div>
                  </div>

                  <AccountSelect
                    value={watchDividendAccountId}
                    onChange={(accountId) => setValue('dividend_account_id', accountId)}
                    accounts={accounts}
                    label={tForm('dividendAccount')}
                    placeholder={tForm('dividendAccountPlaceholder')}
                    noAccountLabel={tForm('noDividendAccount')}
                    helpText={tForm('dividendAccountHelp')}
                  />

                  {watchDividendAccountId && (
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="auto_deposit_dividends">{tForm('autoDepositDividends')}</Label>
                        <p className="text-xs text-muted-foreground">{tForm('autoDepositDividendsHelp')}</p>
                      </div>
                      <Switch
                        id="auto_deposit_dividends"
                        checked={watch('auto_deposit_dividends')}
                        onCheckedChange={(checked) => setValue('auto_deposit_dividends', checked)}
                      />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Active Status */}
            <div className="flex items-center justify-between pt-4 border-t">
              <Label htmlFor="is_active">{tForm('isActive')}</Label>
              <Switch
                id="is_active"
                checked={watch('is_active')}
                onCheckedChange={(checked) => setValue('is_active', checked)}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                {tActions('cancel')}
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? tForm('saving') : isEditing ? tForm('update') : tForm('create')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
