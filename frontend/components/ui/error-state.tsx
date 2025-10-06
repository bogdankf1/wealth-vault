/**
 * Error State Component
 * Displays error messages with retry functionality
 */
import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
  variant?: 'default' | 'destructive';
}

export function ErrorState({
  title = 'Error',
  message,
  onRetry,
  className = '',
  variant = 'destructive',
}: ErrorStateProps) {
  return (
    <div className={`py-8 ${className}`}>
      <Alert variant={variant}>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription className="mt-2">
          <p>{message}</p>
          {onRetry && (
            <Button
              onClick={onRetry}
              variant="outline"
              size="sm"
              className="mt-4"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          )}
        </AlertDescription>
      </Alert>
    </div>
  );
}

// Specific error for API errors
export interface ApiError {
  error?: string;
  message?: string;
  details?: Record<string, string | number | boolean>;
  status_code?: number;
}

interface ApiErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}

export function ApiErrorState({ error, onRetry, className }: ApiErrorStateProps) {
  // Extract error message from various error formats
  let errorMessage = 'An unexpected error occurred. Please try again.';
  let errorTitle = 'Error';

  if (error) {
    if (typeof error === 'string') {
      errorMessage = error;
    } else if (typeof error === 'object' && error !== null && 'data' in error && error.data) {
      const data = error.data as ApiError;
      errorMessage = data.error || data.message || errorMessage;
      if (data.status_code === 403) {
        errorTitle = 'Access Denied';
        errorMessage = 'You do not have permission to perform this action.';
      } else if (data.status_code === 404) {
        errorTitle = 'Not Found';
        errorMessage = 'The requested resource could not be found.';
      } else if (data.status_code === 429) {
        errorTitle = 'Rate Limit Exceeded';
        errorMessage = 'Too many requests. Please try again later.';
      } else if (data.status_code && data.status_code >= 500) {
        errorTitle = 'Server Error';
        errorMessage = 'A server error occurred. Please try again later.';
      }
    } else if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
      errorMessage = error.message;
    }
  }

  return (
    <ErrorState
      title={errorTitle}
      message={errorMessage}
      onRetry={onRetry}
      className={className}
    />
  );
}
