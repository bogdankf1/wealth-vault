'use client';

import { useSession, signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, LogOut } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * AuthErrorHandler Component
 * Monitors authentication status and displays errors when backend authentication fails
 */
export function AuthErrorHandler() {
  const { data: session, status } = useSession();
  const [dismissed, setDismissed] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // Reset dismissed state when session changes
  useEffect(() => {
    setDismissed(false);
  }, [session?.error]);

  // Don't show anything while loading or if dismissed
  if (status === 'loading' || dismissed) {
    return null;
  }

  // Check if there's an authentication error
  const authError = session?.error as { type: string; message: string; status: number } | undefined;

  if (!authError) {
    return null;
  }

  const handleRetry = async () => {
    setIsRetrying(true);
    // Force re-authentication by signing out and back in
    await signOut({ redirect: false });
    window.location.href = '/login';
  };

  const handleDismiss = () => {
    setDismissed(true);
  };

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/login' });
  };

  return (
    <div className="fixed top-4 right-4 z-50 w-full max-w-md">
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <Alert variant="destructive">
            <AlertTriangle className="h-5 w-5" />
            <AlertTitle className="text-lg font-semibold">
              {authError.type === 'NetworkError'
                ? 'Connection Error'
                : 'Authentication Error'}
            </AlertTitle>
            <AlertDescription className="mt-2 space-y-4">
              <p className="text-sm">{authError.message}</p>

              {authError.type === 'NetworkError' ? (
                <p className="text-sm text-muted-foreground">
                  The application cannot connect to the server. Some features may not work correctly.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Your session may be invalid or expired. Please try signing in again.
                </p>
              )}

              <div className="flex flex-col sm:flex-row gap-2 mt-4">
                <Button
                  onClick={handleRetry}
                  disabled={isRetrying}
                  size="sm"
                  variant="default"
                  className="flex-1"
                >
                  {isRetrying ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Retrying...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Retry
                    </>
                  )}
                </Button>

                <Button
                  onClick={handleSignOut}
                  size="sm"
                  variant="outline"
                  className="flex-1"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </Button>

                <Button
                  onClick={handleDismiss}
                  size="sm"
                  variant="ghost"
                >
                  Dismiss
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
