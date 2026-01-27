/**
 * Empty State Component
 * Displays a message when no data is available
 */
import React from 'react';
import { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-6 lg:py-12 px-4 text-center ${className}`}
    >
      {Icon && (
        <div className="mb-2 lg:mb-4 rounded-full bg-muted p-2 lg:p-4">
          <Icon className="h-6 w-6 lg:h-8 lg:w-8 text-muted-foreground" />
        </div>
      )}
      <h3 className="mb-1 lg:mb-2 text-sm lg:text-lg font-semibold">{title}</h3>
      {description && (
        <p className="mb-4 lg:mb-6 max-w-md text-xs lg:text-sm text-muted-foreground">{description}</p>
      )}
      {actionLabel && onAction && (
        <Button onClick={onAction} variant="default" size="sm" className="text-xs lg:text-sm">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
