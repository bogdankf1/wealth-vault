import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'wealth-vault-sidebar-collapsed';

/**
 * Hook to manage sidebar collapse state with localStorage persistence.
 * Defaults to expanded (false) on SSR; hydrates from localStorage on mount.
 */
export function useSidebarCollapse() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'true') {
        setIsCollapsed(true);
      }
    } catch {
      // localStorage unavailable — keep default
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // localStorage unavailable
      }
      return next;
    });
  }, []);

  return { isCollapsed, toggleCollapsed };
}
