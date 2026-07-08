'use client';

import { useCallback, useMemo, useState } from 'react';

/**
 * Manages multi-row selection state (toggle / select-all / deselect / clear).
 *
 * Lifted verbatim from the inline selection state machine in the expenses
 * overview page so behavior is identical.
 */
export function useRowSelection() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds((prev) => {
      if (prev.size === ids.length) {
        return new Set();
      }
      return new Set(ids);
    });
  }, []);

  const deselect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
  }, []);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isAllSelected = useCallback(
    (count: number) => selectedIds.size === count,
    [selectedIds]
  );

  return useMemo(
    () => ({
      selectedIds,
      toggle,
      selectAll,
      deselect,
      clear,
      isAllSelected,
      size: selectedIds.size,
    }),
    [selectedIds, toggle, selectAll, deselect, clear, isAllSelected]
  );
}
