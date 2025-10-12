'use client';

import { useEffect, useState } from 'react';
import { Shield, Eye, Download } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { useGetMyPreferencesQuery, useUpdateMyPreferencesMutation, AnalyticsOptOut } from '@/lib/api/preferencesApi';

export function PrivacySettings() {
  const { toast } = useToast();
  const { data: preferences, isLoading } = useGetMyPreferencesQuery();
  const [updatePreferences] = useUpdateMyPreferencesMutation();

  // Local state
  const [analyticsOptOut, setAnalyticsOptOut] = useState<AnalyticsOptOut>({
    usage_analytics: false,
    error_reporting: false,
    performance_monitoring: false,
  });
  const [dataVisibility, setDataVisibility] = useState<'private' | 'anonymous'>('private');

  // Sync local state with fetched preferences
  useEffect(() => {
    if (preferences) {
      setAnalyticsOptOut(preferences.analytics_opt_out);
      setDataVisibility(preferences.data_visibility);
    }
  }, [preferences]);

  const handleAnalyticsOptOutChange = async (key: keyof AnalyticsOptOut, value: boolean) => {
    const updated = { ...analyticsOptOut, [key]: value };
    setAnalyticsOptOut(updated);

    try {
      await updatePreferences({ analytics_opt_out: updated }).unwrap();
      toast({
        title: 'Analytics Preferences Updated',
        description: 'Your privacy preferences have been saved.',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to update privacy preferences',
        variant: 'destructive',
      });
      setAnalyticsOptOut(analyticsOptOut);
    }
  };

  const handleDataVisibilityChange = async (value: 'private' | 'anonymous') => {
    setDataVisibility(value);

    try {
      await updatePreferences({ data_visibility: value }).unwrap();
      toast({
        title: 'Data Visibility Updated',
        description: `Your data visibility is now set to ${value}.`,
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to update data visibility',
        variant: 'destructive',
      });
      setDataVisibility(dataVisibility);
    }
  };

  const handleExportData = () => {
    toast({
      title: 'Data Export Requested',
      description: 'Your data export will be ready shortly. We\'ll send you an email with the download link.',
    });
    // TODO: Implement actual data export functionality
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <div className="h-6 w-32 animate-pulse rounded bg-muted" />
              <div className="h-4 w-48 animate-pulse rounded bg-muted mt-2" />
            </CardHeader>
            <CardContent>
              <div className="h-32 w-full animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Analytics & Tracking */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Analytics & Tracking
          </CardTitle>
          <CardDescription>
            Control what data we collect to improve our service
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="analytics-usage">Usage Analytics</Label>
              <p className="text-sm text-muted-foreground">
                Help us improve by sharing anonymous usage data
              </p>
            </div>
            <Switch
              id="analytics-usage"
              checked={!analyticsOptOut.usage_analytics}
              onCheckedChange={(checked) => handleAnalyticsOptOutChange('usage_analytics', !checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="analytics-errors">Error Reporting</Label>
              <p className="text-sm text-muted-foreground">
                Automatically send error reports to help us fix bugs
              </p>
            </div>
            <Switch
              id="analytics-errors"
              checked={!analyticsOptOut.error_reporting}
              onCheckedChange={(checked) => handleAnalyticsOptOutChange('error_reporting', !checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="analytics-performance">Performance Monitoring</Label>
              <p className="text-sm text-muted-foreground">
                Help us optimize performance by sharing performance metrics
              </p>
            </div>
            <Switch
              id="analytics-performance"
              checked={!analyticsOptOut.performance_monitoring}
              onCheckedChange={(checked) => handleAnalyticsOptOutChange('performance_monitoring', !checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Data Visibility */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Data Visibility
          </CardTitle>
          <CardDescription>
            Control how your data is used within the platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup value={dataVisibility} onValueChange={(value) => handleDataVisibilityChange(value as 'private' | 'anonymous')}>
            <div className="space-y-4">
              <div className="flex items-start space-x-3 rounded-lg border p-4">
                <RadioGroupItem value="private" id="visibility-private" />
                <div className="flex-1">
                  <Label htmlFor="visibility-private" className="font-medium">
                    Private
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Your data is completely private and never shared or used in aggregate statistics
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 rounded-lg border p-4">
                <RadioGroupItem value="anonymous" id="visibility-anonymous" />
                <div className="flex-1">
                  <Label htmlFor="visibility-anonymous" className="font-medium">
                    Anonymous
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Your data may be used in anonymous aggregate statistics to improve our service
                  </p>
                </div>
              </div>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Data Export */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Your Data
            <span className="ml-2 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300">
              Coming Soon
            </span>
          </CardTitle>
          <CardDescription>
            Download all your data in a portable format (GDPR compliant)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Data export functionality is currently in development. Once available, you'll be able to download all your financial data.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            You will be able to request a copy of all your personal data. We'll prepare a downloadable file containing
            all your information including income sources, expenses, goals, and account details.
          </p>
          <Button onClick={handleExportData} variant="outline" disabled className="cursor-not-allowed opacity-50">
            <Download className="h-4 w-4 mr-2" />
            Request Data Export
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
