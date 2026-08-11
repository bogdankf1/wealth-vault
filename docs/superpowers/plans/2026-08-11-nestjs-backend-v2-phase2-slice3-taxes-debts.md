# Phase 2 Slice 3 — Taxes + Debts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Status: complete.** 2026-08-11 on `feature/nestjs-phase2-taxes-debts`. All 26 endpoints ported;
153 unit and 202 e2e tests green; all five parity lists match; route inventory 90/90 against
FastAPI. Phase 2 is finished.

One correction to §8 below, found by checking against CPython rather than trusting the reading: a
debt paid exactly in full answers `progress_percentage` `"100"`, **not** `"100.00"` — the exact
quotient 50.00/50.00 collapses to `"1"` (ideal exponent 0) before the multiply. `amount_remaining`
does keep its `"0.00"` scale as described.

**Goal:** Port the FastAPI `taxes` (15 endpoints) and `debts` (11 endpoints) modules to
`backend-nest/`, byte-identical on the wire, completing Phase 2 (69/69 endpoints).

**Architecture:** Same shape as slices 1 and 2 — one Nest module per FastAPI module, controllers
thin, use cases in services, `OwnedRepository<T>` for every read, one `dataSource.transaction()`
per mutating use case. Two new shared pieces: `decMax` in the money layer, and a
`TaxWithdrawalService` that deliberately does *not* reuse `AccountTransactionService`.

**Tech Stack:** NestJS 11, TypeORM 0.3 (`synchronize: false`), decimal.js via
`src/common/money`, Jest + supertest.

---

## Read this first: what makes slice 3 different

Slice 3 is the first slice where **the two modules do not share a contract with each other**.
Taxes withdraw money; debts receive it. They touch the savings engine from opposite ends and
disagree about almost everything else. Do not build a shared abstraction across them.

### 1. Taxes bypass the savings transaction engine

`pay_tax` (`backend/app/modules/taxes/service/payments.py:229-248`) does **not** call
`TransactionService`. It constructs an `AccountTransaction` inline. The consequences are all
observable:

| | via `TransactionService` (income, expenses, debts) | taxes `pay_tax` (inline) |
|---|---|---|
| `balance_history` row | written | **none** |
| `source_type` | `'manual'` fallback | **NULL** |
| `source_id` | set | **NULL** |
| `posted_date` | set to now | **NULL** |
| `reference_number` | NULL | NULL |
| account filter | `is_active = true` | **no active filter** |
| overdraft check | `balance_after < 0` | `current_balance < amount` |
| error message | `Insufficient funds. Available: …` | `Insufficient balance. Required: …` |

So: **do not reuse `AccountTransactionService.createWithdrawal` for taxes.** Write
`TaxWithdrawalService` that reproduces the inline path. Reusing the engine would silently start
writing balance-history rows that FastAPI never wrote, corrupting the shared dev DB's history.

Debts *do* use the engine (`TransactionService.create_deposit` / `reverse_transaction`), so
`AccountTransactionService.createDeposit` is correct there.

### 2. Two shadowed routes in taxes

`GET /{tax_id}` is declared at `router.py:93`, before `GET /income-summary` (265) and
`GET /payments` (297). FastAPI matches in declaration order, so both are unreachable — they 422
with `uuid_parsing`. This is the same defect slice 1 found in expenses, and we follow the same
**Option B** the user chose there: declare the static routes first in Nest so they work, annotate
them in the controller, and mark their parity rows KNOWN.

Not shadowed (verify, don't assume): `GET /stats` (declared before `/{tax_id}`),
`GET /payments/{payment_id}` and `DELETE /payments/{payment_id}` (two segments, no competing
two-segment route declared earlier), `POST /payments`, `POST /batch-delete`,
`POST /process-due-payments` (no `POST /{tax_id}` route exists). Debts has **no** shadowing —
`/stats` and `/batch-delete` both precede `/{debt_id}`.

### 3. `batch-delete` is ungated in both modules

Every other endpoint carries `@require_feature("tax_tracking")` / `("debt_tracking")`.
`POST /taxes/batch-delete` (`router.py:144`) and `POST /debts/batch-delete` (`router.py:140`) carry
none. Compare with expenses, where batch-delete *is* gated with `expense_tracking`. This is a
FastAPI inconsistency, and it is **user-visible**: on a Free tier, batch-delete works while
everything else 403s. Replicate it — no `@RequireFeature` on those two handlers — and cover it with
a test so nobody "fixes" it later.

### 4. Both features are Wealth-tier-only

`seed_data.py:287-288` maps `debt_tracking` and `tax_tracking` to the Wealth tier only. Every e2e
test needs a wealth-tier user; the existing helpers create starter-tier users. Add a
`createWealthUser()` helper rather than mutating the shared fixture.

### 5. Money conventions

Both modules use `response_model` on every endpoint, so **Decimals serialize as strings**, like
income and unlike expenses' two number-emitting endpoints. One exception:
`GET /taxes/income-summary` returns `List[dict]` built with `float(...)` (`stats.py:154-193`), so
its numbers are **JSON floats** — use `pyFloatMoney`. That endpoint is shadowed anyway, so its
format cannot be verified against FastAPI; implement it faithfully and mark it KNOWN.

### 6. Enum storage — the fourth convention, and it is a coincidence

`Tax.tax_type` and `Tax.frequency` use `SQLEnum(..., native_enum=False)`, which stores the enum
**NAME**. The names happen to equal the values (`fixed = "fixed"`, `monthly = "monthly"`), so the
column holds lowercase text. Do not conclude "taxes are like subscriptions" — they agree by
accident, through a different mechanism. Store and compare lowercase strings; declare the columns
`varchar`. `Debt.payment_frequency` and both `status` columns are plain `String`, no enum at all.

### 7. Timestamps

Every `DateTime` in `taxes`, `tax_payments`, `debts`, `debt_payments` is **naive** — use
`NaiveTimestampModel` and `varchar` columns, as in expenses/subscriptions/installments.
`account_transactions` is the exception (`DateTime(timezone=True)`), already handled by the savings
entity from Phase 1.

### 8. Python scale semantics that will bite

`DebtResponse` has four `@computed_field`s, serialized **after** the declared fields:

- `progress_percentage` = `(amount_paid / amount) * 100`, then `min(percentage, Decimal('100'))`.
  Python's `min` returns the **first** argument when the two compare equal, so `decMin(a, b)` must
  return `a` on a tie — verify the existing helper does before relying on it. *(Corrected during
  execution: a debt paid exactly in full yields `"100"`, not `"100.00"` as first written here —
  `50.00/50.00` divides exactly to `"1"` at ideal exponent 0, so the multiply has no scale to
  carry. Confirmed against CPython and then against live FastAPI, which answers `"37.500"` for a
  40000.00 debt paid 15000.00 and `"100"` for a settled one.)*
- `amount_remaining` = `max(amount - amount_paid, Decimal('0'))`. Same tie rule: a zero remainder
  serializes with the subtraction's scale (`"0.00"`), not `"0"`. There is **no `decMax` yet** —
  add one with first-arg-wins semantics.
- `total_with_interest` = `amount + accrued_interest` → `decAdd`.
- `is_overdue` compares `datetime.utcnow()` against a naive `due_date`.

`(amount_paid / amount)` is exact-division territory: `decDiv` already pads to the ideal exponent
and falls back to 28 significant digits. This is the single most likely source of a parity diff in
this slice.

### 9. JSON key order

Byte-parity means key order matters, and pydantic emits base-class fields first. Declare DTO
fields in exactly this order:

- **TaxResponse:** name, description, tax_type, frequency, fixed_amount, currency, percentage,
  income_source_id, payment_account_id, auto_pay, next_payment_date, is_active, notes, id, user_id,
  created_at, updated_at, display_fixed_amount, display_currency, calculated_amount, income_source,
  payment_account, is_paid_current_period, current_period_start, current_period_end,
  last_payment_date, last_payment_amount
- **DebtResponse:** debtor_name, description, amount, amount_paid, currency, is_active, is_paid,
  due_date, paid_date, notes, deposit_account_id, auto_deposit, interest_rate,
  reminder_days_before, next_payment_date, payment_frequency, expected_payment_amount, id, user_id,
  created_at, updated_at, accrued_interest, display_amount, display_amount_paid, display_currency,
  is_overdue, progress_percentage, amount_remaining, total_with_interest
- **DebtPaymentResponse:** amount, payment_date, principal_amount, interest_amount, notes, id,
  debt_id, user_id, currency, balance_before, balance_after, account_transaction_id, status,
  created_at
- **TaxPaymentResponse:** id, tax_id, user_id, amount, currency, payment_date, period_start,
  period_end, account_transaction_id, status, notes, created_at, updated_at

### 10. Enrichment is per-request and cross-tenant-sensitive

`convert_tax_to_display_currency` mutates the ORM object with `display_fixed_amount`,
`display_currency`, `calculated_amount`, and five payment-status fields. `percentage` taxes read
**all** the user's income (or one source). Slice 1 and Phase 1 both found real cross-tenant leaks in
exactly this kind of enrichment join — scope every income/account lookup by `user_id`, including
`payment_account` and `income_source`, and cover it with a two-user test.

### 11. FastAPI bugs to replicate, not fix

- `process-due-payments` never increments `auto_paid`; it always returns `0`. Replicate; note it.
- Both `batch-delete` handlers swallow every exception into `failed_ids`.
- `mark_debt_forgiven` sets `is_paid = true` and appends `"\n[Debt forgiven]"` to notes but does
  **not** touch `amount_paid`, so a forgiven debt still reports a non-zero `amount_remaining`.
- `record_debt_payment` swallows deposit failures (`logger.warning`) and still records the payment
  with `account_transaction_id = NULL`.
- `pay_tax` writes `TaxPayment.period_start/period_end` as NULL even though the period is known.

---

## File structure

```
backend-nest/src/
  common/money/money.ts                      # MODIFY: add decMax
  modules/taxes/
    taxes.module.ts
    taxes.controller.ts                      # 11 tax routes (incl. 2 un-shadowed)
    tax-payments.controller.ts               # 4 payment routes
    entities/{tax.entity.ts,tax-payment.entity.ts}
    dto/{create-tax.dto.ts,update-tax.dto.ts,tax-response.dto.ts,pay-tax.dto.ts,
         tax-payment.dto.ts,batch-delete.dto.ts,tax-stats.dto.ts}
    services/
      tax-crud.service.ts
      tax-enrichment.service.ts              # convert_tax_to_display_currency + payment status
      tax-period.ts                          # pure: period ranges + next payment date
      tax-payments.service.ts
      tax-withdrawal.service.ts              # the inline AccountTransaction path
      tax-stats.service.ts                   # /stats + /income-summary
      tax-due-payments.service.ts            # /process-due-payments
  modules/debts/
    debts.module.ts
    debts.controller.ts                      # all 11 routes
    entities/{debt.entity.ts,debt-payment.entity.ts}
    dto/{create-debt.dto.ts,update-debt.dto.ts,debt-response.dto.ts,
         record-payment.dto.ts,debt-stats.dto.ts,batch-delete.dto.ts}
    services/
      debt-crud.service.ts
      debt-enrichment.service.ts
      debt-payments.service.ts               # record + backfill + reverse
      debt-stats.service.ts
      debt-response.ts                       # pure: the four computed fields
  scripts/requests/slice3.json               # parity rows
test/
  taxes.e2e-spec.ts
  debts.e2e-spec.ts
```

---

## Tasks

### Task 1: `decMax` in the money layer

**Files:** Modify `src/common/money/money.ts`; test `src/common/money/money.spec.ts`

- [x] **Step 1: Write the failing test** — tie must return the first argument, preserving scale.

```typescript
describe('decMax', () => {
  it('returns the first argument on a tie, preserving its scale', () => {
    expect(decMax('0.00', '0')).toBe('0.00');
  });
  it('returns the larger value otherwise', () => {
    expect(decMax('-5.00', '0')).toBe('0');
    expect(decMax('12.50', '0')).toBe('12.50');
  });
});
```

- [x] **Step 2: Run it and watch it fail** — `npm test -- money.spec` → `decMax is not a function`.
- [x] **Step 3: Implement**, mirroring `decMin`'s existing shape:

```typescript
/** Python's max(a, b): returns b only when b is strictly greater, so a tie keeps a's scale. */
export function decMax(a: string, b: string): string {
  return decCmp(b, a) > 0 ? b : a;
}
```

- [x] **Step 4: Confirm `decMin` has the same tie behaviour** (`min` keeps `a` when equal). Fix it
      if it does not, and add the tie test for it.
- [x] **Step 5:** `npm test -- money.spec` → PASS. Commit.

### Task 2: Entities

**Files:** Create the four entity files; test `src/modules/taxes/entities/entities.spec.ts`

- [x] **Step 1:** Write a round-trip spec asserting a naive timestamp survives insert→select as the
      identical string (the check that caught TypeORM's `new Date()` hydration in slice 1).
- [x] **Step 2:** Declare `Tax`, `TaxPayment`, `Debt`, `DebtPayment` extending
      `NaiveTimestampModel`. Money columns `varchar`; `tax_type`/`frequency`/`status`/
      `payment_frequency` `varchar`. `Tax` and `Debt` have `deletedAt`; the two payment tables do
      not. `DebtPayment` has `createdAt` but **no** `updatedAt`.
- [x] **Step 3:** Run the spec; commit.

### Task 3: Taxes — CRUD + enrichment (7 endpoints)

POST ``, GET ``, GET `/stats`, GET `/{id}`, PUT `/{id}`, DELETE `/{id}`, POST `/batch-delete`.

- [x] Write e2e specs first for: create→get round-trip, list filters (`is_active`,
      `income_source_id`), pagination envelope `{items,total,page,page_size}`, soft-delete
      invisibility, batch-delete partial failure, and the ungated batch-delete on a starter user.
- [x] Implement `tax-period.ts` (pure) with unit tests for all three frequencies, including the
      annual `Dec 31 23:59:59.999999` end and the monthly/quarterly `-1 second` end.
- [x] Implement `TaxCrudService` + `TaxEnrichmentService`; auto-`next_payment_date` on create when
      `auto_pay` and none supplied, and on update only when *enabling* auto_pay with no date
      anywhere.
- [x] One `dataSource.transaction()` per mutating use case.
- [x] Cross-tenant test: another user's `income_source_id` / `payment_account_id` must not enrich.

### Task 4: Taxes — payments (4 endpoints) + pay (1)

POST `/payments`, GET `/payments`, GET `/payments/{id}`, DELETE `/payments/{id}`,
GET `/{id}/payments`, POST `/{id}/pay`.

- [x] `TaxWithdrawalService` per the table in "Read this first" — inline transaction, no
      balance-history row, no active-account filter.
- [x] `/pay` insufficient-funds path returns **400** with the dict detail
      `{message, error_code: "INSUFFICIENT_FUNDS", account_name, current_balance, required_amount,
      currency}` where the two numbers are JSON floats. The amount is recovered from the error
      string by regex in FastAPI; produce it directly, but keep the message identical.
- [x] Assert in a test that no `balance_history` row appears after `/pay`.
- [x] `GET /payments` is the shadowed one — declare it before `/{tax_id}`.

### Task 5: Taxes — stats, income-summary, process-due-payments (3 endpoints)

- [x] `/stats` — active taxes only, fixed converted to display currency, percentage computed off
      monthly income; `decAdd` accumulation in FastAPI's iteration order.
- [x] `/income-summary` — `pyFloatMoney` everywhere, global + specific taxes per source, shadowed.
- [x] `/process-due-payments` — skip already-paid, `auto_paid` always `0`, failures split between
      `failed_payments` (insufficient funds) and `errors` (everything else).

### Task 6: Debts — CRUD (7 endpoints)

POST ``, GET ``, GET `/stats`, GET `/{id}`, PUT `/{id}`, DELETE `/{id}`, POST `/batch-delete`.

- [x] Implement `debt-response.ts` (pure) for the four computed fields **first**, with unit tests
      covering the two tie cases from §8 (`"100.00"` not `"100"`, `"0.00"` not `"0"`).
- [x] `DebtCrudService` with tz-stripping on `due_date`/`paid_date`/`next_payment_date`.
- [x] `/stats`: `total_amount_owed` counts only debts with a positive remainder;
      `total_amount_paid` counts all; overdue = unpaid with a past `due_date`.

### Task 7: Debts — payments, mark-paid, forgive (4 endpoints)

- [x] `record_debt_payment`: deposit via `AccountTransactionService.createDeposit` when
      (`auto_deposit` or `deposit_to_account`) and an account is linked; FX via `rateFor` with the
      1:1 fallback; **swallow deposit failures** and still record the payment.
- [x] `balance_after = max(balance_before - amount, 0)`; mark `is_paid` + `paid_date` when
      `amount_paid >= amount`.
- [x] `sync_historical` on create/update → backfill one historical payment / reverse then re-backfill
      when the deposit account changes.
- [x] `GET /{id}/payments` uses the `{items, total}` envelope with `total = len(items)`.
- [x] `/forgive` appends `"\n[Debt forgiven]"` and leaves `amount_paid` alone.

### Task 8: Wire-up, parity, docs

- [x] Register both modules in `app.module.ts`; confirm the catch-all route ordering issue from
      Phase 0 has not resurfaced.
- [x] Write `scripts/requests/slice3.json` — read-only GETs only (the dev DB is shared).
- [x] Run **all five** parity lists together; every row PASS or an annotated KNOWN.
- [x] **Route-inventory diff against FastAPI's OpenAPI** — this is what caught the two missing
      `process-due-payments` endpoints in slice 2. Expect taxes 15, debts 11.
- [x] `npm run lint` 0 errors, `npm run build` clean, full unit + e2e green.
- [x] Update the spec Progress table (90/208 done, 118 remain; Phase 2 **complete**), the phase
      bullet, the README, and this plan's status line.
- [x] Leftover-data audit: no rows left behind by tests in the shared dev DB.

---

## Verification

Slice 3 is done when:

1. All 26 endpoints answer, and the route inventory matches FastAPI exactly (61 + 26 = 87 total).
2. All five parity lists are green in one run.
3. `/pay` leaves no `balance_history` row; a debt payment does.
4. The two shadowed tax routes work in Nest and are annotated as deliberate divergences.
5. `batch-delete` works for a starter-tier user in both modules; everything else 403s.
6. A debt paid exactly in full serializes `progress_percentage` as `"100.00"`.
7. No cross-tenant enrichment: another user's income source or account never appears.
