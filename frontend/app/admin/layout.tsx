/**
 * Admin panel layout with sidebar navigation
 */
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import {
  LayoutDashboard,
  Users,
  Crown,
  BarChart3,
  LogOut,
  Menu,
  X,
  Shield,
  DollarSign,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useSidebarSwipe } from '@/hooks/use-sidebar-swipe';
import { useSidebarCollapse } from '@/hooks/use-sidebar-collapse';
import { useGetCurrentUserQuery } from '@/lib/api/authApi';

const navigation = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { name: 'Users', href: '/admin/users', icon: Users },
  { name: 'Tiers', href: '/admin/tiers', icon: Crown },
  { name: 'Currencies', href: '/admin/currencies', icon: DollarSign },
  { name: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
  { name: 'Support Center', href: '/admin/support', icon: MessageSquare },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const { data: currentUser } = useGetCurrentUserQuery();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { sidebarRef, backdropRef, isDragging } = useSidebarSwipe({
    isOpen: sidebarOpen,
    setIsOpen: setSidebarOpen,
    sidebarWidth: 256,
    desktopQuery: '(min-width: 1024px)',
  });
  const { isCollapsed, toggleCollapsed } = useSidebarCollapse();

  // Check if user is admin
  useEffect(() => {
    if (status === 'loading') return;

    if (!session) {
      router.push('/login');
      return;
    }

    if (currentUser && currentUser.role !== 'ADMIN') {
      router.push('/dashboard');
    }
  }, [session, status, currentUser, router]);

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/login' });
  };

  // Show loading while checking auth
  if (status === 'loading' || !currentUser) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  // Redirect if not admin
  if (currentUser.role !== 'ADMIN') {
    return null;
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Mobile sidebar backdrop */}
      <div
        ref={backdropRef}
        className={cn(
          'fixed inset-0 z-40 bg-black lg:hidden transition-opacity duration-300',
          sidebarOpen && !isDragging ? 'opacity-75 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <div
        ref={sidebarRef}
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 transform bg-white dark:bg-gray-800 lg:translate-x-0 lg:static',
          isCollapsed ? 'lg:w-16' : 'lg:w-64',
          !isDragging ? 'transition-[transform,width] duration-300 ease-in-out' : 'transition-[width] duration-300 ease-in-out',
          !isDragging && (sidebarOpen ? 'translate-x-0' : '-translate-x-full')
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className={cn(
            'flex h-16 items-center justify-between px-6 border-b dark:border-gray-700',
            isCollapsed && 'lg:justify-center lg:px-0'
          )}>
            <Link href="/admin" className={cn(
              'flex items-center space-x-2',
              isCollapsed && 'lg:hidden'
            )}>
              <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
                <Shield className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                Admin Panel
              </span>
            </Link>
            <button
              onClick={toggleCollapsed}
              className="hidden lg:flex p-1.5 rounded-md text-gray-500 hover:text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-700"
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? (
                <PanelLeftOpen className="h-5 w-5" />
              ) : (
                <PanelLeftClose className="h-5 w-5" />
              )}
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden"
            >
              <X className="h-6 w-6 text-gray-500" />
            </button>
          </div>

          {/* Navigation */}
          <nav className={cn(
            'flex-1 space-y-1 px-3 py-4 overflow-y-auto',
            isCollapsed && 'lg:px-1 lg:space-y-0.5 lg:overflow-visible'
          )}>
            {navigation.map((item) => {
              const isActive = pathname === item.href ||
                (item.href !== '/admin' && pathname.startsWith(item.href));
              const Icon = item.icon;

              return (
                <div key={item.name} className="group/nav relative">
                  <Link
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      'flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                      isActive
                        ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700',
                      isCollapsed && 'lg:justify-center lg:px-0 lg:py-2 lg:mx-auto lg:w-10 lg:h-10'
                    )}
                  >
                    <Icon className={cn('mr-3 h-5 w-5', isCollapsed && 'lg:mr-0')} />
                    <span className={cn(isCollapsed && 'lg:hidden')}>{item.name}</span>
                  </Link>
                  {isCollapsed && (
                    <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white whitespace-nowrap opacity-0 group-hover/nav:opacity-100 transition-opacity hidden lg:block z-[60]">
                      {item.name}
                    </span>
                  )}
                </div>
              );
            })}

            {/* Divider */}
            <div className={cn('py-2', isCollapsed && 'lg:hidden')}>
              <div className="border-t dark:border-gray-700" />
            </div>

            {/* Back to Dashboard */}
            <div className="group/nav relative">
              <Link
                href="/dashboard"
                className={cn(
                  'flex items-center px-3 py-2 text-sm font-medium rounded-lg text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors',
                  isCollapsed && 'lg:justify-center lg:px-0 lg:py-2 lg:mx-auto lg:w-10 lg:h-10'
                )}
              >
                <LayoutDashboard className={cn('mr-3 h-5 w-5', isCollapsed && 'lg:mr-0')} />
                <span className={cn(isCollapsed && 'lg:hidden')}>Back to User Dashboard</span>
              </Link>
              {isCollapsed && (
                <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white whitespace-nowrap opacity-0 group-hover/nav:opacity-100 transition-opacity hidden lg:block z-[60]">
                  Back to User Dashboard
                </span>
              )}
            </div>
          </nav>

          {/* User section */}
          <div className={cn(
            'border-t dark:border-gray-700 p-4',
            isCollapsed && 'lg:p-2'
          )}>
            <div className={cn(
              'flex items-center justify-between',
              isCollapsed && 'lg:flex-col lg:items-center lg:gap-2'
            )}>
              <div className={cn(
                'flex items-center space-x-3',
                isCollapsed && 'lg:space-x-0'
              )}>
                <div className="h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center flex-shrink-0">
                  {session?.user?.image ? (
                    <Image
                      src={session.user.image}
                      alt={session.user.name || 'Admin'}
                      width={40}
                      height={40}
                      className="h-10 w-10 rounded-full"
                    />
                  ) : (
                    <Shield className="h-5 w-5 text-indigo-600 dark:text-indigo-300" />
                  )}
                </div>
                <div className={cn('flex-1 min-w-0', isCollapsed && 'lg:hidden')}>
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {session?.user?.name || 'Admin'}
                  </p>
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                    Administrator
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
        {/* Mobile header */}
        <header className="lg:hidden bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-4 py-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-md text-gray-500 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300"
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="flex items-center space-x-2">
              <Shield className="h-5 w-5 text-indigo-600" />
              <span className="text-sm font-medium text-indigo-600">Admin</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
