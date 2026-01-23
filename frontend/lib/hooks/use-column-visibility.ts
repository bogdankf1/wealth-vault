'use client';

import { useState, useEffect, useCallback } from 'react';

export interface ColumnConfig {
  id: string;
  label: string;
  locked?: boolean; // If true, column cannot be hidden
}

export interface ColumnVisibilityState {
  [columnId: string]: boolean;
}

const STORAGE_KEY_PREFIX = 'column-visibility-';

/**
 * Hook for managing column visibility with localStorage persistence
 * @param moduleId - Unique identifier for the module (e.g., 'income', 'expenses')
 * @param columns - Array of column configurations
 * @returns Object with visible columns state and toggle function
 */
export function useColumnVisibility(moduleId: string, columns: ColumnConfig[]) {
  // Initialize with all columns visible
  const getDefaultState = useCallback((): ColumnVisibilityState => {
    return columns.reduce((acc, col) => {
      acc[col.id] = true;
      return acc;
    }, {} as ColumnVisibilityState);
  }, [columns]);

  const [visibleColumns, setVisibleColumns] = useState<ColumnVisibilityState>(() => {
    // Will be updated in useEffect after hydration
    return getDefaultState();
  });

  const [isHydrated, setIsHydrated] = useState(false);

  // Load from localStorage after mount (client-side only)
  useEffect(() => {
    const storageKey = `${STORAGE_KEY_PREFIX}${moduleId}`;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as ColumnVisibilityState;
        // Merge with default state to handle new columns
        const defaultState = getDefaultState();
        const merged = { ...defaultState, ...parsed };
        // Ensure locked columns are always visible
        columns.forEach((col) => {
          if (col.locked) {
            merged[col.id] = true;
          }
        });
        setVisibleColumns(merged);
      }
    } catch (error) {
      console.error('Failed to load column visibility settings:', error);
    }
    setIsHydrated(true);
  }, [moduleId, columns, getDefaultState]);

  // Save to localStorage when visibility changes
  useEffect(() => {
    if (!isHydrated) return;

    const storageKey = `${STORAGE_KEY_PREFIX}${moduleId}`;
    try {
      localStorage.setItem(storageKey, JSON.stringify(visibleColumns));
    } catch (error) {
      console.error('Failed to save column visibility settings:', error);
    }
  }, [moduleId, visibleColumns, isHydrated]);

  const toggleColumn = useCallback((columnId: string) => {
    // Find the column config
    const column = columns.find((c) => c.id === columnId);
    // Don't toggle locked columns
    if (column?.locked) return;

    setVisibleColumns((prev) => ({
      ...prev,
      [columnId]: !prev[columnId],
    }));
  }, [columns]);

  const setColumnVisibility = useCallback((columnId: string, visible: boolean) => {
    const column = columns.find((c) => c.id === columnId);
    // Don't change locked columns
    if (column?.locked && !visible) return;

    setVisibleColumns((prev) => ({
      ...prev,
      [columnId]: visible,
    }));
  }, [columns]);

  const showAllColumns = useCallback(() => {
    setVisibleColumns(getDefaultState());
  }, [getDefaultState]);

  const isColumnVisible = useCallback((columnId: string): boolean => {
    return visibleColumns[columnId] ?? true;
  }, [visibleColumns]);

  const visibleColumnCount = Object.values(visibleColumns).filter(Boolean).length;
  const totalColumnCount = columns.length;

  return {
    visibleColumns,
    toggleColumn,
    setColumnVisibility,
    showAllColumns,
    isColumnVisible,
    visibleColumnCount,
    totalColumnCount,
    isHydrated,
  };
}
