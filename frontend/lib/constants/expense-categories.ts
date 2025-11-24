/**
 * Expense Categories
 * Shared list of expense category keys used throughout the application
 * Labels come from translations: expenses.categories.{key}
 */

export const EXPENSE_CATEGORY_KEYS = [
  'groceries',
  'diningOut',
  'clothing',
  'gifts',
  'transportation',
  'personalCare',
  'healthcare',
  'luxuryPremium',
  'postalShipping',
  'miscellaneous',
  'housing',
  'educationLearning',
  'travelVacations',
  'entertainment',
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORY_KEYS[number];

// Legacy support - maps old category names to new keys
export const CATEGORY_NAME_TO_KEY: Record<string, ExpenseCategory> = {
  'Groceries': 'groceries',
  'Dining Out / Delivery': 'diningOut',
  'Clothing': 'clothing',
  'Gifts': 'gifts',
  'Transportation': 'transportation',
  'Personal Care': 'personalCare',
  'Healthcare': 'healthcare',
  'Luxury & Premium Items': 'luxuryPremium',
  'Postal & Shipping': 'postalShipping',
  'Miscellaneous': 'miscellaneous',
  'Housing': 'housing',
  'Education & Learning': 'educationLearning',
  'Travel & Vacations': 'travelVacations',
  'Entertainment': 'entertainment',
};
