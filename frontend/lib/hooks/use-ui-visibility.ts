'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * UI visibility settings for common elements across modules
 */
export interface UIVisibilitySettings {
  showStatsCards: boolean;
  showPageDescription: boolean;
}

const DEFAULT_SETTINGS: UIVisibilitySettings = {
  showStatsCards: true,
  showPageDescription: true,
};

const STORAGE_KEY = 'wealth-vault-ui-visibility';

/**
 * Hook to manage UI visibility settings
 * Persists settings to localStorage and syncs across tabs
 */
export function useUIVisibility() {
  const [settings, setSettings] = useState<UIVisibilitySettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      }
    } catch (error) {
      console.error('Failed to load UI visibility settings:', error);
    }
    setIsLoaded(true);
  }, []);

  // Sync settings across tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          setSettings({ ...DEFAULT_SETTINGS, ...parsed });
        } catch (error) {
          console.error('Failed to parse UI visibility settings from storage event:', error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Save settings to localStorage whenever they change
  const updateSettings = useCallback((updates: Partial<UIVisibilitySettings>) => {
    setSettings((prev) => {
      const newSettings = { ...prev, ...updates };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
      } catch (error) {
        console.error('Failed to save UI visibility settings:', error);
      }
      return newSettings;
    });
  }, []);

  // Toggle a specific setting
  const toggleSetting = useCallback((key: keyof UIVisibilitySettings) => {
    updateSettings({ [key]: !settings[key] });
  }, [settings, updateSettings]);

  // Reset to defaults
  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
    } catch (error) {
      console.error('Failed to reset UI visibility settings:', error);
    }
  }, []);

  return {
    settings,
    isLoaded,
    updateSettings,
    toggleSetting,
    resetSettings,
    // Convenience getters
    showStatsCards: settings.showStatsCards,
    showPageDescription: settings.showPageDescription,
  };
}
