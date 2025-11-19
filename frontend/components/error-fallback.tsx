'use client';

import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface ErrorFallbackProps {
  error?: Error;
  errorInfo?: React.ErrorInfo;
  resetError?: () => void;
}

export function ErrorFallback({ error, errorInfo, resetError }: ErrorFallbackProps) {
  const router = useRouter();
  const isDevelopment = process.env.NODE_ENV === 'development';

  const handleGoHome = () => {
    if (resetError) {
      resetError();
    }
    router.push('/dashboard');
  };

  const handleReload = () => {
    if (resetError) {
      resetError();
    }
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="max-w-2xl w-full">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-destructive/10 rounded-full">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <CardTitle className="text-2xl">Something went wrong</CardTitle>
              <CardDescription>
                We apologize for the inconvenience. An unexpected error has occurred.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isDevelopment && error && (
            <div className="space-y-2">
              <div className="p-4 bg-muted rounded-lg">
                <h3 className="font-semibold text-sm mb-2">Error Details (Development Only):</h3>
                <p className="text-sm font-mono text-destructive break-all">
                  {error.message}
                </p>
              </div>

              {error.stack && (
                <details className="p-4 bg-muted rounded-lg">
                  <summary className="cursor-pointer text-sm font-semibold mb-2">
                    Stack Trace
                  </summary>
                  <pre className="text-xs overflow-auto mt-2 text-muted-foreground">
                    {error.stack}
                  </pre>
                </details>
              )}

              {errorInfo?.componentStack && (
                <details className="p-4 bg-muted rounded-lg">
                  <summary className="cursor-pointer text-sm font-semibold mb-2">
                    Component Stack
                  </summary>
                  <pre className="text-xs overflow-auto mt-2 text-muted-foreground">
                    {errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>
          )}

          <div className="bg-muted/50 rounded-lg p-4">
            <h3 className="font-semibold text-sm mb-2">What can you do?</h3>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Try refreshing the page</li>
              <li>Go back to the dashboard</li>
              <li>Clear your browser cache</li>
              <li>
                <Link href="/dashboard/help" className="text-primary hover:underline">
                  Contact support
                </Link>{' '}
                if the problem persists
              </li>
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button onClick={handleReload} className="flex-1" variant="default">
              <RefreshCw className="mr-2 h-4 w-4" />
              Reload Page
            </Button>
            <Button onClick={handleGoHome} className="flex-1" variant="outline">
              <Home className="mr-2 h-4 w-4" />
              Go to Dashboard
            </Button>
          </div>

          {!isDevelopment && (
            <p className="text-xs text-center text-muted-foreground">
              Error ID: {Math.random().toString(36).substring(2, 15)}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
