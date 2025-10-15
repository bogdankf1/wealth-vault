"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGetCurrenciesQuery } from "@/lib/api/currenciesApi";
import { Currency } from "@/types/currency";

interface CurrencySelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  size?: "sm" | "default";
  activeOnly?: boolean;
}

export function CurrencySelect({
  value,
  onValueChange,
  disabled = false,
  placeholder = "Select currency",
  className,
  size = "default",
  activeOnly = true,
}: CurrencySelectProps) {
  const { data: currencies, isLoading, error } = useGetCurrenciesQuery({ active_only: activeOnly });

  if (isLoading) {
    return (
      <Select disabled={true}>
        <SelectTrigger className={className} size={size}>
          <SelectValue placeholder="Loading currencies..." />
        </SelectTrigger>
      </Select>
    );
  }

  if (error || !currencies) {
    return (
      <Select disabled={true}>
        <SelectTrigger className={className} size={size}>
          <SelectValue placeholder="Failed to load currencies" />
        </SelectTrigger>
      </Select>
    );
  }

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={className} size={size}>
        <SelectValue placeholder={placeholder}>
          {value && currencies.find((c: Currency) => c.code === value) ? (
            <span className="flex items-center gap-2">
              <span className="font-medium">{currencies.find((c: Currency) => c.code === value)?.symbol}</span>
              <span>{currencies.find((c: Currency) => c.code === value)?.code}</span>
            </span>
          ) : (
            placeholder
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Currencies</SelectLabel>
          {currencies.map((currency: Currency) => (
            <SelectItem key={currency.code} value={currency.code}>
              <span className="flex items-center gap-2">
                <span className="font-medium w-6">{currency.symbol}</span>
                <span className="font-medium">{currency.code}</span>
                <span className="text-muted-foreground">- {currency.name}</span>
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
