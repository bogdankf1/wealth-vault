# NestJS Backend v2 — Phase 1 (Income) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the FastAPI `income` module — 18 endpoints under `/api/v1/income` — to `backend-nest/`,
byte-for-byte compatible where practical, and in doing so settle the six conventions that the
remaining 17 modules will copy.

**Architecture:** Income is the template module. Its endpoints are thin controllers over services that
never see an unscoped repository: every query goes through `OwnedRepository`, which requires a
`userId`. Money and naive timestamps stay **strings** end to end — no `number`, no `Date` — because
both are lossy in JS and both would silently break parity. Response mapping is a separate, pure,
unit-tested layer, because FastAPI's own serialization is inconsistent per verb and the mapper is
where that inconsistency is reproduced deliberately rather than accidentally.

**Tech Stack:** As Phase 0, plus `decimal.js` (exact decimal arithmetic configured to match Python's
`decimal` default context: 28 significant digits, ROUND_HALF_EVEN).

**Source of truth:** `backend/app/modules/income/{router,schemas,models,service,distribution_service}.py`,
`backend/app/modules/savings/transaction_service/{mutations,base}.py`,
`backend/app/services/currency_service.py`. Live schema via psql; live responses via the running
FastAPI on :8000 (every JSON sample in this plan was captured from it on 2026-08-11, not guessed).

**Prerequisites:** `docker start wealth-vault-postgres wealth-vault-redis`, FastAPI running on :8000
for parity (`PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m uvicorn app.main:app --port 8000` from
`backend/`). Work happens on a branch off `main`.

---

## Decisions (the actual Phase 1 deliverable)

The spec left four decisions open. Research turned up two more that matter just as much, so there are
six. Each applies to all 17 remaining modules.

### D1 — Pagination envelope: one shared query DTO, two envelope builders

FastAPI has **two** list shapes and the port must keep both:
`{items, total, page, page_size}` for sources/transactions, `{items, total}` for distribution rules
(where `total` is `len(items)`, not a COUNT). So: a shared `PageQueryDto` (`page` ≥ 1 default 1,
`page_size` 1–100 default 50) and two one-line builders. No generic base controller, no
`has_next`/`pages` invention.

### D2 — Ownership scoping: structural, via `OwnedRepository`

FastAPI repeats `.where(Model.user_id == current_user.id)` by hand ~40 times in this module alone.
Repeating that across 205 handlers guarantees an eventual omission, and an omission here is a
cross-tenant data leak — the FastAPI code **already has one** (see Deviation 5). Services therefore
never receive a `Repository<T>`; they receive an `OwnedRepository<T>` whose every method takes
`userId` as its first argument and injects `user_id = :userId` plus `deleted_at IS NULL` into the
query it builds. Getting a user-scoped query wrong now requires deliberately reaching around the API.

### D3 — Transaction boundaries: one transaction per use case

FastAPI has **no** explicit transaction anywhere in the codebase (`grep` for `begin_nested|session.begin`
returns nothing), and its deposit helper commits internally — so a 3-rule distribution performs ≥4
commits and a mid-loop failure leaves money half-moved. Nest wraps each multi-row use case
(`createSource` + backfill, `updateSource` + sync, `deposit`, `applyDistribution`) in
`dataSource.transaction()`. This is a deliberate behavioral improvement, invisible on the happy path
(same responses), and it is the convention Phase 3's savings transfers will need.

### D4 — Money: strings end to end, with two serializers

Money never becomes a JS `number` in the app. Inbound DTOs validate a numeric *string*
(`@IsMoneyString()`, mirroring pydantic's `ge=0, decimal_places=2`); arithmetic uses `decimal.js`;
storage is TypeORM's native `numeric`→string. Output uses one of exactly two serializers, chosen per
endpoint to match FastAPI:

| Serializer | Emits | Used by |
|---|---|---|
| `rawMoney(s)` | the DB string unchanged — `"1000.00"` | POST/PUT source, all transaction responses, rule responses, stats, history |
| `pyFloatMoney(s)` | Python's `str(float(...))` — `"1000.0"` | GET `/sources`, GET `/sources/{id}` only |

The split is not a style choice: FastAPI's list/detail handlers hand-build dicts with `float()` casts,
its create/update handlers use `model_validate`, and **the same row therefore serializes differently
depending on the verb.** Verified live:

```
POST /income/sources     → "amount": "1000.00"   GET /income/sources/{id} → "amount": "1000.0"
PUT  amount=100.50       → "amount": "100.50"    GET same row             → "amount": "100.5"
```

### D5 — Naive timestamps: strings too, via a pg type parser

`income_*.date`, `start_date`, `end_date` are `timestamp WITHOUT time zone`. node-postgres parses OID
1114 into a JS `Date` **interpreted in the process timezone**, so `2025-12-01 00:00:00` becomes
`2025-11-30T22:00:00.000Z` on this machine — not a formatting difference, a **different calendar day**.
FastAPI emits `"2025-12-01T00:00:00"`.

Fix: register `pg.types.setTypeParser(1114, (v) => v)` at bootstrap so naive timestamps arrive as raw
strings; map those columns as `string`; the mapper emits `s.replace(' ', 'T')`. This reproduces
pydantic exactly, including the fractional-seconds case, and removes a whole class of timezone bug
from every module that follows. `timestamptz` columns (OID 1184) are left alone — Phase 0 depends on
their `Date` behavior and the parity script already normalizes the `Z`-vs-`+00:00` difference.

### D6 — Enum storage vs. wire values are different alphabets

SQLAlchemy's `Enum(native_enum=False)` stores the **member name**; pydantic serializes the **value**.
So the DB holds `MONTHLY` / `RECEIVED` / `PERCENTAGE` and the JSON says `monthly` / `received` /
`percentage`. Entities store the uppercase name; DTOs and responses use lowercase; one mapping object
per enum, no `toLowerCase()` shortcuts (`ONE_TIME` → `one_time` survives that, but relying on it
invites a break the first time an enum isn't a clean snake-case pair).

### D7 — Currency conversion: read-only port

`CurrencyService.convert_amount` returns `1.0` for same-currency, else a cached rate, else **fetches
from an external API and writes the rate back**. Nest ports the read half only: same currency → no
conversion; otherwise the most recent `exchange_rates` row; otherwise `null`, which callers treat the
way FastAPI does (fall back to the unconverted amount). No outbound HTTP, no rate writes. For every
user whose display currency equals their source currency — all current dev users — behavior is
identical.

---

## Deliberate deviations from FastAPI (documented, not accidental)

1. **`POST /income/transactions` is implemented; FastAPI 500s.** `IncomeTransactionCreate` carries
   `deposit_to_account_id`, which is not a column, and the router passes `**model_dump()` straight
   into the model constructor — so every call raises `TypeError` and returns
   `{"error":"Internal server error",...}` with no row written. Verified live. Nest creates the
   transaction and **ignores** `deposit_to_account_id` (accepting it keeps the request contract).
   Porting a 500 into a new backend would be absurd; this row in the parity list is expected to differ
   and is annotated as such.
2. **Multi-row use cases are atomic** (D3). FastAPI persists partial work on failure; Nest rolls back.
3. **The cross-tenant name leak is fixed.** `update_rule` never validates `income_source_id`
   ownership, and `enrich_rule_response` then reads `.name` off whatever row that id points at — so a
   user can set `income_source_id` to another user's source and read its name back. Nest validates
   ownership on update exactly as create does, and every enrichment lookup is user-scoped. Same
   posture as Phase 0's FeatureGuard: Nest is stricter where FastAPI leaks.
4. **`deposited_to_account_id` is set from the first *account* distribution, not `distributions[0]`.**
   FastAPI uses `preview.distributions[0].target_id`, which is a **goal** id when a goal rule sorts
   first — written into a column whose FK points at `savings_accounts`, i.e. a guaranteed FK violation.
   Nest uses the account that was actually credited.
5. **Goal `progress_percentage` is capped at 100.** FastAPI's inline update is uncapped into a
   `numeric(5,2)` column, so 1000%+ progress raises a numeric-overflow error mid-distribution. (Its
   own snapshot helper caps it — the two disagree inside one function.)
6. **No external FX fetch** (D7).
7. Everything else that is observable is replicated **exactly**, bugs included: the per-verb decimal
   formatting (D4), the two different frequency-multiplier tables, `total_transactions` counting
   *sources* not transactions, `remaining_amount` going negative when percentages exceed 100%,
   `target_account_name`/`deposited_to_account_name` always `null`, `PUT` behaving like `PATCH`, and
   endpoint #18 emitting `amount` as a JSON **number** while every other amount is a string.

---

## Parity-critical constants

**Frequency → monthly multiplier.** Two tables, used in different places. This is not a bug to fix —
both are observable.

| frequency | `calculate_monthly_amount()` (used by `monthly_equivalent`, stats) | `get_income_history()` |
|---|---|---|
| one_time | `0` | `0` |
| weekly | `4.33` | `4.33333` |
| biweekly | `2.17` | `2.16667` |
| monthly | `1` | `1` |
| quarterly | `0.33` | `0.333333` |
| annually | `0.083` | `0.083333` |

Multiplication must reproduce Python `Decimal` scale semantics: **scale(result) = scale(a) + scale(b)**,
no normalization. `100.50 × 0.083 = 8.34150` (not `8.3415`). Verified live: `GET` of a 100.50/annually
source returns `monthly_equivalent: "8.3415"` — scale 5 produced by the multiply, then collapsed by
`pyFloatMoney`. A POST/PUT of the same value returns the un-collapsed string.

**Error bodies** (exact strings; `{error,details,status_code}` = AppException, `{detail}` = DetailException):

| Condition | Status | Body |
|---|---|---|
| source not found / not owned / soft-deleted | 404 | `{"error":"Income source not found","details":{},"status_code":404}` |
| rule not found | 404 | `{"error":"Distribution rule not found","details":{},"status_code":404}` |
| deposit: txn missing | 400 | `{"detail":"Income transaction not found"}` |
| deposit: already deposited | 400 | `{"detail":"Income has already been deposited"}` |
| deposit: bad account | 400 | `{"detail":"Invalid target account"}` |
| deposit: engine threw | 400 | `{"detail":"Failed to create deposit: <msg>"}` |
| rule: no target | 400 | `{"detail":"Rule must have either a target account or target goal"}` |
| rule: percentage type, no percentage | 400 | `{"detail":"Percentage type requires percentage value"}` |
| rule: fixed_amount type, no amount | 400 | `{"detail":"Fixed amount type requires amount value"}` |
| rule: bad income source | 400 | `{"detail":"Invalid income source"}` |
| rule: bad target account | 400 | `{"detail":"Invalid target account"}` |
| rule: bad target goal | 400 | `{"detail":"Invalid target goal"}` |
| distribute: txn missing | 400 | `{"detail":"Income transaction not found"}` |
| source limit reached | 403 | `{"error":"Income source limit reached. Your {tier} tier allows {limit} sources.","details":{"current_tier":"{tier}","required_tier":"growth"|"wealth"},"status_code":403}` |

**HTTP status codes** (Nest defaults are wrong for half of these — set them explicitly):
201 for the three POST creates; **204** for both DELETEs; **200** for `batch-delete`, `deposit`,
`distribution-preview`, `distribute`.

**Response key order** does not matter (the parity script sorts keys, and JSON objects are unordered),
but field *presence* does — `null` fields must be present, never omitted.

---

## File structure

```
backend-nest/src/
  common/
    money/
      money.ts                     # rawMoney, pyFloatMoney, decMul/decAdd/decDiv, scaleOf
      money.spec.ts
      is-money-string.decorator.ts # @IsMoneyString (ge=0, ≤2dp) + @IsDecimalString
    time/
      naive-timestamp.ts           # toNaiveIso, stripOffset; OID 1114 parser registration
      naive-timestamp.spec.ts
    dto/
      page-query.dto.ts            # page/page_size + paginated()/listed() builders
    repository/
      owned.repository.ts          # D2 — the only way a service touches the DB
      owned.repository.spec.ts
  modules/
    savings/                       # PARTIAL — Phase 3 owns this module; Phase 1 lands only what
      entities/                    #   income's deposit path needs, in its final location.
        savings-account.entity.ts
        account-transaction.entity.ts
        balance-history.entity.ts
      deposit.service.ts           # port of TransactionService.create_deposit
      savings.module.ts
    goals/                         # PARTIAL — same deal
      entities/{goal,goal-progress-history}.entity.ts
      goal-progress.service.ts     # port of record_progress_snapshot
      goals.module.ts
    currency/                      # PARTIAL — read-only converter (D7)
      entities/{currency,exchange-rate}.entity.ts
      currency-converter.service.ts
      currency.module.ts
    income/
      income.module.ts
      income.controller.ts         # sources + transactions + stats + history + deposit
      distribution.controller.ts   # rules + preview + distribute
      entities/{income-source,income-transaction,income-distribution-rule}.entity.ts
      dto/                         # one file per request shape
      mappers/income-response.mapper.ts
      services/
        income-sources.service.ts
        income-transactions.service.ts
        income-stats.service.ts
        income-history.service.ts
        income-deposit.service.ts
        income-backfill.service.ts
        distribution.service.ts
      enums.ts
test/
  income-sources.e2e-spec.ts, income-transactions.e2e-spec.ts,
  income-stats.e2e-spec.ts, income-distribution.e2e-spec.ts
scripts/requests/income.json       # parity rows for this module
```

Two controllers rather than one because the distribution surface (7 endpoints, its own service and
error vocabulary) is independently testable; splitting by responsibility, not by layer.

---

### Task 1: The conventions kit (money, naive timestamps, pagination, owned repository)

**Files:**
- Create: `src/common/money/money.ts`, `money.spec.ts`, `src/common/money/is-money-string.decorator.ts`
- Create: `src/common/time/naive-timestamp.ts`, `naive-timestamp.spec.ts`
- Create: `src/common/dto/page-query.dto.ts`
- Create: `src/common/repository/owned.repository.ts`, `owned.repository.spec.ts`
- Modify: `src/main.ts`, `src/app.setup.ts` (register the pg type parser)

This task is D1/D2/D4/D5 in code. Nothing else in Phase 1 works without it.

- [ ] **Step 1: Install decimal.js**

```bash
cd backend-nest && npm i decimal.js
```

- [ ] **Step 2: Write the failing money tests**

`src/common/money/money.spec.ts`:

```typescript
import { decAdd, decDiv, decMul, pyFloatMoney, rawMoney, scaleOf } from './money';

describe('scaleOf', () => {
  it.each([
    ['1000.00', 2],
    ['1000', 0],
    ['0.083', 3],
  ])('%s → %i', (input, expected) => expect(scaleOf(input)).toBe(expected));
});

describe('decMul — Python Decimal scale semantics: scale(a)+scale(b)', () => {
  it('keeps trailing zeros the way Python does', () => {
    expect(decMul('1000.00', '1')).toBe('1000.00');
    expect(decMul('100.50', '0.083')).toBe('8.34150');
    expect(decMul('0.10', '4.33')).toBe('0.4330');
    expect(decMul('6500.00', '1')).toBe('6500.00');
  });
});

describe('decAdd — scale is max(scale(a), scale(b))', () => {
  it('adds without normalizing', () => {
    expect(decAdd('6500.00', '1000.00')).toBe('7500.00');
    expect(decAdd('8.34150', '1.00')).toBe('9.34150');
  });
});

describe('decDiv — 28 significant digits, like Python decimal', () => {
  it('divides exactly when it can', () => {
    expect(decDiv('7500.00', '2')).toBe('3750');
  });

  it('emits Python-length repeating fractions', () => {
    expect(decDiv('10.00', '3')).toBe('3.333333333333333333333333333');
  });
});

describe('pyFloatMoney — reproduces Python str(float(Decimal))', () => {
  it.each([
    ['1000.00', '1000.0'],
    ['100.50', '100.5'],
    ['8.34150', '8.3415'],
    ['0.10', '0.1'],
    ['1234.56', '1234.56'],
    ['6500.00', '6500.0'],
  ])('%s → %s', (input, expected) => expect(pyFloatMoney(input)).toBe(expected));
});

describe('rawMoney', () => {
  it('passes the DB string through untouched', () => {
    expect(rawMoney('1000.00')).toBe('1000.00');
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx jest src/common/money --verbose` → FAIL, `Cannot find module './money'`.

- [ ] **Step 4: Implement money.ts**

```typescript
import Decimal from 'decimal.js';

// Python's `decimal` default context is 28 significant digits, ROUND_HALF_EVEN. Matching it is what
// makes get_income_history's `overall_average` (an unrounded Decimal division) come out identical.
// The toExp* bounds are pushed out so toString() never switches to exponential notation — Python's
// str(Decimal) doesn't, and a "1e+21" in a money field would be a parity break.
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_EVEN,
  toExpNeg: -9e15,
  toExpPos: 9e15,
});

/** Number of digits after the decimal point, as Python's Decimal exponent would report it. */
export function scaleOf(value: string): number {
  const dot = value.indexOf('.');
  return dot === -1 ? 0 : value.length - dot - 1;
}

/**
 * Python multiplies Decimals by adding exponents: Decimal('100.50') * Decimal('0.083') is
 * Decimal('8.34150') — scale 5, trailing zero preserved. decimal.js normalizes instead, so the
 * scale has to be reimposed. Do NOT "simplify" this to .toString().
 */
export function decMul(a: string, b: string): string {
  return new Decimal(a).times(b).toFixed(scaleOf(a) + scaleOf(b));
}

/** Python addition keeps the larger scale: Decimal('1.00') + Decimal('2.5') → Decimal('3.50'). */
export function decAdd(a: string, b: string): string {
  return new Decimal(a).plus(b).toFixed(Math.max(scaleOf(a), scaleOf(b)));
}

export function decSub(a: string, b: string): string {
  return new Decimal(a).minus(b).toFixed(Math.max(scaleOf(a), scaleOf(b)));
}

/** Division is the one operation Python does NOT pad — the context precision decides the digits. */
export function decDiv(a: string, b: string): string {
  return new Decimal(a).div(b).toString();
}

export function decIsZero(value: string): boolean {
  return new Decimal(value).isZero();
}

export function decCmp(a: string, b: string): number {
  return new Decimal(a).comparedTo(b);
}

export function decMin(a: string, b: string): string {
  return decCmp(a, b) <= 0 ? a : b;
}

/** Quantize to N places, half-even — mirrors CurrencyService's `converted.quantize(...)`. */
export function decQuantize(value: string, places: number): string {
  return new Decimal(value).toFixed(places, Decimal.ROUND_HALF_EVEN);
}

/** The DB string, untouched. What pydantic emits for a Decimal read straight off the ORM object. */
export function rawMoney(value: string): string {
  return value;
}

/**
 * What FastAPI's list/detail handlers emit, because they cast through float() before pydantic
 * re-validates into a Decimal. Python's str(float) always keeps a fractional part — str(1000.0) is
 * '1000.0', where JS String(1000) is '1000' — so the '.0' has to be re-attached.
 */
export function pyFloatMoney(value: string): string {
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber)) return value;
  const printed = String(asNumber);
  return printed.includes('.') || printed.includes('e') ? printed : `${printed}.0`;
}
```

- [ ] **Step 5: Run to verify the money tests pass**

Run: `npx jest src/common/money --verbose` → PASS (five suites).

- [ ] **Step 6: Money validation decorator**

`src/common/money/is-money-string.decorator.ts`:

```typescript
import { applyDecorators } from '@nestjs/common';
import { Matches } from 'class-validator';

// Mirrors pydantic's `Decimal = Field(ge=0, decimal_places=2)`: non-negative, at most two decimal
// places. Deliberately NOT @IsNumber + @Type(() => Number) — money never becomes a JS number here
// (D4), and portfolio_assets.quantity is numeric(18,8), more digits than a double holds exactly.
const MONEY = /^\d+(\.\d{1,2})?$/;

export function IsMoneyString(): PropertyDecorator {
  return applyDecorators(
    Matches(MONEY, { message: 'must be a non-negative number with at most 2 decimal places' }),
  );
}

/** For `IncomeDistributionRuleBase.amount`, which has ge=0 but NO decimal_places constraint. */
const DECIMAL = /^\d+(\.\d+)?$/;

export function IsDecimalString(): PropertyDecorator {
  return applyDecorators(Matches(DECIMAL, { message: 'must be a non-negative number' }));
}
```

- [ ] **Step 7: Write the failing naive-timestamp tests**

`src/common/time/naive-timestamp.spec.ts`:

```typescript
import { toNaiveIso, toNaiveTimestamp } from './naive-timestamp';

describe('toNaiveIso — DB text → pydantic naive isoformat', () => {
  it('swaps the separator and nothing else', () => {
    expect(toNaiveIso('2025-12-01 00:00:00')).toBe('2025-12-01T00:00:00');
    expect(toNaiveIso('2026-01-01 09:30:15.123456')).toBe('2026-01-01T09:30:15.123456');
  });

  it('passes null through', () => {
    expect(toNaiveIso(null)).toBeNull();
  });
});

describe('toNaiveTimestamp — inbound value → what we store', () => {
  it('discards the offset instead of converting it (pydantic replace(tzinfo=None))', () => {
    expect(toNaiveTimestamp('2024-01-01T23:00:00-05:00')).toBe('2024-01-01T23:00:00');
    expect(toNaiveTimestamp('2024-01-01T00:00:00Z')).toBe('2024-01-01T00:00:00');
    expect(toNaiveTimestamp('2024-01-01T00:00:00+05:00')).toBe('2024-01-01T00:00:00');
  });

  it('keeps an already-naive value', () => {
    expect(toNaiveTimestamp('2024-01-01T00:00:00')).toBe('2024-01-01T00:00:00');
  });

  it('expands a bare date', () => {
    expect(toNaiveTimestamp('2024-01-01')).toBe('2024-01-01T00:00:00');
  });
});
```

- [ ] **Step 8: Run to verify failure, then implement**

Run: `npx jest src/common/time --verbose` → FAIL.

`src/common/time/naive-timestamp.ts`:

```typescript
import { types } from 'pg';

const TIMESTAMP_WITHOUT_TIME_ZONE = 1114;

/**
 * node-postgres parses `timestamp without time zone` into a JS Date **interpreted in the process
 * timezone**, so `2025-12-01 00:00:00` becomes 2025-11-30T22:00:00.000Z on a UTC+3 machine — a
 * different calendar day, not a formatting difference. FastAPI emits '2025-12-01T00:00:00'.
 * Keeping the raw string is the only representation that survives the round trip; the money
 * convention (D4) is the same idea for the same reason.
 *
 * Scope: OID 1114 only. `timestamptz` (1184) keeps its Date behavior because Phase 0's
 * user-response mapper calls .toISOString() on it.
 */
export function registerNaiveTimestampParser(): void {
  types.setTypeParser(TIMESTAMP_WITHOUT_TIME_ZONE, (value: string) => value);
}

/** '2025-12-01 00:00:00' → '2025-12-01T00:00:00', matching pydantic's naive isoformat(). */
export function toNaiveIso(value: string | null): string | null {
  return value === null ? null : value.replace(' ', 'T');
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
```

Call `registerNaiveTimestampParser()` at the top of `configureApp()` in `src/app.setup.ts` (so e2e
suites get it too) **and** before `NestFactory.create` in `main.ts`. It must run before the first
query, and registering twice is harmless.

- [ ] **Step 9: Run the time tests** → `npx jest src/common/time --verbose` → PASS.

- [ ] **Step 10: Pagination DTO**

`src/common/dto/page-query.dto.ts`:

```typescript
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** FastAPI: page = Query(1, ge=1), page_size = Query(50, ge=1, le=100). */
export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page_size: number = 50;
}

/** {items, total, page, page_size} — sources and transactions. */
export function paginated<T>(items: T[], total: number, query: PageQueryDto) {
  return { items, total, page: query.page, page_size: query.page_size };
}

/** {items, total} — distribution rules, where FastAPI sets total = len(items). */
export function listed<T>(items: T[]) {
  return { items, total: items.length };
}
```

- [ ] **Step 11: Write the failing OwnedRepository tests**

`src/common/repository/owned.repository.spec.ts`:

```typescript
import { OwnedRepository } from './owned.repository';

interface Row {
  id: string;
  userId: string;
}

function fakeRepo() {
  return {
    target: class {},
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn(),
  };
}

describe('OwnedRepository', () => {
  it('injects user_id into findOne', async () => {
    const repo = fakeRepo();
    await new OwnedRepository<Row>(repo as never).findOne('u-1', { id: 'x' } as never);
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'x', userId: 'u-1' } });
  });

  it('injects user_id into find, preserving order and paging options', async () => {
    const repo = fakeRepo();
    await new OwnedRepository<Row>(repo as never).find('u-1', {
      where: { id: 'x' } as never,
      order: { id: 'DESC' } as never,
      skip: 10,
      take: 5,
    });
    expect(repo.find).toHaveBeenCalledWith({
      where: { id: 'x', userId: 'u-1' },
      order: { id: 'DESC' },
      skip: 10,
      take: 5,
    });
  });

  it('injects user_id into count', async () => {
    const repo = fakeRepo();
    await new OwnedRepository<Row>(repo as never).count('u-1');
    expect(repo.count).toHaveBeenCalledWith({ where: { userId: 'u-1' } });
  });

  it('pre-scopes a query builder', () => {
    const repo = fakeRepo();
    const qb = { andWhere: jest.fn().mockReturnThis() };
    repo.createQueryBuilder.mockReturnValue(qb);
    new OwnedRepository<Row>(repo as never).qb('u-1', 's');
    expect(repo.createQueryBuilder).toHaveBeenCalledWith('s');
    expect(qb.andWhere).toHaveBeenCalledWith('s.user_id = :ownerId', { ownerId: 'u-1' });
  });
});
```

- [ ] **Step 12: Run to verify failure, then implement**

Run: `npx jest src/common/repository --verbose` → FAIL.

`src/common/repository/owned.repository.ts`:

```typescript
import { Provider } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  EntityManager,
  EntityTarget,
  FindOptionsOrder,
  FindOptionsWhere,
  ObjectLiteral,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';

/**
 * D2 — the only DB handle a service is given. Every method takes the owner's id first and folds
 * `user_id = :userId` into the query, so "forgot to scope by user" stops being a thing a handler
 * can do by omission. FastAPI writes that predicate by hand ~40 times in this module alone and
 * misses it in three places (see the plan's Deviation 3).
 *
 * Soft deletes need no handling here: entities carrying @DeleteDateColumn get `deleted_at IS NULL`
 * from TypeORM automatically, which is exactly what income's queries want.
 */
export class OwnedRepository<T extends ObjectLiteral> {
  constructor(private readonly repo: Repository<T>) {}

  /** Rebind onto a transaction's EntityManager (D3). Returns a new instance; this one is unchanged. */
  withManager(manager: EntityManager): OwnedRepository<T> {
    return new OwnedRepository<T>(manager.getRepository<T>(this.repo.target as EntityTarget<T>));
  }

  /** Escape hatch for writes that need the raw repo (create/save). Still owner-tagged by callers. */
  get raw(): Repository<T> {
    return this.repo;
  }

  private scope(userId: string, where?: FindOptionsWhere<T>): FindOptionsWhere<T> {
    return { ...(where ?? {}), userId } as FindOptionsWhere<T>;
  }

  findOne(userId: string, where?: FindOptionsWhere<T>): Promise<T | null> {
    return this.repo.findOne({ where: this.scope(userId, where) });
  }

  find(
    userId: string,
    options: {
      where?: FindOptionsWhere<T>;
      order?: FindOptionsOrder<T>;
      skip?: number;
      take?: number;
    } = {},
  ): Promise<T[]> {
    const { where, ...rest } = options;
    return this.repo.find({ where: this.scope(userId, where), ...rest });
  }

  count(userId: string, where?: FindOptionsWhere<T>): Promise<number> {
    return this.repo.count({ where: this.scope(userId, where) });
  }

  /** Pre-scoped builder for the aggregate queries stats/history need. */
  qb(userId: string, alias: string): SelectQueryBuilder<T> {
    return this.repo
      .createQueryBuilder(alias)
      .andWhere(`${alias}.user_id = :ownerId`, { ownerId: userId });
  }
}

export function ownedRepositoryToken(entity: EntityTarget<ObjectLiteral>): string {
  return `OwnedRepository<${getRepositoryToken(entity).toString()}>`;
}

/** Module sugar: `providers: [provideOwnedRepository(IncomeSource), ...]`. */
export function provideOwnedRepository(entity: EntityTarget<ObjectLiteral>): Provider {
  return {
    provide: ownedRepositoryToken(entity),
    inject: [getRepositoryToken(entity)],
    useFactory: (repo: Repository<ObjectLiteral>) => new OwnedRepository(repo),
  };
}
```

- [ ] **Step 13: Run tests + lint**

Run: `npx jest src/common --verbose && npm run lint` → PASS, lint exit 0.

- [ ] **Step 14: Commit**

```bash
git add backend-nest && git commit -m "feat(nest): phase 1 conventions kit — money, naive timestamps, pagination, owned repository"
```

---

### Task 2: Entities

**Files:**
- Create: `src/modules/income/enums.ts`
- Create: `src/modules/income/entities/{income-source,income-transaction,income-distribution-rule}.entity.ts`
- Create: `src/modules/savings/entities/{savings-account,account-transaction,balance-history}.entity.ts`
- Create: `src/modules/goals/entities/{goal,goal-progress-history}.entity.ts`
- Create: `src/modules/currency/entities/{currency,exchange-rate}.entity.ts`
- Test: `test/income-entities.e2e-spec.ts`

**Two schema facts that break the Phase 0 base class — read before writing any entity:**

1. `savings_accounts`, `goals`, `balance_history`, `goal_progress_history` have **`created_at`/`updated_at`
   as `timestamp WITHOUT time zone`** and **no `deleted_at` column at all**. They cannot extend
   `BaseModel` (which declares timestamptz + `@DeleteDateColumn`). Declare their columns explicitly.
   `income_*` and `currencies`/`exchange_rates` do match `BaseModel`.
2. All money columns are `numeric` → strings (never add a transformer). All naive date columns are
   typed `string` in the entity, which only works because Task 1 registered the OID 1114 parser.

- [ ] **Step 1: Enums**

`src/modules/income/enums.ts`:

```typescript
// D6: SQLAlchemy's Enum(native_enum=False) stores the member NAME; pydantic serialises the VALUE.
// The DB says 'MONTHLY', the wire says 'monthly'. Both directions are explicit — never toLowerCase().

export const INCOME_FREQUENCY_TO_WIRE = {
  ONE_TIME: 'one_time',
  WEEKLY: 'weekly',
  BIWEEKLY: 'biweekly',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  ANNUALLY: 'annually',
} as const;

export type IncomeFrequencyName = keyof typeof INCOME_FREQUENCY_TO_WIRE;
export type IncomeFrequencyWire = (typeof INCOME_FREQUENCY_TO_WIRE)[IncomeFrequencyName];

export const INCOME_FREQUENCY_TO_NAME = Object.fromEntries(
  Object.entries(INCOME_FREQUENCY_TO_WIRE).map(([name, wire]) => [wire, name]),
) as Record<IncomeFrequencyWire, IncomeFrequencyName>;

export const INCOME_STATUS_TO_WIRE = {
  EXPECTED: 'expected',
  RECEIVED: 'received',
  DEPOSITED: 'deposited',
} as const;

export type IncomeStatusName = keyof typeof INCOME_STATUS_TO_WIRE;
export type IncomeStatusWire = (typeof INCOME_STATUS_TO_WIRE)[IncomeStatusName];

export const INCOME_STATUS_TO_NAME = Object.fromEntries(
  Object.entries(INCOME_STATUS_TO_WIRE).map(([name, wire]) => [wire, name]),
) as Record<IncomeStatusWire, IncomeStatusName>;

export const DISTRIBUTION_TYPE_TO_WIRE = {
  PERCENTAGE: 'percentage',
  FIXED_AMOUNT: 'fixed_amount',
  REMAINDER: 'remainder',
} as const;

export type DistributionTypeName = keyof typeof DISTRIBUTION_TYPE_TO_WIRE;
export type DistributionTypeWire = (typeof DISTRIBUTION_TYPE_TO_WIRE)[DistributionTypeName];

export const DISTRIBUTION_TYPE_TO_NAME = Object.fromEntries(
  Object.entries(DISTRIBUTION_TYPE_TO_WIRE).map(([name, wire]) => [wire, name]),
) as Record<DistributionTypeWire, DistributionTypeName>;

/** IncomeSource.calculate_monthly_amount() — used by monthly_equivalent and stats. */
export const MONTHLY_MULTIPLIER: Record<IncomeFrequencyName, string> = {
  ONE_TIME: '0',
  WEEKLY: '4.33',
  BIWEEKLY: '2.17',
  MONTHLY: '1',
  QUARTERLY: '0.33',
  ANNUALLY: '0.083',
};

/** get_income_history()'s own table — deliberately different constants. Not a typo. */
export const HISTORY_MULTIPLIER: Record<IncomeFrequencyName, string> = {
  ONE_TIME: '0',
  WEEKLY: '4.33333',
  BIWEEKLY: '2.16667',
  MONTHLY: '1',
  QUARTERLY: '0.333333',
  ANNUALLY: '0.083333',
};
```

- [ ] **Step 2: Income entities**

`src/modules/income/entities/income-source.entity.ts`:

```typescript
import { Column, Entity } from 'typeorm';
import { BaseModel } from '../../../common/entities/base.entity';
import { IncomeFrequencyName } from '../enums';

@Entity('income_sources')
export class IncomeSource extends BaseModel {
  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  category!: string | null;

  // numeric(15,2) — arrives as a string and stays one (D4).
  @Column({ type: 'numeric', precision: 15, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  // varchar(20) holding the enum NAME, e.g. 'MONTHLY' (D6).
  @Column({ type: 'varchar', length: 20 })
  frequency!: IncomeFrequencyName;

  @Column({ type: 'boolean' })
  isActive!: boolean;

  // timestamp WITHOUT time zone → string, via the OID 1114 parser (D5).
  @Column({ type: 'timestamp', nullable: true })
  date!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  startDate!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  endDate!: string | null;

  @Column({ type: 'uuid', nullable: true })
  targetAccountId!: string | null;

  @Column({ type: 'boolean' })
  autoDeposit!: boolean;
}
```

`income-transaction.entity.ts` — same pattern, `@Entity('income_transactions')`, columns:
`userId uuid`, `sourceId uuid nullable`, `description varchar(500) nullable`,
`amount numeric(15,2) → string`, `currency varchar(3)`, `date timestamp → string` (NOT NULL),
`category varchar(50) nullable`, `notes varchar(1000) nullable`,
`depositedToAccountId uuid nullable`, `accountTransactionId uuid nullable`,
`status varchar(20) → IncomeStatusName`.

`income-distribution-rule.entity.ts` — `@Entity('income_distribution_rules')`, columns:
`userId uuid`, `incomeSourceId uuid nullable`, `targetAccountId uuid nullable`,
`targetGoalId uuid nullable`, `distributionType varchar(20) → DistributionTypeName`,
`amount numeric(12,2) nullable → string|null`, `percentage numeric(5,2) nullable → string|null`,
`priority int`, `name varchar(100) nullable`, `isActive boolean`.

- [ ] **Step 3: Savings / goals / currency entities (partial, Phase 3 owns them later)**

`src/modules/savings/entities/savings-account.entity.ts` — **no `BaseModel`**:

```typescript
import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * PARTIAL entity — Phase 1 maps only what income's deposit path touches. Phase 3 owns this module.
 * Note it does NOT extend BaseModel: this table's created_at/updated_at are `timestamp WITHOUT time
 * zone` and there is no deleted_at column, so BaseModel's timestamptz + @DeleteDateColumn would
 * both be wrong (and @DeleteDateColumn would silently append `deleted_at IS NULL` to every query
 * against a column that does not exist).
 */
@Entity('savings_accounts')
export class SavingsAccount {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  currentBalance!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'boolean' })
  isActive!: boolean;

  @Column({ type: 'timestamp' })
  createdAt!: string;

  @Column({ type: 'timestamp' })
  updatedAt!: string;
}
```

`account-transaction.entity.ts` — `@Entity('account_transactions')`, all `timestamptz` here
(`transactionDate`, `postedDate`, `createdAt`, `updatedAt` → `Date`), money columns `numeric(12,2)`
→ string: `id`, `accountId`, `userId`, `transactionType varchar(20)`, `amount`, `currency`,
`balanceBefore`, `balanceAfter`, `sourceType varchar(50) nullable`, `sourceId uuid nullable`,
`description varchar(500) nullable`, `category varchar(50) nullable`,
`referenceNumber varchar(100) nullable`, `status varchar(20)`.

`balance-history.entity.ts` — `@Entity('balance_history')`: `id`, `accountId`,
`balance numeric(12,2)`, `date timestamp → string`, `changeAmount numeric(12,2) nullable`,
`changeReason varchar(200) nullable`, `createdAt timestamp → string`. No `userId` — it is reached
only through an already-scoped account.

`goal.entity.ts` — `@Entity('goals')`, no BaseModel (naive timestamps, no deleted_at):
`id`, `userId`, `name`, `targetAmount numeric(12,2)`, `currentAmount numeric(12,2)`, `currency`,
`isActive`, `isCompleted`, `completedAt timestamp nullable → string`,
`progressPercentage numeric(5,2) nullable`, `startDate timestamp → string`, `createdAt`, `updatedAt`.

`goal-progress-history.entity.ts` — `@Entity('goal_progress_history')`: `id`, `goalId`, `userId`,
`recordedDate timestamp → string`, `currentAmount`, `targetAmount`, `progressPercentage`,
`linkedAccountsSnapshot jsonb nullable`, `triggerType varchar(30)`, `notes varchar(500) nullable`,
`createdAt timestamp → string`.

`currency.entity.ts` — `@Entity('currencies')` extends `BaseModel`: `code varchar(3)`,
`name varchar(100)`, `symbol varchar(10)`, `decimalPlaces int`, `isActive boolean`.
`exchange-rate.entity.ts` — `@Entity('exchange_rates')` extends `BaseModel`:
`fromCurrency varchar(3)`, `toCurrency varchar(3)`, `rate numeric(20,10) → string`,
`source varchar(100)`, `fetchedAt timestamp → string`, `isManualOverride boolean`.

- [ ] **Step 4: Write the mapping e2e test**

`test/income-entities.e2e-spec.ts` — same shape as Phase 0's `entities.e2e-spec.ts` (a `find()`
selects every mapped column, so it throws if a column name is wrong). Cover all ten entities, and
add one assertion that proves D5 end to end:

```typescript
it('reads naive timestamps as raw strings, not shifted Dates', async () => {
  const row = await dataSource
    .getRepository(IncomeTransaction)
    .findOne({ where: {}, order: { date: 'DESC' } });
  if (row?.date) {
    expect(typeof row.date).toBe('string');
    expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
  }
});
```

- [ ] **Step 5: Run it**

Run: `npx jest --config test/jest-e2e.json test/income-entities.e2e-spec.ts --verbose` → PASS.
A `column X does not exist` failure means the entity is wrong — the DB is the source of truth; check
with `psql "$DATABASE_URL" -c "\d <table>"`.

- [ ] **Step 6: Commit**

```bash
git add backend-nest && git commit -m "feat(nest): income entities + partial savings/goals/currency entities"
```

---

### Task 3: Request DTOs

**Files:** `src/modules/income/dto/*.ts` (one file per shape), plus `dto/index.ts` barrel.

Rules that apply to every DTO here:
- money fields use `@IsMoneyString()` (or `@IsDecimalString()` where FastAPI omits `decimal_places`),
  **never** `@Type(() => Number)`;
- naive-datetime fields are `string`, validated loosely and normalised with `toNaiveTimestamp()` via
  `@Transform`, because pydantic parses with `dateutil` and then **discards** the offset;
- `currency` is upper-cased with `@Transform`, mirroring the pydantic `field_validator`;
- update DTOs carry **no defaults** — `exclude_unset=True` semantics mean "absent" and "null" differ,
  so the service must apply only keys actually present (`Object.keys(dto)`).

- [ ] **Step 1: `create-income-source.dto.ts`**

```typescript
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { IsMoneyString } from '../../../common/money/is-money-string.decorator';
import { toNaiveTimestamp } from '../../../common/time/naive-timestamp';
import { INCOME_FREQUENCY_TO_WIRE, IncomeFrequencyWire } from '../enums';

const FREQUENCIES = Object.values(INCOME_FREQUENCY_TO_WIRE);

export class CreateIncomeSourceDto {
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string | null;

  @IsMoneyString()
  amount!: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  currency: string = 'USD';

  @IsOptional()
  @IsIn(FREQUENCIES)
  frequency: IncomeFrequencyWire = 'monthly';

  @IsOptional()
  @IsBoolean()
  is_active: boolean = true;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? toNaiveTimestamp(value) : value))
  date?: string | null;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? toNaiveTimestamp(value) : value))
  start_date?: string | null;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? toNaiveTimestamp(value) : value))
  end_date?: string | null;

  @IsOptional()
  @IsUUID()
  target_account_id?: string | null;

  @IsOptional()
  @IsBoolean()
  auto_deposit: boolean = false;
}
```

- [ ] **Step 2: the remaining DTOs**

- `update-income-source.dto.ts` — every field optional with **no default**; same validators; adds
  `sync_historical?: boolean`; **has no `date` field** (FastAPI's `IncomeSourceUpdate` omits it, so a
  one-time source's date cannot be changed via PUT) and **no date `@Transform`** (that schema has no
  validator either — offsets survive on update).
- `list-income-sources.query.ts` — extends `PageQueryDto`, adds
  `@IsOptional() @Transform(({value}) => value === 'true' ? true : value === 'false' ? false : value) @IsBoolean() is_active?: boolean`.
- `list-income-transactions.query.ts` — extends `PageQueryDto`, adds optional `source_id` (UUID),
  `start_date`, `end_date` (naive strings).
- `date-range.query.ts` — optional `start_date`, `end_date`; used by `/stats` and `/history`.
- `create-income-transaction.dto.ts` — `source_id?` UUID, `description?` ≤500, `amount` money
  (required), `currency` default `'USD'`, `date` **required** naive string, `category?` ≤50,
  `notes?` ≤1000, `deposit_to_account_id?` UUID (accepted, ignored — Deviation 1).
- `batch-delete-income-sources.dto.ts` — `@IsArray() @ArrayMinSize(1) @IsUUID('4', {each: true}) source_ids!: string[]`.
- `deposit-income.dto.ts` — `account_id!` UUID, `description?` ≤500.
- `create-distribution-rule.dto.ts` — `income_source_id?`, `target_account_id?`, `target_goal_id?`
  (all UUID), `distribution_type!` in `['percentage','fixed_amount','remainder']`,
  `amount?` `@IsDecimalString()` (ge=0, **no** 2dp limit), `percentage?` `@IsDecimalString()` plus a
  `@Max`-equivalent range check (`ge=0, le=100`), `priority` int default 0, `name?` ≤100,
  `is_active` default true.
- `update-distribution-rule.dto.ts` — all of the above optional, no defaults.
- `distribution-preview.query.ts` — `income_amount!` `@IsDecimalString()` (required **query** param),
  `currency` default `'USD'` (no length constraint in FastAPI — do not add one),
  `income_source_id?` UUID.

- [ ] **Step 3: commit** — `git commit -m "feat(nest): income request DTOs"`

---

### Task 4: Response mappers + the read-only currency converter

**Files:**
- Create: `src/modules/currency/currency-converter.service.ts`, `currency.module.ts`
- Create: `src/modules/income/mappers/income-response.mapper.ts`
- Test: `src/modules/income/mappers/income-response.mapper.spec.ts`

This is the parity layer. Every byte the module emits is decided here.

- [ ] **Step 1: Write the failing mapper tests, using captured FastAPI bytes**

`src/modules/income/mappers/income-response.mapper.spec.ts`:

```typescript
import { IncomeSource } from '../entities/income-source.entity';
import { toSourceResponseFloat, toSourceResponseRaw, monthlyEquivalent } from './income-response.mapper';

function source(overrides: Partial<IncomeSource> = {}): IncomeSource {
  return Object.assign(new IncomeSource(), {
    id: '7a5bb0ca-d1f2-454a-9ca3-4b57bfedfdcf',
    userId: '6d8464bc-864b-4e7d-85c6-944d7a24bee9',
    name: 'Freelance Design',
    description: null,
    category: 'Freelance',
    amount: '1000.00',
    currency: 'USD',
    frequency: 'MONTHLY',
    isActive: true,
    date: null,
    startDate: '2026-01-01 00:00:00',
    endDate: null,
    targetAccountId: null,
    autoDeposit: false,
    createdAt: new Date('2026-06-24T09:16:51.946Z'),
    updatedAt: new Date('2026-06-24T09:16:51.946Z'),
    deletedAt: null,
    ...overrides,
  });
}

describe('monthlyEquivalent — IncomeSource.calculate_monthly_amount()', () => {
  it.each([
    ['MONTHLY', '1000.00', '1000.00'],
    ['ANNUALLY', '100.50', '8.34150'],
    ['WEEKLY', '0.10', '0.4330'],
    ['ONE_TIME', '500.00', '0.00'],
  ])('%s %s → %s', (frequency, amount, expected) =>
    expect(monthlyEquivalent(source({ frequency, amount } as never))).toBe(expected));
});

describe('toSourceResponseRaw — POST/PUT shape (verified against FastAPI)', () => {
  it('keeps DB precision and leaves every display_* field null', () => {
    expect(toSourceResponseRaw(source())).toEqual({
      name: 'Freelance Design',
      description: null,
      category: 'Freelance',
      amount: '1000.00',
      currency: 'USD',
      frequency: 'monthly',
      is_active: true,
      date: null,
      start_date: '2026-01-01T00:00:00',
      end_date: null,
      target_account_id: null,
      auto_deposit: false,
      id: '7a5bb0ca-d1f2-454a-9ca3-4b57bfedfdcf',
      user_id: '6d8464bc-864b-4e7d-85c6-944d7a24bee9',
      created_at: '2026-06-24T09:16:51.946Z',
      updated_at: '2026-06-24T09:16:51.946Z',
      monthly_equivalent: '1000.00',
      display_amount: null,
      display_currency: null,
      display_monthly_equivalent: null,
      target_account_name: null,
    });
  });
});

describe('toSourceResponseFloat — GET list/detail shape', () => {
  it('collapses decimals through Python float repr and fills display_*', () => {
    const body = toSourceResponseFloat(source(), {
      displayAmount: '1000.00',
      displayCurrency: 'USD',
      displayMonthlyEquivalent: '1000.00',
    });
    expect(body.amount).toBe('1000.0');
    expect(body.monthly_equivalent).toBe('1000.0');
    expect(body.display_amount).toBe('1000.0');
    expect(body.display_currency).toBe('USD');
    expect(body.display_monthly_equivalent).toBe('1000.0');
    expect(body.start_date).toBe('2026-01-01T00:00:00');
    expect(body.target_account_name).toBeNull();
  });

  it('emits "0" for a zero amount and null for a zero monthly equivalent', () => {
    // FastAPI: `float(source.amount) if source.amount else 0` → int 0 → "0";
    //          `float(calc()) if calc() else None` → null.
    const body = toSourceResponseFloat(source({ amount: '0.00', frequency: 'ONE_TIME' } as never), {
      displayAmount: null,
      displayCurrency: null,
      displayMonthlyEquivalent: null,
    });
    expect(body.amount).toBe('0');
    expect(body.monthly_equivalent).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure** → `npx jest src/modules/income/mappers --verbose` → FAIL.

- [ ] **Step 3: Implement the currency converter**

`src/modules/currency/currency-converter.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { decMul, decQuantize } from '../../common/money/money';
import { Currency } from './entities/currency.entity';
import { ExchangeRate } from './entities/exchange-rate.entity';

/**
 * D7 — the read half of CurrencyService.convert_amount. Same currency → rate 1. Otherwise the most
 * recent stored rate. FastAPI would call an external API and persist a fresh rate when the cache is
 * stale; Nest does not (no outbound HTTP from a read path, no writes on GET). Returns null exactly
 * where FastAPI returns None, so callers keep its fallback behaviour.
 */
@Injectable()
export class CurrencyConverterService {
  constructor(
    @InjectRepository(ExchangeRate) private readonly rates: Repository<ExchangeRate>,
    @InjectRepository(Currency) private readonly currencies: Repository<Currency>,
  ) {}

  async convert(amount: string, from: string, to: string): Promise<string | null> {
    if (amount === '0' || Number(amount) === 0) return '0.0'; // FastAPI: Decimal("0.0")
    const rate = await this.getRate(from, to);
    if (rate === null) return null;

    const converted = decMul(amount, rate);
    const target = await this.currencies.findOne({ where: { code: to } });
    return target ? decQuantize(converted, target.decimalPlaces) : converted;
  }

  private async getRate(from: string, to: string): Promise<string | null> {
    if (from === to) return '1.0';
    const row = await this.rates.findOne({
      where: { fromCurrency: from, toCurrency: to },
      order: { fetchedAt: 'DESC' },
    });
    return row ? row.rate : null;
  }
}
```

- [ ] **Step 4: Implement the mapper**

`src/modules/income/mappers/income-response.mapper.ts` — the important parts:

```typescript
import { pyFloatMoney, decMul, decIsZero } from '../../../common/money/money';
import { toNaiveIso } from '../../../common/time/naive-timestamp';
import { INCOME_FREQUENCY_TO_WIRE, INCOME_STATUS_TO_WIRE, MONTHLY_MULTIPLIER } from '../enums';
import { IncomeSource } from '../entities/income-source.entity';

/** IncomeSource.calculate_monthly_amount(): amount × multiplier, Python Decimal scale rules. */
export function monthlyEquivalent(source: IncomeSource): string {
  return decMul(source.amount, MONTHLY_MULTIPLIER[source.frequency]);
}

export interface DisplayValues {
  displayAmount: string | null;
  displayCurrency: string | null;
  displayMonthlyEquivalent: string | null;
}

/** Shared, verb-independent half of IncomeSourceResponse. */
function sourceCommon(source: IncomeSource) {
  return {
    name: source.name,
    description: source.description,
    category: source.category,
    currency: source.currency,
    frequency: INCOME_FREQUENCY_TO_WIRE[source.frequency],
    is_active: source.isActive,
    date: toNaiveIso(source.date),
    start_date: toNaiveIso(source.startDate),
    end_date: toNaiveIso(source.endDate),
    target_account_id: source.targetAccountId,
    auto_deposit: source.autoDeposit,
    id: source.id,
    user_id: source.userId,
    created_at: source.createdAt.toISOString(),
    updated_at: source.updatedAt.toISOString(),
    // Never populated by any FastAPI code path — a dead field that must still be present.
    target_account_name: null as string | null,
  };
}

/**
 * POST /sources and PUT /sources/{id}: FastAPI builds these with model_validate on the ORM object,
 * so decimals keep DB precision and the display_* trio is never computed.
 */
export function toSourceResponseRaw(source: IncomeSource) {
  return {
    ...sourceCommon(source),
    amount: source.amount,
    monthly_equivalent: monthlyEquivalent(source),
    display_amount: null,
    display_currency: null,
    display_monthly_equivalent: null,
  };
}

/**
 * GET /sources and GET /sources/{id}: FastAPI hand-builds a dict, casting through float() — hence
 * pyFloatMoney — and populates display_* from convert_income_to_display_currency. The two zero
 * cases are FastAPI's truthiness checks, not ours: `float(x) if x else 0` and `float(m) if m else None`.
 */
export function toSourceResponseFloat(source: IncomeSource, display: DisplayValues) {
  const monthly = monthlyEquivalent(source);
  return {
    ...sourceCommon(source),
    amount: decIsZero(source.amount) ? '0' : pyFloatMoney(source.amount),
    monthly_equivalent: decIsZero(monthly) ? null : pyFloatMoney(monthly),
    display_amount: display.displayAmount === null ? null : pyFloatMoney(display.displayAmount),
    display_currency: display.displayCurrency,
    display_monthly_equivalent:
      display.displayMonthlyEquivalent === null ? null : pyFloatMoney(display.displayMonthlyEquivalent),
  };
}
```

Add in the same file, following the same pattern (all raw money, no float collapse):

- `toTransactionResponse(txn)` → keys `source_id, description, amount, currency, date, category,
  notes, id, user_id, created_at, updated_at, deposited_to_account_id, account_transaction_id,
  status, deposited_to_account_name` — `status` via `INCOME_STATUS_TO_WIRE`, `date` via `toNaiveIso`,
  `deposited_to_account_name` always `null`.
- `toRuleResponse(rule, names)` → keys `income_source_id, target_account_id, target_goal_id,
  distribution_type, amount, percentage, priority, name, is_active, id, user_id, created_at,
  updated_at, income_source_name, target_account_name, target_goal_name`.

- [ ] **Step 5: Run the mapper tests** → PASS. Then `npm run lint` → exit 0.

- [ ] **Step 6: Commit** — `git commit -m "feat(nest): income response mappers + read-only currency converter"`

---

### Task 5: Income sources — read endpoints

**Files:** `income.module.ts`, `income.controller.ts`, `services/income-sources.service.ts`,
`services/display-currency.service.ts`; test `test/income-sources.e2e-spec.ts`.

- [ ] **Step 1: Write the failing e2e test**

`test/income-sources.e2e-spec.ts` — bootstrap exactly like Phase 0's `auth.e2e-spec.ts`
(`createNestApplication({ bodyParser: false })` + `configureApp(app)`), then create a dedicated user
and rows in `beforeAll` and delete them in `afterAll` (`try/finally`, `app.close()` last). The user
needs the `wealth` tier or every request 403s on the feature guard. Mint the JWT with the app's own
`JwtService`. Assertions for this step:

```typescript
it('GET /api/v1/income/sources returns the FastAPI envelope', async () => {
  const res = await request(app.getHttpServer())
    .get('/api/v1/income/sources?page=1&page_size=2')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  expect(Object.keys(res.body).sort()).toEqual(['items', 'page', 'page_size', 'total']);
  expect(res.body.total).toBe(2);
  expect(res.body.items[0].amount).toBe('1000.0');      // float-collapsed (D4)
  expect(res.body.items[0].frequency).toBe('monthly');   // wire value, not MONTHLY (D6)
  expect(res.body.items[0].start_date).toBe('2026-01-01T00:00:00'); // naive, unshifted (D5)
  expect(res.body.items[0].target_account_name).toBeNull();
});

it('orders by coalesce(date, start_date) DESC, created_at DESC', async () => { /* two rows, assert order */ });
it('filters by is_active', async () => { /* … */ });
it('GET /api/v1/income/sources/{id} 404s for another user\'s row', async () => {
  const res = await request(app.getHttpServer())
    .get(`/api/v1/income/sources/${otherUsersSourceId}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(404);
  expect(res.body).toEqual({ error: 'Income source not found', details: {}, status_code: 404 });
});
```

- [ ] **Step 2: Run to verify failure** (404 on the route — module not wired yet).

- [ ] **Step 3: Implement `DisplayCurrencyService`**

Reads `UserPreferences.display_currency` (default `'USD'`) and computes the display trio for a
source, mirroring `convert_income_to_display_currency` exactly, including its fallbacks:
same currency → `displayAmount = amount`, `displayCurrency = display`,
`displayMonthlyEquivalent = monthlyEquivalent(source)`; conversion returns null → fall back to the
**source's own** currency and unconverted amounts.

- [ ] **Step 4: Implement `IncomeSourcesService.list()` and `.get()`**

```typescript
async list(userId: string, query: ListIncomeSourcesQuery) {
  const where = query.is_active === undefined ? {} : { isActive: query.is_active };
  const total = await this.sources.count(userId, where);
  const rows = await this.sources
    .qb(userId, 's')
    .andWhere(query.is_active === undefined ? '1=1' : 's.is_active = :active', { active: query.is_active })
    // FastAPI: ORDER BY coalesce(date, start_date) DESC, created_at DESC
    .orderBy('COALESCE(s.date, s.start_date)', 'DESC')
    .addOrderBy('s.created_at', 'DESC')
    .skip((query.page - 1) * query.page_size)
    .take(query.page_size)
    .getMany();
  const items = await Promise.all(
    rows.map(async (row) => toSourceResponseFloat(row, await this.display.forSource(userId, row))),
  );
  return paginated(items, total, query);
}
```

`get()` throws the app's `NotFoundException('Income source not found')` when the row is missing —
which the Phase 0 filter renders as `{error, details, status_code}`. Import it from
`src/common/exceptions/app.exception.ts`, never from `@nestjs/common` (eslint blocks that).

- [ ] **Step 5: Controller + module wiring**

```typescript
@Controller('income')
export class IncomeController {
  @Get('sources')
  listSources(@CurrentUser() user: User, @Query() query: ListIncomeSourcesQuery) { ... }

  @Get('sources/:sourceId')
  getSource(@CurrentUser() user: User, @Param('sourceId', ParseUUIDPipe) sourceId: string) { ... }
}
```

`ParseUUIDPipe` gives 400 by default — FastAPI gives **422** for a malformed path UUID. Construct it
as `new ParseUUIDPipe({ exceptionFactory: () => new DetailException(422, [{ loc: ['path', 'source_id'],
msg: 'Input should be a valid UUID', type: 'uuid_parsing' }]) })` so the shape matches (the message
wording differs — that is Phase 0's accepted deviation 4).

Register `IncomeModule` in `app.module.ts` imports. **Declare `sources/batch-delete` before any
`:sourceId` route** in the controller — Nest matches in declaration order.

- [ ] **Step 6: Run the e2e test** → PASS. Then `npm run lint`.

- [ ] **Step 7: Commit** — `git commit -m "feat(nest): income source list/detail endpoints"`

---

### Task 6: Income sources — write endpoints (no backfill yet)

**Files:** extend `income-sources.service.ts`, `income.controller.ts`; extend `test/income-sources.e2e-spec.ts`.

- [ ] **Step 1: Write failing e2e assertions**

```typescript
it('POST /api/v1/income/sources returns 201 and DB-precision decimals', async () => {
  const res = await request(app.getHttpServer())
    .post('/api/v1/income/sources')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'E2E Salary', amount: '1000.00', currency: 'usd', frequency: 'monthly',
            start_date: '2026-03-15T00:00:00' })
    .expect(201);
  expect(res.body.amount).toBe('1000.00');        // NOT float-collapsed (D4)
  expect(res.body.currency).toBe('USD');          // upper-cased by the DTO transform
  expect(res.body.display_amount).toBeNull();     // never populated on create
  expect(res.body.monthly_equivalent).toBe('1000.00');
});

it('PUT applies only the keys present in the body (PATCH-like)', async () => {
  const res = await request(app.getHttpServer())
    .put(`/api/v1/income/sources/${createdId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ amount: '1234.56' })
    .expect(200);
  expect(res.body.amount).toBe('1234.56');
  expect(res.body.name).toBe('E2E Salary');       // untouched
});

it('DELETE soft-deletes and returns 204 with an empty body', async () => {
  await request(app.getHttpServer())
    .delete(`/api/v1/income/sources/${createdId}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(204);
  const rows = await dataSource.query(
    'SELECT deleted_at FROM income_sources WHERE id = $1', [createdId]);
  expect(rows[0].deleted_at).not.toBeNull();
});

it('POST /sources/batch-delete reports deleted_count and failed_ids', async () => { /* … */ });
it('POST /sources/batch-delete with [] → 422', async () => { /* … */ });
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement create/update/delete/batchDelete**

- `create`: count the user's live sources, call the tier check (Task 6a below), insert with
  `frequency: INCOME_FREQUENCY_TO_NAME[dto.frequency]`, `userId`, defaults from the DTO; return
  `toSourceResponseRaw`. Status `201` (Nest's POST default — leave it).
- `update`: fetch owned-or-404, apply **only present keys** (`for (const key of Object.keys(dto))`),
  never spread the whole DTO (that would write `undefined` over set columns); return
  `toSourceResponseRaw`.
- `delete`: `@HttpCode(204)`, soft delete via `repo.softDelete`, empty body.
- `batchDelete`: `@HttpCode(200)`; loop, soft-delete each owned id, collect unowned/missing into
  `failed_ids`; return `{ deleted_count, failed_ids }`. One transaction (D3) — FastAPI uses one
  commit here too, so this is parity *and* correctness.

- [ ] **Step 4: Tier limit check**

Port `check_usage_limit`: read the user's tier feature row for `income_tracking`; if
`limit_value` is not null and `currentCount >= limit_value`, throw

```typescript
new TierLimitException(
  `Income source limit reached. Your ${tierName} tier allows ${limit} sources.`,
  tierName,                                   // 'free' when the user has no tier — FastAPI's literal
  tierName === 'starter' ? 'growth' : 'wealth',
);
```

- [ ] **Step 5: Run e2e** → PASS. **Step 6: Commit** — `git commit -m "feat(nest): income source create/update/delete/batch-delete"`

---

### Task 7: Income transactions (list + create)

**Files:** `services/income-transactions.service.ts`, controller routes, `test/income-transactions.e2e-spec.ts`.

- [ ] **Step 1: Failing e2e**

```typescript
it('GET /api/v1/income/transactions paginates, filters and orders by date DESC', async () => {
  const res = await request(app.getHttpServer())
    .get('/api/v1/income/transactions?page=1&page_size=2')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  expect(res.body.items[0].amount).toBe('6500.00');   // raw, not float-collapsed
  expect(res.body.items[0].date).toBe('2026-05-01T00:00:00');
  expect(res.body.items[0].status).toBe('received');
  expect(res.body.items[0].deposited_to_account_name).toBeNull();
});

// Deviation 1: FastAPI 500s here; Nest implements the endpoint.
it('POST /api/v1/income/transactions creates the row and ignores deposit_to_account_id', async () => {
  const res = await request(app.getHttpServer())
    .post('/api/v1/income/transactions')
    .set('Authorization', `Bearer ${token}`)
    .send({ amount: '12.34', currency: 'USD', date: '2026-08-01T00:00:00',
            description: 'E2E', deposit_to_account_id: someAccountId })
    .expect(201);
  expect(res.body.amount).toBe('12.34');
  expect(res.body.status).toBe('received');
  expect(res.body.deposited_to_account_id).toBeNull();  // ignored, not deposited
});

it('POST with a source_id owned by someone else → 404 income-source shape', async () => { /* … */ });
```

- [ ] **Step 2–4: run/implement/run.** List filters: `source_id`, `date >= start_date`,
`date <= end_date`; `ORDER BY date DESC`; count before pagination. Create validates `source_id`
ownership (404 `Income source not found`) and inserts `status: 'RECEIVED'`.

- [ ] **Step 5: Commit** — `git commit -m "feat(nest): income transaction list/create"`

---

### Task 8: GET /income/stats

**Files:** `services/income-stats.service.ts`, controller route, `test/income-stats.e2e-spec.ts`.

Read `backend/app/modules/income/service.py:1092-1360` alongside this task — it is the most intricate
endpoint in the module and almost nothing about it is obvious.

**What the field names do NOT mean.** `total_transactions`, `transactions_current_month` and
`transactions_last_month` count **income sources**, not transactions. The `income_transactions` table
is never read by this endpoint. Replicate that; it is observable.

**Algorithm:**

1. `displayCurrency` = user preference or `'USD'`.
2. If **no** date range: `total_sources` = COUNT of non-deleted sources;
   `active_sources` = COUNT where `is_active`. Both from one aggregate query.
   If a range **is** given: both equal the length of the filtered active set.
3. Window predicate (used three times, verbatim), applied to active non-deleted sources:
   ```sql
   (frequency = 'ONE_TIME' AND date IS NOT NULL AND date >= :start AND date <= :end)
   OR (frequency <> 'ONE_TIME' AND start_date IS NOT NULL AND start_date <= :end
       AND (end_date IS NULL OR end_date >= :start))
   ```
   The caller-supplied window is **inclusive** on both ends. The current-month and last-month windows
   are **half-open** on the right (`date < monthEnd`, `start_date < monthEnd`, `end_date >= monthStart`)
   — do not unify them.
4. Month boundaries come from `utcnow()` with explicit December→January rollover, computed in UTC.
5. `total_monthly_income` = Σ `convert(monthlyEquivalent(source), source.currency, displayCurrency)`,
   falling back to the unconverted value when conversion returns null. `decAdd` for the sum.
6. `total_annual_income` = `decMul(total_monthly_income, '12')`.
7. `total_transactions_amount` = Σ (`amount` for ONE_TIME sources, else `monthlyEquivalent`), converted.
8. `currency` = `displayCurrency`.

All six Decimal fields serialize with `rawMoney`.

- [ ] **Step 1: failing e2e** — seed one MONTHLY 6500.00 and one MONTHLY 1000.00 source for the test
  user, then assert the captured FastAPI shape:

```typescript
expect(res.body).toEqual({
  total_sources: 2, active_sources: 2,
  total_monthly_income: '7500.00', total_annual_income: '90000.00',
  total_transactions: 2, total_transactions_amount: '7500.00',
  transactions_current_month: 2, transactions_current_month_amount: '7500.00',
  transactions_last_month: 2, transactions_last_month_amount: '7500.00',
  currency: 'USD',
});
```

- [ ] **Steps 2–4:** run (fail) → implement → run (pass).
- [ ] **Step 5: Commit** — `git commit -m "feat(nest): income stats endpoint"`

---

### Task 9: GET /income/history

**Files:** `services/income-history.service.ts`, controller route, e2e in `income-stats.e2e-spec.ts`.

Projected from `income_sources`, **not** from transactions. Only active, non-deleted sources.

1. Range: `start = start_date ?? earliest source start`, `end = end_date ?? now + 12 months` for
   open-ended recurring income. Offsets on the query params are stripped, not converted.
2. For each source, walk months from `max(sourceStart, rangeStart)` snapped to the 1st, to
   `min(sourceEnd, rangeEnd)`, stepping one month at a time; add
   `decMul(amount, HISTORY_MULTIPLIER[frequency])` into the `YYYY-MM` bucket and `count += 1`.
   **`HISTORY_MULTIPLIER`, not `MONTHLY_MULTIPLIER`** — `4.33333` vs `4.33`. Both are live behavior.
3. ONE_TIME sources contribute their multiplier of `0` (i.e. nothing) — do not special-case them into
   their `date` bucket; FastAPI doesn't.
4. `history` sorted ascending by key; `total_months = history.length`;
   `overall_average = decDiv(Σ totals, total_months)` — an unrounded 28-significant-digit division
   that can legitimately emit `"3333.333333333333333333333333"`. Do not round it.
5. `currency` = display currency.

Sample captured from FastAPI (two monthly sources, 6500.00 + 1000.00):

```json
{"month": "2026-01", "total": "7500.00", "count": 2, "currency": "USD"}
```

- [ ] **Steps 1–4:** failing e2e (assert the first bucket and that `total` keeps scale 2) → implement → pass.
- [ ] **Step 5: Commit** — `git commit -m "feat(nest): income history endpoint"`

---

### Task 10: The deposit engine + POST /transactions/{id}/deposit

**Files:** `src/modules/savings/deposit.service.ts`, `savings.module.ts`,
`src/modules/income/services/income-deposit.service.ts`, controller route,
`test/income-distribution.e2e-spec.ts` (deposit half).

`DepositService.createDeposit` is a port of `TransactionService.create_deposit`
(`backend/app/modules/savings/transaction_service/mutations.py:29`). Phase 3 will own and extend it;
Phase 1 lands only the deposit path, in its final location.

```typescript
async createDeposit(manager: EntityManager, input: {
  accountId: string; userId: string; amount: string;
  description?: string | null; sourceType?: string | null; sourceId?: string | null;
  category?: string | null; transactionDate?: Date | null;
}): Promise<AccountTransaction>
```

Behaviour to match exactly:
1. `amount <= 0` → throw `InvalidTransactionError('Deposit amount must be positive')`.
2. Load the account scoped by `id + userId + is_active = true`; missing → `AccountNotFoundError`
   (`Account {id} not found`).
3. `balanceBefore = account.currentBalance`; `balanceAfter = decAdd(before, amount)`.
4. Insert `account_transactions` — `transaction_type: 'deposit'`, `status: 'completed'`,
   `currency` from the **account** (not the income row), `posted_date = now`,
   `transaction_date = input.transactionDate ?? now`.
5. `UPDATE savings_accounts SET current_balance = balanceAfter, updated_at = now`.
6. Insert `balance_history` — `balance = balanceAfter`, `change_amount = amount`,
   `change_reason = 'Deposit'`, `date = now`.
7. **No commit inside** (D3): the caller owns the transaction. This is where Nest departs from
   FastAPI, which commits here and dispatches a `savings.deposit` event. The event bus lands in a
   later phase; note the gap in the code comment rather than half-wiring it.

`IncomeDepositService.deposit(userId, transactionId, dto)` then, inside one
`dataSource.transaction()`:
- load the income transaction by `id + userId` (**no** `deleted_at` filter — FastAPI omits it here);
  missing → `DetailException(400, 'Income transaction not found')`;
- `status === 'DEPOSITED'` → `DetailException(400, 'Income has already been deposited')`;
- account missing/not owned → `DetailException(400, 'Invalid target account')`;
- any error out of `createDeposit` → `DetailException(400, `Failed to create deposit: ${message}`)`;
- on success set `status = 'DEPOSITED'`, `depositedToAccountId`, `accountTransactionId`, then return

```typescript
{
  income_transaction_id: transactionId,
  account_transaction_id: accountTxn.id,
  deposited_to_account_id: dto.account_id,
  amount: txn.amount,                        // raw DB string, e.g. "5000.00"
  currency: txn.currency,
  message: `Successfully deposited ${txn.amount} ${txn.currency} to account`,
}
```

Route: `@Post('transactions/:transactionId/deposit')` with **`@HttpCode(200)`** (Nest would say 201).

- [ ] **Steps 1–5:** failing e2e (create account + income txn, deposit, assert the response, the new
  balance, the `account_transactions` row, the `balance_history` row, and that a second deposit
  returns the "already been deposited" 400) → implement → pass → commit
  `git commit -m "feat(nest): savings deposit engine + income deposit endpoint"`

---

### Task 11: Distribution rules CRUD

**Files:** `services/distribution.service.ts`, `distribution.controller.ts`,
`test/income-distribution.e2e-spec.ts`.

- `GET /income/distribution-rules` — filters `income_source_id` (**OR'd with global rules**:
  `income_source_id = :id OR income_source_id IS NULL`) and `is_active`; `ORDER BY priority` ASC;
  envelope `{items, total}` with `total = items.length` (D1). Each rule is enriched with
  `income_source_name` / `target_account_name` / `target_goal_name`.
  **Enrichment lookups are user-scoped** (Deviation 3) — FastAPI's are not, which is the leak.
- `POST` (201) — validation order matters, first failure wins, all as `DetailException(400, msg)`:
  1. no target → `Rule must have either a target account or target goal`
  2. `percentage` type without `percentage` → `Percentage type requires percentage value`
  3. `fixed_amount` type without `amount` → `Fixed amount type requires amount value`
  4. bad/unowned `income_source_id` → `Invalid income source`
  5. bad/unowned `target_account_id` → `Invalid target account`
  6. bad/unowned `target_goal_id` → `Invalid target goal`
- `GET /{rule_id}` / `PUT /{rule_id}` / `DELETE /{rule_id}` (204) — missing → 404
  `{"error":"Distribution rule not found","details":{},"status_code":404}`.
  `PUT` applies present keys only, and **also validates `income_source_id` ownership** (FastAPI skips
  it — Deviation 3).

Declare `distribution-preview` **before** `distribution-rules/:ruleId` in the controller.

- [ ] **Steps 1–5:** failing e2e covering the six 400 messages and the 404 → implement → pass → commit
  `git commit -m "feat(nest): income distribution rules CRUD"`

---

### Task 12: POST /income/distribution-preview

Query params only, no body (`income_amount` required, `currency` default `'USD'`,
`income_source_id` optional). `@HttpCode(200)`.

```typescript
let remaining = incomeAmount;
let totalDistributed = '0';
const distributions = [];
for (const rule of rulesOrderedByPriority) {          // is_active = true only
  if (decCmp(remaining, '0') <= 0) break;
  let amount = '0';
  if (rule.distributionType === 'PERCENTAGE') {
    // NB: off the ORIGINAL amount, never off `remaining`. Can push `remaining` negative.
    amount = decMul(incomeAmount, decDiv(rule.percentage, '100'));
  } else if (rule.distributionType === 'FIXED_AMOUNT') {
    amount = decMin(rule.amount, remaining);
  } else {
    amount = remaining;
  }
  if (decCmp(amount, '0') <= 0) continue;
  distributions.push({
    rule_id: rule.id, rule_name: rule.name,
    target_type: rule.targetAccountId ? 'account' : 'goal',
    target_id: rule.targetAccountId ?? rule.targetGoalId,
    target_name: name ?? 'Unknown',                   // FastAPI's literal fallback
    amount, currency,                                  // echoed verbatim, NOT upper-cased
  });
  totalDistributed = decAdd(totalDistributed, amount);
  remaining = decSub(remaining, amount);
}
return { income_amount: incomeAmount, currency, distributions,
         remaining_amount: remaining, total_distributed: totalDistributed };
```

Captured from FastAPI with no rules defined — note the un-padded strings, which fall straight out of
echoing the query param:

```json
{"income_amount":"1000","currency":"USD","distributions":[],"remaining_amount":"1000","total_distributed":"0"}
```

- [ ] **Steps 1–5:** failing e2e (no rules → the exact body above; then a percentage rule and a
  remainder rule) → implement → pass → commit `git commit -m "feat(nest): distribution preview"`

---

### Task 13: POST /income/transactions/{id}/distribute

`@HttpCode(200)`. One `dataSource.transaction()` for the whole use case (D3 — FastAPI commits per
distribution).

1. Load the income transaction by `id + userId`; missing → `DetailException(400, 'Income transaction not found')`.
2. `preview = previewDistribution(userId, txn.amount, txn.currency, txn.sourceId)`.
3. For each distribution:
   - `target_type === 'account'` → `depositService.createDeposit(manager, {...,
     sourceType: 'income', sourceId: txnId, description: \`Income distribution: ${rule_name ?? 'Auto-distribution'}\`})`
     and collect `(accountTransactionId, amount)`;
   - `target_type === 'goal'` → load the goal scoped by `userId` **and `is_active = true`**;
     `currentAmount = decAdd(current, amount)`;
     `progressPercentage = min(100, current/target × 100)` (**capped** — Deviation 5);
     complete it when `current >= target`; then write a `goal_progress_history` row unless an
     identical-amount snapshot exists within the last 60 seconds (FastAPI's dedup window).
4. If any account deposit happened: `status = 'DEPOSITED'`,
   `depositedToAccountId = <the first **account** distribution's target>` (Deviation 4),
   `accountTransactionId = first created deposit`.
5. Response — note `amount` is a JSON **number** here, the only place in the module that isn't a string:

```json
{"message":"Successfully distributed income to 2 account(s)",
 "deposits":[{"account_transaction_id":"...","amount":1500.0}]}
```

Emit it as `Number(amount)`. `1500.00` → `1500` in JSON, which is what Python's `float(Decimal('1500.00'))`
serializes to as well.

- [ ] **Steps 1–5:** failing e2e (account rule + goal rule; assert balances, goal progress, the income
  txn status, and the response) → implement → pass → commit
  `git commit -m "feat(nest): apply distribution rules to an income transaction"`

---

### Task 14: Auto-deposit backfill on source create/update

**Files:** `services/income-backfill.service.ts`; extend sources service; extend e2e.

Runs only when `auto_deposit` **and** `target_account_id` are set. For each due date from
`start_date` (or `date` for ONE_TIME) up to today, stepping by the frequency interval
(`weeks(1) | weeks(2) | months(1) | months(3) | years(1)`, default months(1)):

- skip dates that already have an `income_transactions` row for this source (dedup by **date**, not
  timestamp);
- insert an `income_transactions` row, then `depositService.createDeposit(...)`, then mark it
  `DEPOSITED` with the account and account-transaction ids.

Month stepping must **drift like `relativedelta`**: step from the previous value, not from the
anchor, so Jan 31 → Feb 28 → Mar 28. `date-fns`' `addMonths` behaves this way; re-anchoring to the
original day-of-month would not match.

On `update`, `sync_historical: true` first reverses and soft-deletes the existing generated
transactions, then re-runs the backfill.

FastAPI wraps all of this in `try/except` that logs and rolls back **without failing the request** —
the source is created either way. Nest keeps that outer behaviour (the response must not change) but
the backfill itself is atomic inside its own transaction (D3): all deposits or none, rather than
FastAPI's per-deposit commits.

- [ ] **Steps 1–5:** failing e2e (create a source with `auto_deposit` + an account, `start_date` three
  months back; assert three transactions, three deposits, and the account balance) → implement →
  pass → commit `git commit -m "feat(nest): auto-deposit historical backfill"`

---

### Task 15: Parity, wrap-up, docs

**Files:** `scripts/requests/income.json`, `scripts/parity-diff.ts`, `src/modules/auth/auth.controller.ts`,
`backend-nest/README.md`, the spec, this plan.

- [ ] **Step 1: Tighten the parity script to compare exact status codes**

It currently compares only the status *class* (`Math.floor(status / 100)`), which hides real
differences. Replace with `a.status === b.status`, and add an optional `"expectDiff": "<reason>"`
field per request that turns a diff into an annotated PASS (needed for Deviation 1's row).

- [ ] **Step 2: Fix the 201-vs-200 gap the tightened script exposes**

`POST /api/v1/auth/google` returns **201** in Nest and **200** in FastAPI (`@router.post` with no
`status_code`). Phase 0 missed it because the old comparison ignored it. Add `@HttpCode(200)` to
`AuthController.googleAuth` and update the Phase 0 e2e expectation from 201 to 200.

- [ ] **Step 3: Write `scripts/requests/income.json`**

Rows: `GET /sources` (paged and `is_active` filtered), `GET /sources/{id}`, `GET /transactions`
(paged, filtered by `source_id` and by date range), `GET /stats` (bare and with a date range),
`GET /history` (bare and with a range), `GET /distribution-rules`,
`POST /distribution-preview?income_amount=1000&currency=USD`, plus the annotated
`POST /transactions` row (`expectDiff: "FastAPI 500s — see Phase 1 Deviation 1"`). Use ids seeded for
the parity user; keep every row read-only or idempotent.

- [ ] **Step 4: Full verification run**

```bash
cd backend-nest && npm run lint && npm test && npm run test:e2e
TOKEN=<jwt valid on both> npm run parity scripts/requests/core.json
TOKEN=<jwt valid on both> npm run parity scripts/requests/income.json
```

Every row must PASS or carry an `expectDiff` reason. A bare DIFF is a defect, not a note.

- [ ] **Step 5: Update the docs**

- `backend-nest/README.md`: add the income module and the two parity request lists.
- Spec (`docs/superpowers/specs/2026-08-10-nestjs-backend-v2-design.md`): mark Phase 1 done in the
  Progress table (3 → 21 endpoints done, 205 → 187 remaining), replace the "Decisions Phase 1 must
  make (currently open)" section with the settled D1–D7, and add the new deviations to the
  known-deviation sections.
- This plan: check off every step.

- [ ] **Step 6: Commit** — `git commit -m "docs(nest): Phase 1 wrap-up — conventions, parity rows, spec update"`

---

## Self-review

**Spec coverage.** All 18 endpoints appear in a task: sources list/get (T5), create/update/delete/
batch-delete (T6), transactions list/create (T7), stats (T8), history (T9), deposit (T10), rules
list/create/get/update/delete (T11), preview (T12), distribute (T13). The four open spec decisions map
to D1 (pagination), D2 (ownership), D3 (transactions), D4 (money); D5–D7 were discovered during
research and are recorded in the same place.

**Type consistency.** `monthlyEquivalent()`, `toSourceResponseRaw()`, `toSourceResponseFloat()`,
`OwnedRepository.qb()`, `decMul/decAdd/decSub/decDiv/decMin/decCmp/decIsZero/decQuantize`,
`rawMoney/pyFloatMoney`, `toNaiveIso/toNaiveTimestamp`, `paginated/listed`,
`provideOwnedRepository/ownedRepositoryToken`, `createDeposit(manager, input)` — each is defined once
in Task 1/2/4/10 and referenced with the same signature afterwards.

**Known thin spots** (deliberate, not placeholders): Tasks 8, 9, 13 and 14 give algorithms and exact
constants rather than full source, because their Python originals run 150–270 lines each and the
line-level reference is cited for each. Every *interface* they expose is fixed above; every
observable constant (multiplier tables, window predicates, message strings, status codes) is written
out. Read the cited Python before implementing those four.
