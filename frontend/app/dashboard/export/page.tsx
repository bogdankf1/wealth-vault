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
import { useTranslations } from 'next-intl';

export default function ExportPage() {
  const tPage = useTranslations('export.page');
  const tCard = useTranslations('export.card');
  const tLabels = useTranslations('export.labels');
  const tPlaceholders = useTranslations('export.placeholders');
  const tEntryTypes = useTranslations('export.entryTypes');
  const tMonths = useTranslations('export.months');
  const tFormats = useTranslations('export.formats');
  const tButtons = useTranslations('export.buttons');
  const tMessages = useTranslations('export.messages');
  const tInfo = useTranslations('export.info');

  const ENTRY_TYPES: { value: EntryType; label: string }[] = [
    { value: 'income', label: tEntryTypes('income') },
    { value: 'expenses', label: tEntryTypes('expenses') },
    { value: 'subscriptions', label: tEntryTypes('subscriptions') },
    { value: 'installments', label: tEntryTypes('installments') },
    { value: 'budgets', label: tEntryTypes('budgets') },
    { value: 'savings', label: tEntryTypes('savings') },
    { value: 'portfolio', label: tEntryTypes('portfolio') },
    { value: 'goals', label: tEntryTypes('goals') },
    { value: 'debts', label: tEntryTypes('debts') },
    { value: 'taxes', label: tEntryTypes('taxes') },
  ];

  const MONTHS = [
    { value: 1, label: tMonths('january') },
    { value: 2, label: tMonths('february') },
    { value: 3, label: tMonths('march') },
    { value: 4, label: tMonths('april') },
    { value: 5, label: tMonths('may') },
    { value: 6, label: tMonths('june') },
    { value: 7, label: tMonths('july') },
    { value: 8, label: tMonths('august') },
    { value: 9, label: tMonths('september') },
    { value: 10, label: tMonths('october') },
    { value: 11, label: tMonths('november') },
    { value: 12, label: tMonths('december') },
  ];

  const FORMATS: { value: ExportFormat; label: string }[] = [
    { value: 'csv', label: tFormats('csv') },
  ];
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

      toast.success(tMessages('successTitle', { type: entryType }), {
        description: tMessages('successDescription', { filename }),
      });
    } catch (err) {
      const error = err as FetchBaseQueryError | SerializedError;

      if ('status' in error) {
        const fetchError = error as FetchBaseQueryError;
        if (fetchError.status === 403) {
          toast.error(tMessages('errorAccessDenied'), {
            description: tMessages('errorAccessDeniedDescription'),
          });
        } else {
          const errorData = fetchError.data as { detail?: string } | undefined;
          toast.error(tMessages('errorFailed'), {
            description: errorData?.detail || tMessages('errorFailedDescription'),
          });
        }
      } else {
        toast.error(tMessages('errorFailed'), {
          description: tMessages('errorFailedDescription'),
        });
      }
    }
  };

  return (
    <div className="container mx-auto space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{tPage('title')}</h1>
        <p className="text-muted-foreground mt-2">
          {tPage('description')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5" />
            {tCard('title')}
          </CardTitle>
          <CardDescription>
            {tCard('description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Entry Type Selector */}
            <div className="space-y-2">
              <Label htmlFor="entry-type">{tLabels('dataType')}</Label>
              <Select
                value={entryType}
                onValueChange={(value) => setEntryType(value as EntryType)}
              >
                <SelectTrigger id="entry-type">
                  <SelectValue placeholder={tPlaceholders('selectDataType')} />
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
              <Label htmlFor="format">{tLabels('exportFormat')}</Label>
              <Select
                value={format}
                onValueChange={(value) => setFormat(value as ExportFormat)}
              >
                <SelectTrigger id="format">
                  <SelectValue placeholder={tPlaceholders('selectFormat')} />
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
                <Label htmlFor="month">{tLabels('month')}</Label>
                <Select
                  value={month.toString()}
                  onValueChange={(value) => setMonth(parseInt(value))}
                >
                  <SelectTrigger id="month">
                    <SelectValue placeholder={tPlaceholders('selectMonth')} />
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
                <Label htmlFor="year">{tLabels('year')}</Label>
                <Select
                  value={year.toString()}
                  onValueChange={(value) => setYear(parseInt(value))}
                >
                  <SelectTrigger id="year">
                    <SelectValue placeholder={tPlaceholders('selectYear')} />
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
              {isLoading ? tButtons('exporting') : tButtons('export')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tInfo('title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• {tInfo('point1')}</p>
          <p>• {tInfo('point2')}</p>
          <p>• {tInfo('point3')}</p>
          <p>• {tInfo('point4')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
