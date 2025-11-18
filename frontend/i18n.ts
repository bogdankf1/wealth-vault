import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';

// Supported locales
export const locales = ['en', 'uk', 'es'] as const;
export type Locale = (typeof locales)[number];

// Default locale
export const defaultLocale: Locale = 'en';

// Locale names for display
export const localeNames: Record<Locale, string> = {
  en: 'English',
  uk: 'Українська',
  es: 'Español',
};

export default getRequestConfig(async ({ locale }) => {
  // Validate that the incoming `locale` parameter is valid
  const validatedLocale = locale && locales.includes(locale as Locale) ? locale : defaultLocale;

  return {
    locale: validatedLocale,
    timeZone: 'UTC',
    messages: {
      common: (await import(`./messages/${validatedLocale}/common.json`)).default,
      expenses: (await import(`./messages/${validatedLocale}/expenses.json`)).default,
      income: (await import(`./messages/${validatedLocale}/income.json`)).default,
      budgets: (await import(`./messages/${validatedLocale}/budgets.json`)).default,
      savings: (await import(`./messages/${validatedLocale}/savings.json`)).default,
      portfolio: (await import(`./messages/${validatedLocale}/portfolio.json`)).default,
      goals: (await import(`./messages/${validatedLocale}/goals.json`)).default,
      subscriptions: (await import(`./messages/${validatedLocale}/subscriptions.json`)).default,
      installments: (await import(`./messages/${validatedLocale}/installments.json`)).default,
      debts: (await import(`./messages/${validatedLocale}/debts.json`)).default,
      taxes: (await import(`./messages/${validatedLocale}/taxes.json`)).default,
      export: (await import(`./messages/${validatedLocale}/export.json`)).default,
      backups: (await import(`./messages/${validatedLocale}/backups.json`)).default,
      pricing: (await import(`./messages/${validatedLocale}/pricing.json`)).default,
      help: (await import(`./messages/${validatedLocale}/help.json`)).default,
      settings: (await import(`./messages/${validatedLocale}/settings.json`)).default,
      login: (await import(`./messages/${validatedLocale}/login.json`)).default,
      dashboard: (await import(`./messages/${validatedLocale}/dashboard.json`)).default,
      analytics: (await import(`./messages/${validatedLocale}/analytics.json`)).default,
      sidebar: (await import(`./messages/${validatedLocale}/sidebar.json`)).default,
    },
  };
});
