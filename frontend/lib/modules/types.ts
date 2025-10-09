/**
 * Module system type definitions
 */

export type ModuleKey =
  | 'income'
  | 'expenses'
  | 'savings'
  | 'portfolio'
  | 'goals'
  | 'subscriptions'
  | 'installments';

export type TierName = 'starter' | 'growth' | 'wealth';

export interface ModuleConfig {
  key: ModuleKey;
  name: string;
  description: string;
  icon: string; // Lucide icon name
  path: string;
  color: string; // Tailwind color class
  enabled: boolean;
  tier_access: TierName[];
  features: string[];
  dependencies?: ModuleKey[];
}

export interface ModuleRegistry {
  modules: Map<ModuleKey, ModuleConfig>;
  register: (config: ModuleConfig) => void;
  unregister: (key: ModuleKey) => void;
  get: (key: ModuleKey) => ModuleConfig | undefined;
  getAll: () => ModuleConfig[];
  getEnabled: () => ModuleConfig[];
  hasAccess: (key: ModuleKey, tier: TierName) => boolean;
}
