import { advance } from '../income/services/income-backfill.service';
import { naiveUtcNow } from '../../common/entities/naive-timestamp.entity';
import { toNaiveIso } from '../../common/time/naive-timestamp';

/**
 * get_current_period_range (backend/app/modules/taxes/service/common.py:21-52).
 *
 * The three frequencies do NOT share a shape:
 *   - monthly and quarterly end one SECOND before the next period starts, so they land on
 *     '...23:59:59' with no microseconds — and Python's isoformat() omits the fraction entirely
 *     when it is zero, so the wire value has no '.000000' suffix;
 *   - annually is built by replace(month=12, day=31, ..., microsecond=999999) rather than by
 *     subtraction, so it alone carries a fraction: '...23:59:59.999999'.
 * An unrecognised frequency falls back to monthly.
 */
export function currentPeriodRange(
  frequency: string,
  reference: string = naiveUtcNow(),
): { periodStart: string; periodEnd: string } {
  const iso = toNaiveIso(reference)!;
  const [datePart] = iso.split('T');
  const [year, month] = datePart.split('-').map(Number);

  if (frequency === 'annually') {
    return {
      periodStart: `${year}-01-01T00:00:00`,
      periodEnd: `${year}-12-31T23:59:59.999999`,
    };
  }

  const months = frequency === 'quarterly' ? 3 : 1;
  const startMonth =
    frequency === 'quarterly' ? Math.floor((month - 1) / 3) * 3 + 1 : month;
  const periodStart = `${year}-${pad(startMonth)}-01T00:00:00`;
  return {
    periodStart,
    periodEnd: oneSecondBefore(advance(periodStart, { months })),
  };
}

/**
 * calculate_next_payment_date: a single relativedelta step from `from` (which the callers always
 * leave as utcnow — nothing chains off the previous due date, so there is no sticky-clamp problem
 * of the kind subscriptions have).
 */
export function nextTaxPaymentDate(
  frequency: string,
  from: string = naiveUtcNow(),
): string {
  const months =
    frequency === 'annually' ? 12 : frequency === 'quarterly' ? 3 : 1;
  return advance(toNaiveIso(from)!, { months });
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** The boundary is always an exact midnight, so this only ever borrows into 23:59:59. */
function oneSecondBefore(midnight: string): string {
  const [datePart] = midnight.split('T');
  const previousDay = advance(`${datePart}T00:00:00`, { days: -1 });
  return `${previousDay.split('T')[0]}T23:59:59`;
}
