'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Settings2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useGetMyPreferencesQuery, useUpdateMyPreferencesMutation } from '@/lib/api/preferencesApi';
import { CurrencySelect } from '@/components/currency';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { localeNames, type Locale } from '@/i18n';
import { useTranslations } from 'next-intl';
import { useUIVisibility } from '@/lib/hooks/use-ui-visibility';

export function AppearanceSettings() {
  const t = useTranslations('settings.appearance');
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const { locale, setLocale } = useLanguage();

  const { data: preferences, isLoading } = useGetMyPreferencesQuery();
  const [updatePreferences] = useUpdateMyPreferencesMutation();

  const { settings: uiVisibility, updateSettings: updateUIVisibility, isLoaded: uiVisibilityLoaded } = useUIVisibility();

  const [currency, setCurrency] = useState('USD');
  const [defaultContentView, setDefaultContentView] = useState<'card' | 'list'>('card');

  useEffect(() => {
    if (preferences) {
      setCurrency(preferences.currency || 'USD');
      setDefaultContentView(preferences.default_content_view === 'calendar' ? 'card' : preferences.default_content_view);
      if (preferences.theme !== theme) {
        setTheme(preferences.theme);
      }
    }
  }, [preferences, theme, setTheme]);

  const handleThemeChange = async (newTheme: string) => {
    setTheme(newTheme);
    try {
      await updatePreferences({ theme: newTheme as 'light' | 'dark' | 'system' }).unwrap();
      toast({ title: t('toasts.themeUpdated.title'), description: `${t('toasts.themeUpdated.description')} ${newTheme}` });
    } catch {
      toast({ title: t('toasts.error.title'), description: t('toasts.error.themeDescription'), variant: 'destructive' });
    }
  };

  const handleLanguageChange = async (newLocale: Locale) => {
    setLocale(newLocale);
    try {
      await updatePreferences({ language: newLocale }).unwrap();
      toast({ title: t('toasts.languageUpdated.title'), description: `${t('toasts.languageUpdated.description')} ${localeNames[newLocale]}` });
    } catch {
      toast({ title: t('toasts.error.title'), description: t('toasts.error.languageDescription'), variant: 'destructive' });
    }
  };

  const handleCurrencyChange = async (newCurrency: string) => {
    setCurrency(newCurrency);
    try {
      await updatePreferences({ currency: newCurrency, display_currency: newCurrency }).unwrap();
      toast({ title: t('toasts.currencyUpdated.title'), description: `${t('toasts.currencyUpdated.description')} ${newCurrency}` });
    } catch {
      toast({ title: t('toasts.error.title'), description: t('toasts.error.currencyDescription'), variant: 'destructive' });
    }
  };

  const handleDefaultContentViewChange = async (view: string) => {
    const v = view as 'card' | 'list';
    setDefaultContentView(v);
    try {
      await updatePreferences({ default_content_view: v }).unwrap();
      toast({ title: t('toasts.contentViewUpdated.title'), description: `${t('toasts.contentViewUpdated.description')} ${v}` });
    } catch {
      toast({ title: t('toasts.error.title'), description: t('toasts.error.contentViewDescription'), variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="h-5 w-32 animate-pulse rounded bg-muted" />
        </CardHeader>
        <CardContent>
          <div className="h-48 w-full animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm lg:text-base">
          <Settings2 className="h-4 w-4" />
          {t('preferences.title')}
        </CardTitle>
        <CardDescription className="hidden">{t('preferences.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-0 divide-y">
        {/* Theme */}
        <div className="flex items-center justify-between py-3">
          <Label className="text-sm">{t('theme.title')}</Label>
          <Select value={theme} onValueChange={handleThemeChange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">{t('theme.options.light.label')}</SelectItem>
              <SelectItem value="dark">{t('theme.options.dark.label')}</SelectItem>
              <SelectItem value="system">{t('theme.options.system.label')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Language */}
        <div className="flex items-center justify-between py-3">
          <Label className="text-sm">{t('language.title')}</Label>
          <Select value={locale} onValueChange={(value) => handleLanguageChange(value as Locale)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(localeNames).map(([code, name]) => (
                <SelectItem key={code} value={code}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Currency */}
        <div className="flex items-center justify-between py-3">
          <Label className="text-sm">{t('currency.title')}</Label>
          <CurrencySelect
            value={currency}
            onValueChange={handleCurrencyChange}
            placeholder={t('currency.selectPlaceholder')}
            className="w-[200px]"
          />
        </div>

        {/* Content View */}
        <div className="flex items-center justify-between py-3">
          <Label className="text-sm">{t('defaultViews.contentView.title')}</Label>
          <Select value={defaultContentView} onValueChange={handleDefaultContentViewChange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="card">{t('defaultViews.contentView.options.card.label')}</SelectItem>
              <SelectItem value="list">{t('defaultViews.contentView.options.list.label')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Page Descriptions — hidden since page titles are removed */}
        {/* {uiVisibilityLoaded && (
          <div className="flex items-center justify-between py-3">
            <div>
              <Label className="text-sm">{t('uiElements.showPageDescription.label')}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t('uiElements.showPageDescription.description')}</p>
            </div>
            <Switch
              checked={uiVisibility.showPageDescription}
              onCheckedChange={(checked) => updateUIVisibility({ showPageDescription: checked })}
            />
          </div>
        )} */}
      </CardContent>
    </Card>
  );
}
