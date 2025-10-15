'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun, Monitor, Palette, Type, CheckCircle2, DollarSign } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useGetMyPreferencesQuery, useUpdateMyPreferencesMutation } from '@/lib/api/preferencesApi';
import { CurrencySelect } from '@/components/currency';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun, description: 'Light theme' },
  { value: 'dark', label: 'Dark', icon: Moon, description: 'Dark theme' },
  { value: 'system', label: 'System', icon: Monitor, description: 'Follow system preference' },
];

const ACCENT_COLORS = [
  { value: 'blue', label: 'Blue', color: 'bg-blue-600' },
  { value: 'purple', label: 'Purple', color: 'bg-purple-600' },
  { value: 'green', label: 'Green', color: 'bg-green-600' },
  { value: 'orange', label: 'Orange', color: 'bg-orange-600' },
  { value: 'red', label: 'Red', color: 'bg-red-600' },
  { value: 'pink', label: 'Pink', color: 'bg-pink-600' },
  { value: 'indigo', label: 'Indigo', color: 'bg-indigo-600' },
  { value: 'teal', label: 'Teal', color: 'bg-teal-600' },
];

const FONT_SIZES = [
  { value: 'small', label: 'Small', description: '14px base' },
  { value: 'medium', label: 'Medium', description: '16px base (default)' },
  { value: 'large', label: 'Large', description: '18px base' },
];

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  const { data: preferences, isLoading } = useGetMyPreferencesQuery();
  const [updatePreferences] = useUpdateMyPreferencesMutation();

  // Local state
  const [accentColor, setAccentColor] = useState('blue');
  const [fontSize, setFontSize] = useState('medium');
  const [currency, setCurrency] = useState('USD');
  const [displayCurrency, setDisplayCurrency] = useState('USD');

  // Sync local state with fetched preferences
  useEffect(() => {
    if (preferences) {
      setAccentColor(preferences.accent_color);
      setFontSize(preferences.font_size);
      setCurrency(preferences.currency || 'USD');
      setDisplayCurrency(preferences.display_currency || preferences.currency || 'USD');
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
        title: 'Theme Updated',
        description: `Theme changed to ${newTheme}`,
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to save theme preference',
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
        title: 'Accent Color Updated',
        description: `Accent color changed to ${color}`,
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to save accent color preference',
        variant: 'destructive',
      });
    }
  };

  const handleFontSizeChange = async (size: string) => {
    setFontSize(size);
    try {
      await updatePreferences({ font_size: size as 'small' | 'medium' | 'large' }).unwrap();
      toast({
        title: 'Font Size Updated',
        description: `Font size changed to ${size}`,
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to save font size preference',
        variant: 'destructive',
      });
    }
  };

  const handleCurrencyChange = async (newCurrency: string) => {
    setCurrency(newCurrency);
    try {
      await updatePreferences({ currency: newCurrency }).unwrap();
      toast({
        title: 'Currency Updated',
        description: `Preferred currency changed to ${newCurrency}`,
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to save currency preference',
        variant: 'destructive',
      });
    }
  };

  const handleDisplayCurrencyChange = async (newDisplayCurrency: string) => {
    setDisplayCurrency(newDisplayCurrency);
    try {
      await updatePreferences({ display_currency: newDisplayCurrency }).unwrap();
      toast({
        title: 'Display Currency Updated',
        description: `Display currency changed to ${newDisplayCurrency}`,
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to save display currency preference',
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
            Theme
          </CardTitle>
          <CardDescription>
            Choose your preferred color scheme
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

      {/* Accent Color */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Accent Color
            <span className="ml-2 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300">
              Coming Soon
            </span>
          </CardTitle>
          <CardDescription>
            Choose your preferred accent color
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Your accent color preference is saved, but custom accent colors are not yet applied throughout the app. This feature will be activated soon.
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
            Font Size
            <span className="ml-2 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300">
              Coming Soon
            </span>
          </CardTitle>
          <CardDescription>
            Adjust the base font size
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Your font size preference is saved, but dynamic font sizing is not yet applied throughout the app. This feature will be activated soon.
              </p>
            </div>
            <Select value={fontSize} onValueChange={handleFontSizeChange} disabled>
              <SelectTrigger className="w-full md:w-[300px] opacity-50 cursor-not-allowed">
                <SelectValue placeholder="Select font size" />
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
            Currency Preferences
          </CardTitle>
          <CardDescription>
            Choose your preferred currency for data entry and display
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Preferred Currency */}
          <div className="space-y-2">
            <Label htmlFor="preferred-currency">
              Preferred Currency
            </Label>
            <p className="text-sm text-muted-foreground mb-2">
              Default currency for new transactions and data entry
            </p>
            <CurrencySelect
              value={currency}
              onValueChange={handleCurrencyChange}
              placeholder="Select preferred currency"
              className="w-full md:w-[300px]"
            />
          </div>

          {/* Display Currency */}
          <div className="space-y-2">
            <Label htmlFor="display-currency">
              Display Currency
            </Label>
            <p className="text-sm text-muted-foreground mb-2">
              Currency to display amounts in (conversions will be shown automatically)
            </p>
            <CurrencySelect
              value={displayCurrency}
              onValueChange={handleDisplayCurrencyChange}
              placeholder="Select display currency"
              className="w-full md:w-[300px]"
            />
          </div>

          {/* Info Box */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              <strong>Tip:</strong> If your preferred currency and display currency are different, amounts will be automatically converted and shown with a tooltip indicating the original currency.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
