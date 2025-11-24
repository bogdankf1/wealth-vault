/**
 * Income Categories
 * Shared list of income category keys used throughout the application
 * Labels come from translations: income.categories.{key}
 */

export const INCOME_CATEGORY_KEYS = [
  'salary',
  'business',
  'freelance',
  'sideProjects',
  'investments',
  'gifts',
  'refundsReimbursements',
  'rental',
  'other',
] as const;

export type IncomeCategory = typeof INCOME_CATEGORY_KEYS[number];

// Legacy support - maps old category names to new keys
export const INCOME_CATEGORY_NAME_TO_KEY: Record<string, IncomeCategory> = {
  'Salary': 'salary',
  'Business': 'business',
  'Freelance': 'freelance',
  'Side Projects': 'sideProjects',
  'Investments': 'investments',
  'Gifts': 'gifts',
  'Refunds & Reimbursements': 'refundsReimbursements',
  'Rental': 'rental',
  'Other': 'other',
};
