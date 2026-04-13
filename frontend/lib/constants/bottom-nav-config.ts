/**
 * Bottom navigation tab configuration for mobile
 */
import {
  LayoutDashboard,
  ArrowLeftRight,
  TrendingUp,
  Repeat,
  CreditCard,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface BottomNavTab {
  key: string;
  labelKey: string;
  icon: LucideIcon;
  defaultHref: string;
  subPages: {
    href: string;
    labelKey: string;
  }[];
}

export const BOTTOM_NAV_TABS: BottomNavTab[] = [
  {
    key: 'dashboard',
    labelKey: 'tabs.dashboard',
    icon: LayoutDashboard,
    defaultHref: '/dashboard',
    subPages: [],
  },
  {
    key: 'cashflow',
    labelKey: 'tabs.cashflow',
    icon: ArrowLeftRight,
    defaultHref: '/dashboard/expenses',
    subPages: [
      { href: '/dashboard/income', labelKey: 'navigation.income' },
      { href: '/dashboard/expenses', labelKey: 'navigation.expenses' },
    ],
  },
  {
    key: 'assets',
    labelKey: 'tabs.assets',
    icon: TrendingUp,
    defaultHref: '/dashboard/accounts',
    subPages: [
      { href: '/dashboard/accounts', labelKey: 'navigation.accounts' },
      { href: '/dashboard/portfolio', labelKey: 'navigation.portfolio' },
      { href: '/dashboard/goals', labelKey: 'navigation.goals' },
    ],
  },
  {
    key: 'recurring',
    labelKey: 'tabs.recurring',
    icon: Repeat,
    defaultHref: '/dashboard/budgets',
    subPages: [
      { href: '/dashboard/budgets', labelKey: 'navigation.budgets' },
      { href: '/dashboard/subscriptions', labelKey: 'navigation.subscriptions' },
      { href: '/dashboard/installments', labelKey: 'navigation.installments' },
    ],
  },
  {
    key: 'liabilities',
    labelKey: 'tabs.liabilities',
    icon: CreditCard,
    defaultHref: '/dashboard/debts',
    subPages: [
      { href: '/dashboard/debts', labelKey: 'navigation.debts' },
      { href: '/dashboard/taxes', labelKey: 'navigation.taxes' },
    ],
  },
];

/**
 * Find which tab group a given pathname belongs to
 */
export function getActiveTab(pathname: string): BottomNavTab | undefined {
  // Dashboard exact match
  if (pathname === '/dashboard') {
    return BOTTOM_NAV_TABS[0];
  }

  // Check sub-pages
  for (const tab of BOTTOM_NAV_TABS) {
    for (const subPage of tab.subPages) {
      if (pathname.startsWith(subPage.href)) {
        return tab;
      }
    }
  }

  return undefined;
}
