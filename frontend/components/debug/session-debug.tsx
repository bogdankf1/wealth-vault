/**
 * Debug component to check session and token
 */
'use client';

import { useSession } from 'next-auth/react';

export function SessionDebug() {
  const { data: session, status } = useSession();

  if (process.env.NODE_ENV === 'production') return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 p-4 bg-black/90 text-white text-xs rounded-lg max-w-md">
      <div className="font-bold mb-2">Session Debug</div>
      <div>Status: {status}</div>
      <div>Has Session: {session ? 'Yes' : 'No'}</div>
      <div>Has Access Token: {session?.accessToken ? 'Yes' : 'No'}</div>
      {session?.accessToken && (
        <div className="mt-2 break-all">
          Token: {session.accessToken.substring(0, 50)}...
        </div>
      )}
      <div className="mt-2">
        <pre className="text-xs overflow-auto max-h-40">
          {JSON.stringify(session, null, 2)}
        </pre>
      </div>
    </div>
  );
}
