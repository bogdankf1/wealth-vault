import {
  decAdd,
  decCmp,
  decDiv,
  decMax,
  decMin,
  decMul,
  decSub,
} from '../../common/money/money';

/**
 * The four @computed_field properties on DebtResponse
 * (backend/app/modules/debts/schemas.py:83-111). Pydantic serializes computed fields AFTER the
 * declared ones, so these land at the end of the object.
 *
 * Every one of them is scale-sensitive, and none of the scales are obvious:
 *   - 50.00 paid in full  -> "100", because 50.00/50.00 divides exactly to "1" (ideal exponent
 *     scale(a)-scale(b) = 0) and 1*100 keeps scale 0. NOT "100.00".
 *   - 200.00 paid 50.00   -> "25.00", because 0.25 needs two places and *100 carries them.
 *   - 1000.00 paid 333.33 -> "33.33300" — an exact quotient of 0.33333 padded by the multiply.
 *   - overpaid            -> min() picks the literal Decimal('100'), so "100" with no scale, and
 *     max() picks the literal Decimal('0'), so "0" rather than the subtraction's "-50.00" scale.
 * All verified against CPython before being written down.
 */
export function progressPercentage(amount: string, amountPaid: string): string {
  if (decCmp(amount, '0') <= 0) return '0';
  return decMin(decMul(decDiv(amountPaid, amount), '100'), '100');
}

export function amountRemaining(amount: string, amountPaid: string): string {
  return decMax(decSub(amount, amountPaid), '0');
}

export function totalWithInterest(
  amount: string,
  accruedInterest: string,
): string {
  return decAdd(amount, accruedInterest);
}

/**
 * `datetime.utcnow() > self.due_date` — false whenever the debt is paid or has no due date. Both
 * sides are naive UTC strings, which compare correctly lexicographically because ISO components are
 * zero-padded and fixed-width.
 */
export function isOverdue(
  isPaid: boolean,
  dueDate: string | null,
  now: string,
): boolean {
  if (isPaid || !dueDate) return false;
  return now > dueDate;
}
