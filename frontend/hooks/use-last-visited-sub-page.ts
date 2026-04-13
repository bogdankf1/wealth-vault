import { useCallback, useEffect, useRef } from 'react';

const STORAGE_KEY = 'wealth-vault-last-visited';

/**
 * Hook to track and recall the last-visited sub-page per bottom nav tab.
 * Stores to localStorage so it persists across sessions.
 */
export function useLastVisitedSubPage() {
  const cache = useRef<Record<string, string>>({});

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        cache.current = JSON.parse(stored);
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  const setLastVisited = useCallback((tabKey: string, href: string) => {
    cache.current[tabKey] = href;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache.current));
    } catch {
      // localStorage unavailable
    }
  }, []);

  const getLastVisited = useCallback((tabKey: string): string | undefined => {
    return cache.current[tabKey];
  }, []);

  return { setLastVisited, getLastVisited };
}
