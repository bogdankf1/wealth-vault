"use client";

import * as React from "react";
import { useGetCurrencyQuery, useConvertCurrencyMutation } from "@/lib/api/currenciesApi";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface CurrencyDisplayProps {
  amount: number | string;
  currency: string;
  displayCurrency?: string; // Optional: display in different currency
  showSymbol?: boolean;
  showCode?: boolean;
  className?: string;
  showConversionTooltip?: boolean;
  decimals?: number;
}

export function CurrencyDisplay({
  amount,
  currency,
  displayCurrency,
  showSymbol = true,
  showCode = false,
  className,
  showConversionTooltip = true,
  decimals,
}: CurrencyDisplayProps) {
  const { data: currencyData } = useGetCurrencyQuery(displayCurrency || currency);
  const [convertedAmount, setConvertedAmount] = React.useState<string | null>(null);
  const [convertCurrency] = useConvertCurrencyMutation();
  const [isConverting, setIsConverting] = React.useState(false);

  // Convert if display currency is different
  React.useEffect(() => {
    if (displayCurrency && displayCurrency !== currency) {
      setIsConverting(true);
      convertCurrency({
        amount: typeof amount === "string" ? parseFloat(amount) : amount,
        from_currency: currency,
        to_currency: displayCurrency,
      })
        .unwrap()
        .then((result) => {
          setConvertedAmount(result.converted_amount);
          setIsConverting(false);
        })
        .catch((error) => {
          console.error('Currency conversion failed:', error);
          setConvertedAmount(null);
          setIsConverting(false);
        });
    } else {
      // Reset converted amount if currencies are the same or no displayCurrency
      setConvertedAmount(null);
      setIsConverting(false);
    }
  }, [amount, currency, displayCurrency, convertCurrency]);

  const displayAmount = convertedAmount || amount;
  const numericAmount = typeof displayAmount === "string" ? parseFloat(displayAmount) : displayAmount;

  // Format the amount
  const decimalPlaces = decimals !== undefined ? decimals : (currencyData?.decimal_places || 2);
  const formattedAmount = numericAmount.toLocaleString(undefined, {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  });

  const displayContent = (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {showSymbol && currencyData?.symbol && (
        <span className="font-medium">{currencyData.symbol}</span>
      )}
      <span>{formattedAmount}</span>
      {showCode && (
        <span className="text-muted-foreground text-xs">{displayCurrency || currency}</span>
      )}
    </span>
  );

  // Show tooltip if converted
  if (showConversionTooltip && displayCurrency && displayCurrency !== currency && convertedAmount) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help border-b border-dashed border-muted-foreground/30">
              {displayContent}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-sm">
              Original: {amount} {currency}
            </p>
            <p className="text-xs text-muted-foreground">
              Converted to {displayCurrency}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return displayContent;
}
