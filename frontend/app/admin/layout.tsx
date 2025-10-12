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
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useGetCurrentUserQuery } from '@/lib/api/authApi';

const navigation = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { name: 'Users', href: '/admin/users', icon: Users },
  { name: 'Tiers', href: '/admin/tiers', icon: Crown },
  { name: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
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
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 transform bg-white dark:bg-gray-800 transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center justify-between px-6 border-b dark:border-gray-700">
            <Link href="/admin" className="flex items-center space-x-2">
              <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                <Shield className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                Admin Panel
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
          <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = pathname === item.href ||
                (item.href !== '/admin' && pathname.startsWith(item.href));
              const Icon = item.icon;

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                  )}
                >
                  <Icon className="mr-3 h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}

            {/* Divider */}
            <div className="py-2">
              <div className="border-t dark:border-gray-700" />
            </div>

            {/* Back to Dashboard */}
            <Link
              href="/dashboard"
              className="flex items-center px-3 py-2 text-sm font-medium rounded-lg text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
            >
              <LayoutDashboard className="mr-3 h-5 w-5" />
              Back to User Dashboard
            </Link>
          </nav>

          {/* User section */}
          <div className="border-t dark:border-gray-700 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
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
                <div className="flex-1 min-w-0">
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
