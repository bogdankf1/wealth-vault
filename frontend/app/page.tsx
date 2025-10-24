'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGetCurrentUserQuery } from '@/lib/api/authApi';

export default function Home() {
  const router = useRouter();
  const { data: currentUser, isLoading, error } = useGetCurrentUserQuery();

  useEffect(() => {
    if (!isLoading) {
      if (currentUser) {
        // User is logged in, redirect to dashboard
        router.push('/dashboard');
      } else {
        // User is not logged in, redirect to login
        router.push('/login');
      }
    }
  }, [currentUser, isLoading, router]);

  // Show loading state while checking authentication
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100 mx-auto"></div>
        <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    </div>
  );
}
