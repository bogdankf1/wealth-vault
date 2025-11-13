/**
 * Custom hook for managing view preferences in module pages
 * Uses default preferences from user settings as initial values
 */
import { useState, useEffect } from 'react';
import { useGetMyPreferencesQuery } from '@/lib/api/preferencesApi';

export function useViewPreferences() {
  const { data: preferences } = useGetMyPreferencesQuery();

  const [viewMode, setViewMode] = useState<'card' | 'list' | 'calendar'>('card');
  const [statsViewMode, setStatsViewMode] = useState<'cards' | 'compact'>('cards');
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize view modes from preferences only once
  useEffect(() => {
    if (preferences && !isInitialized) {
      setViewMode(preferences.default_content_view);
      setStatsViewMode(preferences.default_stats_view);
      setIsInitialized(true);
    }
  }, [preferences, isInitialized]);

  return {
    viewMode,
    setViewMode,
    statsViewMode,
    setStatsViewMode,
    isLoading: !isInitialized && !preferences,
  };
}
