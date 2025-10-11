/**
 * Expense Categories
 * Shared list of expense categories used throughout the application
 */

export const EXPENSE_CATEGORIES = [
  'Food & Dining',
  'Transportation',
  'Housing',
  'Utilities',
  'Healthcare',
  'Entertainment',
  'Shopping',
  'Personal Care',
  'Education',
  'Insurance',
  'Debt Payments',
  'Other',
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export const CATEGORY_OPTIONS = EXPENSE_CATEGORIES.map((category) => ({
  value: category,
  label: category,
}));
