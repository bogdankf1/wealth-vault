'use client';

import { useState } from 'react';
import { Shield, Smartphone, Clock, AlertTriangle, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';

interface Session {
  id: string;
  device: string;
  location: string;
  ip: string;
  lastActive: string;
  current: boolean;
}

export function SecuritySettings() {
  const t = useTranslations('settings.security');
  const { toast } = useToast();
  const { data: session } = useSession();

  // 2FA state
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [isEnabling2FA, setIsEnabling2FA] = useState(false);

  // Mock active sessions (would come from API)
  const [sessions, setSessions] = useState<Session[]>([
    {
      id: '1',
      device: 'Chrome on macOS',
      location: 'New York, USA',
      ip: '192.168.1.1',
      lastActive: '2 minutes ago',
      current: true,
    },
    {
      id: '2',
      device: 'Safari on iPhone',
      location: 'New York, USA',
      ip: '192.168.1.2',
      lastActive: '2 hours ago',
      current: false,
    },
  ]);

  const handle2FAToggle = async (enabled: boolean) => {
    setIsEnabling2FA(true);

    try {
      // TODO: Implement actual 2FA enable/disable API call
      await new Promise((resolve) => setTimeout(resolve, 1000));

      setIs2FAEnabled(enabled);
      toast({
        title: enabled ? t('toasts.twoFactorEnabled.title') : t('toasts.twoFactorDisabled.title'),
        description: enabled
          ? t('toasts.twoFactorEnabled.description')
          : t('toasts.twoFactorDisabled.description'),
      });
    } catch (error) {
      toast({
        title: t('toasts.error.title'),
        description: t('toasts.error.twoFactorDescription'),
        variant: 'destructive',
      });
    } finally {
      setIsEnabling2FA(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      // TODO: Implement actual session revoke API call
      await new Promise((resolve) => setTimeout(resolve, 500));

      setSessions(sessions.filter((s) => s.id !== sessionId));
      toast({
        title: t('toasts.sessionRevoked.title'),
        description: t('toasts.sessionRevoked.description'),
      });
    } catch (error) {
      toast({
        title: t('toasts.error.title'),
        description: t('toasts.error.sessionDescription'),
        variant: 'destructive',
      });
    }
  };

  const handleRevokeAllSessions = async () => {
    try {
      // TODO: Implement actual revoke all sessions API call
      await new Promise((resolve) => setTimeout(resolve, 500));

      setSessions(sessions.filter((s) => s.current));
      toast({
        title: t('toasts.sessionsRevoked.title'),
        description: t('toasts.sessionsRevoked.description'),
      });
    } catch (error) {
      toast({
        title: t('toasts.error.title'),
        description: t('toasts.error.sessionsDescription'),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Authentication Method */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t('authMethod.title')}
          </CardTitle>
          <CardDescription>
            {t('authMethod.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
            <div className="flex items-start gap-3">
              <svg className="h-6 w-6 mt-0.5" viewBox="0 0 24 24">
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
                <h4 className="font-medium text-blue-900 dark:text-blue-100">
                  {t('authMethod.signedInWith')}
                </h4>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  {session?.user?.email || 'Loading...'}
                </p>
                <p className="text-sm text-blue-600 dark:text-blue-400 mt-2">
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

      {/* Two-Factor Authentication */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            {t('twoFactor.title')}
            <span className="ml-2 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300">
              {t('twoFactor.comingSoon')}
            </span>
          </CardTitle>
          <CardDescription>
            {t('twoFactor.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {t('twoFactor.warningMessage')}
            </p>
          </div>
          <div className="flex items-center justify-between opacity-50">
            <div className="space-y-0.5">
              <Label htmlFor="2fa-toggle">{t('twoFactor.enable')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('twoFactor.enableDescription')}
              </p>
            </div>
            <Switch
              id="2fa-toggle"
              checked={is2FAEnabled}
              onCheckedChange={handle2FAToggle}
              disabled
            />
          </div>

          {is2FAEnabled && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                <div>
                  <h4 className="font-medium text-green-900 dark:text-green-100">
                    {t('twoFactor.enabled.title')}
                  </h4>
                  <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                    {t('twoFactor.enabled.description')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t('sessions.title')}
            <span className="ml-2 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300">
              {t('sessions.comingSoon')}
            </span>
          </CardTitle>
          <CardDescription>
            {t('sessions.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {t('sessions.warningMessage')}
            </p>
          </div>
          {sessions.map((session) => (
            <div
              key={session.id}
              className="flex items-start justify-between rounded-lg border p-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{session.device}</p>
                  {session.current && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
                      {t('sessions.current')}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {session.location} • {session.ip}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('sessions.lastActive')} {session.lastActive}
                </p>
              </div>

              {!session.current && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  className="cursor-not-allowed opacity-50"
                >
                  {t('sessions.revoke')}
                </Button>
              )}
            </div>
          ))}

          {sessions.length > 1 && (
            <div className="pt-2">
              <Button
                variant="destructive"
                disabled
                className="w-full cursor-not-allowed opacity-50"
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                {t('sessions.revokeAll')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
