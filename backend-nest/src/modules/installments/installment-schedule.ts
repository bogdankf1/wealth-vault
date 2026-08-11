import { advance } from '../income/services/income-backfill.service';
import { decCmp, decMul, decSub } from '../../common/money/money';
import { naiveUtcNow } from '../../common/entities/naive-timestamp.entity';
import { toNaiveIso } from '../../common/time/naive-timestamp';

const STEP: Record<string, { months?: number; days?: number }> = {
  weekly: { days: 7 },
  biweekly: { days: 14 },
  monthly: { months: 1 },
};

/** Unknown frequency falls back to monthly, matching the `else: # monthly` branches. */
function stepFor(frequency: string): { months?: number; days?: number } {
  return STEP[frequency] ?? { months: 1 };
}

const dayOf = (timestamp: string): string => timestamp.slice(0, 10);

/**
 * The scheduled date of payment N: `first_payment_date + delta * (n - 1)`.
 *
 * Multiplicative, unlike subscriptions' iterative walk — so a month-end clamp is applied ONCE at
 * the end rather than accumulating. Jan 31 + 2 months is Mar 31 here, where the subscriptions
 * helper would have drifted to Mar 28. The two modules differ on purpose.
 */
export function scheduledDateFor(
  firstPaymentDate: string,
  frequency: string,
  paymentNumber: number,
): string {
  const step = stepFor(frequency);
  const periods = paymentNumber - 1;
  const scaled = step.days
    ? { days: step.days * periods }
    : { months: (step.months ?? 1) * periods };
  return advance(toNaiveIso(firstPaymentDate)!, scaled);
}

/**
 * calculate_payments_made — derived from the CALENDAR, not from recorded payments. Re-run on every
 * create and update, so a PUT overwrites whatever the payment path stored.
 */
export function calculatePaymentsMade(
  firstPaymentDate: string,
  frequency: string,
  numberOfPayments: number,
  today: string = naiveUtcNow(),
): number {
  const first = dayOf(toNaiveIso(firstPaymentDate)!);
  const cutoff = dayOf(toNaiveIso(today)!);
  if (cutoff < first) return 0;

  let made = 0;
  let cursor = toNaiveIso(firstPaymentDate)!;
  for (let i = 0; i < numberOfPayments; i += 1) {
    if (dayOf(cursor) > cutoff) break;
    made += 1;
    cursor = advance(cursor, stepFor(frequency));
  }
  return Math.min(made, numberOfPayments);
}

/** first_payment_date + (n - 1) intervals. Always recomputed on update, discarding any input. */
export function calculateEndDate(
  firstPaymentDate: string,
  frequency: string,
  numberOfPayments: number,
): string {
  return scheduledDateFor(firstPaymentDate, frequency, numberOfPayments);
}

/** null once the schedule is exhausted. */
export function calculateNextPaymentDate(
  firstPaymentDate: string,
  frequency: string,
  numberOfPayments: number,
  from: string = naiveUtcNow(),
): string | null {
  const limit = toNaiveIso(from)!;
  let cursor = toNaiveIso(firstPaymentDate)!;
  for (let i = 0; i < numberOfPayments; i += 1) {
    if (cursor > limit) return cursor;
    cursor = advance(cursor, stepFor(frequency));
  }
  return null;
}

/**
 * remaining = total - amount_per_payment × payments_made, floored at zero. FastAPI branches on
 * interest_rate and then computes the same thing in both branches — collapsed here.
 */
export function calculateRemainingBalance(
  totalAmount: string,
  amountPerPayment: string,
  paymentsMade: number,
): string {
  const paid = decMul(amountPerPayment, String(paymentsMade));
  const remaining = decSub(totalAmount, paid);
  return decCmp(remaining, '0') < 0 ? '0' : remaining;
}
