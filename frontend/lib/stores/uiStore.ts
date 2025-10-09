/**
 * Zustand store for UI state (theme, sidebar, etc.)
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';

interface UIState {
  // Theme
  theme: Theme;
  setTheme: (theme: Theme) => void;

  // Sidebar
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // View density
  viewDensity: 'comfortable' | 'compact' | 'spacious';
  setViewDensity: (density: 'comfortable' | 'compact' | 'spacious') => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Theme
      theme: 'system',
      setTheme: (theme) => set({ theme }),

      // Sidebar
      sidebarOpen: true,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      // View density
      viewDensity: 'comfortable',
      setViewDensity: (density) => set({ viewDensity: density }),
    }),
    {
      name: 'wealth-vault-ui',
    }
  )
);
