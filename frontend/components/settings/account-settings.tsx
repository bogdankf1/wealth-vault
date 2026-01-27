'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { User, Mail, Calendar, Globe, Briefcase } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGetCurrentUserQuery } from '@/lib/api/authApi';
import { useGetMyPreferencesQuery, useUpdateMyPreferencesMutation } from '@/lib/api/preferencesApi';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';

export function AccountSettings() {
  const t = useTranslations('settings.account');
  const { toast } = useToast();
  const { data: session } = useSession();
  const { data: currentUser, isLoading: userLoading } = useGetCurrentUserQuery();
  const { data: preferences, isLoading: prefsLoading } = useGetMyPreferencesQuery();
  const [updatePreferences] = useUpdateMyPreferencesMutation();

  // Local state
  const [country, setCountry] = useState<string>('');
  const [occupation, setOccupation] = useState<string>('');

  // Countries list (ISO 3166-1 alpha-2)
  const COUNTRIES = [
    { code: 'US', name: 'United States' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'DE', name: 'Germany' },
    { code: 'FR', name: 'France' },
    { code: 'ES', name: 'Spain' },
    { code: 'IT', name: 'Italy' },
    { code: 'PL', name: 'Poland' },
    { code: 'PT', name: 'Portugal' },
    { code: 'UA', name: 'Ukraine' },
    { code: 'CA', name: 'Canada' },
    { code: 'AU', name: 'Australia' },
    { code: 'NL', name: 'Netherlands' },
    { code: 'BE', name: 'Belgium' },
    { code: 'AT', name: 'Austria' },
    { code: 'CH', name: 'Switzerland' },
    { code: 'SE', name: 'Sweden' },
    { code: 'NO', name: 'Norway' },
    { code: 'DK', name: 'Denmark' },
    { code: 'FI', name: 'Finland' },
    { code: 'IE', name: 'Ireland' },
    { code: 'CZ', name: 'Czech Republic' },
    { code: 'RO', name: 'Romania' },
    { code: 'HU', name: 'Hungary' },
    { code: 'GR', name: 'Greece' },
    { code: 'JP', name: 'Japan' },
    { code: 'KR', name: 'South Korea' },
    { code: 'CN', name: 'China' },
    { code: 'IN', name: 'India' },
    { code: 'BR', name: 'Brazil' },
    { code: 'MX', name: 'Mexico' },
    { code: 'AR', name: 'Argentina' },
    { code: 'ZA', name: 'South Africa' },
    { code: 'NZ', name: 'New Zealand' },
    { code: 'SG', name: 'Singapore' },
    { code: 'AE', name: 'United Arab Emirates' },
    { code: 'IL', name: 'Israel' },
    { code: 'TR', name: 'Turkey' },
  ].sort((a, b) => a.name.localeCompare(b.name));

  // Occupation types (similar to Interactive Brokers)
  const OCCUPATIONS = [
    { value: 'employed', label: t('occupation.options.employed') },
    { value: 'self_employed', label: t('occupation.options.selfEmployed') },
    { value: 'business_owner', label: t('occupation.options.businessOwner') },
    { value: 'freelancer', label: t('occupation.options.freelancer') },
    { value: 'retired', label: t('occupation.options.retired') },
    { value: 'student', label: t('occupation.options.student') },
    { value: 'unemployed', label: t('occupation.options.unemployed') },
    { value: 'homemaker', label: t('occupation.options.homemaker') },
    { value: 'military', label: t('occupation.options.military') },
    { value: 'government', label: t('occupation.options.government') },
    { value: 'other', label: t('occupation.options.other') },
  ];

  // Sync local state with preferences
  useEffect(() => {
    if (preferences) {
      setCountry(preferences.country || '');
      setOccupation(preferences.occupation || '');
    }
  }, [preferences]);

  const handleCountryChange = async (newCountry: string) => {
    setCountry(newCountry);
    try {
      await updatePreferences({ country: newCountry }).unwrap();
      const countryName = COUNTRIES.find(c => c.code === newCountry)?.name || newCountry;
      toast({
        title: t('toasts.countryUpdated.title'),
        description: `${t('toasts.countryUpdated.description')} ${countryName}`,
      });
    } catch {
      toast({
        title: t('toasts.error.title'),
        description: t('toasts.error.countryDescription'),
        variant: 'destructive',
      });
    }
  };

  const handleOccupationChange = async (newOccupation: string) => {
    setOccupation(newOccupation);
    try {
      await updatePreferences({ occupation: newOccupation }).unwrap();
      const occupationLabel = OCCUPATIONS.find(o => o.value === newOccupation)?.label || newOccupation;
      toast({
        title: t('toasts.occupationUpdated.title'),
        description: `${t('toasts.occupationUpdated.description')} ${occupationLabel}`,
      });
    } catch {
      toast({
        title: t('toasts.error.title'),
        description: t('toasts.error.occupationDescription'),
        variant: 'destructive',
      });
    }
  };

  const isLoading = userLoading || prefsLoading;

  if (isLoading) {
    return (
      <div className="space-y-3 lg:space-y-6">
        <Card>
          <CardHeader className="p-3 lg:p-6">
            <div className="h-6 w-32 animate-pulse rounded bg-muted" />
            <div className="h-4 w-48 animate-pulse rounded bg-muted mt-2" />
          </CardHeader>
          <CardContent className="p-3 lg:p-6 pt-0">
            <div className="h-32 w-full animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3 lg:space-y-6">
      <Card>
        <CardHeader className="p-3 lg:p-6">
          <CardTitle className="flex items-center gap-2 text-sm lg:text-base">
            <User className="h-4 w-4 lg:h-5 lg:w-5" />
            {t('title')}
          </CardTitle>
          <CardDescription className="text-xs lg:text-sm">{t('description')}</CardDescription>
        </CardHeader>
        <CardContent className="p-3 lg:p-6 pt-0 space-y-3 lg:space-y-4">
          <div className="flex items-start gap-2 lg:gap-3">
            <User className="h-4 w-4 lg:h-5 lg:w-5 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <p className="text-xs lg:text-sm font-medium">{t('name')}</p>
              <p className="text-xs lg:text-sm text-muted-foreground">
                {session?.user?.name || currentUser?.name || t('notSet')}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2 lg:gap-3">
            <Mail className="h-4 w-4 lg:h-5 lg:w-5 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <p className="text-xs lg:text-sm font-medium">{t('email')}</p>
              <p className="text-xs lg:text-sm text-muted-foreground">
                {session?.user?.email || currentUser?.email || t('notSet')}
              </p>
            </div>
          </div>

          {currentUser?.created_at && (
            <div className="flex items-start gap-2 lg:gap-3">
              <Calendar className="h-4 w-4 lg:h-5 lg:w-5 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <p className="text-xs lg:text-sm font-medium">{t('memberSince')}</p>
                <p className="text-xs lg:text-sm text-muted-foreground">
                  {format(new Date(currentUser.created_at), 'MMMM d, yyyy')}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Country Selection */}
      <Card>
        <CardHeader className="p-3 lg:p-6">
          <CardTitle className="flex items-center gap-2 text-sm lg:text-base">
            <Globe className="h-4 w-4 lg:h-5 lg:w-5" />
            {t('country.title')}
          </CardTitle>
          <CardDescription className="text-xs lg:text-sm">
            {t('country.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 lg:p-6 pt-0">
          <Select value={country} onValueChange={handleCountryChange}>
            <SelectTrigger className="w-full md:w-[300px]">
              <SelectValue placeholder={t('country.selectPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Occupation Selection */}
      <Card>
        <CardHeader className="p-3 lg:p-6">
          <CardTitle className="flex items-center gap-2 text-sm lg:text-base">
            <Briefcase className="h-4 w-4 lg:h-5 lg:w-5" />
            {t('occupation.title')}
          </CardTitle>
          <CardDescription className="text-xs lg:text-sm">
            {t('occupation.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 lg:p-6 pt-0">
          <Select value={occupation} onValueChange={handleOccupationChange}>
            <SelectTrigger className="w-full md:w-[300px]">
              <SelectValue placeholder={t('occupation.selectPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {OCCUPATIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
    </div>
  );
}
