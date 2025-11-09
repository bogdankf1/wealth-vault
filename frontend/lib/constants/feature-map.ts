/**
 * Feature mapping - maps navigation items and widgets to their required features
 */

export const NAVIGATION_FEATURES: Record<string, string | null> = {
  '/dashboard': null, // Dashboard is always available
  '/dashboard/income': 'income_tracking',
  '/dashboard/expenses': 'expense_tracking',
  '/dashboard/budgets': 'budget_tracking',
  '/dashboard/savings': 'savings_tracking',
  '/dashboard/portfolio': 'portfolio_tracking',
  '/dashboard/goals': 'financial_goals',
  '/dashboard/subscriptions': 'subscription_tracking',
  '/dashboard/installments': 'installment_tracking',
  '/dashboard/debts': 'debt_tracking',
  '/dashboard/taxes': 'tax_tracking',
  '/dashboard/pricing': null, // Pricing is always available
  '/dashboard/settings': null, // Settings is always available
};

export const WIDGET_FEATURES: Record<string, string | null> = {
  'quick-actions': null, // Always available
  'ai-insights': 'ai_insights',
  'exchange-rates': null, // Always available
  'net-worth': null, // Always available
  'income-vs-expenses': null, // Always available if income or expenses enabled
  'monthly-spending': 'expense_tracking',
  'recent-transactions': null, // Always available
  'upcoming-bills': null, // Always available if subscriptions enabled
  'budget-overview': 'budget_tracking',
  'goals-progress': 'financial_goals',
  'portfolio-summary': 'portfolio_tracking',
  'subscriptions-by-category': 'subscription_tracking',
  'installments-by-category': 'installment_tracking',
  'expenses-by-category': 'expense_tracking',
  'budgets-by-category': 'budget_tracking',
  'income-allocation': 'income_tracking',
  'net-worth-trend': null, // Always available
  'taxes': 'tax_tracking',
  'debts-owed': 'debt_tracking',
};
