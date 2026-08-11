import Decimal from 'decimal.js';

// Python's `decimal` default context is 28 significant digits, ROUND_HALF_EVEN. Matching it is what
// makes get_income_history's `overall_average` — an unrounded Decimal division — come out identical.
// The toExp* bounds are pushed out so toString() never switches to exponential notation: Python's
// str(Decimal) doesn't, and a "1e+21" in a money field would be a parity break.
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_EVEN,
  toExpNeg: -9e15,
  toExpPos: 9e15,
});

/** Digits after the decimal point — what Python's Decimal exponent reports. */
export function scaleOf(value: string): number {
  const dot = value.indexOf('.');
  return dot === -1 ? 0 : value.length - dot - 1;
}

/**
 * Exact arithmetic, unconstrained by the 28-digit context — used to decide whether Python would
 * have rounded a result before padding it.
 */
const ExactDecimal = Decimal.clone({
  precision: 1e9,
  rounding: Decimal.ROUND_HALF_EVEN,
  toExpNeg: -9e15,
  toExpPos: 9e15,
});

/**
 * Python multiplies Decimals by adding exponents — Decimal('100.50') * Decimal('0.083') is
 * Decimal('8.34150'), scale 5 with the trailing zero preserved — but only while the exact product
 * fits the 28-significant-digit context. Past that it rounds, and the ideal exponent is abandoned:
 * Decimal('100.00') * Decimal(4.33) is 433.0000000000000071054273576, not a 50-decimal number.
 * Both halves are observable — the first in POST/PUT responses, the second in /expenses/stats.
 * decimal.js normalizes exact results and rounds inexact ones, so both rules are reimposed here.
 */
export function decMul(a: string, b: string): string {
  const exact = new ExactDecimal(a).times(b);
  if (exact.precision() <= 28) {
    return exact.toFixed(scaleOf(a) + scaleOf(b));
  }
  // Beyond the context precision Python rounds to 28 significant digits and keeps what it gets.
  // The rounding has to be explicit: decimal.js applies its precision to operations, not to
  // construction, so `new Decimal(exact.toString())` would carry all 50 digits through.
  return exact.toSignificantDigits(28, Decimal.ROUND_HALF_EVEN).toString();
}

/**
 * Python addition keeps the larger scale — Decimal('1.00') + Decimal('2.5') is Decimal('3.50') —
 * subject to the same precision ceiling as multiplication.
 */
export function decAdd(a: string, b: string): string {
  const exact = new ExactDecimal(a).plus(b);
  return exact.precision() <= 28
    ? exact.toFixed(Math.max(scaleOf(a), scaleOf(b)))
    : exact.toSignificantDigits(28, Decimal.ROUND_HALF_EVEN).toString();
}

/** Same rule as addition. */
export function decSub(a: string, b: string): string {
  const exact = new ExactDecimal(a).minus(b);
  return exact.precision() <= 28
    ? exact.toFixed(Math.max(scaleOf(a), scaleOf(b)))
    : new Decimal(exact.toString()).toString();
}

/**
 * Division follows Python's "ideal exponent" rule, which is subtler than the other operations:
 *   - an INEXACT quotient is carried to the context precision (28 significant digits) and printed
 *     as-is — Decimal('10.00') / 3 is 3.333333333333333333333333333;
 *   - an EXACT quotient is padded back out to scale(a) - scale(b) — Decimal('45000.00') / 6 is
 *     Decimal('7500.00'), NOT 7500, and that trailing scale is visible in /income/history's
 *     overall_average.
 * decimal.js normalizes exact results, so the padding has to be reapplied. Verified against
 * CPython's decimal module, and caught by the parity diff when it wasn't.
 */
export function decDiv(a: string, b: string): string {
  const quotient = new Decimal(a).div(b);
  const isExact = quotient.times(b).equals(new Decimal(a));
  if (!isExact) return quotient.toString();
  const idealScale = Math.max(0, scaleOf(a) - scaleOf(b));
  return quotient.toFixed(Math.max(idealScale, quotient.decimalPlaces()));
}

export function decIsZero(value: string): boolean {
  return new Decimal(value).isZero();
}

/** -1 | 0 | 1, numeric rather than lexical ('9' < '10'). */
export function decCmp(a: string, b: string): number {
  return new Decimal(a).comparedTo(b);
}

/** Returns whichever operand is smaller, with its original scale intact. */
export function decMin(a: string, b: string): string {
  return decCmp(a, b) <= 0 ? a : b;
}

/** Quantize to N places, half-even — mirrors CurrencyService's `converted.quantize(...)`. */
export function decQuantize(value: string, places: number): string {
  return new Decimal(value).toFixed(places, Decimal.ROUND_HALF_EVEN);
}

/** The DB string, untouched — what pydantic emits for a Decimal read straight off the ORM object. */
export function rawMoney(value: string): string {
  return value;
}

/**
 * What FastAPI's income list/detail handlers emit, because they cast through float() before pydantic
 * re-validates into a Decimal. Python's str(float) always keeps a fractional part — str(1000.0) is
 * '1000.0' where JS String(1000) is '1000' — so the '.0' has to be re-attached.
 */
export function pyFloatMoney(value: string): string {
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber)) return value;
  const printed = String(asNumber);
  return printed.includes('.') || printed.includes('e')
    ? printed
    : `${printed}.0`;
}
