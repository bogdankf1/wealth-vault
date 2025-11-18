'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { CurrencyInput } from '@/components/currency/currency-input';
import { useCreateBudgetMutation, useUpdateBudgetMutation, Budget } from '@/lib/api/budgetsApi';
import { toast } from 'sonner';
import { EXPENSE_CATEGORIES } from '@/lib/constants/expense-categories';

const budgetSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  category: z.string().min(1, 'Category is required').max(50),
  description: z.string().max(500).optional(),
  amount: z.number()
    .positive('Amount must be positive')
    .refine(
      (val) => {
        // Check if number has more than 2 decimal places
        // Use toFixed to round to 2 decimals and compare
        const rounded = Math.round(val * 100) / 100;
        return Math.abs(val - rounded) < 0.00001; // Allow for floating point precision
      },
      { message: 'Amount can have at most 2 decimal places' }
    ),
  currency: z.string().length(3),
  period: z.enum(['monthly', 'quarterly', 'yearly']),
  start_date: z.string(),
  end_date: z.string().optional(),
  is_active: z.boolean(),
  rollover_unused: z.boolean(),
  alert_threshold: z.number().min(0).max(100),
});

type BudgetFormValues = z.infer<typeof budgetSchema>;

interface BudgetFormProps {
  open: boolean;
  onClose: () => void;
  budget?: Budget;
}

export function BudgetForm({ open, onClose, budget }: BudgetFormProps) {
  // Translation hooks
  const tForm = useTranslations('budgets.form');
  const tActions = useTranslations('budgets.actions');
  const tPeriod = useTranslations('budgets.period');

  // Local state to track the string value of amount while user is typing
  const [amountInput, setAmountInput] = React.useState<string>('');

  const [createBudget, { isLoading: isCreating }] = useCreateBudgetMutation();
  const [updateBudget, { isLoading: isUpdating }] = useUpdateBudgetMutation();

  const form = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetSchema),
    defaultValues: budget
      ? {
          name: budget.name,
          category: budget.category,
          description: budget.description || '',
          amount: Number(budget.amount),
          currency: budget.currency,
          period: budget.period,
          start_date: budget.start_date.split('T')[0],
          end_date: budget.end_date?.split('T')[0] || '',
          is_active: budget.is_active,
          rollover_unused: budget.rollover_unused,
          alert_threshold: budget.alert_threshold,
        }
      : {
          name: '',
          category: '',
          description: '',
          amount: 0,
          currency: 'USD',
          period: 'monthly',
          start_date: new Date().toISOString().split('T')[0],
          end_date: '',
          is_active: true,
          rollover_unused: false,
          alert_threshold: 80,
        },
  });

  // Set amountInput when budget changes
  React.useEffect(() => {
    if (budget) {
      const amountNum = typeof budget.amount === 'string'
        ? parseFloat(budget.amount)
        : budget.amount;
      setAmountInput(String(amountNum));
    } else {
      setAmountInput('');
    }
  }, [budget]);

  const onSubmit = async (data: BudgetFormValues) => {
    try {
      // Format dates
      const payload = {
        ...data,
        start_date: new Date(data.start_date).toISOString(),
        end_date: data.end_date ? new Date(data.end_date).toISOString() : undefined,
      };

      if (budget) {
        await updateBudget({ id: budget.id, data: payload }).unwrap();
        toast.success(tForm('updateSuccess'));
      } else {
        await createBudget(payload).unwrap();
        toast.success(tForm('createSuccess'));
      }

      form.reset();
      setAmountInput('');
      onClose();
    } catch {
      toast.error(budget ? tForm('updateError') : tForm('createError'));
    }
  };

  const handleClose = () => {
    setAmountInput('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{budget ? tForm('editTitle') : tForm('addTitle')}</DialogTitle>
          <DialogDescription>
            {budget
              ? tForm('editDescription')
              : tForm('addDescription')}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{tForm('name')}</FormLabel>
                  <FormControl>
                    <Input placeholder={tForm('namePlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{tForm('category')}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={tForm('categoryPlaceholder')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {EXPENSE_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{tForm('description')}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={tForm('descriptionPlaceholder')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <CurrencyInput
              key={`currency-${budget?.id || 'new'}-${form.watch('currency')}`}
              label={tForm('amount')}
              amount={amountInput}
              currency={form.watch('currency')}
              onAmountChange={(value) => {
                // Update the local string state to allow typing decimal points
                setAmountInput(value);

                // Update the form state with the numeric value
                if (value === '') {
                  form.setValue('amount', 0, { shouldValidate: true });
                } else {
                  const numValue = parseFloat(value);
                  if (!isNaN(numValue)) {
                    form.setValue('amount', numValue, { shouldValidate: true });
                  }
                }
              }}
              onCurrencyChange={(value) => form.setValue('currency', value)}
              required
              error={form.formState.errors.amount?.message}
            />

            <FormField
              control={form.control}
              name="period"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{tForm('period')}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="monthly">{tPeriod('monthly')}</SelectItem>
                      <SelectItem value="quarterly">{tPeriod('quarterly')}</SelectItem>
                      <SelectItem value="yearly">{tPeriod('yearly')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{tForm('startDate')}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormDescription className="invisible">
                      Placeholder text
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{tForm('endDate')}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormDescription>
                      {tForm('endDateDescription')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="alert_threshold"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{tForm('alertThreshold')}: {field.value}%</FormLabel>
                  <FormControl>
                    <Slider
                      min={0}
                      max={100}
                      step={5}
                      value={[field.value]}
                      onValueChange={(vals) => field.onChange(vals[0])}
                    />
                  </FormControl>
                  <FormDescription>
                    {tForm('alertThresholdDescription')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">{tForm('isActive')}</FormLabel>
                    <FormDescription>
                      {tForm('isActiveDescription')}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="rollover_unused"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">{tForm('rollover')}</FormLabel>
                    <FormDescription>
                      {tForm('rolloverDescription')}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                {tActions('cancel')}
              </Button>
              <Button type="submit" disabled={isCreating || isUpdating}>
                {isCreating || isUpdating
                  ? tForm('saving')
                  : budget
                  ? tForm('update')
                  : tForm('create')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
