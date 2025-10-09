/**
 * Utility functions for calculating installment payment dates
 */

import { InstallmentFrequency } from '@/lib/api/installmentsApi';

/**
 * Calculate the next payment date for an installment
 * Uses date-only format to avoid timezone issues
 */
export function calculateNextPaymentDate(
  firstPaymentDate: string,
  frequency: InstallmentFrequency,
  paymentsMade: number,
  numberOfPayments: number,
  endDate?: string
): { nextPayment: string | null; isPaidOff: boolean; daysUntilPayment: number } {
  // Get today's date in local timezone, normalized to midnight
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Check if installment is paid off
  if (paymentsMade >= numberOfPayments) {
    return { nextPayment: null, isPaidOff: true, daysUntilPayment: -1 };
  }

  // Parse first payment date in local timezone to avoid timezone shifts
  const firstPaymentStr = firstPaymentDate.split('T')[0];
  const [firstYear, firstMonth, firstDay] = firstPaymentStr.split('-').map(Number);
  const firstPayment = new Date(firstYear, firstMonth - 1, firstDay);

  // Check if installment has ended
  if (endDate) {
    const endDateStr = endDate.split('T')[0];
    const [endYear, endMonth, endDay] = endDateStr.split('-').map(Number);
    const end = new Date(endYear, endMonth - 1, endDay);
    if (end < today) {
      return { nextPayment: null, isPaidOff: false, daysUntilPayment: -1 };
    }
  }

  // Calculate the next payment date based on payments made
  const nextPayment = new Date(firstPayment);

  // Calculate days/weeks/months to add based on frequency
  if (frequency === 'weekly') {
    // Add weeks
    nextPayment.setDate(nextPayment.getDate() + (paymentsMade * 7));
  } else if (frequency === 'biweekly') {
    // Add biweekly periods
    nextPayment.setDate(nextPayment.getDate() + (paymentsMade * 14));
  } else {
    // Monthly - add months
    nextPayment.setMonth(nextPayment.getMonth() + paymentsMade);
  }

  // If calculated next payment is in the past, that means today or next period
  if (nextPayment <= today) {
    // Move to the next period
    if (frequency === 'weekly') {
      nextPayment.setDate(nextPayment.getDate() + 7);
    } else if (frequency === 'biweekly') {
      nextPayment.setDate(nextPayment.getDate() + 14);
    } else {
      nextPayment.setMonth(nextPayment.getMonth() + 1);
    }
  }

  // Check if next payment exceeds end date
  if (endDate) {
    const endDateStr = endDate.split('T')[0];
    const [endYear, endMonth, endDay] = endDateStr.split('-').map(Number);
    const end = new Date(endYear, endMonth - 1, endDay);
    if (nextPayment > end) {
      return { nextPayment: null, isPaidOff: false, daysUntilPayment: -1 };
    }
  }

  const diffDays = Math.round((nextPayment.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  // Format the next payment date as YYYY-MM-DD
  const year = nextPayment.getFullYear();
  const month = String(nextPayment.getMonth() + 1).padStart(2, '0');
  const day = String(nextPayment.getDate()).padStart(2, '0');

  return {
    nextPayment: `${year}-${month}-${day}`,
    isPaidOff: false,
    daysUntilPayment: diffDays,
  };
}

/**
 * Get payment urgency level for color coding
 */
export function getPaymentUrgency(daysUntilPayment: number): 'high' | 'medium' | 'low' | 'ended' {
  if (daysUntilPayment < 0) return 'ended';
  if (daysUntilPayment === 0) return 'high'; // Today
  if (daysUntilPayment <= 7) return 'medium'; // Within a week
  return 'low'; // More than a week away
}

/**
 * Format payment date for display
 */
export function formatPaymentDate(dateStr: string | null): string {
  if (!dateStr) return 'No upcoming payment';

  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Get human-readable payment message
 */
export function getPaymentMessage(daysUntilPayment: number, isPaidOff: boolean): string {
  if (isPaidOff) return 'Paid off';
  if (daysUntilPayment < 0) return 'No payment scheduled';
  if (daysUntilPayment === 0) return 'Due today';
  if (daysUntilPayment === 1) return 'Due tomorrow';
  if (daysUntilPayment <= 7) return `Due in ${daysUntilPayment} days`;
  return `Due in ${daysUntilPayment} days`;
}

/**
 * Calculate percentage paid off
 */
export function calculatePercentPaid(paymentsMade: number, numberOfPayments: number): number {
  if (numberOfPayments === 0) return 0;
  return Math.round((paymentsMade / numberOfPayments) * 100);
}
