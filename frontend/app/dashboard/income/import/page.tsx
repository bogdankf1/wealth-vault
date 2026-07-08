/**
 * Income Import Page
 * AI-powered screenshot import with 3-step flow
 */
'use client';

import React, { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Upload, Sparkles, Edit3, CheckCircle, ChevronRight, ChevronLeft, Loader2, AlertTriangle, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
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
import { AccountSelect } from '@/components/ui/account-select';
import {
  useUploadImagesMutation,
  useParseIncomeScreenshotsMutation,
  type ParsedIncomeTransaction,
} from '@/lib/api/aiApi';
import { useCreateIncomeSourceMutation, type IncomeFrequency } from '@/lib/api/incomeApi';
import { useListAccountsQuery, type SavingsAccount } from '@/lib/api/savingsApi';
import { useGetCurrentUserQuery } from '@/lib/api/authApi';
import { useGetMyPreferencesQuery } from '@/lib/api/preferencesApi';
import { useConvertCurrencyMutation } from '@/lib/api/currenciesApi';
import { hasFeatureAccess } from '@/hooks/use-tier-check';
import { UpgradePromptDialog } from '@/components/upgrade-prompt';
import { toast } from 'sonner';
import { INCOME_CATEGORY_KEYS, INCOME_CATEGORY_NAME_TO_KEY } from '@/lib/constants/income-categories';
import type { AccountOption } from '@/components/ui/account-select';

// Step enum
type ImportStep = 'upload' | 'review' | 'import';

// Extended transaction type for editing
interface EditableTransaction extends ParsedIncomeTransaction {
  id: string;
  selected: boolean;
  sourceName?: string;
  targetAccountId?: string;
  autoDeposit?: boolean;
}

const STEPS: { key: ImportStep; icon: React.ElementType }[] = [
  { key: 'upload', icon: Upload },
  { key: 'review', icon: Edit3 },
  { key: 'import', icon: CheckCircle },
];

const FREQUENCY_OPTIONS: { value: IncomeFrequency; labelKey: string }[] = [
  { value: 'one_time', labelKey: 'one_time' },
  { value: 'weekly', labelKey: 'weekly' },
  { value: 'biweekly', labelKey: 'biweekly' },
  { value: 'monthly', labelKey: 'monthly' },
  { value: 'quarterly', labelKey: 'quarterly' },
  { value: 'annually', labelKey: 'annually' },
];

export default function IncomeImportPage() {
  const t = useTranslations('income.import');
  const tFrequency = useTranslations('income.frequency');
  const tCategories = useTranslations('income.categories');
  const tCommon = useTranslations('common');

  const [currentStep, setCurrentStep] = useState<ImportStep>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedFileIds, setUploadedFileIds] = useState<string[]>([]);
  const [transactions, setTransactions] = useState<EditableTransaction[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'one_time' | 'recurring'>('all');
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [convertedTotal, setConvertedTotal] = useState<number | null>(null);
  const [isConverting, setIsConverting] = useState(false);

  // API hooks
  const [uploadImages, { isLoading: isUploading }] = useUploadImagesMutation();
  const [parseScreenshots, { isLoading: isParsing }] = useParseIncomeScreenshotsMutation();
  const [createIncomeSource, { isLoading: isCreating }] = useCreateIncomeSourceMutation();
  const [convertCurrency] = useConvertCurrencyMutation();
  const { data: accountsData } = useListAccountsQuery({ is_active: true });
  const { data: user } = useGetCurrentUserQuery();
  const { data: preferences } = useGetMyPreferencesQuery();

  // User's preferred display currency
  const displayCurrency = preferences?.display_currency || preferences?.currency || 'UAH';

  // Tier check for AI features
  const currentTier = user?.tier?.name || 'starter';
  const canUseFeature = hasFeatureAccess(currentTier, 'ai-insights');
  const requiredTier = 'growth';

  // Convert accounts to AccountOption format
  const accountOptions: AccountOption[] = accountsData?.items?.map((acc: SavingsAccount) => ({
    id: acc.id,
    name: acc.name,
    current_balance: acc.current_balance,
    currency: acc.currency,
  })) || [];

  // Handle files ready from ImageUpload
  const handleFilesReady = useCallback((newFiles: File[]) => {
    setFiles(newFiles);
  }, []);

  // Upload files and parse screenshots with AI
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

      // Parse screenshots immediately
      const result = await parseScreenshots({ file_ids: fileIds }).unwrap();

      if (result.transactions.length === 0) {
        toast.info(t('noTransactionsFound'));
        return;
      }

      // Convert to editable transactions
      // - Convert category names to keys (e.g., "Salary" -> "salary")
      // - Default to 'salary' if not detected
      // - Auto-select matching currency account
      const editableTransactions: EditableTransaction[] = result.transactions.map((txn, index) => {
        // Convert category name to key, fallback to 'salary'
        const categoryKey = txn.category
          ? INCOME_CATEGORY_NAME_TO_KEY[txn.category] || txn.category.toLowerCase() || 'salary'
          : 'salary';

        // Find an account matching the transaction's currency for auto-selection
        const matchingAccount = accountsData?.items?.find(
          (acc: SavingsAccount) => acc.currency === txn.currency
        );

        return {
          ...txn,
          id: `txn-${index}-${Date.now()}`,
          selected: true,
          sourceName: txn.description,
          category: categoryKey,
          targetAccountId: matchingAccount?.id,
          autoDeposit: true,
        };
      });

      setTransactions(editableTransactions);
      setCurrentStep('review');
      toast.success(t('transactionsFound', { count: result.total_count }));
    } catch (error) {
      toast.error(t('parseError'));
    }
  };

  // Update a transaction field
  const updateTransaction = (id: string, updates: Partial<EditableTransaction>) => {
    setTransactions((prev) =>
      prev.map((txn) => (txn.id === id ? { ...txn, ...updates } : txn))
    );
  };

  // Toggle transaction selection
  const toggleTransactionSelection = (id: string) => {
    updateTransaction(id, { selected: !transactions.find((t) => t.id === id)?.selected });
  };

  // Select all transactions
  const selectAll = () => {
    const filtered = getFilteredTransactions();
    setTransactions((prev) =>
      prev.map((txn) => ({
        ...txn,
        selected: filtered.some((f) => f.id === txn.id) ? true : txn.selected,
      }))
    );
  };

  // Deselect all transactions
  const deselectAll = () => {
    const filtered = getFilteredTransactions();
    setTransactions((prev) =>
      prev.map((txn) => ({
        ...txn,
        selected: filtered.some((f) => f.id === txn.id) ? false : txn.selected,
      }))
    );
  };

  // Remove selected transactions
  const removeSelected = () => {
    setTransactions((prev) => prev.filter((txn) => !txn.selected));
  };

  // Get filtered transactions based on active tab
  const getFilteredTransactions = () => {
    switch (activeTab) {
      case 'one_time':
        return transactions.filter((t) => !t.is_recurring_hint);
      case 'recurring':
        return transactions.filter((t) => t.is_recurring_hint);
      default:
        return transactions;
    }
  };

  // Import selected transactions
  const handleImport = async () => {
    const selectedTransactions = transactions.filter((t) => t.selected);
    if (selectedTransactions.length === 0) {
      toast.error(t('noTransactionsSelected'));
      return;
    }

    setCurrentStep('import');
    setImportProgress({
      current: 0,
      total: selectedTransactions.length,
      success: 0,
      failed: 0,
    });

    let success = 0;
    let failed = 0;

    for (let i = 0; i < selectedTransactions.length; i++) {
      const txn = selectedTransactions[i];

      try {
        await createIncomeSource({
          name: txn.sourceName || txn.description,
          description: txn.description,
          category: txn.category || 'other',
          amount: txn.amount,
          currency: txn.currency,
          frequency: (txn.suggested_frequency as IncomeFrequency) || 'one_time',
          is_active: true,
          start_date: txn.date,
          target_account_id: txn.targetAccountId || null,
          auto_deposit: txn.autoDeposit || false,
        }).unwrap();

        success++;
      } catch (error) {
        failed++;
      }

      setImportProgress({
        current: i + 1,
        total: selectedTransactions.length,
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
    setTransactions([]);
    setCurrentStep('upload');
    setImportProgress({ current: 0, total: 0, success: 0, failed: 0 });
  };

  // Calculate summary stats
  const selectedTransactions = transactions.filter((t) => t.selected);
  const recurringCount = selectedTransactions.filter((t) => t.is_recurring_hint).length;

  // Calculate totals grouped by currency
  const totalsByCurrency = selectedTransactions.reduce(
    (acc, t) => {
      const currency = t.currency || 'UAH';
      acc[currency] = (acc[currency] || 0) + t.amount;
      return acc;
    },
    {} as Record<string, number>
  );
  const currencyTotals = Object.entries(totalsByCurrency);

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
            // converted_amount is returned as string, parse to number
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

  const filteredTransactions = getFilteredTransactions();
  const selectedInView = filteredTransactions.filter((t) => t.selected).length;

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
                <Button onClick={handleUploadAndParse} disabled={isUploading || isParsing}>
                  {isUploading || isParsing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {isParsing ? t('parsing') : t('uploading')}
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      {t('parseButton')}
                    </>
                  )}
                </Button>
              </div>
            )}
        </div>
      )}

      {/* Step 2: Review */}
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">{t('totalTransactions')}</p>
                <p className="text-lg md:text-2xl font-bold">{selectedTransactions.length}</p>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">{t('totalSelected')}</p>
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
                <p className="text-sm text-muted-foreground">{t('recurringSources')}</p>
                <p className="text-lg md:text-2xl font-bold">{recurringCount}</p>
              </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <TabsList>
                  <TabsTrigger value="all">
                    {t('tabAll')} ({transactions.length})
                  </TabsTrigger>
                  <TabsTrigger value="one_time">
                    {t('tabOneTime')} ({transactions.filter((t) => !t.is_recurring_hint).length})
                  </TabsTrigger>
                  <TabsTrigger value="recurring">
                    {t('tabRecurring')} ({transactions.filter((t) => t.is_recurring_hint).length})
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
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>{t('columnDate')}</TableHead>
                        <TableHead>{t('columnDescription')}</TableHead>
                        <TableHead>{t('columnAmount')}</TableHead>
                        <TableHead>{t('columnCategory')}</TableHead>
                        <TableHead>{t('columnFrequency')}</TableHead>
                        <TableHead>{t('columnRecurring')}</TableHead>
                        <TableHead>{t('columnAccount')}</TableHead>
                        <TableHead>{t('columnAutoDeposit')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTransactions.map((txn) => (
                        <TableRow key={txn.id} className={cn(!txn.selected && 'opacity-50')}>
                          <TableCell>
                            <Checkbox
                              checked={txn.selected}
                              onCheckedChange={() => toggleTransactionSelection(txn.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              value={txn.date}
                              onChange={(e) => updateTransaction(txn.id, { date: e.target.value })}
                              className="w-36"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={txn.sourceName || txn.description}
                              onChange={(e) =>
                                updateTransaction(txn.id, { sourceName: e.target.value })
                              }
                              className="min-w-48"
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                value={txn.amount}
                                onChange={(e) =>
                                  updateTransaction(txn.id, {
                                    amount: parseFloat(e.target.value) || 0,
                                  })
                                }
                                className="w-24"
                              />
                              <span className="text-sm text-muted-foreground">{txn.currency}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={txn.category || 'other'}
                              onValueChange={(value) =>
                                updateTransaction(txn.id, { category: value })
                              }
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {INCOME_CATEGORY_KEYS.map((cat) => (
                                  <SelectItem key={cat} value={cat}>
                                    {tCategories(cat)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={txn.suggested_frequency || 'one_time'}
                              onValueChange={(value) =>
                                updateTransaction(txn.id, {
                                  suggested_frequency: value,
                                })
                              }
                            >
                              <SelectTrigger className="w-28">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {FREQUENCY_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {tFrequency(opt.labelKey)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Checkbox
                              checked={txn.is_recurring_hint}
                              onCheckedChange={(checked) =>
                                updateTransaction(txn.id, {
                                  is_recurring_hint: !!checked,
                                })
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <AccountSelect
                              accounts={accountOptions}
                              value={txn.targetAccountId || null}
                              onChange={(value: string | null) =>
                                updateTransaction(txn.id, {
                                  targetAccountId: value || undefined,
                                })
                              }
                              label=""
                              placeholder={t('selectAccount')}
                              className="w-60"
                            />
                          </TableCell>
                          <TableCell>
                            <Checkbox
                              checked={txn.autoDeposit}
                              onCheckedChange={(checked) =>
                                updateTransaction(txn.id, {
                                  autoDeposit: !!checked,
                                })
                              }
                              disabled={!txn.targetAccountId}
                            />
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
              <Button onClick={handleImport} disabled={selectedTransactions.length === 0}>
                {t('importButton', { count: selectedTransactions.length })}
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Import Progress */}
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
