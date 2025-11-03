/**
 * Settings Page with Tabs
 * Account settings, subscription management, and preferences
 */
'use client';

import { useState } from 'react';
import { User, CreditCard, Palette, Bell, Shield, Lock } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AccountSettings } from '@/components/settings/account-settings';
import { SubscriptionSettings } from '@/components/settings/subscription-settings';
import { AppearanceSettings } from '@/components/settings/appearance-settings';
import { NotificationSettings } from '@/components/settings/notification-settings';
import { PrivacySettings } from '@/components/settings/privacy-settings';
import { SecuritySettings } from '@/components/settings/security-settings';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('subscription');

  return (
    <div className="container mx-auto space-y-4 md:space-y-6 p-4 md:p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account settings and preferences
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 md:space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 lg:w-[950px] gap-2 h-auto p-1">
          <TabsTrigger value="account" className="flex items-center justify-center gap-1 sm:gap-2 px-2 py-2.5 text-xs sm:text-sm">
            <User className="h-4 w-4 sm:h-4 sm:w-4 flex-shrink-0" />
            <span className="hidden sm:inline">Account</span>
          </TabsTrigger>
          <TabsTrigger value="subscription" className="flex items-center justify-center gap-1 sm:gap-2 px-2 py-2.5 text-xs sm:text-sm">
            <CreditCard className="h-4 w-4 sm:h-4 sm:w-4 flex-shrink-0" />
            <span className="hidden sm:inline">Subscription</span>
          </TabsTrigger>
          <TabsTrigger value="appearance" className="flex items-center justify-center gap-1 sm:gap-2 px-2 py-2.5 text-xs sm:text-sm">
            <Palette className="h-4 w-4 sm:h-4 sm:w-4 flex-shrink-0" />
            <span className="hidden sm:inline">Appearance</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center justify-center gap-1 sm:gap-2 px-2 py-2.5 text-xs sm:text-sm">
            <Bell className="h-4 w-4 sm:h-4 sm:w-4 flex-shrink-0" />
            <span className="hidden sm:inline">Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="privacy" className="flex items-center justify-center gap-1 sm:gap-2 px-2 py-2.5 text-xs sm:text-sm">
            <Shield className="h-4 w-4 sm:h-4 sm:w-4 flex-shrink-0" />
            <span className="hidden sm:inline">Privacy</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center justify-center gap-1 sm:gap-2 px-2 py-2.5 text-xs sm:text-sm">
            <Lock className="h-4 w-4 sm:h-4 sm:w-4 flex-shrink-0" />
            <span className="hidden sm:inline">Security</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="space-y-4">
          <AccountSettings />
        </TabsContent>

        <TabsContent value="subscription" className="space-y-4">
          <SubscriptionSettings />
        </TabsContent>

        <TabsContent value="appearance" className="space-y-4">
          <AppearanceSettings />
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <NotificationSettings />
        </TabsContent>

        <TabsContent value="privacy" className="space-y-4">
          <PrivacySettings />
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <SecuritySettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
