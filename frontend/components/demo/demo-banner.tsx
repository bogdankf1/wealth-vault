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
    <div className="flex items-center justify-between gap-3 border-b border-amber-500/60 bg-amber-300 px-4 py-2 text-sm font-medium text-amber-950 dark:border-amber-400/30 dark:bg-amber-500 dark:text-amber-950">
      <span className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 shrink-0" />
        <span>Demo mode — your changes are private and reset in 24h</span>
      </span>
      <button
        onClick={() => signOut({ callbackUrl: '/login' })}
        className="shrink-0 rounded-md bg-amber-950/10 px-2.5 py-1 text-xs font-semibold text-amber-950 transition-colors hover:bg-amber-950/20"
      >
        Exit demo
      </button>
    </div>
  );
}
