'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun, Monitor, Palette, Type, CheckCircle2, DollarSign, LayoutGrid, List, Grid3x3, Rows3, Languages } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useGetMyPreferencesQuery, useUpdateMyPreferencesMutation } from '@/lib/api/preferencesApi';
import { CurrencySelect } from '@/components/currency';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { localeNames, type Locale } from '@/i18n';
import { useTranslations } from 'next-intl';

export function AppearanceSettings() {
  const t = useTranslations('settings.appearance');
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const { locale, setLocale } = useLanguage();

  const { data: preferences, isLoading } = useGetMyPreferencesQuery();
  const [updatePreferences] = useUpdateMyPreferencesMutation();

  // Local state
  const [accentColor, setAccentColor] = useState('blue');
  const [fontSize, setFontSize] = useState('medium');
  const [currency, setCurrency] = useState('USD');
  const [defaultContentView, setDefaultContentView] = useState<'card' | 'list'>('card');
  const [defaultStatsView, setDefaultStatsView] = useState<'cards' | 'compact'>('cards');

  // Define options inside component for translation
  const THEME_OPTIONS = [
    { value: 'light', label: t('theme.options.light.label'), icon: Sun, description: t('theme.options.light.description') },
    { value: 'dark', label: t('theme.options.dark.label'), icon: Moon, description: t('theme.options.dark.description') },
    { value: 'system', label: t('theme.options.system.label'), icon: Monitor, description: t('theme.options.system.description') },
  ];

  const ACCENT_COLORS = [
    { value: 'blue', label: t('accentColor.colors.blue'), color: 'bg-blue-600' },
    { value: 'purple', label: t('accentColor.colors.purple'), color: 'bg-purple-600' },
    { value: 'green', label: t('accentColor.colors.green'), color: 'bg-green-600' },
    { value: 'orange', label: t('accentColor.colors.orange'), color: 'bg-orange-600' },
    { value: 'red', label: t('accentColor.colors.red'), color: 'bg-red-600' },
    { value: 'pink', label: t('accentColor.colors.pink'), color: 'bg-pink-600' },
    { value: 'indigo', label: t('accentColor.colors.indigo'), color: 'bg-indigo-600' },
    { value: 'teal', label: t('accentColor.colors.teal'), color: 'bg-teal-600' },
  ];

  const FONT_SIZES = [
    { value: 'small', label: t('fontSize.options.small.label'), description: t('fontSize.options.small.description') },
    { value: 'medium', label: t('fontSize.options.medium.label'), description: t('fontSize.options.medium.description') },
    { value: 'large', label: t('fontSize.options.large.label'), description: t('fontSize.options.large.description') },
  ];

  // Sync local state with fetched preferences
  useEffect(() => {
    if (preferences) {
      setAccentColor(preferences.accent_color);
      setFontSize(preferences.font_size);
      setCurrency(preferences.currency || 'USD');
      // Calendar is not a default preference, default to card if set
      setDefaultContentView(preferences.default_content_view === 'calendar' ? 'card' : preferences.default_content_view);
      setDefaultStatsView(preferences.default_stats_view);
      // Sync theme with next-themes
      if (preferences.theme !== theme) {
        setTheme(preferences.theme);
      }
    }
  }, [preferences, theme, setTheme]);

  const handleThemeChange = async (newTheme: string) => {
    setTheme(newTheme);
    try {
      await updatePreferences({ theme: newTheme as 'light' | 'dark' | 'system' }).unwrap();
      toast({
        title: t('toasts.themeUpdated.title'),
        description: `${t('toasts.themeUpdated.description')} ${newTheme}`,
      });
    } catch {
      toast({
        title: t('toasts.error.title'),
        description: t('toasts.error.themeDescription'),
        variant: 'destructive',
      });
    }
  };

  const handleLanguageChange = async (newLocale: Locale) => {
    setLocale(newLocale);
    try {
      await updatePreferences({ language: newLocale }).unwrap();
      toast({
        title: t('toasts.languageUpdated.title'),
        description: `${t('toasts.languageUpdated.description')} ${localeNames[newLocale]}`,
      });
    } catch {
      toast({
        title: t('toasts.error.title'),
        description: t('toasts.error.languageDescription'),
        variant: 'destructive',
      });
    }
  };

  const handleAccentColorChange = async (color: string) => {
    setAccentColor(color);
    try {
      await updatePreferences({
        accent_color: color as 'blue' | 'purple' | 'green' | 'orange' | 'red' | 'pink' | 'indigo' | 'teal'
      }).unwrap();
      toast({
        title: t('toasts.accentColorUpdated.title'),
        description: `${t('toasts.accentColorUpdated.description')} ${color}`,
      });
    } catch {
      toast({
        title: t('toasts.error.title'),
        description: t('toasts.error.accentColorDescription'),
        variant: 'destructive',
      });
    }
  };

  const handleFontSizeChange = async (size: string) => {
    setFontSize(size);
    try {
      await updatePreferences({ font_size: size as 'small' | 'medium' | 'large' }).unwrap();
      toast({
        title: t('toasts.fontSizeUpdated.title'),
        description: `${t('toasts.fontSizeUpdated.description')} ${size}`,
      });
    } catch {
      toast({
        title: t('toasts.error.title'),
        description: t('toasts.error.fontSizeDescription'),
        variant: 'destructive',
      });
    }
  };

  const handleCurrencyChange = async (newCurrency: string) => {
    setCurrency(newCurrency);
    try {
      await updatePreferences({
        currency: newCurrency,
        display_currency: newCurrency
      }).unwrap();
      toast({
        title: t('toasts.currencyUpdated.title'),
        description: `${t('toasts.currencyUpdated.description')} ${newCurrency}`,
      });
    } catch {
      toast({
        title: t('toasts.error.title'),
        description: t('toasts.error.currencyDescription'),
        variant: 'destructive',
      });
    }
  };

  const handleDefaultContentViewChange = async (view: 'card' | 'list') => {
    setDefaultContentView(view);
    try {
      await updatePreferences({ default_content_view: view }).unwrap();
      toast({
        title: t('toasts.contentViewUpdated.title'),
        description: `${t('toasts.contentViewUpdated.description')} ${view}`,
      });
    } catch {
      toast({
        title: t('toasts.error.title'),
        description: t('toasts.error.contentViewDescription'),
        variant: 'destructive',
      });
    }
  };

  const handleDefaultStatsViewChange = async (view: 'cards' | 'compact') => {
    setDefaultStatsView(view);
    try {
      await updatePreferences({ default_stats_view: view }).unwrap();
      toast({
        title: t('toasts.statsViewUpdated.title'),
        description: `${t('toasts.statsViewUpdated.description')} ${view}`,
      });
    } catch {
      toast({
        title: t('toasts.error.title'),
        description: t('toasts.error.statsViewDescription'),
        variant: 'destructive',
      });
    }
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
      {/* Theme Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            {t('theme.title')}
          </CardTitle>
          <CardDescription>
            {t('theme.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup value={theme} onValueChange={handleThemeChange}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {THEME_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <label
                    key={option.value}
                    htmlFor={`theme-${option.value}`}
                    className="relative cursor-pointer"
                  >
                    <div className={`
                      flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-all
                      ${theme === option.value
                        ? 'border-primary bg-primary/5'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }
                    `}>
                      <RadioGroupItem
                        value={option.value}
                        id={`theme-${option.value}`}
                        className="sr-only"
                      />
                      <Icon className={`h-8 w-8 ${theme === option.value ? 'text-primary' : 'text-muted-foreground'}`} />
                      <div className="text-center">
                        <p className="font-medium">{option.label}</p>
                        <p className="text-xs text-muted-foreground">{option.description}</p>
                      </div>
                      {theme === option.value && (
                        <CheckCircle2 className="absolute top-2 right-2 h-5 w-5 text-primary" />
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Language Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5" />
            {t('language.title')}
          </CardTitle>
          <CardDescription>
            {t('language.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={locale} onValueChange={(value) => handleLanguageChange(value as Locale)}>
            <SelectTrigger className="w-full md:w-[300px]">
              <SelectValue placeholder={t('language.selectPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(localeNames).map(([code, name]) => (
                <SelectItem key={code} value={code}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Accent Color */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            {t('accentColor.title')}
            <span className="ml-2 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300">
              {t('accentColor.comingSoon')}
            </span>
          </CardTitle>
          <CardDescription>
            {t('accentColor.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {t('accentColor.warningMessage')}
            </p>
          </div>
          <div className="grid grid-cols-4 md:grid-cols-8 gap-3 opacity-50">
            {ACCENT_COLORS.map((color) => (
              <button
                key={color.value}
                onClick={() => handleAccentColorChange(color.value)}
                disabled
                className={`
                  relative h-12 w-12 rounded-full ${color.color} transition-all cursor-not-allowed
                  ${accentColor === color.value ? 'ring-2 ring-offset-2 ring-primary scale-110' : ''}
                `}
                aria-label={color.label}
              >
                {accentColor === color.value && (
                  <CheckCircle2 className="absolute inset-0 m-auto h-6 w-6 text-white" />
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Font Size */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Type className="h-5 w-5" />
            {t('fontSize.title')}
            <span className="ml-2 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300">
              {t('fontSize.comingSoon')}
            </span>
          </CardTitle>
          <CardDescription>
            {t('fontSize.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
              <p className="text-sm text-amber-700 dark:text-amber-300">
                {t('fontSize.warningMessage')}
              </p>
            </div>
            <Select value={fontSize} onValueChange={handleFontSizeChange} disabled>
              <SelectTrigger className="w-full md:w-[300px] opacity-50 cursor-not-allowed">
                <SelectValue placeholder={t('fontSize.selectPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {FONT_SIZES.map((size) => (
                  <SelectItem key={size.value} value={size.value}>
                    <div className="flex items-center gap-2">
                      <span>{size.label}</span>
                      <span className="text-xs text-muted-foreground">- {size.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Currency Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            {t('currency.title')}
          </CardTitle>
          <CardDescription>
            {t('currency.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currency">
              {t('currency.label')}
            </Label>
            <p className="text-sm text-muted-foreground mb-2">
              {t('currency.info')}
            </p>
            <CurrencySelect
              value={currency}
              onValueChange={handleCurrencyChange}
              placeholder={t('currency.selectPlaceholder')}
              className="w-full md:w-[300px]"
            />
          </div>
        </CardContent>
      </Card>

      {/* Default View Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5" />
            {t('defaultViews.title')}
          </CardTitle>
          <CardDescription>
            {t('defaultViews.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Content View Preference */}
          <div className="space-y-4">
            <div>
              <Label className="text-base font-semibold">{t('defaultViews.contentView.title')}</Label>
              <p className="text-sm text-muted-foreground mt-1">
                {t('defaultViews.contentView.description')}
              </p>
            </div>
            <RadioGroup value={defaultContentView} onValueChange={handleDefaultContentViewChange}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label
                  htmlFor="content-card"
                  className="relative cursor-pointer"
                >
                  <div className={`
                    flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-all
                    ${defaultContentView === 'card'
                      ? 'border-primary bg-primary/5'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }
                  `}>
                    <RadioGroupItem
                      value="card"
                      id="content-card"
                      className="sr-only"
                    />
                    <LayoutGrid className={`h-8 w-8 ${defaultContentView === 'card' ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div className="text-center">
                      <p className="font-medium">{t('defaultViews.contentView.options.card.label')}</p>
                      <p className="text-xs text-muted-foreground">{t('defaultViews.contentView.options.card.description')}</p>
                    </div>
                    {defaultContentView === 'card' && (
                      <CheckCircle2 className="absolute top-2 right-2 h-5 w-5 text-primary" />
                    )}
                  </div>
                </label>
                <label
                  htmlFor="content-list"
                  className="relative cursor-pointer"
                >
                  <div className={`
                    flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-all
                    ${defaultContentView === 'list'
                      ? 'border-primary bg-primary/5'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }
                  `}>
                    <RadioGroupItem
                      value="list"
                      id="content-list"
                      className="sr-only"
                    />
                    <List className={`h-8 w-8 ${defaultContentView === 'list' ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div className="text-center">
                      <p className="font-medium">{t('defaultViews.contentView.options.list.label')}</p>
                      <p className="text-xs text-muted-foreground">{t('defaultViews.contentView.options.list.description')}</p>
                    </div>
                    {defaultContentView === 'list' && (
                      <CheckCircle2 className="absolute top-2 right-2 h-5 w-5 text-primary" />
                    )}
                  </div>
                </label>
              </div>
            </RadioGroup>
          </div>

          {/* Statistics View Preference */}
          <div className="space-y-4">
            <div>
              <Label className="text-base font-semibold">{t('defaultViews.statsView.title')}</Label>
              <p className="text-sm text-muted-foreground mt-1">
                {t('defaultViews.statsView.description')}
              </p>
            </div>
            <RadioGroup value={defaultStatsView} onValueChange={handleDefaultStatsViewChange}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label
                  htmlFor="stats-cards"
                  className="relative cursor-pointer"
                >
                  <div className={`
                    flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-all
                    ${defaultStatsView === 'cards'
                      ? 'border-primary bg-primary/5'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }
                  `}>
                    <RadioGroupItem
                      value="cards"
                      id="stats-cards"
                      className="sr-only"
                    />
                    <Grid3x3 className={`h-8 w-8 ${defaultStatsView === 'cards' ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div className="text-center">
                      <p className="font-medium">{t('defaultViews.statsView.options.cards.label')}</p>
                      <p className="text-xs text-muted-foreground">{t('defaultViews.statsView.options.cards.description')}</p>
                    </div>
                    {defaultStatsView === 'cards' && (
                      <CheckCircle2 className="absolute top-2 right-2 h-5 w-5 text-primary" />
                    )}
                  </div>
                </label>
                <label
                  htmlFor="stats-compact"
                  className="relative cursor-pointer"
                >
                  <div className={`
                    flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-all
                    ${defaultStatsView === 'compact'
                      ? 'border-primary bg-primary/5'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }
                  `}>
                    <RadioGroupItem
                      value="compact"
                      id="stats-compact"
                      className="sr-only"
                    />
                    <Rows3 className={`h-8 w-8 ${defaultStatsView === 'compact' ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div className="text-center">
                      <p className="font-medium">{t('defaultViews.statsView.options.compact.label')}</p>
                      <p className="text-xs text-muted-foreground">{t('defaultViews.statsView.options.compact.description')}</p>
                    </div>
                    {defaultStatsView === 'compact' && (
                      <CheckCircle2 className="absolute top-2 right-2 h-5 w-5 text-primary" />
                    )}
                  </div>
                </label>
              </div>
            </RadioGroup>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
