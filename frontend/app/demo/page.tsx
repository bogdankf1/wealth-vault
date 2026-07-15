/**
 * Public demo entry. Auto-provisions a per-visitor demo user and lands on the dashboard.
 * Lives outside /dashboard so the auth middleware does not gate it.
 */
'use client';

import { useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { Loader2 } from 'lucide-react';

export default function DemoPage() {
  useEffect(() => {
    signIn('demo', { callbackUrl: '/dashboard' });
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <Loader2 className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400" />
      <p className="text-sm text-gray-600 dark:text-gray-400">Setting up your demo…</p>
    </div>
  );
}
