/**
 * Income module configuration
 */
import { ModuleConfig } from '../types';

export const incomeModuleConfig: ModuleConfig = {
  key: 'income',
  name: 'Income Tracking',
  description: 'Track multiple income sources with recurring and one-time support',
  icon: 'TrendingUp',
  path: '/dashboard/income',
  color: 'emerald',
  enabled: true,
  tier_access: ['starter', 'growth', 'wealth'],
  features: ['income_tracking'],
  dependencies: [],
};
