/**
 * Utility functions for calculating subscription renewal dates
 */

import { SubscriptionFrequency } from '@/lib/api/subscriptionsApi';

/**
 * Calculate the next renewal date for a subscription
 * Uses date-only format to avoid timezone issues
 */
export function calculateNextRenewalDate(
  startDate: string,
  frequency: SubscriptionFrequency,
  endDate?: string
): { nextRenewal: string | null; isEnded: boolean; daysUntilRenewal: number } {
  // Get today's date in local timezone, normalized to midnight
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Parse start date in local timezone to avoid timezone shifts
  const startDateStr = startDate.split('T')[0];
  const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number);
  const start = new Date(startYear, startMonth - 1, startDay);

  // Check if subscription has ended
  if (endDate) {
    const endDateStr = endDate.split('T')[0];
    const [endYear, endMonth, endDay] = endDateStr.split('-').map(Number);
    const end = new Date(endYear, endMonth - 1, endDay);
    if (end < today) {
      return { nextRenewal: null, isEnded: true, daysUntilRenewal: -1 };
    }
  }

  // If start date is in the future, that's the next renewal
  if (start > today) {
    const diffDays = Math.round((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return {
      nextRenewal: startDateStr,
      isEnded: false,
      daysUntilRenewal: diffDays,
    };
  }

  // Calculate months to add based on frequency
  const monthsToAdd = {
    monthly: 1,
    quarterly: 3,
    biannually: 6,
    annually: 12,
  }[frequency];

  // Calculate next renewal date
  const nextRenewal = new Date(start);

  // Keep adding the frequency interval until we find the next future date
  while (nextRenewal <= today) {
    nextRenewal.setMonth(nextRenewal.getMonth() + monthsToAdd);
  }

  // Check if next renewal exceeds end date
  if (endDate) {
    const endDateStr = endDate.split('T')[0];
    const [endYear, endMonth, endDay] = endDateStr.split('-').map(Number);
    const end = new Date(endYear, endMonth - 1, endDay);
    if (nextRenewal > end) {
      return { nextRenewal: null, isEnded: false, daysUntilRenewal: -1 };
    }
  }

  const diffDays = Math.round((nextRenewal.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  // Format the next renewal date as YYYY-MM-DD
  const year = nextRenewal.getFullYear();
  const month = String(nextRenewal.getMonth() + 1).padStart(2, '0');
  const day = String(nextRenewal.getDate()).padStart(2, '0');

  return {
    nextRenewal: `${year}-${month}-${day}`,
    isEnded: false,
    daysUntilRenewal: diffDays,
  };
}

/**
 * Get renewal urgency level for color coding
 */
export function getRenewalUrgency(daysUntilRenewal: number): 'high' | 'medium' | 'low' | 'ended' {
  if (daysUntilRenewal < 0) return 'ended';
  if (daysUntilRenewal === 0) return 'high'; // Today
  if (daysUntilRenewal <= 7) return 'medium'; // Within a week
  return 'low'; // More than a week away
}

/**
 * Format renewal date for display
 * @param dateStr - Date string to format
 * @param noUpcomingRenewalLabel - Optional label for when there's no upcoming renewal
 * @param locale - Locale for date formatting (defaults to 'en-US')
 */
export function formatRenewalDate(
  dateStr: string | null,
  noUpcomingRenewalLabel?: string,
  locale: string = 'en-US'
): string {
  if (!dateStr) return noUpcomingRenewalLabel || 'No upcoming renewal';

  const date = new Date(dateStr);
  return date.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Get human-readable renewal message
 * @param daysUntilRenewal - Number of days until renewal
 * @param isEnded - Whether the subscription has ended
 * @param translations - Optional translation object with renewal messages
 */
export function getRenewalMessage(
  daysUntilRenewal: number,
  isEnded: boolean,
  translations?: {
    ended: string;
    noRenewalScheduled: string;
    renewsToday: string;
    renewsTomorrow: string;
    renewsInDays: string;
    renewsIn1Day: string;
  }
): string {
  if (isEnded) return translations?.ended || 'Ended';
  if (daysUntilRenewal < 0) return translations?.noRenewalScheduled || 'No renewal scheduled';
  if (daysUntilRenewal === 0) return translations?.renewsToday || 'Renews today';
  if (daysUntilRenewal === 1) return translations?.renewsIn1Day?.replace('{days}', '1') || 'Renews tomorrow';
  return translations?.renewsInDays?.replace('{days}', String(daysUntilRenewal)) || `Renews in ${daysUntilRenewal} days`;
}
