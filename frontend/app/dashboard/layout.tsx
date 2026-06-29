/**
 * Dashboard layout with sidebar navigation
 */
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import {
  TrendingUp,
  DollarSign,
  Landmark,
  LineChart,
  Target,
  CreditCard,
  Receipt,
  Wallet,
  Sparkles,
  Settings,
  Shield,
  FileText,
  UserMinus,
  LayoutDashboard,
  Download,
  Database,
  HelpCircle,
  Bell,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useSidebarSwipe } from '@/hooks/use-sidebar-swipe';
import { useSidebarCollapse } from '@/hooks/use-sidebar-collapse';
import { BottomNavBar } from '@/components/navigation/bottom-nav-bar';
import { SubPagePillBar } from '@/components/navigation/sub-page-pill-bar';
import { InstallPrompt } from '@/components/pwa/install-prompt';
import { useGetCurrentUserQuery } from '@/lib/api/authApi';
import { useGetCurrenciesQuery } from '@/lib/api/currenciesApi';
import { WealthVaultLogo } from '@/components/ui/wealth-vault-logo';
import { NAVIGATION_FEATURES } from '@/lib/constants/feature-map';
import { useGetUserFeaturesQuery } from '@/lib/api/authApi';
import { AuthErrorHandler } from '@/components/auth/auth-error-handler';
import { AgentSheet } from '@/components/agent/agent-sheet';
// import { SessionDebug } from '@/components/debug/session-debug';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { data: currentUser } = useGetCurrentUserQuery();
  const { data: userFeatures } = useGetUserFeaturesQuery();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { sidebarRef, backdropRef, isDragging } = useSidebarSwipe({
    isOpen: sidebarOpen,
    setIsOpen: setSidebarOpen,
    sidebarWidth: 256,
    desktopQuery: '(min-width: 1280px)',
    enabled: false, // Disabled — mobile uses bottom nav instead
  });
  // Back swipe disabled — not useful on mobile
  // useBackSwipe({ enabled: !sidebarOpen });
  const { isCollapsed, toggleCollapsed } = useSidebarCollapse();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    incomeExpenses: true,
    accountsInvestments: true,
    recurring: true,
    liabilities: true,
    dataManagement: false,
  });
  const t = useTranslations('sidebar');

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }));
  };

  // Preload currencies to ensure they're available when editing entries
  useGetCurrenciesQuery({ active_only: true });

  const navigationGroups = [
    {
      items: [
        { name: t('navigation.dashboard'), href: '/dashboard', icon: LayoutDashboard },
      ],
    },
    {
      key: 'incomeExpenses',
      label: t('groups.incomeExpenses'),
      items: [
        { name: t('navigation.income'), href: '/dashboard/income', icon: TrendingUp },
        { name: t('navigation.expenses'), href: '/dashboard/expenses', icon: DollarSign },
      ],
    },
    {
      key: 'accountsInvestments',
      label: t('groups.accountsInvestments'),
      items: [
        { name: t('navigation.accounts'), href: '/dashboard/accounts', icon: Landmark },
        { name: t('navigation.portfolio'), href: '/dashboard/portfolio', icon: LineChart },
        { name: t('navigation.goals'), href: '/dashboard/goals', icon: Target },
      ],
    },
    {
      key: 'recurring',
      label: t('groups.recurring'),
      items: [
        { name: t('navigation.budgets'), href: '/dashboard/budgets', icon: Wallet },
        { name: t('navigation.subscriptions'), href: '/dashboard/subscriptions', icon: CreditCard },
        { name: t('navigation.installments'), href: '/dashboard/installments', icon: Receipt },
      ],
    },
    {
      key: 'liabilities',
      label: t('groups.liabilities'),
      items: [
        { name: t('navigation.debts'), href: '/dashboard/debts', icon: UserMinus },
        { name: t('navigation.taxes'), href: '/dashboard/taxes', icon: FileText },
      ],
    },
  ];

  const dataManagementItems = [
    { name: t('bottomNavigation.export'), href: '/dashboard/export', icon: Download },
    { name: t('bottomNavigation.backups'), href: '/dashboard/backups', icon: Database },
  ];

  const bottomNavigation = [
    // { name: t('bottomNavigation.pricing'), href: '/dashboard/pricing', icon: Sparkles, desktopOnly: false },
    // { name: t('bottomNavigation.helpCenter'), href: '/dashboard/help', icon: HelpCircle, desktopOnly: true },
    // { name: t('bottomNavigation.notifications'), href: '/dashboard/notifications', icon: Bell, desktopOnly: true },
    { name: t('bottomNavigation.settings'), href: '/dashboard/settings', icon: Settings, desktopOnly: true },
  ];

  /**
   * Check if user has access to a feature
   * @param href - The navigation href
   * @returns true if user has access, false otherwise
   */
  const hasFeatureAccess = (href: string): boolean => {
    const requiredFeature = NAVIGATION_FEATURES[href];

    // If no feature is required, allow access
    if (!requiredFeature) return true;

    // If user features not loaded yet, default to allowing access
    if (!userFeatures) return true;

    // Check if user has the required feature enabled
    return requiredFeature in userFeatures.features;
  };

  // Filter navigation groups based on user's enabled features
  const accessibleNavigationGroups = navigationGroups.map(group => ({
    ...group,
    items: group.items.filter(item => hasFeatureAccess(item.href))
  })).filter(group => group.items.length > 0);

  const accessibleDataManagementItems = dataManagementItems.filter((item) =>
    hasFeatureAccess(item.href)
  );

  const accessibleBottomNavigation = bottomNavigation.filter((item) =>
    hasFeatureAccess(item.href)
  );

  /**
   * Check if a navigation item is active
   * For Dashboard (/dashboard), use exact match
   * For other items, use startsWith to highlight parent and child routes
   */
  const isNavItemActive = (itemHref: string): boolean => {
    if (itemHref === '/dashboard') {
      return pathname === '/dashboard';
    }
    return pathname.startsWith(itemHref);
  };

  return (
    <>
      {/* Authentication Error Handler */}
      <AuthErrorHandler />

      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        {/* Mobile/Tablet sidebar backdrop (desktop sidebar only) */}
        <div
          ref={backdropRef}
          className={cn(
            'fixed inset-0 z-40 bg-black xl:hidden transition-opacity duration-300 hidden',
            sidebarOpen && !isDragging ? 'opacity-75 pointer-events-auto' : 'opacity-0 pointer-events-none'
          )}
          onClick={() => setSidebarOpen(false)}
        />

      {/* Sidebar (desktop only — mobile uses bottom nav) */}
      <div
        ref={sidebarRef}
        className={cn(
          'hidden xl:block fixed inset-y-0 left-0 z-50 transform bg-white dark:bg-gray-800 xl:translate-x-0 xl:static shadow-2xl xl:shadow-none',
          isCollapsed ? 'xl:w-16' : 'xl:w-64',
          'transition-[width] duration-300 ease-in-out'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className={cn(
            'flex h-14 md:h-16 items-center justify-between px-4 md:px-6 border-b dark:border-gray-700 overflow-hidden',
            isCollapsed && 'xl:justify-center xl:px-0'
          )}>
            <Link href="/dashboard" className={cn(
              'flex items-center space-x-3 whitespace-nowrap',
              isCollapsed && 'xl:hidden'
            )}>
              <WealthVaultLogo size={32} className="flex-shrink-0" />
              <span className="text-lg lg:text-xl font-bold text-gray-900 dark:text-white">
                {t('logo.title')}
              </span>
            </Link>
            <button
              onClick={toggleCollapsed}
              className="hidden xl:flex p-1.5 rounded-md text-gray-500 hover:text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-700"
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? (
                <PanelLeftOpen className="h-5 w-5" />
              ) : (
                <PanelLeftClose className="h-5 w-5" />
              )}
            </button>
          </div>

          {/* Navigation */}
          <nav className={cn(
            'flex-1 space-y-1 px-2 md:px-3 py-3 md:py-4 overflow-y-auto',
            isCollapsed && 'xl:px-1 xl:space-y-0.5 xl:overflow-visible'
          )}>
            {accessibleNavigationGroups.map((group, groupIndex) => {
              const isExpanded = group.key ? expandedGroups[group.key] : true;

              return (
                <div key={groupIndex} className={cn(groupIndex > 0 && 'mt-3', isCollapsed && 'xl:mt-0 xl:space-y-0.5')}>
                  {group.label && group.key && (
                    <button
                      onClick={() => toggleGroup(group.key!)}
                      className={cn(
                        'w-full flex items-center justify-between gap-1 overflow-hidden px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-300 transition-colors',
                        isCollapsed && 'xl:hidden'
                      )}
                    >
                      <span className="truncate">{group.label}</span>
                      <ChevronDown
                        className={cn(
                          'h-3.5 w-3.5 transition-transform duration-200',
                          isExpanded ? '' : '-rotate-90'
                        )}
                      />
                    </button>
                  )}
                  {(isExpanded || isCollapsed) && group.items.map((item) => {
                    const isActive = isNavItemActive(item.href);
                    const Icon = item.icon;

                    return (
                      <div key={item.name} className="group/nav relative">
                        <Link
                          href={item.href}
                          onClick={() => setSidebarOpen(false)}
                          className={cn(
                            'flex items-center overflow-hidden px-3 py-2.5 md:py-2 text-sm md:text-sm font-medium rounded-lg transition-colors touch-manipulation',
                            isActive
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                              : 'text-gray-700 hover:bg-gray-100 active:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700 dark:active:bg-gray-600',
                            isCollapsed && 'xl:justify-center xl:px-0 xl:py-2 xl:mx-auto xl:w-10 xl:h-10'
                          )}
                        >
                          <Icon className={cn('mr-3 h-5 w-5 flex-shrink-0', isCollapsed && 'xl:mr-0')} />
                          <span className={cn('truncate', isCollapsed && 'xl:hidden')}>{item.name}</span>
                        </Link>
                        {isCollapsed && (
                          <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white whitespace-nowrap opacity-0 group-hover/nav:opacity-100 transition-opacity hidden xl:block z-[60]">
                            {item.name}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Divider */}
            <div className={cn('py-2', isCollapsed && 'xl:hidden')}>
              <div className="border-t dark:border-gray-700" />
            </div>

            {/* Data Management Group (Export & Backups) — hidden for now */}
            {/* {accessibleDataManagementItems.length > 0 && (
              <div className={cn('mt-1', isCollapsed && 'xl:mt-0 xl:space-y-0.5')}>
                ...
              </div>
            )} */}

            {/* Bottom Navigation */}
            {accessibleBottomNavigation.map((item) => {
              const isActive = isNavItemActive(item.href);
              const Icon = item.icon;

              return (
                <div key={item.name} className={cn('group/nav relative', item.desktopOnly && 'hidden xl:block')}>
                  <Link
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      'flex items-center overflow-hidden px-3 py-2.5 md:py-2 text-sm font-medium rounded-lg transition-colors touch-manipulation',
                      isActive
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                        : 'text-gray-700 hover:bg-gray-100 active:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700 dark:active:bg-gray-600',
                      isCollapsed && 'xl:justify-center xl:px-0 xl:py-2 xl:mx-auto xl:w-10 xl:h-10'
                    )}
                  >
                    <Icon className={cn('mr-3 h-5 w-5 flex-shrink-0', isCollapsed && 'xl:mr-0')} />
                    <span className={cn('truncate', isCollapsed && 'xl:hidden')}>{item.name}</span>
                  </Link>
                  {isCollapsed && (
                    <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white whitespace-nowrap opacity-0 group-hover/nav:opacity-100 transition-opacity hidden xl:block z-[60]">
                      {item.name}
                    </span>
                  )}
                </div>
              );
            })}

            {/* Admin Link (only for admins, desktop only) */}
            {currentUser?.role === 'ADMIN' && (
              <div className="group/nav relative hidden xl:block">
                <Link
                  href="/admin"
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'flex items-center overflow-hidden px-3 py-2.5 md:py-2 text-sm font-medium rounded-lg transition-colors touch-manipulation',
                    pathname.startsWith('/admin')
                      ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200'
                      : 'text-indigo-700 hover:bg-indigo-50 active:bg-indigo-100 dark:text-indigo-400 dark:hover:bg-indigo-900/20',
                    isCollapsed && 'xl:justify-center xl:px-0 xl:py-2 xl:mx-auto xl:w-10 xl:h-10'
                  )}
                >
                  <Shield className={cn('mr-3 h-5 w-5 flex-shrink-0', isCollapsed && 'xl:mr-0')} />
                  <span className={cn('truncate', isCollapsed && 'xl:hidden')}>{t('admin.panel')}</span>
                </Link>
                {isCollapsed && (
                  <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white whitespace-nowrap opacity-0 group-hover/nav:opacity-100 transition-opacity hidden xl:block z-[60]">
                    {t('admin.panel')}
                  </span>
                )}
              </div>
            )}
          </nav>

          {/* User section (desktop only) */}
          <div className={cn(
            'hidden xl:block border-t dark:border-gray-700 p-4',
            isCollapsed && 'xl:p-2'
          )}>
            <Link
              href="/dashboard/settings/account"
              className={cn(
                'flex items-center space-x-3 hover:opacity-80 transition-opacity',
                isCollapsed && 'xl:justify-center xl:space-x-0'
              )}
            >
              <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center flex-shrink-0">
                {session?.user?.image ? (
                  <Image
                    src={session.user.image}
                    alt={session.user.name || 'User'}
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-full"
                  />
                ) : (
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                    {session?.user?.name?.[0] || 'U'}
                  </span>
                )}
              </div>
              <div className={cn('flex-1 min-w-0', isCollapsed && 'xl:hidden')}>
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {session?.user?.name || 'User'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                  {currentUser?.tier?.name || session?.user?.tier || 'starter'} {t('user.tier')}
                </p>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header with quick actions */}
        <div className="xl:hidden flex items-center justify-between h-10 px-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center space-x-2">
            <WealthVaultLogo size={24} className="flex-shrink-0" />
            <span className="text-sm font-bold text-gray-900 dark:text-white">
              {t('logo.title')}
            </span>
          </Link>

          {/* Right side icons */}
          <div className="flex items-center gap-1">
            <InstallPrompt />
            {hasFeatureAccess('/dashboard/settings') && (
              <Link
                href="/dashboard/settings/account"
                className={cn(
                  'p-1.5 rounded-md transition-colors touch-manipulation',
                  pathname.startsWith('/dashboard/settings')
                    ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/50'
                    : 'text-gray-500 hover:text-gray-600 hover:bg-gray-100 active:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-700'
                )}
                title={t('bottomNavigation.settings')}
              >
                <Settings className="h-5 w-5" />
              </Link>
            )}
            {currentUser?.role === 'ADMIN' && (
              <Link
                href="/admin"
                className={cn(
                  'p-1.5 rounded-md transition-colors touch-manipulation',
                  pathname.startsWith('/admin')
                    ? 'text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-900/50'
                    : 'text-indigo-600 hover:bg-indigo-50 active:bg-indigo-100 dark:text-indigo-400 dark:hover:bg-indigo-900/20'
                )}
                title={t('admin.panel')}
              >
                <Shield className="h-5 w-5" />
              </Link>
            )}
          </div>
        </div>

        {/* Sub-page pill bar (mobile only — shows within tab groups) */}
        <SubPagePillBar />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-16 xl:pb-0">
          {children}
          <footer className="px-4 py-6 text-center">
            <a
              href="https://built-by-bohdan.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-500 transition-colors hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
            >
              Built by Bohdan
            </a>
          </footer>
        </main>
      </div>

        {/* Bottom navigation bar (mobile only) */}
        <BottomNavBar />

        {/* AI assistant — floating trigger + right-side slide-over, available on every page */}
        <AgentSheet />

        {/* Debug panel (development only) - Hidden but available for debugging */}
        {/* <SessionDebug /> */}
      </div>
    </>
  );
}
