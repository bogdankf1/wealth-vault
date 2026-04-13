'use client';

import { useEffect, useState } from 'react';
import { Shield, Eye } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { useGetMyPreferencesQuery, useUpdateMyPreferencesMutation, AnalyticsOptOut } from '@/lib/api/preferencesApi';
import { useTranslations } from 'next-intl';

export function PrivacySettings() {
  const t = useTranslations('settings.privacy');
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
        title: t('toasts.analyticsUpdated.title'),
        description: t('toasts.analyticsUpdated.description'),
      });
    } catch {
      toast({
        title: t('toasts.error.title'),
        description: t('toasts.error.analyticsDescription'),
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
        title: t('toasts.dataVisibilityUpdated.title'),
        description: `${t('toasts.dataVisibilityUpdated.description')} ${value}`,
      });
    } catch {
      toast({
        title: t('toasts.error.title'),
        description: t('toasts.error.dataVisibilityDescription'),
        variant: 'destructive',
      });
      setDataVisibility(dataVisibility);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="p-3">
              <div className="h-6 w-32 animate-pulse rounded bg-muted" />
              <div className="h-4 w-48 animate-pulse rounded bg-muted mt-2" />
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="h-32 w-full animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Analytics & Tracking */}
      <Card>
        <CardHeader className="p-3">
          <CardTitle className="flex items-center gap-2 text-sm lg:text-base">
            <Shield className="h-4 w-4 lg:h-5 lg:w-5" />
            {t('analytics.title')}
          </CardTitle>
          <CardDescription className="hidden">
            {t('analytics.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="analytics-usage" className="text-xs lg:text-sm">{t('analytics.usageAnalytics.label')}</Label>
              <p className="text-xs lg:text-sm text-muted-foreground">
                {t('analytics.usageAnalytics.description')}
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
              <Label htmlFor="analytics-errors" className="text-xs lg:text-sm">{t('analytics.errorReporting.label')}</Label>
              <p className="text-xs lg:text-sm text-muted-foreground">
                {t('analytics.errorReporting.description')}
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
              <Label htmlFor="analytics-performance" className="text-xs lg:text-sm">{t('analytics.performanceMonitoring.label')}</Label>
              <p className="text-xs lg:text-sm text-muted-foreground">
                {t('analytics.performanceMonitoring.description')}
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
        <CardHeader className="p-3">
          <CardTitle className="flex items-center gap-2 text-sm lg:text-base">
            <Eye className="h-4 w-4 lg:h-5 lg:w-5" />
            {t('dataVisibility.title')}
          </CardTitle>
          <CardDescription className="hidden">
            {t('dataVisibility.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <RadioGroup value={dataVisibility} onValueChange={(value) => handleDataVisibilityChange(value as 'private' | 'anonymous')}>
            <div className="space-y-3">
              <div className="flex items-start space-x-3 rounded-lg border p-3">
                <RadioGroupItem value="private" id="visibility-private" />
                <div className="flex-1">
                  <Label htmlFor="visibility-private" className="text-xs lg:text-sm font-medium">
                    {t('dataVisibility.private.label')}
                  </Label>
                  <p className="text-xs lg:text-sm text-muted-foreground mt-1">
                    {t('dataVisibility.private.description')}
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 rounded-lg border p-3">
                <RadioGroupItem value="anonymous" id="visibility-anonymous" />
                <div className="flex-1">
                  <Label htmlFor="visibility-anonymous" className="text-xs lg:text-sm font-medium">
                    {t('dataVisibility.anonymous.label')}
                  </Label>
                  <p className="text-xs lg:text-sm text-muted-foreground mt-1">
                    {t('dataVisibility.anonymous.description')}
                  </p>
                </div>
              </div>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* TODO: Data Export section hidden — no backend implementation exists yet.
         Re-enable when data export backend is implemented. */}
    </div>
  );
}
