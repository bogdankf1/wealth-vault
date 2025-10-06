/**
 * Loading State Component
 * Displays loading skeletons for various content types
 */
import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

interface LoadingStateProps {
  variant?: 'card' | 'list' | 'table' | 'form';
  count?: number;
  className?: string;
}

export function LoadingState({ variant = 'card', count = 3, className = '' }: LoadingStateProps) {
  const renderSkeleton = () => {
    switch (variant) {
      case 'card':
        return (
          <div className="space-y-4">
            {Array.from({ length: count }).map((_, i) => (
              <div key={i} className="rounded-lg border p-6">
                <div className="space-y-3">
                  <Skeleton className="h-5 w-1/3" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                  <div className="flex gap-2 pt-2">
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-8 w-20" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        );

      case 'list':
        return (
          <div className="space-y-2">
            {Array.from({ length: count }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border p-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-8 w-16" />
              </div>
            ))}
          </div>
        );

      case 'table':
        return (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            {Array.from({ length: count }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        );

      case 'form':
        return (
          <div className="space-y-4">
            {Array.from({ length: count }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        );

      default:
        return null;
    }
  };

  return <div className={className}>{renderSkeleton()}</div>;
}

// Specific loading components for common patterns
export function LoadingCard() {
  return <LoadingState variant="card" count={1} />;
}

export function LoadingCards({ count = 3 }: { count?: number }) {
  return <LoadingState variant="card" count={count} />;
}

export function LoadingList({ count = 5 }: { count?: number }) {
  return <LoadingState variant="list" count={count} />;
}

export function LoadingTable({ count = 5 }: { count?: number }) {
  return <LoadingState variant="table" count={count} />;
}

export function LoadingForm({ count = 4 }: { count?: number }) {
  return <LoadingState variant="form" count={count} />;
}
