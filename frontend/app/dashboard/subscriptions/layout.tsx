/**
 * Subscriptions Module Layout
 * Provides tabs navigation (Overview, History) and action button injection
 */
'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutGrid, History, Archive, BarChart3, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ModuleTab } from '@/types/module-layout';
import { SubscriptionsActionsContext } from './context';
import { useTranslations } from 'next-intl';
import { useUIVisibility } from '@/lib/hooks/use-ui-visibility';

export default function SubscriptionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [actions, setActions] = React.useState<React.ReactNode>(null);
  const { showPageDescription } = useUIVisibility();
  const t = useTranslations('subscriptions');

  const SUBSCRIPTIONS_TABS: ModuleTab[] = [
    {
      value: 'overview',
      label: t('navigation.overview'),
      icon: LayoutGrid,
      href: '/dashboard/subscriptions/overview',
    },
    // {
    //   value: 'analysis',
    //   label: t('navigation.analysis'),
    //   icon: BarChart3,
    //   href: '/dashboard/subscriptions/analysis',
    // },
    // {
    //   value: 'history',
    //   label: t('navigation.history'),
    //   icon: History,
    //   href: '/dashboard/subscriptions/history',
    // },
    // {
    //   value: 'archive',
    //   label: t('navigation.archive'),
    //   icon: Archive,
    //   href: '/dashboard/subscriptions/archive',
    // },
    // {
    // value: 'import',
    // label: t('navigation.import'),
    // icon: Upload,
    // href: '/dashboard/subscriptions/import',
    // },
  ];

  // Check if we're on a detail page (not a known tab route)
  const knownRoutes = SUBSCRIPTIONS_TABS.map(tab => tab.href);
  const isDetailPage = !knownRoutes.includes(pathname);

  // On detail pages, just render children without the module header and tabs
  if (isDetailPage) {
    return (
      <SubscriptionsActionsContext.Provider value={{ setActions }}>
        <div className="container mx-auto p-4 md:p-6">
          {children}
        </div>
      </SubscriptionsActionsContext.Provider>
    );
  }

  return (
    <SubscriptionsActionsContext.Provider value={{ setActions }}>
      <div className="container mx-auto p-4 md:p-6">
        {/* Page Header with Actions */}
        {actions && (
            <div className="flex flex-col sm:flex-row gap-2 md:gap-3 flex-shrink-0 mb-4">
              {actions}
            </div>
          )}

        {/* Tab Navigation — hidden when only 1 tab */}
        {SUBSCRIPTIONS_TABS.length > 1 && <div className="border-b border-border -mx-4 md:-mx-6 xl:mx-0">
          <nav className="flex overflow-x-auto overflow-y-hidden scrollbar-hide">
            {SUBSCRIPTIONS_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = pathname === tab.href;

              return (
                <Link
                  key={tab.value}
                  href={tab.href}
                  className={cn(
                    'flex items-center justify-center flex-1 xl:flex-initial gap-2 px-1 xl:px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap -mb-px',
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground'
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>}

        {/* Tab Content */}
        <div className="mt-6">{children}</div>
      </div>
    </SubscriptionsActionsContext.Provider>
  );
}
