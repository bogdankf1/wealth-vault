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
 * Returns theme-aware color that works in both light and dark modes
 */
export function getChartColor(index: number): string {
  const colorVar = `--chart-${Math.max(1, Math.min(12, index))}`;
  const value = getCSSVariable(colorVar);

  if (!value) {
    // Fallback colors if CSS variables aren't available
    const fallbacks = [
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
    return fallbacks[(index - 1) % fallbacks.length];
  }

  return `oklch(${value})`;
}

/**
 * Get all chart colors as an array
 */
export function getChartColors(count: number = 12): string[] {
  return Array.from({ length: Math.min(count, 12) }, (_, i) => getChartColor(i + 1));
}

/**
 * Category-specific color palette for expense categories
 * Uses chart colors but with semantic names
 */
export const EXPENSE_CATEGORY_COLORS: Record<string, string> = {
  'Food & Dining': 'oklch(var(--chart-5))',      // red/orange
  'Transportation': 'oklch(var(--chart-10))',    // amber
  'Housing': 'oklch(var(--chart-4))',            // purple
  'Utilities': 'oklch(var(--chart-9))',          // cyan
  'Healthcare': 'oklch(var(--chart-6))',         // pink
  'Entertainment': 'oklch(var(--chart-2))',      // green
  'Shopping': 'oklch(var(--chart-3))',           // yellow/lime
  'Personal Care': 'oklch(var(--chart-8))',      // indigo
  'Education': 'oklch(var(--chart-7))',          // teal
  'Insurance': 'oklch(var(--chart-1))',          // blue
  'Debt Payments': 'oklch(var(--chart-11))',     // violet
  'Other': 'oklch(var(--chart-12))',             // slate
};

/**
 * Get color for expense category with fallback
 */
export function getExpenseCategoryColor(category: string): string {
  return EXPENSE_CATEGORY_COLORS[category] || getChartColor(12);
}

/**
 * Income/Expense specific colors that work in both modes
 */
export const INCOME_COLOR = 'oklch(var(--chart-2))';  // green
export const EXPENSE_COLOR = 'oklch(var(--chart-5))'; // red

/**
 * Status colors for budgets (green, amber, red)
 */
export const BUDGET_STATUS_COLORS = {
  good: 'oklch(var(--chart-2))',      // green
  warning: 'oklch(var(--chart-10))',  // amber
  danger: 'oklch(var(--chart-5))',    // red
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
