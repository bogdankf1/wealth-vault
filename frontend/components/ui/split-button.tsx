'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface SplitButtonOption {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SplitButtonProps {
  /** Primary action label */
  primaryLabel: string;
  /** Primary action click handler */
  onPrimaryClick: () => void;
  /** Primary action icon (optional) */
  primaryIcon?: React.ReactNode;
  /** Dropdown menu options */
  options: SplitButtonOption[];
  /** Button variant */
  variant?: ButtonProps['variant'];
  /** Button size */
  size?: ButtonProps['size'];
  /** Disabled state */
  disabled?: boolean;
  /** Additional className for the container */
  className?: string;
  /** Full width mode - useful for mobile */
  fullWidth?: boolean;
}

/**
 * SplitButton component - A button with a primary action and a dropdown for secondary actions.
 *
 * The primary action is shown as the main button, while secondary actions are accessible
 * via a dropdown menu triggered by the chevron button on the right.
 */
export function SplitButton({
  primaryLabel,
  onPrimaryClick,
  primaryIcon,
  options,
  variant = 'default',
  size = 'default',
  disabled = false,
  className,
  fullWidth = false,
}: SplitButtonProps) {
  return (
    <div className={cn('inline-flex rounded-md', fullWidth && 'w-full', className)}>
      {/* Primary action button */}
      <Button
        variant={variant}
        size={size}
        disabled={disabled}
        onClick={onPrimaryClick}
        className="rounded-r-none border-r-0 flex-1"
      >
        {primaryIcon && <span className="mr-2">{primaryIcon}</span>}
        <span className="truncate">{primaryLabel}</span>
      </Button>

      {/* Dropdown trigger */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={variant}
            size={size}
            disabled={disabled}
            className="rounded-l-none px-2 border-l border-l-primary-foreground/20"
          >
            <ChevronDown className="h-4 w-4" />
            <span className="sr-only">More options</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[160px]">
          {options.map((option, index) => (
            <DropdownMenuItem
              key={index}
              onClick={option.onClick}
              disabled={option.disabled}
              className="cursor-pointer"
            >
              {option.icon && <span className="mr-2">{option.icon}</span>}
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
