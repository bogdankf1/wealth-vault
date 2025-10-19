"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencySelect } from "./currency-select";
import { useGetCurrencyQuery } from "@/lib/api/currenciesApi";
import { cn } from "@/lib/utils";

interface CurrencyInputProps {
  amount?: number | string;
  currency?: string;
  onAmountChange?: (amount: string) => void;
  onCurrencyChange?: (currency: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  showCurrencySelect?: boolean;
  error?: string;
}

export function CurrencyInput({
  amount = "",
  currency = "USD",
  onAmountChange,
  onCurrencyChange,
  label,
  placeholder = "0.00",
  disabled = false,
  required = false,
  className,
  showCurrencySelect = true,
  error,
}: CurrencyInputProps) {
  const { data: currencyData } = useGetCurrencyQuery(currency);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // Allow only numbers and decimal point with max 2 decimal places
    // Matches: "", "1", "1.", "1.5", "1.50", but not "1.567"
    if (value === "" || /^\d*\.?\d{0,2}$/.test(value)) {
      onAmountChange?.(value);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <Label>
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
      )}
      <div className="flex gap-2">
        <div className="relative flex-1">
          {currencyData?.symbol && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium pointer-events-none">
              {currencyData.symbol}
            </span>
          )}
          <Input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={handleAmountChange}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            className={cn(
              currencyData?.symbol && "pl-8",
              error && "border-destructive focus-visible:ring-destructive"
            )}
            aria-invalid={!!error}
          />
        </div>
        {showCurrencySelect && (
          <CurrencySelect
            value={currency}
            onValueChange={onCurrencyChange}
            disabled={disabled}
            className="w-[140px]"
          />
        )}
      </div>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
