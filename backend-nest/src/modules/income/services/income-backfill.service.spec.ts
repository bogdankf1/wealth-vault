import { advance } from './income-backfill.service';

describe('advance — relativedelta-equivalent calendar stepping', () => {
  it('steps by whole days for weekly and biweekly', () => {
    expect(advance('2026-01-01T00:00:00', { days: 7 })).toBe(
      '2026-01-08T00:00:00',
    );
    expect(advance('2026-01-01T00:00:00', { days: 14 })).toBe(
      '2026-01-15T00:00:00',
    );
    expect(advance('2026-02-25T00:00:00', { days: 7 })).toBe(
      '2026-03-04T00:00:00',
    );
  });

  it('clamps a month step to the last valid day', () => {
    expect(advance('2026-01-31T00:00:00', { months: 1 })).toBe(
      '2026-02-28T00:00:00',
    );
    expect(advance('2024-01-31T00:00:00', { months: 1 })).toBe(
      '2024-02-29T00:00:00',
    );
  });

  // The clamp is sticky: relativedelta steps from the PREVIOUS value, not the original anchor,
  // so a Jan 31 start never returns to the 31st. Re-anchoring would produce different deposits.
  it('stays clamped on subsequent steps', () => {
    const feb = advance('2026-01-31T00:00:00', { months: 1 });
    const mar = advance(feb, { months: 1 });
    expect(mar).toBe('2026-03-28T00:00:00');
  });

  it('rolls the year over', () => {
    expect(advance('2026-12-15T00:00:00', { months: 1 })).toBe(
      '2027-01-15T00:00:00',
    );
    expect(advance('2026-10-15T00:00:00', { months: 3 })).toBe(
      '2027-01-15T00:00:00',
    );
    expect(advance('2026-03-15T00:00:00', { months: 12 })).toBe(
      '2027-03-15T00:00:00',
    );
  });

  it('preserves the time of day', () => {
    expect(advance('2026-01-15T09:30:00', { months: 1 })).toBe(
      '2026-02-15T09:30:00',
    );
  });
});
