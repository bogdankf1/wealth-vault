/**
 * Goals Module Layout
 * Provides tabs navigation and action button injection
 */
'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ModuleTab } from '@/types/module-layout';
import { GoalsActionsContext } from './context';

const GOALS_TABS: ModuleTab[] = [
  {
    value: 'overview',
    label: 'Overview',
    icon: LayoutGrid,
    href: '/dashboard/goals/overview',
  },
];

export default function GoalsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [actions, setActions] = React.useState<React.ReactNode>(null);

  return (
    <GoalsActionsContext.Provider value={{ setActions }}>
      <div className="container mx-auto p-4 md:p-6">
        {/* Page Header with Actions */}
        <div className="flex flex-col gap-3 md:gap-4 md:flex-row md:items-center md:justify-between mb-6">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
              Goals
            </h1>
            <p className="mt-1 text-xs md:text-sm text-gray-500 dark:text-gray-400">
              Track and manage your financial goals
            </p>
          </div>
          {actions && (
            <div className="flex flex-col sm:flex-row gap-2 md:gap-3 flex-shrink-0">
              {actions}
            </div>
          )}
        </div>

        {/* Tab Navigation with full-width border */}
        <div className="border-b border-border">
          <nav className="flex overflow-x-auto overflow-y-hidden scrollbar-hide">
            {GOALS_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = pathname === tab.href;

              return (
                <Link
                  key={tab.value}
                  href={tab.href}
                  className={cn(
                    'flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap -mb-px',
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground'
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="mt-6">{children}</div>
      </div>
    </GoalsActionsContext.Provider>
  );
}
