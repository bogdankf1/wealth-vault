'use client';

import { useState } from 'react';
import { Download, FileDown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useDownloadExportMutation, type EntryType, type ExportFormat, type ExportRequest } from '@/lib/api/exportsApi';
import type { SerializedError } from '@reduxjs/toolkit';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';

const ENTRY_TYPES: { value: EntryType; label: string }[] = [
  { value: 'income', label: 'Income' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'subscriptions', label: 'Subscriptions' },
  { value: 'installments', label: 'Installments' },
  { value: 'budgets', label: 'Budgets' },
  { value: 'savings', label: 'Savings' },
  { value: 'portfolio', label: 'Portfolio' },
  { value: 'goals', label: 'Goals' },
  { value: 'debts', label: 'Debts' },
  { value: 'taxes', label: 'Taxes' },
];

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const FORMATS: { value: ExportFormat; label: string }[] = [
  { value: 'csv', label: 'CSV' },
];

export default function ExportPage() {
  const currentDate = new Date();
  const [entryType, setEntryType] = useState<EntryType>('expenses');
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [year, setYear] = useState<number>(currentDate.getFullYear());
  const [month, setMonth] = useState<number>(currentDate.getMonth() + 1);

  const [downloadExport, { isLoading }] = useDownloadExportMutation();

  // Entry types that support date range filtering (have date range filter on their pages)
  const DATE_FILTERABLE_TYPES: EntryType[] = ['income', 'expenses', 'subscriptions', 'installments', 'taxes'];
  const supportsDateFilter = DATE_FILTERABLE_TYPES.includes(entryType);

  // Generate year options (current year and past 5 years)
  const years = Array.from({ length: 6 }, (_, i) => currentDate.getFullYear() - i);

  const handleExport = async () => {
    try {
      // Only include dates for modules that support date filtering
      const requestData: ExportRequest = {
        entry_type: entryType,
        format,
        start_date: null,
        end_date: null,
      };

      if (supportsDateFilter) {
        // Convert year/month to start_date and end_date
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59); // Last day of month
        requestData.start_date = startDate.toISOString();
        requestData.end_date = endDate.toISOString();
      }

      const blob = await downloadExport(requestData).unwrap();

      // Generate filename
      let filename: string;
      if (supportsDateFilter) {
        const monthName = MONTHS.find(m => m.value === month)?.label || 'Unknown';
        filename = `${entryType}_${monthName}_${year}.${format}`;
      } else {
        filename = `${entryType}_all.${format}`;
      }

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success(`Successfully exported ${entryType} data`, {
        description: `File: ${filename}`,
      });
    } catch (err) {
      console.error('Export error:', err);
      const error = err as FetchBaseQueryError | SerializedError;

      if ('status' in error) {
        const fetchError = error as FetchBaseQueryError;
        if (fetchError.status === 403) {
          toast.error('Access denied', {
            description: 'This feature requires a Wealth tier subscription',
          });
        } else {
          const errorData = fetchError.data as { detail?: string } | undefined;
          toast.error('Export failed', {
            description: errorData?.detail || 'Failed to export data. Please try again.',
          });
        }
      } else {
        toast.error('Export failed', {
          description: 'Failed to export data. Please try again.',
        });
      }
    }
  };

  return (
    <div className="container mx-auto space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Export Data</h1>
        <p className="text-muted-foreground mt-2">
          Export your financial data in various formats
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5" />
            Export Configuration
          </CardTitle>
          <CardDescription>
            Select the data type, period, and format you want to export
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Entry Type Selector */}
            <div className="space-y-2">
              <Label htmlFor="entry-type">Data Type</Label>
              <Select
                value={entryType}
                onValueChange={(value) => setEntryType(value as EntryType)}
              >
                <SelectTrigger id="entry-type">
                  <SelectValue placeholder="Select data type" />
                </SelectTrigger>
                <SelectContent>
                  {ENTRY_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Format Selector */}
            <div className="space-y-2">
              <Label htmlFor="format">Export Format</Label>
              <Select
                value={format}
                onValueChange={(value) => setFormat(value as ExportFormat)}
              >
                <SelectTrigger id="format">
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent>
                  {FORMATS.map((fmt) => (
                    <SelectItem key={fmt.value} value={fmt.value}>
                      {fmt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Month Selector - Only for date-filterable modules */}
            {supportsDateFilter && (
              <div className="space-y-2">
                <Label htmlFor="month">Month</Label>
                <Select
                  value={month.toString()}
                  onValueChange={(value) => setMonth(parseInt(value))}
                >
                  <SelectTrigger id="month">
                    <SelectValue placeholder="Select month" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m) => (
                      <SelectItem key={m.value} value={m.value.toString()}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Year Selector - Only for date-filterable modules */}
            {supportsDateFilter && (
              <div className="space-y-2">
                <Label htmlFor="year">Year</Label>
                <Select
                  value={year.toString()}
                  onValueChange={(value) => setYear(parseInt(value))}
                >
                  <SelectTrigger id="year">
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={y.toString()}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Export Button */}
          <div className="flex justify-end pt-4">
            <Button
              onClick={handleExport}
              disabled={isLoading}
              size="lg"
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              {isLoading ? 'Exporting...' : 'Export Data'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">About Data Export</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• Exports include all records for the selected month and year</p>
          <p>• CSV files can be opened in Excel, Google Sheets, or any spreadsheet application</p>
          <p>• This feature is available exclusively for Wealth tier subscribers</p>
          <p>• Additional export formats may be added in future updates</p>
        </CardContent>
      </Card>
    </div>
  );
}
