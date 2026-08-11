import { currentPeriodRange, nextTaxPaymentDate } from './tax-period';

// Expectations produced by running get_current_period_range / calculate_next_payment_date under
// CPython with dateutil, then isoformat()-ing the results.
describe('currentPeriodRange', () => {
  it.each([
    [
      'monthly',
      '2026-08-11T15:27:26',
      '2026-08-01T00:00:00',
      '2026-08-31T23:59:59',
    ],
    [
      'monthly',
      '2026-02-05T00:00:00',
      '2026-02-01T00:00:00',
      '2026-02-28T23:59:59',
    ],
    [
      'monthly',
      '2024-02-05T00:00:00',
      '2024-02-01T00:00:00',
      '2024-02-29T23:59:59',
    ],
    [
      'monthly',
      '2026-12-31T23:00:00',
      '2026-12-01T00:00:00',
      '2026-12-31T23:59:59',
    ],
    [
      'quarterly',
      '2026-08-11T15:27:26',
      '2026-07-01T00:00:00',
      '2026-09-30T23:59:59',
    ],
    [
      'quarterly',
      '2026-01-01T00:00:00',
      '2026-01-01T00:00:00',
      '2026-03-31T23:59:59',
    ],
    [
      'quarterly',
      '2026-12-15T00:00:00',
      '2026-10-01T00:00:00',
      '2026-12-31T23:59:59',
    ],
    [
      'annually',
      '2026-08-11T15:27:26',
      '2026-01-01T00:00:00',
      '2026-12-31T23:59:59.999999',
    ],
  ])('%s at %s -> %s .. %s', (frequency, reference, start, end) => {
    expect(currentPeriodRange(frequency, reference)).toEqual({
      periodStart: start,
      periodEnd: end,
    });
  });

  it('falls back to monthly for an unrecognised frequency', () => {
    expect(currentPeriodRange('fortnightly', '2026-08-11T15:27:26')).toEqual({
      periodStart: '2026-08-01T00:00:00',
      periodEnd: '2026-08-31T23:59:59',
    });
  });

  it('accepts the space-separated form Postgres hands back', () => {
    expect(
      currentPeriodRange('monthly', '2026-08-11 15:27:26').periodStart,
    ).toBe('2026-08-01T00:00:00');
  });
});

describe('nextTaxPaymentDate', () => {
  it.each([
    ['monthly', '2026-08-11T15:27:26', '2026-09-11T15:27:26'],
    ['quarterly', '2026-08-11T15:27:26', '2026-11-11T15:27:26'],
    ['annually', '2026-08-11T15:27:26', '2027-08-11T15:27:26'],
    ['monthly', '2026-01-31T00:00:00', '2026-02-28T00:00:00'],
    ['annually', '2024-02-29T00:00:00', '2025-02-28T00:00:00'],
  ])('%s from %s -> %s', (frequency, from, expected) => {
    expect(nextTaxPaymentDate(frequency, from)).toBe(expected);
  });
});
