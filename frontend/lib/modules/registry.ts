/**
 * Module registry for managing application modules
 */
import { ModuleConfig, ModuleKey, ModuleRegistry, TierName } from './types';

class ModuleRegistryImpl implements ModuleRegistry {
  modules: Map<ModuleKey, ModuleConfig>;

  constructor() {
    this.modules = new Map();
  }

  register(config: ModuleConfig): void {
    this.modules.set(config.key, config);
    console.log(`[ModuleRegistry] Registered module: ${config.key}`);
  }

  unregister(key: ModuleKey): void {
    this.modules.delete(key);
    console.log(`[ModuleRegistry] Unregistered module: ${key}`);
  }

  get(key: ModuleKey): ModuleConfig | undefined {
    return this.modules.get(key);
  }

  getAll(): ModuleConfig[] {
    return Array.from(this.modules.values());
  }

  getEnabled(): ModuleConfig[] {
    return this.getAll().filter((module) => module.enabled);
  }

  hasAccess(key: ModuleKey, tier: TierName): boolean {
    const moduleConfig = this.get(key);
    if (!moduleConfig) return false;
    return moduleConfig.tier_access.includes(tier);
  }

  /**
   * Check if all dependencies for a module are available
   */
  checkDependencies(key: ModuleKey): boolean {
    const moduleConfig = this.get(key);
    if (!moduleConfig || !moduleConfig.dependencies) return true;

    return moduleConfig.dependencies.every((depKey) => {
      const dep = this.get(depKey);
      return dep && dep.enabled;
    });
  }

  /**
   * Get modules accessible by tier
   */
  getByTier(tier: TierName): ModuleConfig[] {
    return this.getEnabled().filter((module) =>
      module.tier_access.includes(tier)
    );
  }
}

// Export singleton instance
export const moduleRegistry = new ModuleRegistryImpl();
