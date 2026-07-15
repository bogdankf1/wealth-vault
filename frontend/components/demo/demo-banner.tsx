/**
 * Slim banner shown above the dashboard chrome while in demo mode.
 */
'use client';

import { useSession, signOut } from 'next-auth/react';
import { FlaskConical } from 'lucide-react';

export function DemoBanner() {
  const { data: session } = useSession();
  if (!session?.user?.isDemo) return null;

  return (
    <div className="flex items-center justify-between gap-2 border-b border-amber-300 bg-amber-100 px-3 py-1.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
      <span className="flex items-center gap-1.5">
        <FlaskConical className="h-3.5 w-3.5" />
        Demo mode — your changes are private and reset in 24h
      </span>
      <button
        onClick={() => signOut({ callbackUrl: '/login' })}
        className="font-medium underline hover:no-underline"
      >
        Exit demo
      </button>
    </div>
  );
}
