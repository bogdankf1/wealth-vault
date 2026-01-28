/**
 * Accounts Import Page
 * AI-powered screenshot import for bank accounts, cards, and deposits
 */
'use client';

import React, { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Upload, Sparkles, Edit3, CheckCircle, ChevronRight, ChevronLeft, Loader2, Trash2 } from 'lucide-react';
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
  useParseAccountScreenshotsMutation,
  type ParsedAccount,
} from '@/lib/api/aiApi';
import { useCreateAccountMutation, useListAccountsQuery, type AccountType } from '@/lib/api/savingsApi';
import { useGetCurrentUserQuery } from '@/lib/api/authApi';
import { useGetMyPreferencesQuery } from '@/lib/api/preferencesApi';
import { useConvertCurrencyMutation } from '@/lib/api/currenciesApi';
import { hasFeatureAccess } from '@/lib/hooks/use-tier-check';
import { UpgradePromptDialog } from '@/components/upgrade-prompt';
import { toast } from 'sonner';

// Step enum
type ImportStep = 'upload' | 'parse' | 'review' | 'import';

// Extended account type for editing
interface EditableAccount extends ParsedAccount {
  id: string;
  selected: boolean;
  isDuplicate: boolean;
}

const STEPS: { key: ImportStep; icon: React.ElementType }[] = [
  { key: 'upload', icon: Upload },
  { key: 'parse', icon: Sparkles },
  { key: 'review', icon: Edit3 },
  { key: 'import', icon: CheckCircle },
];

// Account type options (matching backend AccountType enum)
const ACCOUNT_TYPE_OPTIONS: { value: AccountType; labelKey: string }[] = [
  { value: 'personal', labelKey: 'personal' },
  { value: 'business', labelKey: 'business' },
  { value: 'cash', labelKey: 'cash' },
  { value: 'crypto', labelKey: 'crypto' },
  { value: 'fixed_deposit', labelKey: 'fixedDeposit' },
  { value: 'other', labelKey: 'other' },
];

// Map parsed account_type to API AccountType
const mapAccountType = (parsedType: string): AccountType => {
  const mapping: Record<string, AccountType> = {
    'card': 'personal',      // Cards are personal accounts
    'deposit': 'fixed_deposit', // Deposits map to fixed_deposit
    'cash': 'cash',
    'savings': 'personal',   // Savings map to personal
    'other': 'other',
  };
  return mapping[parsedType] || 'other';
};

export default function AccountsImportPage() {
  const t = useTranslations('savings.import');
  const tTypes = useTranslations('savings.accountTypes');
  const tCommon = useTranslations('common');

  const [currentStep, setCurrentStep] = useState<ImportStep>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedFileIds, setUploadedFileIds] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<EditableAccount[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'cards' | 'deposits'>('all');
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [convertedTotal, setConvertedTotal] = useState<number | null>(null);
  const [isConverting, setIsConverting] = useState(false);

  // API hooks
  const [uploadImages, { isLoading: isUploading }] = useUploadImagesMutation();
  const [parseScreenshots, { isLoading: isParsing }] = useParseAccountScreenshotsMutation();
  const [createAccount, { isLoading: isCreating }] = useCreateAccountMutation();
  const [convertCurrency] = useConvertCurrencyMutation();
  const { data: user } = useGetCurrentUserQuery();
  const { data: preferences } = useGetMyPreferencesQuery();
  const { data: existingAccountsData } = useListAccountsQuery({ page: 1, page_size: 100 });

  // Get existing accounts for duplicate detection
  const existingAccounts = existingAccountsData?.items || [];

  // Check if an account is a duplicate (same name + currency, or same name + institution + last4)
  const isDuplicateAccount = useCallback((acc: ParsedAccount): boolean => {
    return existingAccounts.some((existing) => {
      // Match by name + currency
      const nameMatch = existing.name.toLowerCase() === acc.name.toLowerCase();
      const currencyMatch = existing.currency === acc.currency;

      // Also match by institution + last4 if available
      const institutionMatch = acc.institution && existing.institution?.toLowerCase() === acc.institution.toLowerCase();
      const last4Match = acc.card_last4 && existing.account_number_last4 === acc.card_last4;

      // Consider duplicate if: (same name AND same currency) OR (same institution AND same last4)
      return (nameMatch && currencyMatch) || (institutionMatch && last4Match);
    });
  }, [existingAccounts]);

  // User's preferred display currency
  const displayCurrency = preferences?.display_currency || preferences?.currency || 'UAH';

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

      if (result.accounts.length === 0) {
        toast.info(t('noAccountsFound'));
        return;
      }

      // Convert to editable accounts and mark duplicates
      const editableAccounts: EditableAccount[] = result.accounts.map((acc, index) => {
        const duplicate = isDuplicateAccount(acc);
        return {
          ...acc,
          id: `acc-${index}-${Date.now()}`,
          selected: !duplicate, // Don't select duplicates by default
          isDuplicate: duplicate,
        };
      });

      // Notify about duplicates
      const duplicateCount = editableAccounts.filter(a => a.isDuplicate).length;
      if (duplicateCount > 0) {
        toast.info(t('duplicatesFound', { count: duplicateCount }));
      }

      setAccounts(editableAccounts);
      setCurrentStep('review');
      toast.success(t('accountsFound', { count: result.total_count }));
    } catch (error) {
      toast.error(t('parseError'));
    }
  };

  // Update an account field
  const updateAccount = (id: string, updates: Partial<EditableAccount>) => {
    setAccounts((prev) =>
      prev.map((acc) => (acc.id === id ? { ...acc, ...updates } : acc))
    );
  };

  // Toggle account selection
  const toggleAccountSelection = (id: string) => {
    updateAccount(id, { selected: !accounts.find((a) => a.id === id)?.selected });
  };

  // Select all accounts
  const selectAll = () => {
    const filtered = getFilteredAccounts();
    setAccounts((prev) =>
      prev.map((acc) => ({
        ...acc,
        selected: filtered.some((f) => f.id === acc.id) ? true : acc.selected,
      }))
    );
  };

  // Deselect all accounts
  const deselectAll = () => {
    const filtered = getFilteredAccounts();
    setAccounts((prev) =>
      prev.map((acc) => ({
        ...acc,
        selected: filtered.some((f) => f.id === acc.id) ? false : acc.selected,
      }))
    );
  };

  // Remove selected accounts
  const removeSelected = () => {
    setAccounts((prev) => prev.filter((acc) => !acc.selected));
  };

  // Get filtered accounts based on active tab
  const getFilteredAccounts = () => {
    switch (activeTab) {
      case 'cards':
        return accounts.filter((a) => a.account_type === 'card');
      case 'deposits':
        return accounts.filter((a) => a.account_type === 'deposit' || a.account_type === 'savings');
      default:
        return accounts;
    }
  };

  // Import selected accounts
  const handleImport = async () => {
    const selectedAccounts = accounts.filter((a) => a.selected);
    if (selectedAccounts.length === 0) {
      toast.error(t('noAccountsSelected'));
      return;
    }

    setCurrentStep('import');
    setImportProgress({
      current: 0,
      total: selectedAccounts.length,
      success: 0,
      failed: 0,
    });

    let success = 0;
    let failed = 0;

    for (let i = 0; i < selectedAccounts.length; i++) {
      const acc = selectedAccounts[i];

      try {
        await createAccount({
          name: acc.name,
          account_type: mapAccountType(acc.account_type),
          institution: acc.institution || undefined,
          account_number_last4: acc.card_last4 || undefined,
          current_balance: acc.balance,
          currency: acc.currency,
          interest_rate: acc.interest_rate || undefined, // AI returns decimal (0.14 = 14%), backend expects same format
          is_active: true,
          notes: acc.card_network ? `${acc.card_network}${acc.card_expiry ? ` - Exp: ${acc.card_expiry}` : ''}${acc.is_virtual ? ' (Virtual)' : ''}` : undefined,
        }).unwrap();

        success++;
      } catch (error) {
        failed++;
      }

      setImportProgress({
        current: i + 1,
        total: selectedAccounts.length,
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
    setAccounts([]);
    setCurrentStep('upload');
    setImportProgress({ current: 0, total: 0, success: 0, failed: 0 });
  };

  // Calculate summary stats
  const selectedAccounts = accounts.filter((a) => a.selected);
  const cardsCount = selectedAccounts.filter((a) => a.account_type === 'card').length;
  const depositsCount = selectedAccounts.filter((a) => a.account_type === 'deposit' || a.account_type === 'savings').length;

  // Calculate totals grouped by currency
  const totalsByCurrency = selectedAccounts.reduce(
    (acc, a) => {
      const currency = a.currency || 'UAH';
      acc[currency] = (acc[currency] || 0) + a.balance;
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

  const filteredAccounts = getFilteredAccounts();
  const selectedInView = filteredAccounts.filter((a) => a.selected).length;

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
                      {t('continueToParseButton')}
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
            <CardDescription>{t('reviewDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">{t('totalAccounts')}</p>
                <p className="text-2xl font-bold">{selectedAccounts.length}</p>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">{t('totalBalance')}</p>
                <p className="text-2xl font-bold">
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
                <p className="text-sm text-muted-foreground">{t('cardVsDeposit')}</p>
                <p className="text-2xl font-bold">{cardsCount} / {depositsCount}</p>
              </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <TabsList>
                  <TabsTrigger value="all">
                    {t('tabAll')} ({accounts.length})
                  </TabsTrigger>
                  <TabsTrigger value="cards">
                    {t('tabCards')} ({accounts.filter((a) => a.account_type === 'card').length})
                  </TabsTrigger>
                  <TabsTrigger value="deposits">
                    {t('tabDeposits')} ({accounts.filter((a) => a.account_type === 'deposit' || a.account_type === 'savings').length})
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
                        <TableHead>{t('columnName')}</TableHead>
                        <TableHead>{t('columnType')}</TableHead>
                        <TableHead>{t('columnBalance')}</TableHead>
                        <TableHead>{t('columnInstitution')}</TableHead>
                        <TableHead>{t('columnCardLast4')}</TableHead>
                        <TableHead>{t('columnCardExpiry')}</TableHead>
                        <TableHead>{t('columnNetwork')}</TableHead>
                        <TableHead>{t('columnInterestRate')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAccounts.map((acc) => (
                        <TableRow key={acc.id} className={cn(!acc.selected && 'opacity-50', acc.isDuplicate && 'bg-yellow-50 dark:bg-yellow-950/20')}>
                          <TableCell>
                            <Checkbox
                              checked={acc.selected}
                              onCheckedChange={() => toggleAccountSelection(acc.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Input
                                value={acc.name}
                                onChange={(e) => updateAccount(acc.id, { name: e.target.value })}
                                className="min-w-48"
                              />
                              {acc.isDuplicate && (
                                <Badge variant="outline" className="text-yellow-600 border-yellow-400 whitespace-nowrap">
                                  {t('duplicate')}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={acc.account_type}
                              onValueChange={(value) =>
                                updateAccount(acc.id, { account_type: value as ParsedAccount['account_type'] })
                              }
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="card">{t('typeCard')}</SelectItem>
                                <SelectItem value="deposit">{t('typeDeposit')}</SelectItem>
                                <SelectItem value="savings">{t('typeSavings')}</SelectItem>
                                <SelectItem value="cash">{t('typeCash')}</SelectItem>
                                <SelectItem value="other">{t('typeOther')}</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                value={acc.balance}
                                onChange={(e) =>
                                  updateAccount(acc.id, {
                                    balance: parseFloat(e.target.value) || 0,
                                  })
                                }
                                className="w-28"
                              />
                              <span className="text-sm text-muted-foreground">{acc.currency}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Input
                              value={acc.institution || ''}
                              onChange={(e) => updateAccount(acc.id, { institution: e.target.value || undefined })}
                              placeholder={t('institutionPlaceholder')}
                              className="w-32"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={acc.card_last4 || ''}
                              onChange={(e) => updateAccount(acc.id, { card_last4: e.target.value || undefined })}
                              placeholder="XXXX"
                              maxLength={4}
                              className="w-20"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={acc.card_expiry || ''}
                              onChange={(e) => updateAccount(acc.id, { card_expiry: e.target.value || undefined })}
                              placeholder="MM/YY"
                              className="w-20"
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              value={acc.card_network || 'none'}
                              onValueChange={(value) =>
                                updateAccount(acc.id, { card_network: value === 'none' ? undefined : value })
                              }
                            >
                              <SelectTrigger className="w-28">
                                <SelectValue placeholder="-" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">-</SelectItem>
                                <SelectItem value="VISA">VISA</SelectItem>
                                <SelectItem value="Mastercard">Mastercard</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            {(acc.account_type === 'deposit' || acc.account_type === 'savings') && (
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={acc.interest_rate ? (acc.interest_rate * 100).toFixed(2) : ''}
                                  onChange={(e) =>
                                    updateAccount(acc.id, {
                                      interest_rate: e.target.value ? parseFloat(e.target.value) / 100 : undefined,
                                    })
                                  }
                                  placeholder="0.00"
                                  className="w-20"
                                />
                                <span className="text-sm text-muted-foreground">%</span>
                              </div>
                            )}
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
              <Button onClick={handleImport} disabled={selectedAccounts.length === 0}>
                {t('importButton', { count: selectedAccounts.length })}
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
