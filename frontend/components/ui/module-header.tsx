/**
 * Module Header Component
 * Reusable header for module pages with title and primary action
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Plus, LucideIcon } from 'lucide-react';

interface ModuleHeaderProps {
  title: string;
  description?: string;
  actionLabel?: string;
  actionIcon?: LucideIcon;
  onAction?: () => void;
  children?: React.ReactNode;
}

export function ModuleHeader({
  title,
  description,
  actionLabel = 'Add New',
  actionIcon: ActionIcon = Plus,
  onAction,
  children,
}: ModuleHeaderProps) {
  return (
    <div className="flex flex-col gap-3 md:gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-xs md:text-sm text-gray-500 dark:text-gray-400">
            {description}
          </p>
        )}
      </div>
      <div className="flex flex-col sm:flex-row gap-2 md:gap-3 flex-shrink-0">
        {children}
        {onAction && (
          <Button onClick={onAction} size="default" className="w-full sm:w-auto">
            <ActionIcon className="mr-2 h-4 w-4" />
            <span className="truncate">{actionLabel}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
