'use client';

import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { User, ExternalLink, LogOut } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGetCurrentUserQuery } from '@/lib/api/authApi';
import { useGetMyPreferencesQuery, useUpdateMyPreferencesMutation } from '@/lib/api/preferencesApi';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';

export function AccountSettings() {
  const t = useTranslations('settings.account');
  const tSecurity = useTranslations('settings.security');
  const { toast } = useToast();
  const { data: session } = useSession();
  const { data: currentUser, isLoading: userLoading } = useGetCurrentUserQuery();
  const { data: preferences, isLoading: prefsLoading } = useGetMyPreferencesQuery();
  const [updatePreferences] = useUpdateMyPreferencesMutation();

  const [country, setCountry] = useState<string>('');
  const [occupation, setOccupation] = useState<string>('');

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
      toast({
        title: t('toasts.countryUpdated.title'),
        description: `${t('toasts.countryUpdated.description')} ${COUNTRIES.find(c => c.code === newCountry)?.name}`,
      });
    } catch {
      toast({ title: t('toasts.error.title'), description: t('toasts.error.countryDescription'), variant: 'destructive' });
    }
  };

  const handleOccupationChange = async (newOccupation: string) => {
    setOccupation(newOccupation);
    try {
      await updatePreferences({ occupation: newOccupation }).unwrap();
      toast({
        title: t('toasts.occupationUpdated.title'),
        description: `${t('toasts.occupationUpdated.description')} ${OCCUPATIONS.find(o => o.value === newOccupation)?.label}`,
      });
    } catch {
      toast({ title: t('toasts.error.title'), description: t('toasts.error.occupationDescription'), variant: 'destructive' });
    }
  };

  const isLoading = userLoading || prefsLoading;

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
          <User className="h-4 w-4" />
          {t('title')}
        </CardTitle>
        <CardDescription className="text-xs lg:text-sm">{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-0 divide-y">
        {/* Name */}
        <div className="flex items-center justify-between py-3">
          <Label className="text-sm">{t('name')}</Label>
          <span className="text-sm text-muted-foreground">{session?.user?.name || currentUser?.name || t('notSet')}</span>
        </div>

        {/* Email */}
        <div className="flex items-center justify-between py-3">
          <Label className="text-sm">{t('email')}</Label>
          <span className="text-sm text-muted-foreground">{session?.user?.email || currentUser?.email || t('notSet')}</span>
        </div>

        {/* Member Since */}
        {currentUser?.created_at && (
          <div className="flex items-center justify-between py-3">
            <Label className="text-sm">{t('memberSince')}</Label>
            <span className="text-sm text-muted-foreground">{format(new Date(currentUser.created_at), 'MMMM d, yyyy')}</span>
          </div>
        )}

        {/* Authentication */}
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            <Label className="text-sm">{tSecurity('authMethod.signedInWith')}</Label>
          </div>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-sm"
            onClick={() => window.open('https://myaccount.google.com/security', '_blank')}
          >
            {tSecurity('authMethod.manageGoogleAccount')}
            <ExternalLink className="h-3 w-3 ml-1" />
          </Button>
        </div>

        {/* Country */}
        <div className="flex items-center justify-between py-3">
          <Label className="text-sm">{t('country.title')}</Label>
          <Select value={country} onValueChange={handleCountryChange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t('country.selectPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Occupation */}
        <div className="flex items-center justify-between py-3">
          <Label className="text-sm">{t('occupation.title')}</Label>
          <Select value={occupation} onValueChange={handleOccupationChange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t('occupation.selectPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {OCCUPATIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Logout */}
        <div className="flex items-center justify-between py-3">
          <div>
            <Label className="text-sm">{t('logout.title')}</Label>
            <p className="text-xs text-muted-foreground">{t('logout.description')}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/20"
          >
            <LogOut className="h-4 w-4 mr-2" />
            {t('logout.button')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
