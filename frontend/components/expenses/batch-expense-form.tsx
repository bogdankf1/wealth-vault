/**
 * Batch Expense Form Component
 * Form for creating multiple expenses at once
 */
'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Plus, X, AlertCircle } from 'lucide-react';
import {
  useBatchCreateExpensesMutation,
  ExpenseCreate,
  ExpenseFrequency,
} from '@/lib/api/expensesApi';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EXPENSE_CATEGORY_KEYS } from '@/lib/constants/expense-categories';
import { CurrencyInput } from '@/components/currency';

interface BatchExpenseFormProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ExpenseRow {
  id: string;
  name: string;
  description: string;
  category: string;
  amount: string;
  currency: string;
  frequency: ExpenseFrequency;
  date: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  errors: {
    name?: string;
    amount?: string;
  };
}

export function BatchExpenseForm({ isOpen, onClose }: BatchExpenseFormProps) {
  const tForm = useTranslations('expenses.form');
  const tBatch = useTranslations('expenses.batch');
  const tFrequency = useTranslations('expenses.frequency');
  const tCategories = useTranslations('expenses.categories');
  const tActions = useTranslations('expenses.actions');

  const [batchCreateExpenses, { isLoading }] = useBatchCreateExpensesMutation();

  const [rows, setRows] = useState<ExpenseRow[]>([
    createEmptyRow(),
  ]);

  function createEmptyRow(): ExpenseRow {
    return {
      id: Math.random().toString(36).substr(2, 9),
      name: '',
      description: '',
      category: '',
      amount: '',
      currency: 'USD',
      frequency: 'one_time',
      date: new Date().toISOString().split('T')[0],
      start_date: '',
      end_date: '',
      is_active: true,
      errors: {},
    };
  }

  const addRow = () => {
    setRows([...rows, createEmptyRow()]);
  };

  const removeRow = (id: string) => {
    if (rows.length > 1) {
      setRows(rows.filter(row => row.id !== id));
    }
  };

  const updateRow = (id: string, field: keyof ExpenseRow, value: string | boolean | ExpenseFrequency) => {
    setRows(rows.map(row => {
      if (row.id === id) {
        const updatedRow = { ...row, [field]: value };
        // Clear errors for this field
        if (updatedRow.errors[field as keyof typeof row.errors]) {
          updatedRow.errors = { ...updatedRow.errors };
          delete updatedRow.errors[field as keyof typeof row.errors];
        }
        return updatedRow;
      }
      return row;
    }));
  };

  const validateRows = (): boolean => {
    let isValid = true;
    const updatedRows = rows.map(row => {
      const errors: ExpenseRow['errors'] = {};

      if (!row.name.trim()) {
        errors.name = tForm('nameRequired');
        isValid = false;
      }

      const amount = parseFloat(row.amount);
      if (!row.amount || isNaN(amount) || amount <= 0) {
        errors.amount = tForm('amountPositive');
        isValid = false;
      }

      return { ...row, errors };
    });

    setRows(updatedRows);
    return isValid;
  };

  const handleSubmit = async () => {
    if (!validateRows()) {
      toast.error(tBatch('validationError'));
      return;
    }

    const expenses: ExpenseCreate[] = rows.map(row => {
      const isOneTime = row.frequency === 'one_time';
      const expense: ExpenseCreate = {
        name: row.name,
        description: row.description || undefined,
        category: row.category || undefined,
        amount: parseFloat(row.amount),
        currency: row.currency,
        frequency: row.frequency,
        is_active: row.is_active,
      };

      if (isOneTime) {
        expense.date = row.date ? `${row.date}T00:00:00` : undefined;
      } else {
        expense.start_date = row.start_date ? `${row.start_date}T00:00:00` : undefined;
        expense.end_date = row.end_date ? `${row.end_date}T00:00:00` : undefined;
      }

      return expense;
    });

    try {
      const result = await batchCreateExpenses({ expenses }).unwrap();

      if (result.failed_count === 0) {
        toast.success(tBatch('successDescription', { count: result.created_count }));
        handleClose();
      } else {
        toast.warning(
          tBatch('partialSuccessDescription', {
            success: result.created_count,
            failed: result.failed_count,
          })
        );

        // Remove successfully created rows and show errors for failed ones
        const failedIndices = new Set(result.errors.map(e => e.index));
        setRows(rows.filter((_, index) => failedIndices.has(index)));
      }
    } catch (error) {
      toast.error(tBatch('errorDescription'));
    }
  };

  const handleClose = () => {
    setRows([createEmptyRow()]);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-[96vw] sm:max-w-[96vw] w-full max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>{tBatch('title')}</DialogTitle>
          <DialogDescription>{tBatch('description')}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 px-6 overflow-y-auto">
          <div className="space-y-4 pb-4">
            {/* Mobile: Card layout */}
            <div className="md:hidden space-y-4">
              {rows.map((row, index) => (
                <div
                  key={row.id}
                  className="border rounded-lg p-4 space-y-3 bg-white dark:bg-gray-800"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-500">
                      {tBatch('rowError', { index: index + 1 })}
                    </span>
                    {rows.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRow(row.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>{tForm('name')} *</Label>
                    <Input
                      value={row.name}
                      onChange={(e) => updateRow(row.id, 'name', e.target.value)}
                      placeholder={tForm('namePlaceholder')}
                    />
                    {row.errors.name && (
                      <p className="text-xs text-destructive">{row.errors.name}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>{tForm('description')}</Label>
                    <Input
                      value={row.description}
                      onChange={(e) => updateRow(row.id, 'description', e.target.value)}
                      placeholder={tForm('descriptionPlaceholder')}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>{tForm('category')}</Label>
                    <Select
                      value={row.category}
                      onValueChange={(value) => updateRow(row.id, 'category', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={tForm('categoryPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {EXPENSE_CATEGORY_KEYS.map((key) => (
                          <SelectItem key={key} value={key}>
                            {tCategories(key)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <CurrencyInput
                    label={tForm('amount')}
                    amount={row.amount}
                    currency={row.currency}
                    onAmountChange={(value) => updateRow(row.id, 'amount', value)}
                    onCurrencyChange={(value) => updateRow(row.id, 'currency', value)}
                    required
                    error={row.errors.amount}
                  />

                  <div className="space-y-2">
                    <Label>{tForm('frequency')}</Label>
                    <Select
                      value={row.frequency}
                      onValueChange={(value) =>
                        updateRow(row.id, 'frequency', value as ExpenseFrequency)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(['one_time', 'daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'annually'] as const).map((freq) => (
                          <SelectItem key={freq} value={freq}>
                            {tFrequency(freq)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {row.frequency === 'one_time' ? (
                    <div className="space-y-2">
                      <Label>{tForm('date')}</Label>
                      <Input
                        type="date"
                        value={row.date}
                        onChange={(e) => updateRow(row.id, 'date', e.target.value)}
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-2">
                        <Label>{tForm('startDate')}</Label>
                        <Input
                          type="date"
                          value={row.start_date}
                          onChange={(e) => updateRow(row.id, 'start_date', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{tForm('endDate')}</Label>
                        <Input
                          type="date"
                          value={row.end_date}
                          onChange={(e) => updateRow(row.id, 'end_date', e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop: Table layout */}
            <div className="hidden md:block overflow-x-auto border rounded-lg">
              <table className="w-full border-collapse min-w-[1200px]">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 text-sm font-medium min-w-[150px]">
                      {tForm('name')} *
                    </th>
                    <th className="text-left p-2 text-sm font-medium min-w-[120px]">
                      {tForm('description')}
                    </th>
                    <th className="text-left p-2 text-sm font-medium min-w-[120px]">
                      {tForm('category')}
                    </th>
                    <th className="text-left p-2 text-sm font-medium min-w-[200px]">
                      {tForm('amount')} *
                    </th>
                    <th className="text-left p-2 text-sm font-medium min-w-[120px]">
                      {tForm('frequency')}
                    </th>
                    <th className="text-left p-2 text-sm font-medium min-w-[120px]">
                      {tForm('date')}
                    </th>
                    <th className="text-left p-2 text-sm font-medium w-[50px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b">
                      <td className="p-2">
                        <Input
                          value={row.name}
                          onChange={(e) => updateRow(row.id, 'name', e.target.value)}
                          placeholder={tForm('namePlaceholder')}
                          className={row.errors.name ? 'border-destructive' : ''}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          value={row.description}
                          onChange={(e) => updateRow(row.id, 'description', e.target.value)}
                          placeholder={tForm('descriptionPlaceholder')}
                        />
                      </td>
                      <td className="p-2">
                        <Select
                          value={row.category}
                          onValueChange={(value) => updateRow(row.id, 'category', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={tForm('categoryPlaceholder')} />
                          </SelectTrigger>
                          <SelectContent>
                            {EXPENSE_CATEGORY_KEYS.map((key) => (
                              <SelectItem key={key} value={key}>
                                {tCategories(key)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <CurrencyInput
                          amount={row.amount}
                          currency={row.currency}
                          onAmountChange={(value) => updateRow(row.id, 'amount', value)}
                          onCurrencyChange={(value) => updateRow(row.id, 'currency', value)}
                          error={row.errors.amount}
                        />
                      </td>
                      <td className="p-2">
                        <Select
                          value={row.frequency}
                          onValueChange={(value) =>
                            updateRow(row.id, 'frequency', value as ExpenseFrequency)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(['one_time', 'daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'annually'] as const).map((freq) => (
                              <SelectItem key={freq} value={freq}>
                                {tFrequency(freq)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        {row.frequency === 'one_time' ? (
                          <Input
                            type="date"
                            value={row.date}
                            onChange={(e) => updateRow(row.id, 'date', e.target.value)}
                          />
                        ) : (
                          <div className="flex gap-1">
                            <Input
                              type="date"
                              value={row.start_date}
                              onChange={(e) => updateRow(row.id, 'start_date', e.target.value)}
                              placeholder="Start"
                            />
                          </div>
                        )}
                      </td>
                      <td className="p-2">
                        {rows.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeRow(row.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={addRow}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              {tBatch('addRow')}
            </Button>
          </div>
        </div>

        <DialogFooter className="px-6 pb-6 pt-4 border-t">
          <Button type="button" variant="outline" onClick={handleClose}>
            {tActions('cancel')}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? tBatch('saving') : tActions('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
