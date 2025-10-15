/**
 * Currency-related TypeScript types
 */

export interface Currency {
  id: string;
  code: string; // ISO 4217 currency code (e.g., "USD", "EUR", "UAH")
  name: string; // Full currency name (e.g., "US Dollar")
  symbol: string; // Currency symbol (e.g., "$", "€", "₴")
  decimal_places: number; // Number of decimal places
  is_active: boolean;
  created_by_admin: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExchangeRate {
  id: string;
  from_currency: string;
  to_currency: string;
  rate: string; // Decimal as string
  source: string;
  fetched_at: string;
  is_manual_override: boolean;
  overridden_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversionRequest {
  amount: number | string;
  from_currency: string;
  to_currency: string;
}

export interface ConversionResponse {
  original_amount: string;
  original_currency: string;
  converted_amount: string;
  target_currency: string;
  exchange_rate: string;
  fetched_at: string;
}

export interface CurrencyAmount {
  amount: number | string;
  currency: string;
  display_amount?: number | string;
  display_currency?: string;
}

export interface CurrencyCreateRequest {
  code: string;
  name: string;
  symbol: string;
  decimal_places?: number;
  is_active?: boolean;
}

export interface CurrencyUpdateRequest {
  name?: string;
  symbol?: string;
  decimal_places?: number;
  is_active?: boolean;
}

export interface RefreshRatesResponse {
  success: number;
  failed: number;
  message: string;
}
