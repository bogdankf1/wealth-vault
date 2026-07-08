/**
 * Installment Import Page
 * AI-powered screenshot import for installments from Monobank Pay, PrivatBank, etc.
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
  useParseInstallmentScreenshotsMutation,
  type ParsedInstallment,
} from '@/lib/api/aiApi';
import { useCreateInstallmentMutation } from '@/lib/api/installmentsApi';
import { useListAccountsQuery } from '@/lib/api/savingsApi';
import { useGetCurrentUserQuery } from '@/lib/api/authApi';
import { useGetMyPreferencesQuery } from '@/lib/api/preferencesApi';
import { hasFeatureAccess } from '@/hooks/use-tier-check';
import { UpgradePromptDialog } from '@/components/upgrade-prompt';
import { toast } from 'sonner';

// Step enum
type ImportStep = 'upload' | 'review' | 'import';

// Extended installment type for editing
interface EditableInstallment extends ParsedInstallment {
  id: string;
  selected: boolean;
}

const STEPS: { key: ImportStep; icon: React.ElementType }[] = [
  { key: 'upload', icon: Upload },
  { key: 'review', icon: Edit3 },
  { key: 'import', icon: CheckCircle },
];

// Frequency options
const FREQUENCY_OPTIONS: { value: string; labelKey: string }[] = [
  { value: 'weekly', labelKey: 'weekly' },
  { value: 'biweekly', labelKey: 'biweekly' },
  { value: 'monthly', labelKey: 'monthly' },
];

// Category options for installments with translation keys
const CATEGORY_OPTIONS: { value: string; labelKey: string }[] = [
  { value: 'Personal Tech', labelKey: 'personalTech' },
  { value: 'Kitchen Appliances', labelKey: 'kitchenAppliances' },
  { value: 'Health Tech', labelKey: 'healthTech' },
  { value: 'Home Appliances', labelKey: 'homeAppliances' },
  { value: 'Fitness Equipment', labelKey: 'fitnessEquipment' },
  { value: 'Housing Goods', labelKey: 'housingGoods' },
  { value: 'Vehicle', labelKey: 'vehicle' },
  { value: 'Property & Real Estate', labelKey: 'propertyRealEstate' },
  { value: 'Miscellaneous', labelKey: 'miscellaneous' },
];

export default function InstallmentImportPage() {
  const t = useTranslations('installments.import');
  const tFreq = useTranslations('installments.frequencies');
  const tCat = useTranslations('installments.categories');

  const [currentStep, setCurrentStep] = useState<ImportStep>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedFileIds, setUploadedFileIds] = useState<string[]>([]);
  const [installments, setInstallments] = useState<EditableInstallment[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'completed'>('all');
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [selectedPaymentAccountId, setSelectedPaymentAccountId] = useState<string | null>(null);
  const [enableAutoPay, setEnableAutoPay] = useState(false);
  const [syncHistorical, setSyncHistorical] = useState(false);

  // API hooks
  const [uploadImages, { isLoading: isUploading }] = useUploadImagesMutation();
  const [parseScreenshots, { isLoading: isParsing }] = useParseInstallmentScreenshotsMutation();
  const [createInstallment, { isLoading: isCreating }] = useCreateInstallmentMutation();
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

      // Convert to editable installments with corrected dates
      const today = new Date();
      const currentYear = today.getFullYear();

      const editableInstallments: EditableInstallment[] = result.installments.map((inst, index) => {
        // Fix start_date: use current year so backend doesn't think all payments are complete
        let correctedStartDate = inst.start_date;
        if (correctedStartDate) {
          const parsed = new Date(correctedStartDate);
          if (!isNaN(parsed.getTime())) {
            parsed.setFullYear(currentYear);
            if (parsed > today) {
              // If corrected date is in the future, use previous year
              parsed.setFullYear(currentYear - 1);
            }
            correctedStartDate = parsed.toISOString().split('T')[0];
          }
        }

        return {
          ...inst,
          start_date: correctedStartDate,
          id: `inst-${index}-${Date.now()}`,
          selected: inst.status === 'active',
        };
      });

      setInstallments(editableInstallments);
      setCurrentStep('review');

      // Show success message
      toast.success(t('installmentsFound', { count: result.total_count }));
    } catch (error) {
      toast.error(t('uploadError'));
    }
  };

  // Update an installment field
  const updateInstallment = (id: string, field: keyof EditableInstallment, value: unknown) => {
    setInstallments((prev) =>
      prev.map((inst) => (inst.id === id ? { ...inst, [field]: value } : inst))
    );
  };

  // Toggle installment selection
  const toggleSelection = (id: string) => {
    setInstallments((prev) =>
      prev.map((inst) => (inst.id === id ? { ...inst, selected: !inst.selected } : inst))
    );
  };

  // Select/deselect all
  const selectAll = () => {
    const filtered = getFilteredInstallments();
    const allSelected = filtered.every((s) => s.selected);
    setInstallments((prev) =>
      prev.map((inst) => {
        const inFiltered = filtered.some((f) => f.id === inst.id);
        return inFiltered ? { ...inst, selected: !allSelected } : inst;
      })
    );
  };

  // Remove selected installments
  const removeSelected = () => {
    setInstallments((prev) => prev.filter((s) => !s.selected));
  };

  // Get filtered installments based on active tab
  const getFilteredInstallments = () => {
    switch (activeTab) {
      case 'active':
        return installments.filter((s) => s.status === 'active');
      case 'completed':
        return installments.filter((s) => s.status === 'completed');
      default:
        return installments;
    }
  };

  // Calculate totals
  const selectedInsts = installments.filter((s) => s.selected);
  const selectedCount = selectedInsts.length;
  const activeInsts = installments.filter((s) => s.status === 'active');
  const completedInsts = installments.filter((s) => s.status === 'completed');

  // Calculate total debt and monthly payment for selected active installments
  const totalDebt = selectedInsts
    .filter((s) => s.status === 'active')
    .reduce((total, inst) => total + (inst.remaining_balance || 0), 0);

  const monthlyPayment = selectedInsts
    .filter((s) => s.status === 'active')
    .reduce((total, inst) => total + inst.amount_per_payment, 0);

  // Import installments
  const handleImport = async () => {
    const toImport = installments.filter((s) => s.selected);
    if (toImport.length === 0) return;

    setCurrentStep('import');
    setImportProgress({ current: 0, total: toImport.length, success: 0, failed: 0 });

    let success = 0;
    let failed = 0;

    for (let i = 0; i < toImport.length; i++) {
      const inst = toImport[i];
      setImportProgress((prev) => ({ ...prev, current: i + 1 }));

      try {
        // Map frequency
        const frequencyMap: Record<string, 'weekly' | 'biweekly' | 'monthly'> = {
          weekly: 'weekly',
          biweekly: 'biweekly',
          monthly: 'monthly',
        };

        // Get start date - use start_date or today
        const startDate = inst.start_date || new Date().toISOString().split('T')[0];
        const firstPaymentDate = inst.start_date || startDate;

        await createInstallment({
          name: inst.name,
          description: inst.description || undefined,
          category: inst.category || 'Miscellaneous',
          total_amount: inst.total_amount,
          amount_per_payment: inst.amount_per_payment,
          currency: inst.currency || 'UAH',
          frequency: frequencyMap[inst.frequency] || 'monthly',
          number_of_payments: inst.number_of_payments,
          payments_made: inst.payments_made || 0,
          start_date: startDate,
          first_payment_date: firstPaymentDate,
          is_active: inst.status === 'active',
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
    setInstallments([]);
    setImportProgress({ current: 0, total: 0, success: 0, failed: 0 });
    setSelectedPaymentAccountId(null);
    setEnableAutoPay(false);
    setSyncHistorical(false);
  };

  // Get step status for progress indicator
  const getStepStatus = (step: ImportStep): 'completed' | 'current' | 'upcoming' => {
    const stepOrder: ImportStep[] = ['upload', 'review', 'import'];
    const currentIndex = stepOrder.indexOf(currentStep);
    const stepIndex = stepOrder.indexOf(step);

    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'current';
    return 'upcoming';
  };

  const filteredInstallments = getFilteredInstallments();

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
                      {isUploading ? t('uploading') : t('parsing')}
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
            <CardDescription>{t('reviewDescription', { count: installments.length })}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">{t('totalInstallments')}</p>
                <p className="text-lg md:text-2xl font-bold">{selectedCount}</p>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">{t('totalDebt')}</p>
                <p className="text-lg md:text-2xl font-bold">
                  <CurrencyDisplay amount={totalDebt} currency="UAH" />
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">{t('monthlyPayment')}</p>
                <p className="text-lg md:text-2xl font-bold">
                  <CurrencyDisplay amount={monthlyPayment} currency="UAH" />
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">{t('breakdown')}</p>
                <p className="text-lg font-bold">{activeInsts.filter(s => s.selected).length} / {completedInsts.filter(s => s.selected).length}</p>
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
                    {t('tabs.all')} ({installments.length})
                  </TabsTrigger>
                  <TabsTrigger value="active">
                    {t('tabs.active')} ({activeInsts.length})
                  </TabsTrigger>
                  <TabsTrigger value="completed">
                    {t('tabs.completed')} ({completedInsts.length})
                  </TabsTrigger>
                </TabsList>

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={selectAll}>
                    {filteredInstallments.every((s) => s.selected)
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
                        <TableHead>{t('columns.totalAmount')}</TableHead>
                        <TableHead>{t('columns.paymentAmount')}</TableHead>
                        <TableHead>{t('columns.currency')}</TableHead>
                        <TableHead>{t('columns.frequency')}</TableHead>
                        <TableHead>{t('columns.payments')}</TableHead>
                        <TableHead>{t('columns.category')}</TableHead>
                        <TableHead>{t('columns.startDate')}</TableHead>
                        <TableHead>{t('columns.status')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInstallments.map((inst) => (
                        <TableRow
                          key={inst.id}
                          className={cn(!inst.selected && 'opacity-50')}
                        >
                          <TableCell>
                            <Checkbox
                              checked={inst.selected}
                              onCheckedChange={() => toggleSelection(inst.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={inst.name}
                              onChange={(e) => updateInstallment(inst.id, 'name', e.target.value)}
                              className="min-w-[150px]"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={inst.total_amount}
                              onChange={(e) =>
                                updateInstallment(inst.id, 'total_amount', parseFloat(e.target.value) || 0)
                              }
                              className="w-28"
                              step="0.01"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={inst.amount_per_payment}
                              onChange={(e) =>
                                updateInstallment(inst.id, 'amount_per_payment', parseFloat(e.target.value) || 0)
                              }
                              className="w-24"
                              step="0.01"
                            />
                          </TableCell>
                          <TableCell>
                            <CurrencySelect
                              value={inst.currency}
                              onValueChange={(value) => updateInstallment(inst.id, 'currency', value)}
                              className="w-28"
                              size="sm"
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              value={inst.frequency}
                              onValueChange={(value) => updateInstallment(inst.id, 'frequency', value)}
                            >
                              <SelectTrigger className="w-28">
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
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                value={inst.payments_made}
                                onChange={(e) =>
                                  updateInstallment(inst.id, 'payments_made', parseInt(e.target.value) || 0)
                                }
                                className="w-16"
                              />
                              <span>/</span>
                              <Input
                                type="number"
                                value={inst.number_of_payments}
                                onChange={(e) =>
                                  updateInstallment(inst.id, 'number_of_payments', parseInt(e.target.value) || 1)
                                }
                                className="w-16"
                              />
                            </div>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={inst.category || 'Miscellaneous'}
                              onValueChange={(value) => updateInstallment(inst.id, 'category', value)}
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
                              value={inst.start_date || ''}
                              onChange={(e) => updateInstallment(inst.id, 'start_date', e.target.value)}
                              className="w-36"
                            />
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={inst.status === 'active' ? 'default' : 'secondary'}
                              className="cursor-pointer"
                              onClick={() =>
                                updateInstallment(
                                  inst.id,
                                  'status',
                                  inst.status === 'active' ? 'completed' : 'active'
                                )
                              }
                            >
                              {inst.status === 'active' ? t('statusActive') : t('statusCompleted')}
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
                  {t('totalDebt')}: <CurrencyDisplay amount={totalDebt} currency="UAH" />
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
