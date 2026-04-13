'use client';

import { redirect } from 'next/navigation';

/**
 * Help settings page — redirects to the main Help Center page.
 * This exists so "Help" appears as a tab in Settings navigation.
 */
export default function SettingsHelpPage() {
  redirect('/dashboard/help');
}
