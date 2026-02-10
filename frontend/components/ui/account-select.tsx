/**
 * Reusable Account Selection Component
 * Standardized dropdown for selecting savings accounts across all forms
 */
'use client';

import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/utils/currency';

export interface AccountOption {
  id: string;
  name: string;
  current_balance: number | string;
  currency: string;
}

interface AccountSelectProps {
  /** Current selected account ID (null for none) */
  value: string | null | undefined;
  /** Callback when selection changes */
  onChange: (accountId: string | null) => void;
  /** List of available accounts */
  accounts: AccountOption[] | undefined;
  /** Label for the field */
  label: string;
  /** Placeholder text when no selection */
  placeholder?: string;
  /** Text for the "no account" option */
  noAccountLabel?: string;
  /** Help text shown below the select */
  helpText?: string;
  /** Error message to display */
  error?: string;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Optional className for the container */
  className?: string;
}

export function AccountSelect({
  value,
  onChange,
  accounts,
  label,
  placeholder = 'Select an account',
  noAccountLabel = 'No account',
  helpText,
  error,
  disabled = false,
  className = '',
}: AccountSelectProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      <Label>{label}</Label>
      <Select
        value={value || 'none'}
        onValueChange={(newValue) => {
          const accountId = newValue === 'none' ? null : newValue;
          onChange(accountId);
        }}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{noAccountLabel}</SelectItem>
          {accounts?.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              <div className="flex items-center w-full gap-2 overflow-hidden">
                <span className="truncate">{account.name}</span>
                <span className="text-muted-foreground text-xs whitespace-nowrap flex-shrink-0">
                  {formatCurrency(
                    typeof account.current_balance === 'string'
                      ? parseFloat(account.current_balance)
                      : account.current_balance || 0,
                    account.currency
                  )}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {helpText && (
        <p className="text-xs text-muted-foreground">{helpText}</p>
      )}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
