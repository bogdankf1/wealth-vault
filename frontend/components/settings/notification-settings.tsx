'use client';

import { useEffect, useState } from 'react';
import { Bell, Mail, Smartphone } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useGetMyPreferencesQuery, useUpdateMyPreferencesMutation, EmailNotifications, PushNotifications } from '@/lib/api/preferencesApi';
import { useTranslations } from 'next-intl';

export function NotificationSettings() {
  const t = useTranslations('settings.notifications');
  const { toast } = useToast();
  const { data: preferences, isLoading } = useGetMyPreferencesQuery();
  const [updatePreferences] = useUpdateMyPreferencesMutation();

  // Local state for email notifications
  const [emailNotifications, setEmailNotifications] = useState<EmailNotifications>({
    marketing: true,
    product_updates: true,
    security_alerts: true,
    billing: true,
    weekly_summary: true,
  });

  // Local state for push notifications
  const [pushNotifications, setPushNotifications] = useState<PushNotifications>({
    budget_alerts: true,
    goal_milestones: true,
    subscription_reminders: true,
    income_notifications: true,
  });

  // Sync local state with fetched preferences
  useEffect(() => {
    if (preferences) {
      setEmailNotifications(preferences.email_notifications);
      setPushNotifications(preferences.push_notifications);
    }
  }, [preferences]);

  const handleEmailNotificationChange = async (key: keyof EmailNotifications, value: boolean) => {
    const updated = { ...emailNotifications, [key]: value };
    setEmailNotifications(updated);

    try {
      await updatePreferences({ email_notifications: updated }).unwrap();
      toast({
        title: t('toasts.emailUpdated.title'),
        description: t('toasts.emailUpdated.description'),
      });
    } catch {
      toast({
        title: t('toasts.error.title'),
        description: t('toasts.error.emailDescription'),
        variant: 'destructive',
      });
      // Revert on error
      setEmailNotifications(emailNotifications);
    }
  };

  const handlePushNotificationChange = async (key: keyof PushNotifications, value: boolean) => {
    const updated = { ...pushNotifications, [key]: value };
    setPushNotifications(updated);

    try {
      await updatePreferences({ push_notifications: updated }).unwrap();
      toast({
        title: t('toasts.pushUpdated.title'),
        description: t('toasts.pushUpdated.description'),
      });
    } catch {
      toast({
        title: t('toasts.error.title'),
        description: t('toasts.error.pushDescription'),
        variant: 'destructive',
      });
      // Revert on error
      setPushNotifications(pushNotifications);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardHeader>
              <div className="h-6 w-32 animate-pulse rounded bg-muted" />
              <div className="h-4 w-48 animate-pulse rounded bg-muted mt-2" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="h-16 w-full animate-pulse rounded bg-muted" />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Email Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {t('email.title')}
            <span className="ml-2 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300">
              {t('email.comingSoon')}
            </span>
          </CardTitle>
          <CardDescription>
            {t('email.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {t('email.warningMessage')}
            </p>
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="email-marketing">{t('email.marketing.label')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('email.marketing.description')}
              </p>
            </div>
            <Switch
              id="email-marketing"
              checked={emailNotifications.marketing}
              onCheckedChange={(checked) => handleEmailNotificationChange('marketing', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="email-product-updates">{t('email.productUpdates.label')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('email.productUpdates.description')}
              </p>
            </div>
            <Switch
              id="email-product-updates"
              checked={emailNotifications.product_updates}
              onCheckedChange={(checked) => handleEmailNotificationChange('product_updates', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="email-security">{t('email.securityAlerts.label')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('email.securityAlerts.description')}
              </p>
            </div>
            <Switch
              id="email-security"
              checked={emailNotifications.security_alerts}
              onCheckedChange={(checked) => handleEmailNotificationChange('security_alerts', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="email-billing">{t('email.billing.label')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('email.billing.description')}
              </p>
            </div>
            <Switch
              id="email-billing"
              checked={emailNotifications.billing}
              onCheckedChange={(checked) => handleEmailNotificationChange('billing', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="email-weekly-summary">{t('email.weeklySummary.label')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('email.weeklySummary.description')}
              </p>
            </div>
            <Switch
              id="email-weekly-summary"
              checked={emailNotifications.weekly_summary}
              onCheckedChange={(checked) => handleEmailNotificationChange('weekly_summary', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Push Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            {t('push.title')}
            <span className="ml-2 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300">
              {t('push.comingSoon')}
            </span>
          </CardTitle>
          <CardDescription>
            {t('push.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {t('push.warningMessage')}
            </p>
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="push-budget-alerts">{t('push.budgetAlerts.label')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('push.budgetAlerts.description')}
              </p>
            </div>
            <Switch
              id="push-budget-alerts"
              checked={pushNotifications.budget_alerts}
              onCheckedChange={(checked) => handlePushNotificationChange('budget_alerts', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="push-goal-milestones">{t('push.goalMilestones.label')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('push.goalMilestones.description')}
              </p>
            </div>
            <Switch
              id="push-goal-milestones"
              checked={pushNotifications.goal_milestones}
              onCheckedChange={(checked) => handlePushNotificationChange('goal_milestones', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="push-subscription-reminders">{t('push.subscriptionReminders.label')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('push.subscriptionReminders.description')}
              </p>
            </div>
            <Switch
              id="push-subscription-reminders"
              checked={pushNotifications.subscription_reminders}
              onCheckedChange={(checked) => handlePushNotificationChange('subscription_reminders', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="push-income-notifications">{t('push.incomeNotifications.label')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('push.incomeNotifications.description')}
              </p>
            </div>
            <Switch
              id="push-income-notifications"
              checked={pushNotifications.income_notifications}
              onCheckedChange={(checked) => handlePushNotificationChange('income_notifications', checked)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
