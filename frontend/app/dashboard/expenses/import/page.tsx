/**
 * Statement Import Page
 * Upload and parse bank statements with AI categorization
 */
'use client';

import { useState, useMemo } from 'react';
import { ArrowLeft, Download, CheckCircle, AlertCircle, Loader2, X, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { CATEGORY_OPTIONS } from '@/lib/constants/expense-categories';

export default function ImportStatementPage() {
  const router = useRouter();
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
  const [currentStep, setCurrentStep] = useState<'upload' | 'parse' | 'review' | 'import'>('upload');
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<{
    success: number;
    failed: number;
    errors: string[];
  } | null>(null);

  const handleUploadSuccess = (fileId: string, filename: string) => {
    setUploadedFileId(fileId);
    setUploadedFilename(filename);
    setCurrentStep('parse');
  };

  const handleParseStatement = async () => {
    if (!uploadedFileId) return;

    try {
      setError(null);
      const response = await parseStatement({ file_id: uploadedFileId }).unwrap();
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
    <div className="container mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/expenses">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Import Bank Statement</h1>
            <p className="text-muted-foreground">
              Upload your bank statement and let AI categorize your transactions
            </p>
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2">
        <Badge variant={currentStep === 'upload' ? 'default' : 'secondary'}>
          1. Upload
        </Badge>
        <div className="h-px flex-1 bg-border" />
        <Badge variant={currentStep === 'parse' ? 'default' : 'secondary'}>
          2. Parse
        </Badge>
        <div className="h-px flex-1 bg-border" />
        <Badge variant={currentStep === 'review' ? 'default' : 'secondary'}>
          3. Review
        </Badge>
        <div className="h-px flex-1 bg-border" />
        <Badge variant={currentStep === 'import' ? 'default' : 'secondary'}>
          4. Import
        </Badge>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Step 1: Upload */}
      {currentStep === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle>Step 1: Upload Your Statement</CardTitle>
            <CardDescription>
              Upload a CSV, Excel, or PDF file containing your bank transactions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FileUpload
              onUploadSuccess={handleUploadSuccess}
              onUploadError={setError}
            />
          </CardContent>
        </Card>
      )}

      {/* Step 2: Parse */}
      {currentStep === 'parse' && (
        <Card>
          <CardHeader>
            <CardTitle>Step 2: Parse Statement</CardTitle>
            <CardDescription>
              Extract transactions from your uploaded file
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div>
                <p className="font-medium">{uploadedFilename}</p>
                <p className="text-sm text-muted-foreground">Ready to parse</p>
              </div>
              <Button onClick={handleParseStatement} disabled={isParsing}>
                {isParsing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Parsing...
                  </>
                ) : (
                  'Parse Statement'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Review */}
      {currentStep === 'review' && (
        <Card>
          <CardHeader>
            <CardTitle>Step 3: Review & Categorize</CardTitle>
            <CardDescription>
              Found {transactions.length} transactions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {categorizedTransactions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">
                  Click the button below to automatically categorize all transactions using AI
                </p>
                <Button onClick={handleCategorize} disabled={isCategorizing}>
                  {isCategorizing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Categorizing...
                    </>
                  ) : (
                    'Categorize with AI'
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
                    Remove Incomes ({incomeCount})
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRemoveSubscriptions}
                    disabled={subscriptionMatchCount === 0}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove Subscriptions ({subscriptionMatchCount})
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRemoveInstallments}
                    disabled={installmentMatchCount === 0}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove Installments ({installmentMatchCount})
                  </Button>
                </div>

                <Tabs defaultValue="all">
                  <TabsList className="grid w-full grid-cols-5">
                    <TabsTrigger value="all">
                      All ({categorizedTransactions.length})
                    </TabsTrigger>
                    <TabsTrigger value="expenses">
                      Expenses ({categorizedTransactions.filter((t) => t.amount < 0).length})
                    </TabsTrigger>
                    <TabsTrigger value="income">
                      Income ({categorizedTransactions.filter((t) => t.amount > 0).length})
                    </TabsTrigger>
                    <TabsTrigger value="subscriptions">
                      Subscriptions ({subscriptionMatchCount})
                    </TabsTrigger>
                    <TabsTrigger value="installments">
                      Installments ({installmentMatchCount})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="all" className="mt-4">
                    <div className="border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
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
                                    {CATEGORY_OPTIONS.map((option) => (
                                      <SelectItem key={option.value} value={option.value}>
                                        {option.label}
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
                            <TableHead>Date</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
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
                                        {CATEGORY_OPTIONS.map((option) => (
                                          <SelectItem key={option.value} value={option.value}>
                                            {option.label}
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
                            <TableHead>Date</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
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
                            <TableHead>Date</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
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
                                        {CATEGORY_OPTIONS.map((option) => (
                                          <SelectItem key={option.value} value={option.value}>
                                            {option.label}
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
                            <TableHead>Date</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
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
                                        {CATEGORY_OPTIONS.map((option) => (
                                          <SelectItem key={option.value} value={option.value}>
                                            {option.label}
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
                    Note: Only expenses will be imported. Income transactions will be skipped.
                  </p>
                  <Button onClick={handleImport} disabled={importing}>
                    {importing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        Import Expenses
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 4: Import Results */}
      {currentStep === 'import' && importResults && (
        <Card>
          <CardHeader>
            <CardTitle>Import Complete</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
              <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertDescription className="text-green-600 dark:text-green-400">
                Successfully imported {importResults.success} expenses
              </AlertDescription>
            </Alert>

            {importResults.failed > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {importResults.failed} transactions failed to import
                  {importResults.errors.length > 0 && (
                    <ul className="mt-2 list-disc list-inside">
                      {importResults.errors.slice(0, 5).map((error, index) => (
                        <li key={index} className="text-xs">
                          {error}
                        </li>
                      ))}
                    </ul>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <Button onClick={() => router.push('/dashboard/expenses')}>
                View Expenses
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setCurrentStep('upload');
                  setUploadedFileId(null);
                  setTransactions([]);
                  setCategorizedTransactions([]);
                  setImportResults(null);
                }}
              >
                Import Another Statement
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
