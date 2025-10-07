/**
 * Portfolio Asset Form Component
 * Form for creating and editing portfolio assets
 */
'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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

// Form validation schema
const portfolioAssetSchema = z.object({
  asset_name: z.string().min(1, 'Asset name is required').max(100),
  asset_type: z.string().max(50).optional(),
  symbol: z.string().max(20).optional(),
  description: z.string().max(500).optional(),
  quantity: z.number().gt(0, 'Quantity must be greater than 0'),
  purchase_price: z.number().gt(0, 'Purchase price must be greater than 0'),
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

const ASSET_TYPE_OPTIONS = [
  { value: 'Stocks', label: 'Stocks' },
  { value: 'Bonds', label: 'Bonds' },
  { value: 'ETFs', label: 'ETFs' },
  { value: 'Crypto', label: 'Cryptocurrency' },
  { value: 'Real Estate', label: 'Real Estate' },
  { value: 'Commodities', label: 'Commodities' },
  { value: 'Mutual Funds', label: 'Mutual Funds' },
  { value: 'Other', label: 'Other' },
];

export function PortfolioForm({ assetId, isOpen, onClose }: PortfolioFormProps) {
  const isEditing = Boolean(assetId);

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
        purchase_price: existingAsset.purchase_price,
        current_price: existingAsset.current_price,
        currency: existingAsset.currency,
        is_active: existingAsset.is_active,
        purchase_date: existingAsset.purchase_date.split('T')[0],
      };

      reset(formData);

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
      } else {
        await createAsset(submitData).unwrap();
      }

      onClose();
      reset();
    } catch (error) {
      console.error('Failed to save portfolio asset:', error);
    }
  };

  const handleClose = () => {
    onClose();
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
  const totalInvested = quantity * purchasePrice;
  const currentValue = quantity * currentPrice;
  const totalReturn = currentValue - totalInvested;
  const returnPercentage = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Asset' : 'Add Asset'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the details of your portfolio asset.'
              : 'Add a new investment asset to track in your portfolio.'}
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
                <Label htmlFor="asset_name">Asset Name *</Label>
                <Input
                  id="asset_name"
                  placeholder="e.g., Apple Inc."
                  {...register('asset_name')}
                />
                {errors.asset_name && (
                  <p className="text-sm text-destructive">{errors.asset_name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="symbol">Symbol/Ticker</Label>
                <Input
                  id="symbol"
                  placeholder="e.g., AAPL"
                  {...register('symbol')}
                />
                {errors.symbol && (
                  <p className="text-sm text-destructive">{errors.symbol.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="asset_type">Asset Type</Label>
              <Select
                value={watch('asset_type') || ''}
                onValueChange={(value) => setValue('asset_type', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select asset type" />
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
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Brief description of this investment"
                rows={2}
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
                <Label htmlFor="quantity">Quantity *</Label>
                <Input
                  id="quantity"
                  type="number"
                  step="0.00000001"
                  placeholder="0.00"
                  {...register('quantity', { valueAsNumber: true })}
                />
                {errors.quantity && (
                  <p className="text-sm text-destructive">{errors.quantity.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Input
                  id="currency"
                  placeholder="USD"
                  maxLength={3}
                  {...register('currency')}
                />
                {errors.currency && (
                  <p className="text-sm text-destructive">
                    {errors.currency.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="purchase_price">Purchase Price (per unit) *</Label>
                <Input
                  id="purchase_price"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  {...register('purchase_price', { valueAsNumber: true })}
                />
                {errors.purchase_price && (
                  <p className="text-sm text-destructive">{errors.purchase_price.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="current_price">Current Price (per unit) *</Label>
                <Input
                  id="current_price"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  {...register('current_price', { valueAsNumber: true })}
                />
                {errors.current_price && (
                  <p className="text-sm text-destructive">{errors.current_price.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="purchase_date">Purchase Date *</Label>
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
                <h4 className="text-sm font-semibold">Calculated Metrics</h4>
                <div className="grid gap-2 sm:grid-cols-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Total Invested: </span>
                    <span className="font-medium">
                      ${totalInvested.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Current Value: </span>
                    <span className="font-medium">
                      ${currentValue.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total Return: </span>
                    <span className={`font-medium ${totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${totalReturn.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Return %: </span>
                    <span className={`font-medium ${returnPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {returnPercentage >= 0 ? '+' : ''}{returnPercentage.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">Active Asset</Label>
              <Switch
                id="is_active"
                checked={watch('is_active')}
                onCheckedChange={(checked: boolean) => setValue('is_active', checked)}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading
                  ? 'Saving...'
                  : isEditing
                  ? 'Update Asset'
                  : 'Add Asset'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
