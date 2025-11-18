/**
 * Settings Layout with Tab Navigation
 */
'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { User, CreditCard, Palette, Bell, Shield, Lock, LayoutGrid } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const tPage = useTranslations('settings.page');
  const tTabs = useTranslations('settings.tabs');

  const SETTINGS_TABS = [
    { value: 'account', label: tTabs('account'), icon: User, href: '/dashboard/settings/account' },
    { value: 'subscription', label: tTabs('subscription'), icon: CreditCard, href: '/dashboard/settings/subscription' },
    { value: 'appearance', label: tTabs('appearance'), icon: Palette, href: '/dashboard/settings/appearance' },
    { value: 'dashboard-layouts', label: tTabs('dashboard'), icon: LayoutGrid, href: '/dashboard/settings/dashboard-layouts' },
    { value: 'notifications', label: tTabs('notifications'), icon: Bell, href: '/dashboard/settings/notifications' },
    { value: 'privacy', label: tTabs('privacy'), icon: Shield, href: '/dashboard/settings/privacy' },
    { value: 'security', label: tTabs('security'), icon: Lock, href: '/dashboard/settings/security' },
  ];

  return (
    <div className="container mx-auto space-y-4 md:space-y-6 p-4 md:p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{tPage('title')}</h1>
        <p className="text-muted-foreground">
          {tPage('description')}
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b">
        <nav className="flex gap-2 overflow-x-auto pb-px -mb-px scrollbar-hide">
          {SETTINGS_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = pathname === tab.href;

            return (
              <Link
                key={tab.value}
                href={tab.href}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50"
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="hidden sm:inline">{tab.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div>{children}</div>
    </div>
  );
}
