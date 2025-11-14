/**
 * Shared types for module layouts with tabs and action buttons
 * Use this pattern for modules that need:
 * - Tab navigation (e.g., Overview, History)
 * - Dynamic action buttons in the header
 * - Consistent layout structure
 */

import { LucideIcon } from 'lucide-react';
import React from 'react';

/**
 * Tab definition for module navigation
 */
export interface ModuleTab {
  /** Unique identifier for the tab */
  value: string;
  /** Display label for the tab */
  label: string;
  /** Icon component from lucide-react */
  icon: LucideIcon;
  /** URL path for the tab */
  href: string;
}

/**
 * Context type for passing action buttons from child pages to layout
 */
export interface ModuleActionsContextType {
  /** Function to set action buttons from child pages */
  setActions: (actions: React.ReactNode) => void;
}

/**
 * Props for module layout component
 */
export interface ModuleLayoutProps {
  /** Child pages to render */
  children: React.ReactNode;
}

/**
 * Time range options for history pages
 */
export type HistoryTimeRange = '3' | '6' | '12' | '24' | 'all';

/**
 * Params for history API queries
 */
export interface HistoryParams {
  start_date: string;
  end_date: string;
}
