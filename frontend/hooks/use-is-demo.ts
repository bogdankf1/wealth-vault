'use client';

import { useSession } from 'next-auth/react';

/** True when the current session is a demo account. */
export function useIsDemo(): boolean {
  const { data: session } = useSession();
  return session?.user?.isDemo === true;
}
