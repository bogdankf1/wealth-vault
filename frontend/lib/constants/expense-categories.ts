/**
 * Expense Categories
 * Shared list of expense categories used throughout the application
 */

export const EXPENSE_CATEGORIES = [
  'Groceries',
  'Dining Out / Delivery',
  'Clothing',
  'Gifts',
  'Transportation',
  'Personal Care',
  'Healthcare',
  'Luxury & Premium Items',
  'Postal & Shipping',
  'Miscellaneous',
  'Housing',
  'Education & Learning',
  'Travel & Vacations',
  'Entertainment',
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export const CATEGORY_OPTIONS = EXPENSE_CATEGORIES.map((category) => ({
  value: category,
  label: category,
}));
