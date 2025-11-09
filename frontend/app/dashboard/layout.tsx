/**
 * Dashboard layout with sidebar navigation
 */
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import {
  TrendingUp,
  DollarSign,
  PiggyBank,
  LineChart,
  Target,
  CreditCard,
  Receipt,
  LogOut,
  Menu,
  X,
  Wallet,
  Sparkles,
  Settings,
  Shield,
  FileText,
  UserMinus,
  LayoutDashboard
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useGetCurrentUserQuery } from '@/lib/api/authApi';
import { useGetCurrenciesQuery } from '@/lib/api/currenciesApi';
import { WealthVaultLogo } from '@/components/ui/wealth-vault-logo';
// import { SessionDebug } from '@/components/debug/session-debug';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, tier: 'starter' },
  { name: 'Income', href: '/dashboard/income', icon: TrendingUp, tier: 'starter' },
  { name: 'Expenses', href: '/dashboard/expenses', icon: DollarSign, tier: 'starter' },
  { name: 'Budgets', href: '/dashboard/budgets', icon: Wallet, tier: 'starter' },
  { name: 'Savings', href: '/dashboard/savings', icon: PiggyBank, tier: 'starter' },
  { name: 'Portfolio', href: '/dashboard/portfolio', icon: LineChart, tier: 'growth' },
  { name: 'Goals', href: '/dashboard/goals', icon: Target, tier: 'growth' },
  { name: 'Subscriptions', href: '/dashboard/subscriptions', icon: CreditCard, tier: 'starter' },
  { name: 'Installments', href: '/dashboard/installments', icon: Receipt, tier: 'starter' },
  { name: 'Debts', href: '/dashboard/debts', icon: UserMinus, tier: 'wealth' },
  { name: 'Taxes', href: '/dashboard/taxes', icon: FileText, tier: 'wealth' },
];

const bottomNavigation = [
  { name: 'Pricing', href: '/dashboard/pricing', icon: Sparkles, tier: 'starter' },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings, tier: 'starter' },
];

// Tier hierarchy: starter < growth < wealth
const tierHierarchy: Record<string, number> = {
  starter: 1,
  growth: 2,
  wealth: 3,
};

/**
 * Check if user's tier has access to required tier
 * @param userTier - The user's current tier
 * @param requiredTier - The tier required for access
 * @returns true if user has access, false otherwise
 */
function hasAccess(userTier: string | undefined, requiredTier: string): boolean {
  const userLevel = tierHierarchy[userTier || 'starter'] || 1;
  const requiredLevel = tierHierarchy[requiredTier] || 1;
  return userLevel >= requiredLevel;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { data: currentUser } = useGetCurrentUserQuery();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Preload currencies to ensure they're available when editing entries
  useGetCurrenciesQuery({ active_only: true });

  const userTier = currentUser?.tier?.name || 'starter';

  // Filter navigation items based on user's tier
  const accessibleNavigation = navigation.filter((item) =>
    hasAccess(userTier, item.tier)
  );

  const accessibleBottomNavigation = bottomNavigation.filter((item) =>
    hasAccess(userTier, item.tier)
  );

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/login' });
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Mobile/Tablet sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 xl:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 md:w-72 transform bg-white dark:bg-gray-800 transition-transform duration-300 ease-in-out xl:translate-x-0 xl:static xl:w-64 shadow-2xl xl:shadow-none',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-14 md:h-16 items-center justify-between px-4 md:px-6 border-b dark:border-gray-700">
            <Link href="/dashboard" className="flex items-center space-x-3">
              <WealthVaultLogo size={32} className="flex-shrink-0" />
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                Wealth Vault
              </span>
            </Link>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden"
            >
              <X className="h-6 w-6 text-gray-500" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-2 md:px-3 py-3 md:py-4 overflow-y-auto">
            {accessibleNavigation.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'flex items-center px-3 py-2.5 md:py-2 text-sm md:text-sm font-medium rounded-lg transition-colors touch-manipulation',
                    isActive
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                      : 'text-gray-700 hover:bg-gray-100 active:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700 dark:active:bg-gray-600'
                  )}
                >
                  <Icon className="mr-3 h-5 w-5 flex-shrink-0" />
                  {item.name}
                </Link>
              );
            })}

            {/* Divider */}
            <div className="py-2">
              <div className="border-t dark:border-gray-700" />
            </div>

            {/* Bottom Navigation */}
            {accessibleBottomNavigation.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'flex items-center px-3 py-2.5 md:py-2 text-sm font-medium rounded-lg transition-colors touch-manipulation',
                    isActive
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                      : 'text-gray-700 hover:bg-gray-100 active:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700 dark:active:bg-gray-600'
                  )}
                >
                  <Icon className="mr-3 h-5 w-5 flex-shrink-0" />
                  {item.name}
                </Link>
              );
            })}

            {/* Admin Link (only for admins) */}
            {currentUser?.role === 'ADMIN' && (
              <Link
                href="/admin"
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'flex items-center px-3 py-2.5 md:py-2 text-sm font-medium rounded-lg transition-colors touch-manipulation',
                  pathname.startsWith('/admin')
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200'
                    : 'text-indigo-700 hover:bg-indigo-50 active:bg-indigo-100 dark:text-indigo-400 dark:hover:bg-indigo-900/20'
                )}
              >
                <Shield className="mr-3 h-5 w-5 flex-shrink-0" />
                Admin Panel
              </Link>
            )}
          </nav>

          {/* User section */}
          <div className="border-t dark:border-gray-700 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
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
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {session?.user?.name || 'User'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                    {currentUser?.tier?.name || session?.user?.tier || 'starter'} tier
                  </p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                title="Logout"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile/Tablet header */}
        <header className="xl:hidden bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-4 py-2.5 flex items-center justify-between sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-md text-gray-500 hover:text-gray-600 hover:bg-gray-100 active:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-700 touch-manipulation"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
          </button>
          <Link href="/dashboard" className="flex items-center space-x-2">
            <WealthVaultLogo size={28} className="flex-shrink-0" />
            <span className="text-lg font-bold text-gray-900 dark:text-white">
              Wealth Vault
            </span>
          </Link>
          <div className="w-10" /> {/* Spacer for centering */}
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Debug panel (development only) - Hidden but available for debugging */}
      {/* <SessionDebug /> */}
    </div>
  );
}
