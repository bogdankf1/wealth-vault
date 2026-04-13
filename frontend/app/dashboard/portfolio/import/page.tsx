/**
 * Portfolio Import Page
 * AI-powered screenshot import for stocks, ETFs, crypto, and other investments
 */
'use client';

import React, { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Upload, Sparkles, Edit3, CheckCircle, ChevronRight, ChevronLeft, Loader2, Trash2, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ImageUpload } from '@/components/income/image-upload';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import {
  useUploadImagesMutation,
  useParsePortfolioScreenshotsMutation,
  type ParsedPortfolioHolding,
} from '@/lib/api/aiApi';
import { useCreatePortfolioAssetMutation } from '@/lib/api/portfolioApi';
import { useListAccountsQuery } from '@/lib/api/savingsApi';
import { useGetCurrentUserQuery } from '@/lib/api/authApi';
import { useGetMyPreferencesQuery } from '@/lib/api/preferencesApi';
import { useConvertCurrencyMutation } from '@/lib/api/currenciesApi';
import { hasFeatureAccess } from '@/lib/hooks/use-tier-check';
import { UpgradePromptDialog } from '@/components/upgrade-prompt';
import { toast } from 'sonner';

// Step enum
type ImportStep = 'upload' | 'parse' | 'review' | 'import';

// Extended holding type for editing
interface EditableHolding extends ParsedPortfolioHolding {
  id: string;
  selected: boolean;
  sourceIndex: number; // Track which screenshot the holding came from
}

const STEPS: { key: ImportStep; icon: React.ElementType }[] = [
  { key: 'upload', icon: Upload },
  { key: 'parse', icon: Sparkles },
  { key: 'review', icon: Edit3 },
  { key: 'import', icon: CheckCircle },
];

// Asset type options (matching backend asset_type enum)
const ASSET_TYPE_OPTIONS: { value: string; labelKey: string }[] = [
  { value: 'stocks', labelKey: 'stocks' },
  { value: 'etfs', labelKey: 'etfs' },
  { value: 'crypto', labelKey: 'crypto' },
  { value: 'bonds', labelKey: 'bonds' },
  { value: 'other', labelKey: 'other' },
];

// Map parsed asset_type to API asset_type
const mapAssetType = (parsedType: string): string => {
  const mapping: Record<string, string> = {
    'stock': 'stocks',
    'etf': 'etfs',
    'crypto': 'crypto',
    'bond': 'bonds',
    'other': 'other',
  };
  return mapping[parsedType] || 'other';
};

export default function PortfolioImportPage() {
  const t = useTranslations('portfolio.import');
  const tTypes = useTranslations('portfolio.assetTypes');
  const tCommon = useTranslations('common');

  const [currentStep, setCurrentStep] = useState<ImportStep>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedFileIds, setUploadedFileIds] = useState<string[]>([]);
  const [holdings, setHoldings] = useState<EditableHolding[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'stocks' | 'etfs' | 'crypto'>('all');
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [convertedTotal, setConvertedTotal] = useState<number | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [selectedPaymentAccountId, setSelectedPaymentAccountId] = useState<string | null>(null);
  const [enableAutoTransact, setEnableAutoTransact] = useState(false);

  // API hooks
  const [uploadImages, { isLoading: isUploading }] = useUploadImagesMutation();
  const [parseScreenshots, { isLoading: isParsing }] = useParsePortfolioScreenshotsMutation();
  const [createAsset, { isLoading: isCreating }] = useCreatePortfolioAssetMutation();
  const [convertCurrency] = useConvertCurrencyMutation();
  const { data: user } = useGetCurrentUserQuery();
  const { data: preferences } = useGetMyPreferencesQuery();
  const { data: accountsData } = useListAccountsQuery({ page: 1, page_size: 100 });

  // Get active accounts for payment account selector
  const accounts = accountsData?.items?.filter(a => a.is_active) || [];

  // User's preferred display currency
  const displayCurrency = preferences?.display_currency || preferences?.currency || 'USD';

  // Tier check for AI features
  const currentTier = user?.tier?.name || 'starter';
  const canUseFeature = hasFeatureAccess(currentTier, 'ai-insights');
  const requiredTier = 'growth';

  // Handle files ready from ImageUpload
  const handleFilesReady = useCallback((newFiles: File[]) => {
    setFiles(newFiles);
  }, []);

  // Upload files and move to parse step
  const handleUploadAndParse = async () => {
    if (!canUseFeature) {
      setShowUpgradeDialog(true);
      return;
    }

    if (files.length === 0) return;

    try {
      // Create FormData
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('files', file);
      });

      // Upload files
      const uploadResult = await uploadImages(formData).unwrap();
      const fileIds = uploadResult.files.map((f) => f.id);
      setUploadedFileIds(fileIds);

      // Move to parse step
      setCurrentStep('parse');
    } catch (error) {
      toast.error(t('uploadError'));
    }
  };

  // Parse screenshots with AI
  const handleParseScreenshots = async () => {
    if (uploadedFileIds.length === 0) return;

    try {
      const result = await parseScreenshots({ file_ids: uploadedFileIds }).unwrap();

      if (result.holdings.length === 0) {
        toast.info(t('noHoldingsFound'));
        return;
      }

      // Convert to editable holdings
      // Note: We don't mark duplicates here because users may have the same ticker
      // across multiple brokerage accounts (e.g., GOOGL in both IBKR and Trading 212)
      const editableHoldings: EditableHolding[] = result.holdings.map((holding, index) => ({
        ...holding,
        id: `holding-${index}-${Date.now()}`,
        selected: true,
        sourceIndex: index,
      }));

      setHoldings(editableHoldings);
      setCurrentStep('review');
      toast.success(t('holdingsFound', { count: result.total_count }));
    } catch (error) {
      toast.error(t('parseError'));
    }
  };

  // Update a holding field
  const updateHolding = (id: string, updates: Partial<EditableHolding>) => {
    setHoldings((prev) =>
      prev.map((h) => (h.id === id ? { ...h, ...updates } : h))
    );
  };

  // Toggle holding selection
  const toggleHoldingSelection = (id: string) => {
    updateHolding(id, { selected: !holdings.find((h) => h.id === id)?.selected });
  };

  // Select all holdings
  const selectAll = () => {
    const filtered = getFilteredHoldings();
    setHoldings((prev) =>
      prev.map((h) => ({
        ...h,
        selected: filtered.some((f) => f.id === h.id) ? true : h.selected,
      }))
    );
  };

  // Deselect all holdings
  const deselectAll = () => {
    const filtered = getFilteredHoldings();
    setHoldings((prev) =>
      prev.map((h) => ({
        ...h,
        selected: filtered.some((f) => f.id === h.id) ? false : h.selected,
      }))
    );
  };

  // Remove selected holdings
  const removeSelected = () => {
    setHoldings((prev) => prev.filter((h) => !h.selected));
  };

  // Get filtered holdings based on active tab
  const getFilteredHoldings = () => {
    switch (activeTab) {
      case 'stocks':
        return holdings.filter((h) => h.asset_type === 'stock');
      case 'etfs':
        return holdings.filter((h) => h.asset_type === 'etf');
      case 'crypto':
        return holdings.filter((h) => h.asset_type === 'crypto');
      default:
        return holdings;
    }
  };

  // Import selected holdings
  const handleImport = async () => {
    const selectedHoldings = holdings.filter((h) => h.selected);
    if (selectedHoldings.length === 0) {
      toast.error(t('noHoldingsSelected'));
      return;
    }

    setCurrentStep('import');
    setImportProgress({
      current: 0,
      total: selectedHoldings.length,
      success: 0,
      failed: 0,
    });

    let success = 0;
    let failed = 0;

    for (let i = 0; i < selectedHoldings.length; i++) {
      const holding = selectedHoldings[i];

      try {
        await createAsset({
          asset_name: holding.name || holding.ticker,
          symbol: holding.ticker,
          ticker: holding.ticker,
          asset_type: mapAssetType(holding.asset_type),
          quantity: holding.quantity,
          purchase_price: holding.purchase_price,
          current_price: holding.current_price,
          currency: holding.currency,
          purchase_date: new Date().toISOString().split('T')[0], // Default to today
          is_active: true,
          use_dynamic_pricing: true, // Enable dynamic pricing by default for imported assets
          // Payment account settings
          ...(selectedPaymentAccountId && {
            payment_account_id: selectedPaymentAccountId,
            auto_transact: enableAutoTransact,
          }),
        }).unwrap();

        success++;
      } catch (error) {
        failed++;
      }

      setImportProgress({
        current: i + 1,
        total: selectedHoldings.length,
        success,
        failed,
      });
    }

    if (failed === 0) {
      toast.success(t('importSuccess', { count: success }));
    } else {
      toast.warning(t('importPartial', { success, failed }));
    }
  };

  // Reset and start over
  const handleStartOver = () => {
    setFiles([]);
    setUploadedFileIds([]);
    setHoldings([]);
    setCurrentStep('upload');
    setImportProgress({ current: 0, total: 0, success: 0, failed: 0 });
    setSelectedPaymentAccountId(null);
    setEnableAutoTransact(false);
  };

  // Calculate summary stats
  const selectedHoldings = holdings.filter((h) => h.selected);
  const stocksCount = selectedHoldings.filter((h) => h.asset_type === 'stock').length;
  const etfsCount = selectedHoldings.filter((h) => h.asset_type === 'etf').length;
  const cryptoCount = selectedHoldings.filter((h) => h.asset_type === 'crypto').length;

  // Calculate totals grouped by currency
  const totalsByCurrency = selectedHoldings.reduce(
    (acc, h) => {
      const currency = h.currency || 'USD';
      const value = h.total_value || h.quantity * h.current_price;
      acc[currency] = (acc[currency] || 0) + value;
      return acc;
    },
    {} as Record<string, number>
  );
  const currencyTotals = Object.entries(totalsByCurrency);

  // Calculate total gain/loss
  const totalGainLoss = selectedHoldings.reduce((acc, h) => {
    return acc + (h.gain_loss || 0);
  }, 0);

  // Convert all amounts to user's display currency
  React.useEffect(() => {
    const calculateConvertedTotal = async () => {
      if (currencyTotals.length === 0) {
        setConvertedTotal(null);
        return;
      }

      // If all amounts are already in display currency, no conversion needed
      if (currencyTotals.length === 1 && currencyTotals[0][0] === displayCurrency) {
        setConvertedTotal(currencyTotals[0][1]);
        return;
      }

      setIsConverting(true);
      try {
        let total = 0;
        for (const [currency, amount] of currencyTotals) {
          if (currency === displayCurrency) {
            total += amount;
          } else {
            const result = await convertCurrency({
              amount,
              from_currency: currency,
              to_currency: displayCurrency,
            }).unwrap();
            total += parseFloat(result.converted_amount);
          }
        }
        setConvertedTotal(total);
      } catch (error) {
        setConvertedTotal(null);
      } finally {
        setIsConverting(false);
      }
    };

    calculateConvertedTotal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(currencyTotals), displayCurrency]);

  const filteredHoldings = getFilteredHoldings();
  const selectedInView = filteredHoldings.filter((h) => h.selected).length;

  return (
    <div className="space-y-6">
      {/* Step Progress */}
      <div className="flex items-center justify-between gap-1 mb-6">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          const isActive = step.key === currentStep;
          const isPast = STEPS.findIndex((s) => s.key === currentStep) > index;

          return (
            <React.Fragment key={step.key}>
              <div
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors',
                  isActive && 'bg-primary text-primary-foreground',
                  isPast && 'bg-primary/20 text-primary',
                  !isActive && !isPast && 'bg-muted text-muted-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="text-sm font-medium hidden sm:inline">
                  {t(`steps.${step.key}`)}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Step 1: Upload */}
      {currentStep === 'upload' && (
        <div className="space-y-4">
            <ImageUpload onFilesReady={handleFilesReady} maxFiles={10} />

            {files.length > 0 && (
              <div className="flex justify-end">
                <Button onClick={handleUploadAndParse} disabled={isUploading}>
                  {isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t('uploading')}
                    </>
                  ) : (
                    <>
                      {t('continueToParseButton')}
                      <ChevronRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            )}
        </div>
      )}

      {/* Step 2: Parse */}
      {currentStep === 'parse' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              {t('steps.parse')}
            </CardTitle>
            <CardDescription>{t('parseDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center py-8">
              {isParsing ? (
                <div className="space-y-4">
                  <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin" />
                  <p className="text-muted-foreground">{t('parsing')}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-muted-foreground">
                    {t('readyToParse', { count: uploadedFileIds.length })}
                  </p>
                  <Button onClick={handleParseScreenshots} size="lg">
                    <Sparkles className="h-4 w-4 mr-2" />
                    {t('parseButton')}
                  </Button>
                </div>
              )}
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={handleStartOver}>
                <ChevronLeft className="h-4 w-4 mr-2" />
                {t('backButton')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Review */}
      {currentStep === 'review' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Edit3 className="h-5 w-5" />
              {t('steps.review')}
            </CardTitle>
            <CardDescription>{t('reviewDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">{t('totalHoldings')}</p>
                <p className="text-lg md:text-2xl font-bold">{selectedHoldings.length}</p>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">{t('totalValue')}</p>
                <p className="text-lg md:text-2xl font-bold">
                  {isConverting ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : convertedTotal !== null ? (
                    <CurrencyDisplay amount={convertedTotal} currency={displayCurrency} />
                  ) : (
                    '-'
                  )}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">{t('totalGainLoss')}</p>
                <p className={cn('text-2xl font-bold', totalGainLoss >= 0 ? 'text-green-600' : 'text-red-600')}>
                  {totalGainLoss >= 0 ? '+' : ''}<CurrencyDisplay amount={totalGainLoss} currency={displayCurrency} />
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">{t('breakdown')}</p>
                <p className="text-lg font-bold">{stocksCount} / {etfsCount} / {cryptoCount}</p>
                <p className="text-xs text-muted-foreground">{t('breakdownLabels')}</p>
              </div>
            </div>

            {/* Payment Account Selector */}
            <div className="p-4 rounded-lg border bg-card">
              <div className="flex items-center gap-2 mb-3">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{t('paymentAccount')}</span>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <Select
                    value={selectedPaymentAccountId || 'none'}
                    onValueChange={(value) => setSelectedPaymentAccountId(value === 'none' ? null : value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('selectAccount')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('noPaymentAccount')}</SelectItem>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name} ({account.currency})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">{t('paymentAccountHelp')}</p>
                </div>
                {selectedPaymentAccountId && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="autoTransact"
                      checked={enableAutoTransact}
                      onCheckedChange={(checked) => setEnableAutoTransact(checked === true)}
                    />
                    <label htmlFor="autoTransact" className="text-sm cursor-pointer">
                      {t('autoTransact')}
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <TabsList>
                  <TabsTrigger value="all">
                    {t('tabAll')} ({holdings.length})
                  </TabsTrigger>
                  <TabsTrigger value="stocks">
                    {t('tabStocks')} ({holdings.filter((h) => h.asset_type === 'stock').length})
                  </TabsTrigger>
                  <TabsTrigger value="etfs">
                    {t('tabETFs')} ({holdings.filter((h) => h.asset_type === 'etf').length})
                  </TabsTrigger>
                  <TabsTrigger value="crypto">
                    {t('tabCrypto')} ({holdings.filter((h) => h.asset_type === 'crypto').length})
                  </TabsTrigger>
                </TabsList>

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={selectAll}>
                    {t('selectAll')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={deselectAll}>
                    {t('deselectAll')}
                  </Button>
                  {selectedInView > 0 && (
                    <Button variant="destructive" size="sm" onClick={removeSelected}>
                      <Trash2 className="h-4 w-4 mr-1" />
                      {t('removeSelected', { count: selectedInView })}
                    </Button>
                  )}
                </div>
              </div>

              <TabsContent value={activeTab} className="mt-4">
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>{t('columnTicker')}</TableHead>
                        <TableHead>{t('columnName')}</TableHead>
                        <TableHead>{t('columnType')}</TableHead>
                        <TableHead>{t('columnQuantity')}</TableHead>
                        <TableHead>{t('columnPurchasePrice')}</TableHead>
                        <TableHead>{t('columnCurrentPrice')}</TableHead>
                        <TableHead>{t('columnValue')}</TableHead>
                        <TableHead>{t('columnGainLoss')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredHoldings.map((holding) => (
                        <TableRow key={holding.id} className={cn(!holding.selected && 'opacity-50')}>
                          <TableCell>
                            <Checkbox
                              checked={holding.selected}
                              onCheckedChange={() => toggleHoldingSelection(holding.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={holding.ticker}
                              onChange={(e) => updateHolding(holding.id, { ticker: e.target.value })}
                              className="w-24 font-mono uppercase"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={holding.name || ''}
                              onChange={(e) => updateHolding(holding.id, { name: e.target.value || undefined })}
                              placeholder={t('namePlaceholder')}
                              className="min-w-40"
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              value={holding.asset_type}
                              onValueChange={(value) =>
                                updateHolding(holding.id, { asset_type: value as ParsedPortfolioHolding['asset_type'] })
                              }
                            >
                              <SelectTrigger className="w-28">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="stock">{t('typeStock')}</SelectItem>
                                <SelectItem value="etf">{t('typeETF')}</SelectItem>
                                <SelectItem value="crypto">{t('typeCrypto')}</SelectItem>
                                <SelectItem value="bond">{t('typeBond')}</SelectItem>
                                <SelectItem value="other">{t('typeOther')}</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.0001"
                              value={holding.quantity}
                              onChange={(e) =>
                                updateHolding(holding.id, {
                                  quantity: parseFloat(e.target.value) || 0,
                                })
                              }
                              className="w-24"
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                step="0.01"
                                value={holding.purchase_price}
                                onChange={(e) =>
                                  updateHolding(holding.id, {
                                    purchase_price: parseFloat(e.target.value) || 0,
                                  })
                                }
                                className="w-24"
                              />
                              <span className="text-sm text-muted-foreground">{holding.currency}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                step="0.01"
                                value={holding.current_price}
                                onChange={(e) =>
                                  updateHolding(holding.id, {
                                    current_price: parseFloat(e.target.value) || 0,
                                  })
                                }
                                className="w-24"
                              />
                              <span className="text-sm text-muted-foreground">{holding.currency}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <CurrencyDisplay
                              amount={holding.total_value || holding.quantity * holding.current_price}
                              currency={holding.currency}
                            />
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const gainLoss = holding.gain_loss || (holding.quantity * holding.current_price) - (holding.quantity * holding.purchase_price);
                              const gainLossPercent = holding.gain_loss_percent || ((holding.current_price - holding.purchase_price) / holding.purchase_price * 100);
                              return (
                                <div className={cn('text-sm font-medium', gainLoss >= 0 ? 'text-green-600' : 'text-red-600')}>
                                  <div>{gainLoss >= 0 ? '+' : ''}<CurrencyDisplay amount={gainLoss} currency={holding.currency} /></div>
                                  <div className="text-xs">({gainLossPercent >= 0 ? '+' : ''}{gainLossPercent.toFixed(2)}%)</div>
                                </div>
                              );
                            })()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={handleStartOver}>
                <ChevronLeft className="h-4 w-4 mr-2" />
                {t('startOverButton')}
              </Button>
              <Button onClick={handleImport} disabled={selectedHoldings.length === 0}>
                {t('importButton', { count: selectedHoldings.length })}
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Import Progress */}
      {currentStep === 'import' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              {t('steps.import')}
            </CardTitle>
            <CardDescription>{t('importDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center py-8 space-y-6">
              {importProgress.current < importProgress.total ? (
                <>
                  <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin" />
                  <div className="space-y-2">
                    <p className="text-muted-foreground">
                      {t('importing', {
                        current: importProgress.current,
                        total: importProgress.total,
                      })}
                    </p>
                    <Progress
                      value={(importProgress.current / importProgress.total) * 100}
                      className="w-64 mx-auto"
                    />
                  </div>
                </>
              ) : (
                <>
                  <CheckCircle className="h-12 w-12 mx-auto text-green-500" />
                  <div className="space-y-4">
                    <p className="text-lg font-medium">{t('importComplete')}</p>
                    <div className="flex justify-center gap-4">
                      <Badge variant="default" className="text-sm">
                        {t('successCount', { count: importProgress.success })}
                      </Badge>
                      {importProgress.failed > 0 && (
                        <Badge variant="destructive" className="text-sm">
                          {t('failedCount', { count: importProgress.failed })}
                        </Badge>
                      )}
                    </div>
                    <Button onClick={handleStartOver} variant="outline" className="mt-4">
                      {t('importMoreButton')}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upgrade Dialog */}
      <UpgradePromptDialog
        isOpen={showUpgradeDialog}
        onClose={() => setShowUpgradeDialog(false)}
        feature="AI Import"
        currentTier={currentTier}
        requiredTier={requiredTier}
        currentLimit={0}
      />
    </div>
  );
}
