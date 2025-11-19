import { defaultLocale, Locale } from '@/i18n';

export async function getMessages(locale: Locale = defaultLocale) {
  try {
    const commonMessages = await import(`@/messages/${locale}/common.json`);
    const expensesMessages = await import(`@/messages/${locale}/expenses.json`);
    const incomeMessages = await import(`@/messages/${locale}/income.json`);
    const budgetsMessages = await import(`@/messages/${locale}/budgets.json`);
    const savingsMessages = await import(`@/messages/${locale}/savings.json`);
    const portfolioMessages = await import(`@/messages/${locale}/portfolio.json`);
    const goalsMessages = await import(`@/messages/${locale}/goals.json`);
    const subscriptionsMessages = await import(`@/messages/${locale}/subscriptions.json`);
    const installmentsMessages = await import(`@/messages/${locale}/installments.json`);
    const debtsMessages = await import(`@/messages/${locale}/debts.json`);
    const taxesMessages = await import(`@/messages/${locale}/taxes.json`);
    const exportMessages = await import(`@/messages/${locale}/export.json`);
    const backupsMessages = await import(`@/messages/${locale}/backups.json`);
    const pricingMessages = await import(`@/messages/${locale}/pricing.json`);
    const helpMessages = await import(`@/messages/${locale}/help.json`);
    const settingsMessages = await import(`@/messages/${locale}/settings.json`);
    const loginMessages = await import(`@/messages/${locale}/login.json`);
    const dashboardMessages = await import(`@/messages/${locale}/dashboard.json`);
    const analyticsMessages = await import(`@/messages/${locale}/analytics.json`);
    const sidebarMessages = await import(`@/messages/${locale}/sidebar.json`);

    return {
      common: commonMessages.default,
      expenses: expensesMessages.default,
      income: incomeMessages.default,
      budgets: budgetsMessages.default,
      savings: savingsMessages.default,
      portfolio: portfolioMessages.default,
      goals: goalsMessages.default,
      subscriptions: subscriptionsMessages.default,
      installments: installmentsMessages.default,
      debts: debtsMessages.default,
      taxes: taxesMessages.default,
      export: exportMessages.default,
      backups: backupsMessages.default,
      pricing: pricingMessages.default,
      help: helpMessages.default,
      settings: settingsMessages.default,
      login: loginMessages.default,
      dashboard: dashboardMessages.default,
      analytics: analyticsMessages.default,
      sidebar: sidebarMessages.default,
    };
  } catch (error) {
    // Fallback to default locale if loading fails
    const commonMessages = await import(`@/messages/${defaultLocale}/common.json`);
    const expensesMessages = await import(`@/messages/${defaultLocale}/expenses.json`);
    const incomeMessages = await import(`@/messages/${defaultLocale}/income.json`);
    const budgetsMessages = await import(`@/messages/${defaultLocale}/budgets.json`);
    const savingsMessages = await import(`@/messages/${defaultLocale}/savings.json`);
    const portfolioMessages = await import(`@/messages/${defaultLocale}/portfolio.json`);
    const goalsMessages = await import(`@/messages/${defaultLocale}/goals.json`);
    const subscriptionsMessages = await import(`@/messages/${defaultLocale}/subscriptions.json`);
    const installmentsMessages = await import(`@/messages/${defaultLocale}/installments.json`);
    const debtsMessages = await import(`@/messages/${defaultLocale}/debts.json`);
    const taxesMessages = await import(`@/messages/${defaultLocale}/taxes.json`);
    const exportMessages = await import(`@/messages/${defaultLocale}/export.json`);
    const backupsMessages = await import(`@/messages/${defaultLocale}/backups.json`);
    const pricingMessages = await import(`@/messages/${defaultLocale}/pricing.json`);
    const helpMessages = await import(`@/messages/${defaultLocale}/help.json`);
    const settingsMessages = await import(`@/messages/${defaultLocale}/settings.json`);
    const loginMessages = await import(`@/messages/${defaultLocale}/login.json`);
    const dashboardMessages = await import(`@/messages/${defaultLocale}/dashboard.json`);
    const analyticsMessages = await import(`@/messages/${defaultLocale}/analytics.json`);
    const sidebarMessages = await import(`@/messages/${defaultLocale}/sidebar.json`);

    return {
      common: commonMessages.default,
      expenses: expensesMessages.default,
      income: incomeMessages.default,
      budgets: budgetsMessages.default,
      savings: savingsMessages.default,
      portfolio: portfolioMessages.default,
      goals: goalsMessages.default,
      subscriptions: subscriptionsMessages.default,
      installments: installmentsMessages.default,
      debts: debtsMessages.default,
      taxes: taxesMessages.default,
      export: exportMessages.default,
      backups: backupsMessages.default,
      pricing: pricingMessages.default,
      help: helpMessages.default,
      settings: settingsMessages.default,
      login: loginMessages.default,
      dashboard: dashboardMessages.default,
      analytics: analyticsMessages.default,
      sidebar: sidebarMessages.default,
    };
  }
}
