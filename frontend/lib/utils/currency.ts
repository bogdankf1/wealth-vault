/**
 * Currency formatting utilities
 */

/**
 * Currency symbol mapping for common currencies
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CNY: '¥',
  KRW: '₩',
  INR: '₹',
  RUB: '₽',
  BRL: 'R$',
  CAD: 'C$',
  AUD: 'A$',
  CHF: 'CHF',
  SEK: 'kr',
  NOK: 'kr',
  DKK: 'kr',
  PLN: 'zł',
  UAH: '₴',
  TRY: '₺',
  MXN: '$',
  ZAR: 'R',
  SGD: 'S$',
  HKD: 'HK$',
  NZD: 'NZ$',
  THB: '฿',
  PHP: '₱',
  IDR: 'Rp',
  MYR: 'RM',
  VND: '₫',
  CZK: 'Kč',
  HUF: 'Ft',
  ILS: '₪',
  AED: 'د.إ',
  SAR: '﷼',
  COP: '$',
  CLP: '$',
  ARS: '$',
  PEN: 'S/',
  TWD: 'NT$',
  BTC: '₿',
  ETH: 'Ξ',
};

/**
 * Get currency symbol for a given currency code
 */
export function getCurrencySymbol(currencyCode?: string): string {
  if (!currencyCode) return '$';
  return CURRENCY_SYMBOLS[currencyCode.toUpperCase()] || currencyCode;
}

/**
 * Format a number as currency with the given currency code
 * @param amount - The amount to format
 * @param currency - The currency code (e.g., 'USD', 'EUR')
 * @param options - Additional formatting options
 */
export function formatCurrency(
  amount: number,
  currency?: string,
  options?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    showSymbol?: boolean;
    useGrouping?: boolean;
  }
): string {
  const {
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
    showSymbol = true,
    useGrouping = true,
  } = options || {};

  const symbol = showSymbol ? getCurrencySymbol(currency) : '';

  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits,
    maximumFractionDigits,
    useGrouping,
  }).format(Math.abs(amount));

  const prefix = amount < 0 ? '-' : '';
  return `${prefix}${symbol}${formatted}`;
}

/**
 * Format a number as compact currency (e.g., $1.2K, $3.4M)
 */
export function formatCompactCurrency(
  amount: number,
  currency?: string
): string {
  const symbol = getCurrencySymbol(currency);

  const absAmount = Math.abs(amount);
  const prefix = amount < 0 ? '-' : '';

  if (absAmount >= 1_000_000_000) {
    return `${prefix}${symbol}${(absAmount / 1_000_000_000).toFixed(1)}B`;
  }
  if (absAmount >= 1_000_000) {
    return `${prefix}${symbol}${(absAmount / 1_000_000).toFixed(1)}M`;
  }
  if (absAmount >= 1_000) {
    return `${prefix}${symbol}${(absAmount / 1_000).toFixed(1)}K`;
  }

  return formatCurrency(amount, currency);
}

/**
 * Parse a currency string back to a number
 */
export function parseCurrency(value: string): number {
  // Remove currency symbols, spaces, and thousands separators
  const cleaned = value
    .replace(/[^\d.,-]/g, '')
    .replace(/,/g, '');

  return parseFloat(cleaned) || 0;
}
