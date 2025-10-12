'use client';

import { useEffect, useState } from 'react';
import { Bell, Mail, Smartphone } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useGetMyPreferencesQuery, useUpdateMyPreferencesMutation, EmailNotifications, PushNotifications } from '@/lib/api/preferencesApi';

export function NotificationSettings() {
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
        title: 'Email Notifications Updated',
        description: 'Your email notification preferences have been saved.',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to update email notification preferences',
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
        title: 'Push Notifications Updated',
        description: 'Your push notification preferences have been saved.',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to update push notification preferences',
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
            Email Notifications
            <span className="ml-2 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300">
              Coming Soon
            </span>
          </CardTitle>
          <CardDescription>
            Manage which emails you receive from us
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Your notification preferences are saved, but email notifications are not yet being sent. This feature will be activated soon.
            </p>
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="email-marketing">Marketing Emails</Label>
              <p className="text-sm text-muted-foreground">
                Receive emails about new features, tips, and special offers
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
              <Label htmlFor="email-product-updates">Product Updates</Label>
              <p className="text-sm text-muted-foreground">
                Get notified when we release new features or improvements
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
              <Label htmlFor="email-security">Security Alerts</Label>
              <p className="text-sm text-muted-foreground">
                Important security notifications about your account
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
              <Label htmlFor="email-billing">Billing & Payments</Label>
              <p className="text-sm text-muted-foreground">
                Invoices, payment confirmations, and billing updates
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
              <Label htmlFor="email-weekly-summary">Weekly Summary</Label>
              <p className="text-sm text-muted-foreground">
                A weekly digest of your financial activity and insights
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
            Push Notifications
            <span className="ml-2 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300">
              Coming Soon
            </span>
          </CardTitle>
          <CardDescription>
            Manage in-app and browser notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Your notification preferences are saved, but push notifications are not yet active. This feature will be activated soon.
            </p>
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="push-budget-alerts">Budget Alerts</Label>
              <p className="text-sm text-muted-foreground">
                Get notified when you are approaching your budget limits
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
              <Label htmlFor="push-goal-milestones">Goal Milestones</Label>
              <p className="text-sm text-muted-foreground">
                Celebrate when you reach savings goals or milestones
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
              <Label htmlFor="push-subscription-reminders">Subscription Reminders</Label>
              <p className="text-sm text-muted-foreground">
                Reminders about upcoming subscription renewals
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
              <Label htmlFor="push-income-notifications">Income Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Get notified when you receive income or payments
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
