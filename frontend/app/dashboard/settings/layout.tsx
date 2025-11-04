/**
 * Settings Layout with Tab Navigation
 */
'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { User, CreditCard, Palette, Bell, Shield, Lock, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';

const SETTINGS_TABS = [
  { value: 'account', label: 'Account', icon: User, href: '/dashboard/settings/account' },
  { value: 'subscription', label: 'Subscription', icon: CreditCard, href: '/dashboard/settings/subscription' },
  { value: 'appearance', label: 'Appearance', icon: Palette, href: '/dashboard/settings/appearance' },
  { value: 'dashboard-layouts', label: 'Dashboard', icon: LayoutGrid, href: '/dashboard/settings/dashboard-layouts' },
  { value: 'notifications', label: 'Notifications', icon: Bell, href: '/dashboard/settings/notifications' },
  { value: 'privacy', label: 'Privacy', icon: Shield, href: '/dashboard/settings/privacy' },
  { value: 'security', label: 'Security', icon: Lock, href: '/dashboard/settings/security' },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="container mx-auto space-y-4 md:space-y-6 p-4 md:p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account settings and preferences
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
