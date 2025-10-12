/**
 * Settings Page with Tabs
 * Account settings, subscription management, and preferences
 */
'use client';

import { useState } from 'react';
import { User, CreditCard } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AccountSettings } from '@/components/settings/account-settings';
import { SubscriptionSettings } from '@/components/settings/subscription-settings';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('subscription');

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account settings and preferences
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
          <TabsTrigger value="account" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Account
          </TabsTrigger>
          <TabsTrigger value="subscription" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Subscription
          </TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="space-y-4">
          <AccountSettings />
        </TabsContent>

        <TabsContent value="subscription" className="space-y-4">
          <SubscriptionSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
