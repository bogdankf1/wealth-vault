/**
 * Statement Import Page
 * Upload and parse bank statements with AI categorization
 */
'use client';

import React, { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Download, CheckCircle, AlertCircle, Loader2, X, Trash2, Upload, Edit3, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileUpload } from '@/components/expenses/file-upload';
import {
  useParseStatementMutation,
  useBatchCategorizeTransactionsMutation,
  type ParsedTransaction,
} from '@/lib/api/aiApi';
import { useCreateExpenseMutation } from '@/lib/api/expensesApi';
import { useListSubscriptionsQuery } from '@/lib/api/subscriptionsApi';
import { useListInstallmentsQuery } from '@/lib/api/installmentsApi';
import { EXPENSE_CATEGORY_KEYS } from '@/lib/constants/expense-categories';

// Step type
type ImportStep = 'upload' | 'review' | 'import';

// Progress steps configuration
const STEPS: { key: ImportStep; icon: React.ElementType }[] = [
  { key: 'upload', icon: Upload },
  { key: 'review', icon: Edit3 },
  { key: 'import', icon: CheckCircle },
];

export default function ImportStatementPage() {
  const t = useTranslations('expenses.import');
  const tCategories = useTranslations('expenses.categories');

  const [parseStatement, { isLoading: isParsing }] = useParseStatementMutation();
  const [batchCategorize, { isLoading: isCategorizing }] = useBatchCategorizeTransactionsMutation();
  const [createExpense] = useCreateExpenseMutation();

  // Fetch user's subscriptions and installments for matching
  const { data: subscriptionsData } = useListSubscriptionsQuery({ page: 1, page_size: 100 });
  const { data: installmentsData } = useListInstallmentsQuery({ page: 1, page_size: 100 });

  const [uploadedFileId, setUploadedFileId] = useState<string | null>(null);
  const [uploadedFilename, setUploadedFilename] = useState<string>('');
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [categorizedTransactions, setCategorizedTransactions] = useState<
    Array<ParsedTransaction & { category: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<ImportStep>('upload');
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<{
    success: number;
    failed: number;
    errors: string[];
  } | null>(null);

  const handleUploadSuccess = async (fileId: string, filename: string) => {
    setUploadedFileId(fileId);
    setUploadedFilename(filename);

    try {
      setError(null);
      const response = await parseStatement({ file_id: fileId }).unwrap();
      setTransactions(response.transactions);
      setCurrentStep('review');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to parse statement';
      setError(errorMessage);
    }
  };

  const handleCategorize = async () => {
    if (transactions.length === 0) return;

    try {
      setError(null);

      // Separate expenses and income based on amount sign
      const expenseTransactions = transactions.filter((t) => t.amount < 0);
      const incomeTransactions = transactions.filter((t) => t.amount > 0);

      // Categorize expenses
      let expenseCategories: string[] = [];
      if (expenseTransactions.length > 0) {
        const expenseResponse = await batchCategorize({
          transactions: expenseTransactions.map((t) => ({
            description: t.description,
            amount: Math.abs(t.amount),
          })),
          transaction_type: 'expense',
        }).unwrap();
        expenseCategories = expenseResponse.categories;
      }

      // Categorize income
      let incomeCategories: string[] = [];
      if (incomeTransactions.length > 0) {
        const incomeResponse = await batchCategorize({
          transactions: incomeTransactions.map((t) => ({
            description: t.description,
            amount: t.amount,
          })),
          transaction_type: 'income',
        }).unwrap();
        incomeCategories = incomeResponse.categories;
      }

      // Merge results back
      const categorized: Array<ParsedTransaction & { category: string }> = [];
      let expenseIndex = 0;
      let incomeIndex = 0;

      transactions.forEach((transaction) => {
        if (transaction.amount < 0) {
          categorized.push({
            ...transaction,
            category: expenseCategories[expenseIndex] || 'Other',
          });
          expenseIndex++;
        } else {
          categorized.push({
            ...transaction,
            category: incomeCategories[incomeIndex] || 'Other',
          });
          incomeIndex++;
        }
      });

      setCategorizedTransactions(categorized);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to categorize transactions';
      setError(errorMessage);
    }
  };

  const handleCategoryChange = (index: number, newCategory: string) => {
    setCategorizedTransactions((prev) =>
      prev.map((transaction, i) =>
        i === index ? { ...transaction, category: newCategory } : transaction
      )
    );
  };

  // Remove individual transaction
  const handleRemoveTransaction = (index: number) => {
    setCategorizedTransactions((prev) => prev.filter((_, i) => i !== index));
  };

  // Remove all income transactions
  const handleRemoveIncomes = () => {
    setCategorizedTransactions((prev) => prev.filter((t) => t.amount < 0));
  };

  // Remove transactions matching user's subscriptions
  const handleRemoveSubscriptions = () => {
    const subscriptionNames = subscriptionsData?.items.map((s) => s.name.toLowerCase()) || [];
    setCategorizedTransactions((prev) =>
      prev.filter((t) => {
        const description = t.description.toLowerCase();
        return !subscriptionNames.some((name) => description.includes(name));
      })
    );
  };

  // Remove transactions matching user's installments
  const handleRemoveInstallments = () => {
    const installmentNames = installmentsData?.items.map((i) => i.name.toLowerCase()) || [];
    setCategorizedTransactions((prev) =>
      prev.filter((t) => {
        const description = t.description.toLowerCase();
        return !installmentNames.some((name) => description.includes(name));
      })
    );
  };

  // Calculate counts for button states
  const incomeCount = useMemo(
    () => categorizedTransactions.filter((t) => t.amount > 0).length,
    [categorizedTransactions]
  );

  const subscriptionMatchCount = useMemo(() => {
    const subscriptionNames = subscriptionsData?.items.map((s) => s.name.toLowerCase()) || [];
    return categorizedTransactions.filter((t) => {
      const description = t.description.toLowerCase();
      return subscriptionNames.some((name) => description.includes(name));
    }).length;
  }, [categorizedTransactions, subscriptionsData?.items]);

  const installmentMatchCount = useMemo(() => {
    const installmentNames = installmentsData?.items.map((i) => i.name.toLowerCase()) || [];
    return categorizedTransactions.filter((t) => {
      const description = t.description.toLowerCase();
      return installmentNames.some((name) => description.includes(name));
    }).length;
  }, [categorizedTransactions, installmentsData?.items]);

  const handleImport = async () => {
    if (categorizedTransactions.length === 0) return;

    setImporting(true);
    setError(null);

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Import only expenses (negative amounts)
    const expensesToImport = categorizedTransactions.filter((t) => t.amount < 0);

    for (const transaction of expensesToImport) {
      try {
        await createExpense({
          name: transaction.description,
          description: `Imported from ${uploadedFilename}`,
          category: transaction.category,
          amount: Math.abs(transaction.amount),
          currency: transaction.currency || 'UAH',
          frequency: 'one_time',
          date: new Date(transaction.date).toISOString(),
          is_active: true,
        }).unwrap();

        results.success++;
      } catch (err: unknown) {
        results.failed++;
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        results.errors.push(`${transaction.description}: ${errorMessage}`);
      }
    }

    setImportResults(results);
    setCurrentStep('import');
    setImporting(false);
  };

  const formatCurrency = (amount: number, currency: string = 'UAH') => {
    const absAmount = Math.abs(amount);
    const formattedNumber = new Intl.NumberFormat('uk-UA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(absAmount);

    // Use ₴ symbol for UAH instead of "грн"
    if (currency === 'UAH') {
      return `₴ ${formattedNumber}`;
    }

    // For other currencies, use default formatting
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(absAmount);
  };

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
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
                  {t(`${step.key}Step`)}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Step 1: Upload & Parse */}
      {currentStep === 'upload' && (
        <div>
          <FileUpload
            onUploadSuccess={handleUploadSuccess}
            onUploadError={setError}
            isParsing={isParsing}
          />
        </div>
      )}

      {/* Step 2: Review */}
      {currentStep === 'review' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Edit3 className="h-5 w-5" />
              {t('reviewStep')}
            </CardTitle>
            <CardDescription>
              {t('transactionsFound', { count: transactions.length })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {categorizedTransactions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">
                  {t('categorizePrompt')}
                </p>
                <Button onClick={handleCategorize} disabled={isCategorizing}>
                  {isCategorizing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('categorizing')}
                    </>
                  ) : (
                    t('categorizeButton')
                  )}
                </Button>
              </div>
            ) : (
              <>
                {/* Bulk Action Buttons */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRemoveIncomes}
                    disabled={incomeCount === 0}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('removeIncomes', { count: incomeCount })}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRemoveSubscriptions}
                    disabled={subscriptionMatchCount === 0}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('removeSubscriptions', { count: subscriptionMatchCount })}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRemoveInstallments}
                    disabled={installmentMatchCount === 0}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('removeInstallments', { count: installmentMatchCount })}
                  </Button>
                </div>

                <Tabs defaultValue="all">
                  <TabsList className="grid w-full grid-cols-5">
                    <TabsTrigger value="all">
                      {t('tabAll', { count: categorizedTransactions.length })}
                    </TabsTrigger>
                    <TabsTrigger value="expenses">
                      {t('tabExpenses', { count: categorizedTransactions.filter((t) => t.amount < 0).length })}
                    </TabsTrigger>
                    <TabsTrigger value="income">
                      {t('tabIncome', { count: categorizedTransactions.filter((t) => t.amount > 0).length })}
                    </TabsTrigger>
                    <TabsTrigger value="subscriptions">
                      {t('tabSubscriptions', { count: subscriptionMatchCount })}
                    </TabsTrigger>
                    <TabsTrigger value="installments">
                      {t('tabInstallments', { count: installmentMatchCount })}
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="all" className="mt-4">
                    <div className="border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('date')}</TableHead>
                            <TableHead>{t('description')}</TableHead>
                            <TableHead>{t('category')}</TableHead>
                            <TableHead className="text-right">{t('amount')}</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {categorizedTransactions.map((transaction, index) => (
                            <TableRow key={index}>
                              <TableCell>{transaction.date}</TableCell>
                              <TableCell>{transaction.description}</TableCell>
                              <TableCell>
                                <Select
                                  value={transaction.category}
                                  onValueChange={(value) => handleCategoryChange(index, value)}
                                >
                                  <SelectTrigger className="w-[180px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {EXPENSE_CATEGORY_KEYS.map((key) => (
                                      <SelectItem key={key} value={key}>
                                        {tCategories(key)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell
                                className={`text-right ${
                                  transaction.amount < 0 ? 'text-red-600' : 'text-green-600'
                                }`}
                              >
                                {transaction.amount < 0 ? '-' : '+'}{formatCurrency(transaction.amount, transaction.currency)}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemoveTransaction(index)}
                                  className="h-8 w-8"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>

                  <TabsContent value="expenses" className="mt-4">
                    <div className="border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('date')}</TableHead>
                            <TableHead>{t('description')}</TableHead>
                            <TableHead>{t('category')}</TableHead>
                            <TableHead className="text-right">{t('amount')}</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {categorizedTransactions
                            .filter((t) => t.amount < 0)
                            .map((transaction) => {
                              // Find the original index in the full array
                              const originalIndex = categorizedTransactions.indexOf(transaction);
                              return (
                                <TableRow key={originalIndex}>
                                  <TableCell>{transaction.date}</TableCell>
                                  <TableCell>{transaction.description}</TableCell>
                                  <TableCell>
                                    <Select
                                      value={transaction.category}
                                      onValueChange={(value) => handleCategoryChange(originalIndex, value)}
                                    >
                                      <SelectTrigger className="w-[180px]">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {EXPENSE_CATEGORY_KEYS.map((key) => (
                                          <SelectItem key={key} value={key}>
                                            {tCategories(key)}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                  <TableCell className="text-right text-red-600">
                                    -{formatCurrency(transaction.amount, transaction.currency)}
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleRemoveTransaction(originalIndex)}
                                      className="h-8 w-8"
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>

                  <TabsContent value="income" className="mt-4">
                    <div className="border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('date')}</TableHead>
                            <TableHead>{t('description')}</TableHead>
                            <TableHead>{t('category')}</TableHead>
                            <TableHead className="text-right">{t('amount')}</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {categorizedTransactions
                            .filter((t) => t.amount > 0)
                            .map((transaction) => {
                              // Find the original index in the full array
                              const originalIndex = categorizedTransactions.indexOf(transaction);
                              return (
                                <TableRow key={originalIndex}>
                                  <TableCell>{transaction.date}</TableCell>
                                  <TableCell>{transaction.description}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline">{transaction.category}</Badge>
                                  </TableCell>
                                  <TableCell className="text-right text-green-600">
                                    +{formatCurrency(transaction.amount, transaction.currency)}
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleRemoveTransaction(originalIndex)}
                                      className="h-8 w-8"
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>

                  <TabsContent value="subscriptions" className="mt-4">
                    <div className="border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('date')}</TableHead>
                            <TableHead>{t('description')}</TableHead>
                            <TableHead>{t('category')}</TableHead>
                            <TableHead className="text-right">{t('amount')}</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {categorizedTransactions
                            .filter((t) => {
                              const subscriptionNames = subscriptionsData?.items.map((s) => s.name.toLowerCase()) || [];
                              const description = t.description.toLowerCase();
                              return subscriptionNames.some((name) => description.includes(name));
                            })
                            .map((transaction) => {
                              // Find the original index in the full array
                              const originalIndex = categorizedTransactions.indexOf(transaction);
                              return (
                                <TableRow key={originalIndex}>
                                  <TableCell>{transaction.date}</TableCell>
                                  <TableCell>{transaction.description}</TableCell>
                                  <TableCell>
                                    <Select
                                      value={transaction.category}
                                      onValueChange={(value) => handleCategoryChange(originalIndex, value)}
                                    >
                                      <SelectTrigger className="w-[180px]">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {EXPENSE_CATEGORY_KEYS.map((key) => (
                                          <SelectItem key={key} value={key}>
                                            {tCategories(key)}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                  <TableCell
                                    className={`text-right ${
                                      transaction.amount < 0 ? 'text-red-600' : 'text-green-600'
                                    }`}
                                  >
                                    {transaction.amount < 0 ? '-' : '+'}{formatCurrency(transaction.amount, transaction.currency)}
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleRemoveTransaction(originalIndex)}
                                      className="h-8 w-8"
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>

                  <TabsContent value="installments" className="mt-4">
                    <div className="border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('date')}</TableHead>
                            <TableHead>{t('description')}</TableHead>
                            <TableHead>{t('category')}</TableHead>
                            <TableHead className="text-right">{t('amount')}</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {categorizedTransactions
                            .filter((t) => {
                              const installmentNames = installmentsData?.items.map((i) => i.name.toLowerCase()) || [];
                              const description = t.description.toLowerCase();
                              return installmentNames.some((name) => description.includes(name));
                            })
                            .map((transaction) => {
                              // Find the original index in the full array
                              const originalIndex = categorizedTransactions.indexOf(transaction);
                              return (
                                <TableRow key={originalIndex}>
                                  <TableCell>{transaction.date}</TableCell>
                                  <TableCell>{transaction.description}</TableCell>
                                  <TableCell>
                                    <Select
                                      value={transaction.category}
                                      onValueChange={(value) => handleCategoryChange(originalIndex, value)}
                                    >
                                      <SelectTrigger className="w-[180px]">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {EXPENSE_CATEGORY_KEYS.map((key) => (
                                          <SelectItem key={key} value={key}>
                                            {tCategories(key)}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                  <TableCell
                                    className={`text-right ${
                                      transaction.amount < 0 ? 'text-red-600' : 'text-green-600'
                                    }`}
                                  >
                                    {transaction.amount < 0 ? '-' : '+'}{formatCurrency(transaction.amount, transaction.currency)}
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleRemoveTransaction(originalIndex)}
                                      className="h-8 w-8"
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                </Tabs>

                <Separator />

                <div className="flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">
                    {t('noteExpensesOnly')}
                  </p>
                  <Button onClick={handleImport} disabled={importing}>
                    {importing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('importing')}
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        {t('importExpensesButton')}
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Import Results */}
      {currentStep === 'import' && importResults && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              {t('importStep')}
            </CardTitle>
            <CardDescription>
              {t('importDescription') || 'Importing your expenses...'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center py-8 space-y-6">
              <CheckCircle className="h-12 w-12 mx-auto text-green-500" />
              <div className="space-y-4">
                <p className="text-lg font-medium">{t('importComplete') || 'Import Complete!'}</p>
                <div className="flex justify-center gap-4">
                  <Badge variant="default" className="text-sm">
                    {t('successCount', { count: importResults.success })}
                  </Badge>
                  {importResults.failed > 0 && (
                    <Badge variant="destructive" className="text-sm">
                      {t('failedCount', { count: importResults.failed })}
                    </Badge>
                  )}
                </div>

                {importResults.failed > 0 && importResults.errors.length > 0 && (
                  <div className="text-left mx-auto max-w-md mt-4">
                    <p className="text-sm text-muted-foreground mb-2">{t('errors')}</p>
                    <ul className="list-disc list-inside text-xs text-red-600">
                      {importResults.errors.slice(0, 5).map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <Button
                  onClick={() => {
                    setCurrentStep('upload');
                    setUploadedFileId(null);
                    setTransactions([]);
                    setCategorizedTransactions([]);
                    setImportResults(null);
                  }}
                  variant="outline"
                  className="mt-4"
                >
                  {t('importAnother')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
