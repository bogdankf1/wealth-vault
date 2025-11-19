'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { IntlProvider } from 'next-intl';
import { Locale, defaultLocale, locales } from '@/i18n';

type LanguageContextType = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

type LanguageProviderProps = {
  children: ReactNode;
  messages: Record<string, unknown>;
};

export function LanguageProvider({ children, messages }: LanguageProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);
  const [currentMessages, setCurrentMessages] = useState(messages);

  // Load locale from localStorage on mount
  useEffect(() => {
    const savedLocale = localStorage.getItem('locale') as Locale;
    if (savedLocale && locales.includes(savedLocale as Locale)) {
      setLocaleState(savedLocale);
      loadMessages(savedLocale);
    }
  }, []);

  const loadMessages = async (newLocale: Locale) => {
    try {
      const commonMessages = await import(`@/messages/${newLocale}/common.json`);
      const expensesMessages = await import(`@/messages/${newLocale}/expenses.json`);
      const incomeMessages = await import(`@/messages/${newLocale}/income.json`);
      const budgetsMessages = await import(`@/messages/${newLocale}/budgets.json`);
      const savingsMessages = await import(`@/messages/${newLocale}/savings.json`);
      const portfolioMessages = await import(`@/messages/${newLocale}/portfolio.json`);
      const goalsMessages = await import(`@/messages/${newLocale}/goals.json`);
      const subscriptionsMessages = await import(`@/messages/${newLocale}/subscriptions.json`);
      const installmentsMessages = await import(`@/messages/${newLocale}/installments.json`);
      const debtsMessages = await import(`@/messages/${newLocale}/debts.json`);
      const taxesMessages = await import(`@/messages/${newLocale}/taxes.json`);
      const exportMessages = await import(`@/messages/${newLocale}/export.json`);
      const backupsMessages = await import(`@/messages/${newLocale}/backups.json`);
      const pricingMessages = await import(`@/messages/${newLocale}/pricing.json`);
      const helpMessages = await import(`@/messages/${newLocale}/help.json`);
      const settingsMessages = await import(`@/messages/${newLocale}/settings.json`);
      const loginMessages = await import(`@/messages/${newLocale}/login.json`);
      const dashboardMessages = await import(`@/messages/${newLocale}/dashboard.json`);
      const analyticsMessages = await import(`@/messages/${newLocale}/analytics.json`);
      const sidebarMessages = await import(`@/messages/${newLocale}/sidebar.json`);

      setCurrentMessages({
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
      });
    } catch (error) {
      // Failed to load messages, fallback to current messages
    }
  };

  const setLocale = async (newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem('locale', newLocale);
    await loadMessages(newLocale);

    // TODO: Also save to backend user preferences
  };

  return (
    <LanguageContext.Provider value={{ locale, setLocale }}>
      <IntlProvider locale={locale} messages={currentMessages} timeZone="UTC">
        {children}
      </IntlProvider>
    </LanguageContext.Provider>
  );
}
