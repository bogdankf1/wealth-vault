/**
 * Chart Color Utilities
 * Provides theme-aware colors for charts that work in both light and dark modes
 */

// Get CSS variable value
function getCSSVariable(variable: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
}

// Convert hsl format to hex or rgb for recharts
function hslToHex(h: number, s: number, l: number): string {
  l /= 100;
  const a = s * Math.min(l, 1 - l) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Parse oklch to rgb hex (simplified for chart usage)
function oklchToHex(oklchString: string): string {
  // For simplicity, we'll use the CSS variable directly with hsl() wrapper
  // Recharts can handle CSS custom properties
  return oklchString;
}

/**
 * Get chart color by index (1-12)
 * Returns theme-aware color that works in Recharts
 * Using direct hex colors for compatibility
 */
export function getChartColor(index: number): string {
  // Use direct color values that Recharts can understand
  const colors = [
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // amber
    '#8b5cf6', // purple
    '#ef4444', // red
    '#ec4899', // pink
    '#14b8a6', // teal
    '#6366f1', // indigo
    '#06b6d4', // cyan
    '#f97316', // orange
    '#a855f7', // violet
    '#64748b', // slate
  ];

  const safeIndex = Math.max(1, Math.min(12, index));
  return colors[safeIndex - 1];
}

/**
 * Get all chart colors as an array
 */
export function getChartColors(count: number = 12): string[] {
  return Array.from({ length: Math.min(count, 12) }, (_, i) => getChartColor(i + 1));
}

/**
 * Category-specific color palette for expense categories
 * Using direct color values that work in Recharts
 */
export const EXPENSE_CATEGORY_COLORS: Record<string, string> = {
  'Food & Dining': '#ef4444',      // red
  'Transportation': '#f97316',     // orange
  'Housing': '#8b5cf6',            // purple
  'Utilities': '#06b6d4',          // cyan
  'Healthcare': '#ec4899',         // pink
  'Entertainment': '#10b981',      // green
  'Shopping': '#f59e0b',           // amber
  'Personal Care': '#6366f1',      // indigo
  'Education': '#14b8a6',          // teal
  'Insurance': '#3b82f6',          // blue
  'Debt Payments': '#a855f7',      // violet
  'Other': '#64748b',              // slate
};

/**
 * Get color for expense category with fallback
 */
export function getExpenseCategoryColor(category: string): string {
  return EXPENSE_CATEGORY_COLORS[category] || getChartColor(12);
}

/**
 * Income/Expense specific colors that work in both modes
 * Using direct color values that work in Recharts
 */
export const INCOME_COLOR = '#10b981';   // green
export const EXPENSE_COLOR = '#ef4444';  // red

/**
 * Status colors for budgets (green, amber, red)
 * Using direct color values that work in Recharts
 */
export const BUDGET_STATUS_COLORS = {
  good: '#10b981',      // green
  warning: '#f59e0b',   // amber
  danger: '#ef4444',    // red
};

/**
 * Get grid and axis colors for charts
 */
export function getChartGridColor(): string {
  // Use CSS variable for border color which is theme-aware
  return 'hsl(var(--border))';
}

export function getChartTextColor(): string {
  // Use muted foreground for chart text
  return 'hsl(var(--muted-foreground))';
}
