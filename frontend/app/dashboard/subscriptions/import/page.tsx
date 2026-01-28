/**
 * Subscription Import Page
 * AI-powered screenshot import for subscriptions from Apple, Google Play, etc.
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
import { CurrencySelect } from '@/components/currency/currency-select';
import {
  useUploadImagesMutation,
  useParseSubscriptionScreenshotsMutation,
  type ParsedSubscription,
} from '@/lib/api/aiApi';
import { useCreateSubscriptionMutation } from '@/lib/api/subscriptionsApi';
import { useListAccountsQuery } from '@/lib/api/savingsApi';
import { useGetCurrentUserQuery } from '@/lib/api/authApi';
import { useGetMyPreferencesQuery } from '@/lib/api/preferencesApi';
import { useConvertCurrencyMutation } from '@/lib/api/currenciesApi';
import { hasFeatureAccess } from '@/lib/hooks/use-tier-check';
import { UpgradePromptDialog } from '@/components/upgrade-prompt';
import { toast } from 'sonner';

// Step enum
type ImportStep = 'upload' | 'parse' | 'review' | 'import';

// Extended subscription type for editing
interface EditableSubscription extends ParsedSubscription {
  id: string;
  selected: boolean;
}

const STEPS: { key: ImportStep; icon: React.ElementType }[] = [
  { key: 'upload', icon: Upload },
  { key: 'parse', icon: Sparkles },
  { key: 'review', icon: Edit3 },
  { key: 'import', icon: CheckCircle },
];

// Frequency options
const FREQUENCY_OPTIONS: { value: string; labelKey: string }[] = [
  { value: 'monthly', labelKey: 'monthly' },
  { value: 'quarterly', labelKey: 'quarterly' },
  { value: 'biannually', labelKey: 'biannually' },
  { value: 'annually', labelKey: 'annually' },
];

// Category options for subscriptions with translation keys
const CATEGORY_OPTIONS: { value: string; labelKey: string }[] = [
  { value: 'Entertainment', labelKey: 'entertainment' },
  { value: 'Productivity', labelKey: 'productivity' },
  { value: 'Storage', labelKey: 'storage' },
  { value: 'Education', labelKey: 'education' },
  { value: 'Health & Fitness', labelKey: 'healthFitness' },
  { value: 'News', labelKey: 'news' },
  { value: 'Utilities', labelKey: 'utilities' },
  { value: 'Gaming', labelKey: 'gaming' },
  { value: 'Music', labelKey: 'music' },
  { value: 'Video', labelKey: 'video' },
  { value: 'Other', labelKey: 'other' },
];

export default function SubscriptionImportPage() {
  const t = useTranslations('subscriptions.import');
  const tFreq = useTranslations('subscriptions.frequency');
  const tCat = useTranslations('subscriptions.categories');
  const tCommon = useTranslations('common');

  const [currentStep, setCurrentStep] = useState<ImportStep>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedFileIds, setUploadedFileIds] = useState<string[]>([]);
  const [subscriptions, setSubscriptions] = useState<EditableSubscription[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'expired'>('all');
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [convertedTotal, setConvertedTotal] = useState<number | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [selectedPaymentAccountId, setSelectedPaymentAccountId] = useState<string | null>(null);
  const [enableAutoPay, setEnableAutoPay] = useState(false);
  const [syncHistorical, setSyncHistorical] = useState(false);

  // API hooks
  const [uploadImages, { isLoading: isUploading }] = useUploadImagesMutation();
  const [parseScreenshots, { isLoading: isParsing }] = useParseSubscriptionScreenshotsMutation();
  const [createSubscription, { isLoading: isCreating }] = useCreateSubscriptionMutation();
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

      // Convert to editable subscriptions
      const editableSubs: EditableSubscription[] = result.subscriptions.map((sub, index) => ({
        ...sub,
        id: `sub-${index}-${Date.now()}`,
        selected: sub.status === 'active', // Only select active by default
      }));

      setSubscriptions(editableSubs);
      setCurrentStep('review');

      // Show success message
      toast.success(t('subscriptionsFound', { count: result.total_count }));
    } catch (error) {
      toast.error(t('parseError'));
    }
  };

  // Update a subscription field
  const updateSubscription = (id: string, field: keyof EditableSubscription, value: unknown) => {
    setSubscriptions((prev) =>
      prev.map((sub) => (sub.id === id ? { ...sub, [field]: value } : sub))
    );
  };

  // Toggle subscription selection
  const toggleSelection = (id: string) => {
    setSubscriptions((prev) =>
      prev.map((sub) => (sub.id === id ? { ...sub, selected: !sub.selected } : sub))
    );
  };

  // Select/deselect all
  const selectAll = () => {
    const filtered = getFilteredSubscriptions();
    const allSelected = filtered.every((s) => s.selected);
    setSubscriptions((prev) =>
      prev.map((sub) => {
        const inFiltered = filtered.some((f) => f.id === sub.id);
        return inFiltered ? { ...sub, selected: !allSelected } : sub;
      })
    );
  };

  // Remove selected subscriptions
  const removeSelected = () => {
    setSubscriptions((prev) => prev.filter((s) => !s.selected));
  };

  // Get filtered subscriptions based on active tab
  const getFilteredSubscriptions = () => {
    switch (activeTab) {
      case 'active':
        return subscriptions.filter((s) => s.status === 'active');
      case 'expired':
        return subscriptions.filter((s) => s.status === 'expired' || s.status === 'cancelled');
      default:
        return subscriptions;
    }
  };

  // Calculate totals
  const selectedSubs = subscriptions.filter((s) => s.selected);
  const selectedCount = selectedSubs.length;
  const activeSubs = subscriptions.filter((s) => s.status === 'active');
  const expiredSubs = subscriptions.filter((s) => s.status !== 'active');

  // Calculate monthly total for selected active subscriptions
  const calculateMonthlyTotal = (subs: EditableSubscription[]) => {
    return subs
      .filter((s) => s.status === 'active')
      .reduce((total, sub) => {
        const amount = sub.amount || 0;
        switch (sub.frequency) {
          case 'monthly':
            return total + amount;
          case 'quarterly':
            return total + amount / 3;
          case 'biannually':
            return total + amount / 6;
          case 'annually':
            return total + amount / 12;
          default:
            return total + amount;
        }
      }, 0);
  };

  const monthlyTotal = calculateMonthlyTotal(selectedSubs);

  // Import subscriptions
  const handleImport = async () => {
    const toImport = subscriptions.filter((s) => s.selected);
    if (toImport.length === 0) return;

    setCurrentStep('import');
    setImportProgress({ current: 0, total: toImport.length, success: 0, failed: 0 });

    let success = 0;
    let failed = 0;

    for (let i = 0; i < toImport.length; i++) {
      const sub = toImport[i];
      setImportProgress((prev) => ({ ...prev, current: i + 1 }));

      try {
        // Map frequency
        const frequencyMap: Record<string, 'monthly' | 'quarterly' | 'annually' | 'biannually'> = {
          monthly: 'monthly',
          quarterly: 'quarterly',
          biannually: 'biannually',
          annually: 'annually',
        };

        // Get start date - use next_payment_date or today
        const startDate = sub.next_payment_date || new Date().toISOString().split('T')[0];

        await createSubscription({
          name: sub.name,
          description: sub.description || undefined,
          category: sub.category || 'Other',
          amount: sub.amount,
          currency: sub.currency || 'USD',
          frequency: frequencyMap[sub.frequency] || 'monthly',
          start_date: startDate,
          is_active: sub.status === 'active',
          payment_account_id: selectedPaymentAccountId || undefined,
          auto_pay: enableAutoPay,
          sync_historical: syncHistorical,
        }).unwrap();

        success++;
      } catch (error) {
        failed++;
      }

      setImportProgress((prev) => ({ ...prev, success, failed }));
    }

    // Show result
    if (failed === 0) {
      toast.success(t('importSuccess', { count: success }));
    } else {
      toast.warning(t('importPartial', { success, failed }));
    }
  };

  // Start over
  const handleStartOver = () => {
    setCurrentStep('upload');
    setFiles([]);
    setUploadedFileIds([]);
    setSubscriptions([]);
    setImportProgress({ current: 0, total: 0, success: 0, failed: 0 });
    setSelectedPaymentAccountId(null);
    setEnableAutoPay(false);
  };

  // Get step status for progress indicator
  const getStepStatus = (step: ImportStep): 'completed' | 'current' | 'upcoming' => {
    const stepOrder: ImportStep[] = ['upload', 'parse', 'review', 'import'];
    const currentIndex = stepOrder.indexOf(currentStep);
    const stepIndex = stepOrder.indexOf(step);

    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'current';
    return 'upcoming';
  };

  const filteredSubscriptions = getFilteredSubscriptions();

  return (
    <div className="space-y-6">
      {/* Step Progress */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          const isActive = step.key === currentStep;
          const isPast = STEPS.findIndex((s) => s.key === currentStep) > index;

          return (
            <React.Fragment key={step.key}>
              <div
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg transition-colors',
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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              {t('steps.upload')}
            </CardTitle>
            <CardDescription>{t('uploadDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
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
                      {t('continueButton')}
                      <ChevronRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
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
            <CardDescription>{t('reviewDescription', { count: subscriptions.length })}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">{t('totalSubscriptions')}</p>
                <p className="text-2xl font-bold">{selectedCount}</p>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">{t('monthlyTotal')}</p>
                <p className="text-2xl font-bold">
                  <CurrencyDisplay amount={monthlyTotal} currency="USD" />
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">{t('annualTotal')}</p>
                <p className="text-2xl font-bold">
                  <CurrencyDisplay amount={monthlyTotal * 12} currency="USD" />
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">{t('breakdown')}</p>
                <p className="text-lg font-bold">{activeSubs.filter(s => s.selected).length} / {expiredSubs.filter(s => s.selected).length}</p>
                <p className="text-xs text-muted-foreground">{t('breakdownLabels')}</p>
              </div>
            </div>

            {/* Payment Account Selector */}
            <div className="p-4 rounded-lg border bg-card">
              <div className="flex items-center gap-2 mb-3">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{t('paymentAccount')}</span>
              </div>
              <div className="space-y-4">
                <div>
                  <Select
                    value={selectedPaymentAccountId || 'none'}
                    onValueChange={(value) => setSelectedPaymentAccountId(value === 'none' ? null : value)}
                  >
                    <SelectTrigger className="max-w-md">
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
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="autoPay"
                        checked={enableAutoPay}
                        onCheckedChange={(checked) => setEnableAutoPay(checked === true)}
                      />
                      <label htmlFor="autoPay" className="text-sm cursor-pointer">
                        {t('autoPay')}
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="syncHistorical"
                        checked={syncHistorical}
                        onCheckedChange={(checked) => setSyncHistorical(checked === true)}
                      />
                      <label htmlFor="syncHistorical" className="text-sm cursor-pointer">
                        {t('syncHistorical')}
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Tabs and Actions */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <TabsList>
                  <TabsTrigger value="all">
                    {t('tabs.all')} ({subscriptions.length})
                  </TabsTrigger>
                  <TabsTrigger value="active">
                    {t('tabs.active')} ({activeSubs.length})
                  </TabsTrigger>
                  <TabsTrigger value="expired">
                    {t('tabs.expired')} ({expiredSubs.length})
                  </TabsTrigger>
                </TabsList>

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={selectAll}>
                    {filteredSubscriptions.every((s) => s.selected)
                      ? t('deselectAll')
                      : t('selectAll')}
                  </Button>
                  {selectedCount > 0 && (
                    <Button variant="destructive" size="sm" onClick={removeSelected}>
                      <Trash2 className="mr-1 h-4 w-4" />
                      {t('removeSelected', { count: selectedCount })}
                    </Button>
                  )}
                </div>
              </div>

              <TabsContent value={activeTab} className="mt-4">
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>{t('columns.name')}</TableHead>
                        <TableHead>{t('columns.description')}</TableHead>
                        <TableHead>{t('columns.amount')}</TableHead>
                        <TableHead>{t('columns.currency')}</TableHead>
                        <TableHead>{t('columns.frequency')}</TableHead>
                        <TableHead>{t('columns.category')}</TableHead>
                        <TableHead>{t('columns.nextPayment')}</TableHead>
                        <TableHead>{t('columns.status')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSubscriptions.map((sub) => (
                        <TableRow
                          key={sub.id}
                          className={cn(!sub.selected && 'opacity-50')}
                        >
                          <TableCell>
                            <Checkbox
                              checked={sub.selected}
                              onCheckedChange={() => toggleSelection(sub.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={sub.name}
                              onChange={(e) => updateSubscription(sub.id, 'name', e.target.value)}
                              className="min-w-[150px]"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={sub.description || ''}
                              onChange={(e) => updateSubscription(sub.id, 'description', e.target.value)}
                              className="min-w-[120px]"
                              placeholder={t('descriptionPlaceholder')}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={sub.amount}
                              onChange={(e) =>
                                updateSubscription(sub.id, 'amount', parseFloat(e.target.value) || 0)
                              }
                              className="w-24"
                              step="0.01"
                            />
                          </TableCell>
                          <TableCell>
                            <CurrencySelect
                              value={sub.currency}
                              onValueChange={(value) => updateSubscription(sub.id, 'currency', value)}
                              className="w-28"
                              size="sm"
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              value={sub.frequency}
                              onValueChange={(value) => updateSubscription(sub.id, 'frequency', value)}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {FREQUENCY_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {tFreq(opt.labelKey)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={sub.category || 'Other'}
                              onValueChange={(value) => updateSubscription(sub.id, 'category', value)}
                            >
                              <SelectTrigger className="w-36">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CATEGORY_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {tCat(opt.labelKey)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              value={sub.next_payment_date || ''}
                              onChange={(e) => updateSubscription(sub.id, 'next_payment_date', e.target.value)}
                              className="w-36"
                            />
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={sub.status === 'active' ? 'default' : 'secondary'}
                              className="cursor-pointer"
                              onClick={() =>
                                updateSubscription(
                                  sub.id,
                                  'status',
                                  sub.status === 'active' ? 'expired' : 'active'
                                )
                              }
                            >
                              {sub.status === 'active' ? t('statusActive') : t('statusExpired')}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>

            {/* Summary */}
            <div className="p-4 rounded-lg bg-muted/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  {t('selectedCount', { count: selectedCount })}
                </p>
                <p className="text-lg font-semibold">
                  {t('monthlyTotal')}: <CurrencyDisplay amount={monthlyTotal} currency="USD" />
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleStartOver}>
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  {t('startOver')}
                </Button>
                <Button onClick={handleImport} disabled={selectedCount === 0 || isCreating}>
                  {t('importButton', { count: selectedCount })}
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {currentStep === 'import' && (
        <Card>
          <CardHeader>
            <CardTitle>{t('importTitle')}</CardTitle>
            <CardDescription>{t('importDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Progress */}
            <div className="space-y-4">
              <Progress
                value={(importProgress.current / importProgress.total) * 100}
                className="h-3"
              />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>
                  {t('importProgress', {
                    current: importProgress.current,
                    total: importProgress.total,
                  })}
                </span>
                <span>
                  {importProgress.success > 0 && (
                    <span className="text-green-600 mr-3">
                      {t('successCount', { count: importProgress.success })}
                    </span>
                  )}
                  {importProgress.failed > 0 && (
                    <span className="text-destructive">
                      {t('failedCount', { count: importProgress.failed })}
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* Completion */}
            {importProgress.current === importProgress.total && importProgress.total > 0 && (
              <div className="text-center py-8 space-y-4">
                <CheckCircle className="h-16 w-16 mx-auto text-green-600" />
                <h3 className="text-xl font-semibold">{t('importComplete')}</h3>
                <p className="text-muted-foreground">
                  {t('importSummary', {
                    success: importProgress.success,
                    failed: importProgress.failed,
                  })}
                </p>
                <Button onClick={handleStartOver}>
                  {t('importMoreButton')}
                </Button>
              </div>
            )}
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
