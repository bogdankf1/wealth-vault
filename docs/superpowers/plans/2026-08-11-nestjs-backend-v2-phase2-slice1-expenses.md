# NestJS Backend v2 — Phase 2 slice 1 (Expenses) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status: complete.** Option B chosen — the three shadowed endpoints are reachable in Nest. Verified
2026-08-11: 121 unit tests, 120 e2e tests, lint clean, build clean, and 12 of 15 parity rows
byte-identical to the live FastAPI (the other 3 are the shadowed endpoints, annotated in the
request list).

**Four corrections the implementation made to this plan:**

1. **`decMul` needed Python's context, not just its scale rule.** Python rounds arithmetic to 28
   significant digits, so `Decimal('100.00') * Decimal(4.33)` is `433.0000000000000071054273576` —
   not the exact 50-digit product this plan implied.
2. **A scale-49 zero propagates through sums.** With no weekly expenses the roll-up's
   `total_weekly * Decimal(4.33)` term is `0E-49`, which forces every sum it joins to 28-digit
   rounding and makes an empty user's stats answer `"0E-49"` rather than `"0"`. Required
   `pyDecimalString` and an exponent-aware `scaleOf`.
3. **Fractional seconds needed padding.** Postgres prints `.92364`, Python's `isoformat()` prints
   `.923640`. Caught by the parity diff on every row of the expenses list.
4. **batch-create is dead for every user.** It gates on `batch_operations`, which no tier in this
   database grants — not even `wealth`. Both backends 403; the e2e asserts it.

Also worth knowing: stop the Nest dev server before running the e2e suite. Both write to the same
database, and a rebuild mid-run produced three spurious failures that did not reproduce.

**Goal:** Port the FastAPI `expenses` module — 15 endpoints under `/api/v1/expenses` — to
`backend-nest/`, and extend the partial savings engine with the withdrawal path that expenses,
subscriptions and installments all need.

**Architecture:** Same skeleton as income: thin controllers, services that only ever hold an
`OwnedRepository`, one `dataSource.transaction()` per use case, a pure mapper layer holding every
serialization quirk. What is *not* the same is the wire format — see E1. Expenses is not a
recoloured income module and treating it as one is the main risk in this slice.

**Tech Stack:** unchanged from Phase 1.

**Source of truth:** `backend/app/modules/expenses/{router,schemas,models}.py` and
`service/{common,crud,payments,stats}.py`; `backend/app/modules/savings/transaction_service/mutations.py`
for `create_withdrawal`. Every JSON sample and every constant below was captured from the FastAPI
running on :8000 against the dev DB on 2026-08-11, or computed in CPython — none are inferred.

**Prerequisites:** `docker start wealth-vault-postgres wealth-vault-redis`; FastAPI on :8000 for
parity. Branch off `main` (which now contains Phase 1).

---

## The decision that needs you

**Three of the 15 endpoints are dead in production.** `GET /expenses/{expense_id}` is declared before
`/pending`, `/overdue` and `/payment-summary`, and Starlette matches in declaration order, so all
three literal paths hit the `{expense_id}` handler and fail UUID parsing:

```
GET /api/v1/expenses/pending          → 422 {"detail":[{"type":"uuid_parsing", … "found `p` at 1"}]}
GET /api/v1/expenses/overdue          → 422  (same shape)
GET /api/v1/expenses/payment-summary  → 422  (same shape)
```

Verified live. Their handlers and services exist and are fully written; nothing has ever called them.

| | Option A — reproduce the 422 | Option B — make them work *(recommended)* |
|---|---|---|
| Route order | `:expenseId` first, as FastAPI has it | literals first, as Nest convention requires anyway |
| Parity | 3 rows match exactly | 3 rows differ (annotated `expectDiff`) |
| Risk | ships 3 endpoints that 422 forever | frontend could start calling them and hit code that has never run in production |

**Recommendation: B.** Nest's own routing convention puts literals first, so A means deliberately
mis-ordering routes to preserve a typo. The three services are straightforward reads (`pending`,
`overdue`, and a status roll-up), and B is what a reader of the codebase would assume is true. It is
also trivially reversible — it is three lines of route order.

If you prefer A, say so and I will flip Task 5; everything else in this plan is unaffected.

---

## Decisions

Phase 1 settled seven conventions that still hold. These are the ones expenses forces on top.

### E1 — The wire format is per-endpoint, and it is not income's

Income was strings everywhere. Expenses is **numbers on two endpoints and strings on the other
eleven**, and the mechanism is mechanical rather than stylistic: `GET /expenses` and
`POST /process-due-payments` declare **no `response_model`**, so FastAPI falls back to
`jsonable_encoder`, which renders `Decimal` as a JSON **float**. Every other endpoint declares a
response model, so pydantic renders `Decimal` as a **string** with its stored scale.

Verified on a single row through both paths:

```
GET  /api/v1/expenses          →  "amount": 123.45     (JSON number)
GET  /api/v1/expenses/{id}     →  "amount": "123.45"   (JSON string)
POST /api/v1/expenses          →  "amount": "123.45"
```

Consequence for the port: the mapper needs a third serializer alongside `rawMoney`/`pyFloatMoney` —
`jsonNumber(s) => Number(s)`. Python's `10000.0` and JS's `10000` are the same JSON number once
parsed, so the parity diff (which compares parsed values) treats them as equal and no float-repr
trickery is needed here. All expense money columns are `numeric(12,2)`, comfortably exact in a
double.

### E2 — `frequency` is a native Postgres enum; `status` is not

`expenses.frequency` is PG type `expensefrequency` whose labels are the member **NAMES**
(`ONE_TIME, DAILY, WEEKLY, BIWEEKLY, MONTHLY, QUARTERLY, ANNUALLY`); the wire carries the lowercase
**values**. Same name/value split as income, but now the database will reject a wrong label instead
of quietly storing it — `frequency != 'one_time'` errors with `invalid input value for enum`.

Note `DAILY` exists here and does not exist in income: **do not share the enum**.

`expenses.status` is a plain `varchar(20)` holding the lowercase values
(`pending, paid, overdue, cancelled, payment_failed`) — no mapping needed, unlike frequency.

*(A claim that FastAPI's `!= ExpenseFrequency.ONE_TIME.value` comparison is broken was investigated
and is false: SQLAlchemy's enum bind processor maps value→name, and both predicate forms return the
same 4 rows. No bug, nothing to replicate.)*

### E3 — Every timestamp on this table is naive

`created_at`, `updated_at`, `deleted_at`, `date`, `start_date`, `end_date`, `paid_date` are all
`timestamp WITHOUT time zone` — income's `created_at`/`updated_at` were `timestamptz`. So:

- The entity **cannot extend `BaseModel`** (timestamptz + `@DeleteDateColumn`). Declare the columns
  explicitly as `varchar`, per the Phase 1 rule.
- Responses carry **no `Z` and no offset**: `"created_at": "2026-06-28T12:21:54.246337"`. The Phase 1
  mapper's `createdAt.toISOString()` is wrong for this module.
- Anything Nest writes into these columns must be an explicit **UTC-naive string**. Postgres discards
  the offset and keeps the wall clock — `'2026-08-11T10:00:00.000Z'::timestamp` is `10:00:00`
  (verified) — so letting node-postgres serialize a JS `Date` would store local time, 3 hours off
  FastAPI's `datetime.utcnow()` on this machine.

### E4 — `DELETE` is a hard delete

`delete_expense` calls `db.delete(expense)`. The `deleted_at` column exists but is written **only**
by the subscriptions and installments reversal paths, never by this module. Port it as a hard delete;
do not "improve" it into a soft delete, because subscription/installment rows point at
`expenses.id` with `ON DELETE SET NULL` and the two behaviours are observably different.

Soft-deleted rows are still filtered inconsistently by FastAPI (list/pending/overdue/payment-summary
filter `deleted_at IS NULL`; get/stats/history/tier-count do not). Replicate per-endpoint; the
matrix is in the constants section.

### E5 — The savings engine grows a withdrawal path

Phase 1 landed `DepositService.createDeposit(manager, input)`. Expenses needs the mirror. Rename the
provider to `AccountTransactionService` and add `createWithdrawal`, which differs from the deposit in
exactly five ways: `balanceAfter = before - amount`; a guard that throws
`InsufficientFundsError` when `balanceAfter < 0` (FastAPI never passes `allow_negative`);
`transaction_type: 'withdrawal'`; `balance_history.change_amount = -amount` with reason
`'Withdrawal'`; and optional FX conversion of the amount before the balance check.

Keep it manager-scoped and commit-free, as Phase 1 established.

### E6 — Three different monthly-equivalent tables, one of them float-poisoned

This module computes "monthly equivalent" three ways and all three are observable. They are **not**
reconciled; reproduce each where it is used.

1. **Stored column** (`calculate_monthly_equivalent`, written on create and on amount/frequency
   change): `daily ×30`, `weekly ×Decimal(4.33)`, `biweekly ×Decimal(2.17)`, `monthly ×1`,
   `quarterly ÷3`, `annually ÷12`, `one_time → 0`. The float noise does not escape: the column is
   `numeric(12,2)` and the handler returns the row after `refresh()`, so it comes back `"433.00"`.
2. **Stats/history map** (in-memory only): `daily '30'`, `weekly '4.33333'`, `biweekly '2.16667'`,
   `monthly '1'`, `quarterly '0.333333'`, `annually '0.083333'` — exact strings, different numbers.
3. **The stats roll-up**, which *does* leak float noise into the response (see the constants section).

### E7 — Close the `payment_account_name` leak

`list_expenses_with_account_names` outer-joins `savings_accounts` with **no owner predicate**, and
neither create nor update validates that `payment_account_id` belongs to the caller. A user can
therefore point an expense at another tenant's account and read that account's **name** back from
`GET /expenses`. Same class of bug as the one Phase 1 closed in distribution rules.

Nest validates `payment_account_id` ownership on create and update (400/404 rather than silently
storing it) and scopes the join. Documented as a deliberate deviation.

---

## Deliberate deviations from FastAPI

1. **The three shadowed endpoints work** (pending Option B above).
2. **`payment_account_id` ownership is enforced and the account-name join is scoped** (E7).
3. **`pay` is atomic.** FastAPI commits inside `create_withdrawal` and again for the expense row, so
   a failure between them takes money out of the account with nothing marked paid. Nest wraps both.
4. **Backfill is atomic**, and does not swallow per-iteration failures into a silent partial
   backfill. FastAPI catches per date and continues, so an NSF halfway leaves a half-filled history
   and reports only a count.
5. **The recurring-payment status reset is explicit.** FastAPI relies on SQLAlchemy's identity map:
   it assigns `expense.status = 'pending'` in memory and depends on autoflush so that `pay_expense`'s
   re-`SELECT` sees it. TypeORM has no equivalent; the port issues a real UPDATE.
6. Everything else observable is replicated exactly, including: the list endpoint's float wire
   format and its different key order, the falsy guards (`amount → 0`, `monthly_equivalent → null`
   when zero), `payment_account_name` being null on every endpoint except the list, `display_*`
   being null on create/cancel and **stale** on update, PUT behaving as PATCH, the `total` count
   ignoring the `is_active`/`status` filters, and cancel neither refunding nor clearing
   `paid_amount`/`account_transaction_id`.

---

## Parity constants

### Serialization matrix (which mapper each endpoint uses)

| Endpoint | Decimals | `display_*` | `payment_account_name` |
|---|---|---|---|
| `POST /expenses` | strings | **null** | null |
| `GET /expenses` (list) | **numbers** | populated (numbers) | **populated** |
| `GET /expenses/{id}` | strings | populated (strings) | null |
| `PUT /expenses/{id}` | strings | **stale** (pre-update) | null |
| `POST /{id}/cancel` | strings | null | null |
| `POST /batch-create` items | strings | null | null |
| `GET /stats`, `/history` | strings | — | — |
| `POST /{id}/pay` | strings | — | — |
| `POST /process-due-payments` | **numbers** | — | — |
| `GET /pending`, `/overdue`, `/payment-summary` | strings | populated / — | null |

### The stats roll-up — reproduce exactly, float noise included

```python
total_monthly_expense = (total_daily * Decimal(30) + total_weekly * Decimal(4.33)
                         + total_monthly + total_annual / Decimal(12) + total_one_time)
total_annual_expense  = total_monthly_expense * Decimal(12)
total_daily_expense   = total_monthly_expense / Decimal(30)
total_weekly_expense  = total_monthly_expense * Decimal(7) / Decimal(30)
```

`Decimal(4.33)` is constructed **from a float**, so it is not 4.33. Its exact value, and the one
`Decimal(2.17)` case, must be hardcoded — `new Decimal(4.33)` in decimal.js yields `4.33` and will
not reproduce the output:

```
DECIMAL_FROM_FLOAT_4_33 = '4.3300000000000000710542735760100185871124267578125'
DECIMAL_FROM_FLOAT_2_17 = '2.1699999999999999289457264239899814128875732421875'
```

Verified end to end — a single weekly expense of `100.00` produces, in CPython:

```json
{"total_monthly_expense":"433.0000000000000071054273576",
 "total_annual_expense":"5196.000000000000085265128291",
 "total_daily_expense":"14.43333333333333357018091192",
 "total_weekly_expense":"101.0333333333333349912663834"}
```

Buckets feeding the roll-up: `biweekly` enters `total_weekly` as `amount / 2`; `quarterly` enters
`total_monthly` as `amount / 3`; `one_time` enters at full amount. `expenses_by_category` uses the
*other* table (map 2) and drops rows whose `category IS NULL`.

### `deleted_at` filtering, per query

| Filters `deleted_at IS NULL` | Does **not** filter |
|---|---|
| list (+ its count), pending, overdue, payment-summary, process-due-payments | get/{id}, PUT, DELETE, cancel, pay, stats, history, both tier-limit counts |

### Error bodies (exact)

| Condition | Status | Body |
|---|---|---|
| expense not found (GET/PUT/DELETE/cancel) | 404 | `{"detail":"Expense not found"}` |
| pay: not found | 400 | `{"detail":"Expense not found"}` |
| pay: already paid | 400 | `{"detail":"Expense is already paid"}` |
| pay: insufficient funds | 400 | `{"detail":{"message":"Insufficient funds","error_code":"INSUFFICIENT_FUNDS","account_name":"…","current_balance":1234.56,"required_amount":1000.0,"currency":"USD"}}` — **floats**, and `account_name` falls back to `"Unknown"`, `current_balance` to `null`, `currency` to `"USD"` |
| tier limit, create | 403 | `{"error":"Expense limit reached. Your {tier} tier allows {limit} expenses.","details":{"current_tier":"{tier}","required_tier":"growth"\|"wealth"},"status_code":403}` |
| tier limit, batch-create | 403 | `{"error":"Cannot create {n} expenses. Your {tier} tier allows {limit} expenses and you currently have {count}.", …}` |
| feature not enabled | 403 | `{"error":"This feature requires a higher tier subscription","details":{"current_tier":"…","required_tier":"growth"},"status_code":403}` |

`InsufficientFundsError` extends `Exception`, not `ValueError`, which is why it reaches its own
handler rather than the generic 400. `AccountNotFoundError` and `InvalidTransactionError` are **not
caught** by the router and surface as 500s — replicate that only if Option A is chosen for the
shadowed routes; otherwise fix them to 400 and record it as a deviation.

### Status codes and feature keys

201: `POST /expenses`, `POST /batch-create`. 204: `DELETE`. 200: everything else including
`batch-delete`, `pay`, `cancel`, `process-due-payments`.
Feature gate is `expense_tracking` on every endpoint **except `batch-create`, which gates on
`batch_operations`** while still checking the `expense_tracking` usage limit.

### Other measured behaviour

- Paying writes `account_transactions` with `transaction_type='withdrawal'`, `source_type='expense'`,
  `source_id=<expense id>` (note: the **expense** id, where income used the income-transaction id).
- Cancel sets `status='cancelled'` and **does not refund**; `paid_amount`, `paid_date` and
  `account_transaction_id` are left in place.
- `paid_amount` on the pay response echoes the **request** literal when supplied (`{"amount":100}`
  → `"100"`), otherwise the stored value.
- `pay` stores the **pre-FX** amount on the expense while the account transaction holds the
  post-FX amount.
- `balance_history.date` is `utcnow()`, never the transaction date — backfilled history rows are all
  stamped "now".

---

## File structure

```
backend-nest/src/modules/
  savings/
    account-transaction.service.ts   # RENAMED from deposit.service.ts; adds createWithdrawal
    errors.ts                        # InsufficientFundsError, AccountNotFoundError, Invalid…
  expenses/
    expenses.module.ts
    expenses.controller.ts           # 15 routes, literals before :expenseId
    entities/expense.entity.ts
    enums.ts                         # ExpenseFrequency name↔wire, status values, 3 multiplier tables
    dto/{create,update,query,batch,pay}.dto.ts
    mappers/expense-response.mapper.ts   # the three serializations
    services/
      expenses-crud.service.ts
      expense-payments.service.ts    # pay, pending, overdue, process-due-payments
      expense-stats.service.ts       # stats, history, payment-summary
      expense-backfill.service.ts
      display-currency.service.ts    # MOVED here from income/ and shared
test/expenses-*.e2e-spec.ts
scripts/requests/expenses.json
```

`DisplayCurrencyService` is byte-identical between the two modules in FastAPI; Task 2 moves Phase 1's
copy to `src/common/currency/` and both modules import it.

---

## Tasks

Nine tasks. Each ends green (lint + tests) and commits. Estimated one session.

### Task 1: Entity, enums and the naive-timestamp base

**Files:** create `src/modules/expenses/enums.ts`, `entities/expense.entity.ts`,
`src/common/entities/naive-base.entity.ts`; test `test/expenses-entities.e2e-spec.ts`.

- [x] **Step 1: The naive-timestamp base class**

Four tables already mapped (savings_accounts, goals, balance_history, goal_progress_history) declare
naive `created_at`/`updated_at` inline; expenses adds a fifth with a `deleted_at` too. Extract it:

```typescript
import { BeforeInsert, Column, PrimaryColumn } from 'typeorm';
import { randomUUID } from 'node:crypto';

/** Postgres-style UTC-naive text: '2026-08-11 10:00:00.123456'. */
export function naiveUtcNow(now: Date = new Date()): string {
  return now.toISOString().replace('T', ' ').replace('Z', '');
}

/**
 * For tables whose created_at/updated_at/deleted_at are `timestamp WITHOUT time zone`. BaseModel
 * cannot be used: its columns are timestamptz and its @DeleteDateColumn would hand TypeORM a Date,
 * which node-postgres serializes with a local offset that Postgres then truncates to local wall
 * clock — three hours off FastAPI's utcnow() on this machine. Columns are varchar for the reason
 * given in the Phase 1 plan (TypeORM re-hydrates date columns through new Date()).
 */
export abstract class NaiveTimestampModel {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  createdAt!: string;

  @Column({ type: 'varchar' })
  updatedAt!: string;

  @BeforeInsert()
  initialise(): void {
    if (!this.id) this.id = randomUUID();
    const now = naiveUtcNow();
    if (!this.createdAt) this.createdAt = now;
    if (!this.updatedAt) this.updatedAt = now;
  }
}
```

Expenses adds `@Column({ type: 'varchar', nullable: true }) deletedAt!: string | null;` — a plain
column, **not** `@DeleteDateColumn`, because this module hard-deletes and filters `deleted_at`
inconsistently per query (see the constants matrix). Automatic filtering would be wrong on 8 of 15
endpoints.

- [x] **Step 2: enums.ts** — `EXPENSE_FREQUENCY_TO_WIRE` / `_TO_NAME` (7 members incl. `DAILY`),
  `EXPENSE_STATUS` values as plain lowercase strings, and the three multiplier tables from E6 named
  `STORED_MULTIPLIER`, `STATS_MULTIPLIER`, plus `DECIMAL_FROM_FLOAT_4_33` / `_2_17` with a comment
  explaining why they are long literals.

- [x] **Step 3: expense.entity.ts** — `@Entity('expenses')` extending `NaiveTimestampModel`:
  `userId`, `name`, `description`, `category`, `amount numeric(12,2)→string`, `currency`,
  `frequency` (varchar-declared, holding the enum NAME — the column is a native PG enum but TypeORM
  binds it as text and Postgres casts, which the round-trip test proves), `date`/`startDate`/`endDate`
  varchar, `isActive`, `tags jsonb → string[] | null`, `monthlyEquivalent numeric(12,2)→string|null`,
  `paymentAccountId`, `status varchar(20)`, `paidDate varchar|null`,
  `paidAmount numeric(12,2)→string|null`, `accountTransactionId`, `receiptUrl`, `paymentMethod`,
  `autoPay`, `deletedAt`.

- [x] **Step 4: e2e mapping test** — `find({ take: 1 })` proves every column name, plus three
  assertions that are the actual risk here:

```typescript
it('writes and reads the native enum by NAME', async () => { /* save frequency 'MONTHLY', read back */ });
it('round-trips a naive timestamp without shifting', async () => { /* '2026-03-15T00:00:00' → same */ });
it('stores created_at as UTC-naive, matching utcnow()', async () => {
  // Guards E3: the value must be within seconds of now() AT TIME ZONE 'UTC', not local time.
});
```

- [x] **Step 5: run** → `npx jest --config test/jest-e2e.json test/expenses-entities.e2e-spec.ts`
- [x] **Step 6: commit** — `feat(nest): expense entity + naive-timestamp base`

---

### Task 2: Withdrawal engine + shared display-currency service

**Files:** rename `savings/deposit.service.ts` → `account-transaction.service.ts`, add
`savings/errors.ts`; move `income/services/display-currency.service.ts` →
`common/currency/display-currency.service.ts`; update income imports.
Test: `src/modules/savings/account-transaction.service.spec.ts`.

- [x] **Step 1: failing unit tests** for `createWithdrawal` — balance goes down, `balance_before`/
  `balance_after` recorded, `transaction_type='withdrawal'`, `change_amount` negative in
  balance_history, and `InsufficientFundsError` thrown (message
  `Insufficient funds. Available: {before}, Requested: {amount}`) when the result would be negative.
- [x] **Step 2–3: implement**, mirroring `createDeposit`. Keep both methods on one service and share
  the account lookup (`id + userId + isActive`, throwing `AccountNotFoundError`).
- [x] **Step 4: move DisplayCurrencyService** to `common/currency/`, parameterised by
  `{ amount, currency }` rather than by an `IncomeSource`, and re-point income's imports. Income's
  tests must stay green — run them.
- [x] **Step 5: run all tests, commit** — `refactor(nest): withdrawal path + shared display currency`

---

### Task 3: DTOs

**Files:** `expenses/dto/*.ts`.

Follow the Phase 1 rules (money as validated strings inbound, naive-date transforms, `@IsUuidLike`).
Differences to encode:

- `amount` is **`gt=0`** here, not `ge=0` — a new `@IsPositiveMoneyString()`.
- `frequency` is **required** on create (income defaulted it).
- `tags?: string[]`.
- `sync_historical?: boolean` on create and update (drives backfill; not a column).
- `PayExpenseDto`: `account_id?`, `amount?`, `payment_method?`, `description?` — **all optional**, so
  `{}` is valid, and `amount` carries **no** positivity constraint (FastAPI accepts a negative here).
- Query DTOs: list takes `page`, `page_size`, `category`, `is_active`, `status`; stats and history
  take `start_date`/`end_date`.

- [x] **Step 1: write them. Step 2: commit** — `feat(nest): expense DTOs`

---

### Task 4: The three mappers

**Files:** `expenses/mappers/expense-response.mapper.ts` + spec.

This is the parity layer and the place this module differs most from income.

- [x] **Step 1: failing unit tests** built from the captured bytes:

```typescript
it('toExpenseModel — the response_model shape (POST/GET-by-id/PUT/cancel/batch)', () => {
  expect(toExpenseModel(expense())).toEqual({
    name: 'Rent', description: null, category: 'housing',
    amount: '1000.00',                       // string, stored scale
    currency: 'USD', frequency: 'monthly', is_active: true, tags: null,
    date: null, start_date: '2025-01-01T00:00:00', end_date: null,
    payment_account_id: null, payment_method: null, auto_pay: false,
    id: '…', user_id: '…',
    monthly_equivalent: '1000.00',
    created_at: '2025-01-01T12:30:45.123456', // no Z — naive column
    updated_at: '2025-01-01T12:30:45.123456',
    display_amount: null, display_currency: null, display_monthly_equivalent: null,
    status: 'pending', paid_date: null, paid_amount: null,
    account_transaction_id: null, receipt_url: null, payment_account_name: null,
  });
});

it('toExpenseListItem — the hand-built dict shape', () => {
  const item = toExpenseListItem(expense({ amount: '123.45', monthlyEquivalent: '0.00' }), display, 'Everyday');
  expect(item.amount).toBe(123.45);          // JSON NUMBER
  expect(item.monthly_equivalent).toBeNull(); // falsy guard: 0.00 → null
  expect(item.payment_account_name).toBe('Everyday'); // only populated here
});

it('list falsy guards match FastAPI exactly', () => {
  // `float(x) if x else 0` → integer 0 for a zero amount…
  expect(toExpenseListItem(expense({ amount: '0.00' }), …).amount).toBe(0);
  // …but display_* use `is not None`, so a zero there survives as 0.
  expect(toExpenseListItem(expense(), { displayAmount: '0.00', … }).display_amount).toBe(0);
});
```

- [x] **Steps 2–4:** implement `toExpenseModel`, `toExpenseListItem`, and the small constructed-model
  mappers (`toPayResponse`, `toStats`, `toHistory`, `toPaymentSummary`); run; commit
  `feat(nest): expense response mappers`

---

### Task 5: CRUD endpoints

**Files:** `expenses-crud.service.ts`, `expenses.controller.ts`, `expenses.module.ts`;
test `test/expenses-crud.e2e-spec.ts`.

Endpoints: `POST /expenses` (201), `GET /expenses`, `GET /{id}`, `PUT /{id}`, `DELETE /{id}` (204),
`POST /batch-create` (201), `POST /batch-delete` (200).

**Route order (this is where the decision lands):** declare `stats`, `history`, `batch-create`,
`batch-delete`, `pending`, `overdue`, `payment-summary`, `process-due-payments` **before**
`:expenseId`. Under Option A, move `:expenseId` above the last three GETs and add three
`expectDiff` parity rows instead.

Behaviours to encode, each with an e2e assertion:
- list orders by `COALESCE(date, start_date) DESC, created_at DESC`, filters `deleted_at IS NULL`,
  and its **`total` ignores `is_active` and `status`** (assert the wrong-but-faithful count);
- `GET /{id}` does **not** filter `deleted_at` and returns `payment_account_name: null`;
- PUT is PATCH-like, recomputes `monthly_equivalent` **only** when `amount` or `frequency` is
  present, and returns **stale** `display_*`;
- DELETE hard-deletes (assert the row is gone, not flagged);
- batch-create returns `{created_count, created_expenses, failed_count, errors:[{index,error}]}` and
  swallows per-item failures; batch-delete returns `{deleted_count, failed_ids}`;
- create validates `payment_account_id` ownership (E7) — assert another user's account is rejected.

- [ ] Steps: failing e2e → implement → green → commit `feat(nest): expense CRUD endpoints`

---

### Task 6: Pay, cancel, pending, overdue

**Files:** `expense-payments.service.ts`; test `test/expenses-payments.e2e-spec.ts`.

One `dataSource.transaction()` around the whole pay use case (deviation 3). Steps inside:
resolve `account_id ?? expense.payment_account_id`, `amount ?? expense.amount`,
`payment_method ?? expense.payment_method`; convert currency if the account differs; call
`createWithdrawal`; then update `status='paid'`, `paid_date`, `paid_amount` (**pre-FX**),
`account_transaction_id`, `payment_method`, `updated_at`.

e2e must assert: the ledger row and the balance; the exact `message` strings
(`"Expense paid successfully"` / `… " and deducted from account"`); already-paid → 400; the
insufficient-funds body **with float fields**; cancel leaves money withdrawn and keeps
`paid_amount`/`account_transaction_id`.

- [ ] Steps: failing e2e → implement → green → commit `feat(nest): expense payment, cancel, pending, overdue`

---

### Task 7: Stats, history, payment-summary

**Files:** `expense-stats.service.ts`; test `test/expenses-stats.e2e-spec.ts`.

All three are pure Python-side loops in FastAPI; keep them straightforward loops here too rather than
inventing SQL aggregates, because the bucket rules do not translate cleanly and the float-noise
constants must apply in the same order.

The single most important test in this task:

```typescript
it('reproduces the float-poisoned roll-up byte for byte', async () => {
  // one weekly expense of 100.00 — values computed in CPython, see the plan's constants section
  expect(body.total_monthly_expense).toBe('433.0000000000000071054273576');
  expect(body.total_annual_expense).toBe('5196.000000000000085265128291');
  expect(body.total_daily_expense).toBe('14.43333333333333357018091192');
  expect(body.total_weekly_expense).toBe('101.0333333333333349912663834');
});
```

Also assert: stats counts include soft-deleted rows; history excludes inactive but not soft-deleted;
`expenses_by_category` drops null categories; `overall_average` is the unrounded 28-digit division
(Phase 1's `decDiv` already implements Python's ideal-exponent rule).

- [ ] Steps: failing e2e → implement → green → commit `feat(nest): expense stats, history, payment summary`

---

### Task 8: Backfill and process-due-payments

**Files:** `expense-backfill.service.ts`, the `process-due-payments` route.

Backfill reuses Phase 1's `advance()` stepper (already unit-tested for relativedelta clamping) with
`DAILY` added. It runs on create when `auto_pay && sync_historical && payment_account_id`, and on
update when `sync_historical` is set or auto-pay was just switched on (`skip_existing=true` in that
case). Atomic (deviation 4). Dedupe reads `account_transactions` by
`source_type='expense' AND source_id=<expense id>` **plus `user_id`** (FastAPI omits the user filter).

`process-due-payments` responds with the hand-built dict — floats in `failed_payments[]`, and a
tz-aware `timestamp` (`+00:00`, the only one in the module). Due-today rules: daily always; weekly
`% 7`; biweekly `% 14`; monthly `day == start.day`; quarterly `monthsDiff % 3 == 0 && day == start.day`;
annually month and day. **No `end_date` check** — an expired recurring expense keeps paying, which is
FastAPI's behaviour; replicate and note it. Rows already paid today are skipped before `due_count`
increments. `auto_pay` is deliberately **not** required on this endpoint.

- [ ] Steps: failing e2e (three past months → three withdrawals; idempotent on re-run) → implement →
  green → commit `feat(nest): expense backfill and due-payment processing`

---

### Task 9: Parity, docs, wrap-up

- [x] **Step 1:** `scripts/requests/expenses.json` — list (paged, filtered by category/is_active/
  status), detail, stats (bare + ranged), history (bare + ranged), a 404, a 422 path UUID, and
  `process-due-payments` (safe: no `auto_pay` rows exist in dev). Under Option B, add three
  `expectDiff` rows for pending/overdue/payment-summary naming the reason.
- [x] **Step 2:** seed a couple of expenses through FastAPI, run
  `TOKEN=<jwt> npm run parity scripts/requests/expenses.json`, clean up. Every row PASS or annotated.
- [x] **Step 3:** update `backend-nest/README.md`, the spec's Progress table (21 → 36 done,
  187 → 172 remaining) and its conventions section with E1–E7; check off this plan.
- [x] **Step 4:** commit `docs(nest): Phase 2 slice 1 wrap-up`

---

## Self-review

**Coverage.** All 15 endpoints are assigned: CRUD ×7 (Task 5), pay/cancel/pending/overdue (Task 6),
stats/history/payment-summary (Task 7), process-due-payments (Task 8). The savings withdrawal path
and the shared display-currency service are Task 2.

**Consistency.** `naiveUtcNow`, `NaiveTimestampModel`, `toExpenseModel`, `toExpenseListItem`,
`createWithdrawal(manager, input)`, `STORED_MULTIPLIER`/`STATS_MULTIPLIER`,
`DECIMAL_FROM_FLOAT_4_33` are each defined once and referenced with the same signature after.
Phase 1 carry-overs used unchanged: `OwnedRepository`, `decAdd/decMul/decDiv/decQuantize`,
`toNaiveIso/toNaiveTimestamp`, `PageQueryDto`, `uuidParam`, `IsUuidLike`, `advance`.

**Known thin spots.** Tasks 7 and 8 give algorithms and constants rather than full source, as their
Python originals are 395 and ~200 lines; both cite exact line ranges and every observable constant is
written out. Task 2's FX branch inside `createWithdrawal` is specified but not coded here — it is a
direct mirror of the deposit path plus `amount × rate` before the balance check.

**Open question deliberately left to the user:** the three shadowed endpoints (top of this document).
