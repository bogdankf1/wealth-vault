/**
 * Portfolio Asset Form Component
 * Form for creating and editing portfolio assets
 */
'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import * as z from 'zod';
import {
  useCreatePortfolioAssetMutation,
  useUpdatePortfolioAssetMutation,
  useGetPortfolioAssetQuery,
} from '@/lib/api/portfolioApi';
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
import { toast } from 'sonner';

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
        // Check if number has more than 2 decimal places
        // Use toFixed to round to 2 decimals and compare
        const rounded = Math.round(val * 100) / 100;
        return Math.abs(val - rounded) < 0.00001; // Allow for floating point precision
      },
      { message: 'Amount can have at most 2 decimal places' }
    ),
  current_price: z.number().gt(0, 'Current price must be greater than 0'),
  currency: z.string().length(3),
  purchase_date: z.string().min(1, 'Purchase date is required'),
  is_active: z.boolean(),
});

type FormData = z.infer<typeof portfolioAssetSchema>;

interface PortfolioFormProps {
  assetId?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

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

  // Local state to track the string value of purchase_price while user is typing
  const [purchasePriceInput, setPurchasePriceInput] = React.useState<string>('');

  const {
    data: existingAsset,
    isLoading: isLoadingAsset,
    error: loadError,
  } = useGetPortfolioAssetQuery(assetId!, {
    skip: !assetId,
  });

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
    },
  });

  // Load existing asset data or reset for new asset
  useEffect(() => {
    if (isEditing && existingAsset) {
      const formData = {
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
      };

      reset(formData);

      // Set the purchase price input string
      const purchasePriceNum = typeof existingAsset.purchase_price === 'string'
        ? parseFloat(existingAsset.purchase_price)
        : existingAsset.purchase_price;
      setPurchasePriceInput(String(purchasePriceNum));

      setTimeout(() => {
        if (existingAsset.asset_type) {
          setValue('asset_type', existingAsset.asset_type, { shouldDirty: true });
        }
      }, 0);
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
      });
      setPurchasePriceInput('');
    }
  }, [isEditing, existingAsset, isOpen, reset, setValue]);

  const onSubmit = async (data: FormData) => {
    try {
      const submitData: {
        asset_name: string;
        asset_type?: string;
        symbol?: string;
        description?: string;
        quantity: number;
        purchase_price: number;
        current_price: number;
        currency: string;
        purchase_date: string;
        is_active: boolean;
      } = {
        asset_name: data.asset_name,
        asset_type: data.asset_type,
        symbol: data.symbol,
        description: data.description,
        quantity: data.quantity,
        purchase_price: data.purchase_price,
        current_price: data.current_price,
        currency: data.currency,
        purchase_date: `${data.purchase_date}T00:00:00`,
        is_active: data.is_active,
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
    } catch (error) {
      console.error('Failed to save portfolio asset:', error);
      toast.error(isEditing ? tForm('updateError') : tForm('createError'));
    }
  };

  const handleClose = () => {
    onClose();
    setPurchasePriceInput('');
    reset({
      currency: 'USD',
      is_active: true,
      quantity: 0,
      purchase_price: 0,
      current_price: 0,
      purchase_date: new Date().toISOString().split('T')[0],
    });
  };

  const isLoading = isCreating || isUpdating;
  const error = createError || updateError || loadError;

  // Calculate metrics for display
  const quantity = watch('quantity') || 0;
  const purchasePrice = watch('purchase_price') || 0;
  const currentPrice = watch('current_price') || 0;
  const selectedCurrency = watch('currency') || 'USD';
  const totalInvested = quantity * purchasePrice;
  const currentValue = quantity * currentPrice;
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
                {errors.symbol && (
                  <p className="text-sm text-destructive">{errors.symbol.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="asset_type">{tForm('assetType')}</Label>
              <Select
                value={watch('asset_type') || ''}
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
              {errors.description && (
                <p className="text-sm text-destructive">
                  {errors.description.message}
                </p>
              )}
            </div>

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
                // Update the local string state to allow typing decimal points
                setPurchasePriceInput(value);

                // Update the form state with the numeric value
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

            <div className="space-y-2">
              <Label htmlFor="current_price">{tForm('currentPrice')} *</Label>
              <div className="relative flex-1">
                <Input
                  id="current_price"
                  type="number"
                  step="0.01"
                  placeholder={tForm('currentPricePlaceholder')}
                  {...register('current_price', { valueAsNumber: true })}
                />
              </div>
              {errors.current_price && (
                <p className="text-sm text-destructive">{errors.current_price.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="purchase_date">{tForm('purchaseDate')} *</Label>
              <Input
                id="purchase_date"
                type="date"
                {...register('purchase_date')}
                className="cursor-pointer"
                style={{ colorScheme: 'light' }}
              />
              {errors.purchase_date && (
                <p className="text-sm text-destructive">
                  {errors.purchase_date.message}
                </p>
              )}
            </div>

            {/* Calculated Metrics Display */}
            {(quantity > 0 && purchasePrice > 0 && currentPrice > 0) && (
              <div className="rounded-lg border bg-muted p-4 space-y-2">
                <h4 className="text-sm font-semibold">{tForm('calculatedMetrics')}</h4>
                <div className="grid gap-2 sm:grid-cols-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">{tForm('totalInvested')}</span>
                    <span className="font-medium">
                      <CurrencyDisplay
                        amount={totalInvested}
                        currency={selectedCurrency}
                        showSymbol={true}
                        showCode={false}
                      />
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{tForm('totalValue')}</span>
                    <span className="font-medium">
                      <CurrencyDisplay
                        amount={currentValue}
                        currency={selectedCurrency}
                        showSymbol={true}
                        showCode={false}
                      />
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{tForm('totalReturn')}</span>
                    <span className={`font-medium ${totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      <CurrencyDisplay
                        amount={totalReturn}
                        currency={selectedCurrency}
                        showSymbol={true}
                        showCode={false}
                      />
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{tForm('returnPercentage')}</span>
                    <span className={`font-medium ${returnPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {returnPercentage >= 0 ? '+' : ''}{returnPercentage.toFixed(2)}%
                    </span>
                  </div>
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
