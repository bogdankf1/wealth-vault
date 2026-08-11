import { types } from 'pg';

const TIMESTAMP_WITHOUT_TIME_ZONE = 1114;

/**
 * node-postgres parses `timestamp without time zone` into a JS Date **interpreted in the process
 * timezone**, so `2025-12-01 00:00:00` becomes 2025-11-30T22:00:00.000Z on a UTC+3 machine — a
 * different calendar day, not a formatting difference. FastAPI emits '2025-12-01T00:00:00'.
 * Keeping the raw string is the only representation that survives the round trip; the money
 * convention is the same idea for the same reason.
 *
 * Scope: OID 1114 only. `timestamptz` (1184) keeps its Date behavior, because Phase 0's
 * user-response mapper calls .toISOString() on it.
 */
export function registerNaiveTimestampParser(): void {
  types.setTypeParser(TIMESTAMP_WITHOUT_TIME_ZONE, (value: string) => value);
}

/** '2025-12-01 00:00:00' → '2025-12-01T00:00:00', matching pydantic's naive isoformat(). */
export function toNaiveIso(value: string | Date | null): string | null {
  if (value === null) return null;
  // A Date only reaches here if the type parser was not registered; format it in UTC rather than
  // through toISOString()'s 'Z' suffix, which would announce a timezone the column doesn't have.
  if (value instanceof Date)
    return value.toISOString().replace(/\.\d+Z$|Z$/, '');
  return value.replace(' ', 'T');
}

/**
 * Inbound normalisation. Mirrors the pydantic validator on IncomeSourceBase/IncomeTransactionBase:
 * an offset is DISCARDED, not converted — '2024-01-01T23:00:00-05:00' stores 23:00, because the
 * comment in the Python says it "preserves the local date that the user selected".
 */
export function toNaiveTimestamp(value: string): string {
  const withoutOffset = value.trim().replace(/(Z|[+-]\d{2}:?\d{2})$/, '');
  const normalised = withoutOffset.replace(' ', 'T');
  return normalised.includes('T') ? normalised : `${normalised}T00:00:00`;
}
