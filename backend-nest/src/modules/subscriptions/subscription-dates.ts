import { advance } from '../income/services/income-backfill.service';
import { naiveUtcNow } from '../../common/entities/naive-timestamp.entity';
import { toNaiveIso } from '../../common/time/naive-timestamp';

/** Every frequency is a month count; biannually is six, not two per year. */
const MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  biannually: 6,
  annually: 12,
};

function monthsFor(frequency: string): number {
  // Unknown frequency silently falls back to monthly, as FastAPI's dict .get(freq, months=1) does.
  return MONTHS[frequency] ?? 1;
}

/**
 * calculate_next_payment_date.
 *
 * Iterative, NOT multiplicative: the delta is applied one period at a time from start_date until it
 * passes `from`. That matters because relativedelta clamps month ends and the clamp is sticky —
 * 2026-01-31 monthly walks 02-28 → 03-28 → 04-28 and never returns to the 31st, whereas
 * `start + 3 months` would give 04-30. Do not "simplify" this into a single multiplication.
 *
 * The comparison is `<=`, so a payment made exactly on the due instant advances a further period,
 * and time-of-day is carried from start_date rather than normalised to midnight.
 */
export function calculateNextPaymentDate(
  startDate: string,
  frequency: string,
  from: string = naiveUtcNow(),
): string {
  const step = { months: monthsFor(frequency) };
  // Both sides must use the same separator or the string comparison below is meaningless — ' ' and
  // 'T' sort either side of the digits.
  const limit = toNaiveIso(from)!;
  let next = toNaiveIso(startDate)!;
  // Guard against a pathological loop if a caller ever passes a far-past start with a tiny period.
  for (let i = 0; next <= limit && i < 10_000; i += 1) {
    next = advance(next, step);
  }
  return next;
}

/**
 * calculate_period_dates: the period runs from the payment instant to one day short of the next
 * one, at the same time of day. Verified live — a monthly payment at 2026-08-11 15:27:26 gave
 * period_end 2026-09-10 15:27:26.
 */
export function calculatePeriodDates(
  paymentDate: string,
  frequency: string,
): { periodStart: string; periodEnd: string } {
  const start = toNaiveIso(paymentDate)!;
  const afterOnePeriod = advance(start, { months: monthsFor(frequency) });
  return {
    periodStart: start,
    periodEnd: advance(afterOnePeriod, { days: -1 }),
  };
}
