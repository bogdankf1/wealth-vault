'use client';

import { Shield, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';

export function SecuritySettings() {
  const t = useTranslations('settings.security');
  const { data: session } = useSession();

  return (
    <div className="space-y-3">
      {/* Authentication Method */}
      <Card>
        <CardHeader className="p-3">
          <CardTitle className="flex items-center gap-2 text-sm lg:text-base">
            <Shield className="h-4 w-4 lg:h-5 lg:w-5" />
            {t('authMethod.title')}
          </CardTitle>
          <CardDescription className="hidden">
            {t('authMethod.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-3">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950">
            <div className="flex items-start gap-2 lg:gap-3">
              <svg className="h-5 w-5 lg:h-6 lg:w-6 mt-0.5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <div className="flex-1">
                <h4 className="text-xs lg:text-sm font-medium text-blue-900 dark:text-blue-100">
                  {t('authMethod.signedInWith')}
                </h4>
                <p className="text-xs lg:text-sm text-blue-700 dark:text-blue-300 mt-1">
                  {session?.user?.email || 'Loading...'}
                </p>
                <p className="text-xs lg:text-sm text-blue-600 dark:text-blue-400 mt-2">
                  {t('authMethod.securityInfo')}
                </p>
                <Button
                  variant="link"
                  className="h-auto p-0 text-blue-700 dark:text-blue-300 mt-2"
                  onClick={() => window.open('https://myaccount.google.com/security', '_blank')}
                >
                  {t('authMethod.manageGoogleAccount')}
                  <ExternalLink className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* TODO: 2FA section hidden — no backend API exists yet.
         Re-enable when 2FA backend is implemented. */}

      {/* TODO: Active Sessions section hidden — no backend API exists yet.
         Re-enable when session management backend is implemented. */}
    </div>
  );
}
