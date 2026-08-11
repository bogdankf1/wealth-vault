import { toNaiveIso, toNaiveTimestamp } from './naive-timestamp';

describe('toNaiveIso — DB text → pydantic naive isoformat', () => {
  it('swaps the separator and nothing else', () => {
    expect(toNaiveIso('2025-12-01 00:00:00')).toBe('2025-12-01T00:00:00');
    expect(toNaiveIso('2026-01-01 09:30:15.123456')).toBe(
      '2026-01-01T09:30:15.123456',
    );
  });

  it('passes null through', () => {
    expect(toNaiveIso(null)).toBeNull();
  });

  // The whole point of the OID 1114 parser: if a Date ever reaches here, the day may already be
  // wrong, so the helper must not quietly accept one.
  it('accepts a Date only by formatting it in UTC', () => {
    expect(toNaiveIso(new Date('2025-12-01T00:00:00Z'))).toBe(
      '2025-12-01T00:00:00',
    );
  });
});

describe('toNaiveTimestamp — inbound value → what we store', () => {
  it('discards the offset instead of converting it (pydantic replace(tzinfo=None))', () => {
    expect(toNaiveTimestamp('2024-01-01T23:00:00-05:00')).toBe(
      '2024-01-01T23:00:00',
    );
    expect(toNaiveTimestamp('2024-01-01T00:00:00Z')).toBe(
      '2024-01-01T00:00:00',
    );
    expect(toNaiveTimestamp('2024-01-01T00:00:00+05:00')).toBe(
      '2024-01-01T00:00:00',
    );
    expect(toNaiveTimestamp('2024-01-01T00:00:00+0500')).toBe(
      '2024-01-01T00:00:00',
    );
  });

  it('keeps an already-naive value', () => {
    expect(toNaiveTimestamp('2024-01-01T00:00:00')).toBe('2024-01-01T00:00:00');
    expect(toNaiveTimestamp('2024-01-01 00:00:00')).toBe('2024-01-01T00:00:00');
  });

  it('expands a bare date', () => {
    expect(toNaiveTimestamp('2024-01-01')).toBe('2024-01-01T00:00:00');
  });

  it('keeps fractional seconds', () => {
    expect(toNaiveTimestamp('2024-01-01T09:30:15.123456Z')).toBe(
      '2024-01-01T09:30:15.123456',
    );
  });
});

describe('toNaiveIso — microsecond padding', () => {
  it("pads the fraction to six digits, as Python's isoformat does", () => {
    // Postgres prints '.92364'; pydantic prints '.923640'. The parity diff on the expenses list
    // is what surfaced this.
    expect(toNaiveIso('2026-06-24 09:16:51.92364')).toBe(
      '2026-06-24T09:16:51.923640',
    );
    expect(toNaiveIso('2026-06-24 09:16:51.5')).toBe(
      '2026-06-24T09:16:51.500000',
    );
  });

  it('leaves a whole-second timestamp without a fraction', () => {
    expect(toNaiveIso('2026-06-24 09:16:51')).toBe('2026-06-24T09:16:51');
  });
});
