# NestJS Backend v2 — Phase 2 slice 2 (Subscriptions + Installments) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the FastAPI `subscriptions` (14 endpoints) and `installments` (14 endpoints) modules,
and formalise the **mirror-expense contract** — both modules write rows into `expenses`, which slice 1
now owns.

**Architecture:** As slices before it. What is new is that these two modules are the first that write
into *another ported module's* table, so the mirror expense gets one shared provider rather than two
copies, and slice 3 (taxes, debts) will reuse it.

**Source of truth:** `backend/app/modules/{subscriptions,installments}/` — router, schemas, models and
the four service files each. Every JSON sample and constant below was captured from the FastAPI on
:8000 against the dev DB on 2026-08-11, or read from the source; none are inferred.

**Prerequisites:** `docker start wealth-vault-postgres wealth-vault-redis`; FastAPI on :8000.
Continue on `feature/nestjs-phase2-expenses` (slice 1 is already there).

---

## What is genuinely new here

Slices 0–1 established seven conventions and then a per-module wire format. These two modules add a
**third** storage convention and the first cross-module write.

### S1 — A third enum storage form: the value, not the name

| Module | Column type | DB holds | Wire |
|---|---|---|---|
| income | `varchar(20)` | `MONTHLY` | `monthly` |
| expenses | native enum `expensefrequency` | `MONTHLY` | `monthly` |
| **subscriptions, installments** | `varchar(20)` | **`monthly`** | `monthly` |

Both modules declare `str, enum.Enum` classes in `models.py` that are **never bound to a column** —
`frequency` and `status` are plain `String(20)` holding the lowercase literal. So there is **no
mapping**: store and emit the same string. Mapping these the way expenses does would corrupt rows.

Installments additionally declares `InstallmentFrequency = Literal["weekly","biweekly","monthly"]`
and a `InstallmentStatus` Literal that **nothing uses**. Subscription frequencies are
`monthly | quarterly | annually | biannually` — note `biannually` means **every six months**
throughout (delta 6 months, 1/6 monthly, 2× annual).

### S2 — Neither table has `deleted_at`

Hard deletes only, cascading to the payment children (`ON DELETE CASCADE` + ORM
`cascade="all, delete-orphan"`). No soft-delete filtering anywhere in either module.

Note the consequence, which is a real data-integrity gap worth deciding on: deleting an installment
or subscription hard-deletes its payment rows but **leaves every mirror expense orphaned and still
active**, because nothing soft-deletes them on that path.

### S3 — The mirror-expense contract (the reason these two ship together)

Both modules INSERT a row into `expenses` per payment, and both soft-delete it on reversal. This is
the **only** writer of `expenses.deleted_at`, the column slice 1 deliberately left inert.

| Field | Subscriptions | Installments |
|---|---|---|
| `name` | `` `${sub.name} - Subscription` `` | `` `${inst.name} - Payment #${n}` `` |
| `description` | `` `Auto-generated from subscription: ${name}` `` | `` `Auto-generated from installment: ${name}` `` |
| `category` | `sub.category ?? 'Subscriptions'` | `inst.category ?? 'Installments'` |
| `amount` / `paid_amount` | `sub.amount` | the payment amount |
| `frequency` | `ONE_TIME` (the **name**, per the expenses enum) | same |
| `status` | `'paid'` (lowercase literal) | same |
| `date` / `paid_date` | `payment_date` | `payment_date` |
| `payment_account_id` | the parent's | the parent's |
| `payment_method` | `'transfer'` when an account is linked, else `null` | same |
| everything else | model defaults — `monthly_equivalent` stays **NULL** | same |

Verified live: paying a subscription produced
`ZZ probe sub - Subscription | 12.30 | ONE_TIME | paid | Subscriptions`.

**Reversal is asymmetric and must stay so:** the expense is **soft**-deleted (`deleted_at` +
`is_active = false`, while `status` stays `'paid'` and `paid_amount` stays set), the payment row is
**hard**-deleted, and the expense's `account_transaction_id` is *not* cleared even though the
transaction was reversed.

Build this as `MirrorExpenseService` in the expenses module, exported for both callers.

### S4 — Wire format: income's pattern, not expenses'

Both modules follow **income's** split, not slice 1's:

- **list, get-by-id, payments-list, pay** hand-build a dict with `float()` casts which the
  `response_model` then re-coerces to `Decimal` → **float-repr strings** (`"20.0"`, `"1200.0"`,
  `"5.5"`). Use `pyFloatMoney`.
- **create, update, pause, resume, cancel, complete, default, reactivate** return the ORM object →
  **raw DB scale** (`"12.30"`, `"1200.00"`, `"5.50"`). Use the raw string.
- **`display_*` is `null` on every ORM-returning endpoint** and populated on list/get-by-id.
- Only `POST /process-due-payments` (both modules) omits `response_model` → **JSON numbers**.

Verified live on one installment: `POST` answered `"1200.00"` / `"5.50"` / `display_total_amount: null`;
`GET /{id}` answered `"1200.0"` / `"5.5"` / `display_total_amount: "1200.0"`.

**Dates are strings in these response schemas.** `start_date`, `end_date`, `next_payment_date`,
`last_payment_date`, `paused_at`, `resume_date`, `scheduled_date`, `actual_payment_date` are declared
`str` and filled by a `mode='before'` validator calling `.isoformat()`; `created_at`/`updated_at` stay
real datetimes. Both render naive (no `Z`, no offset) — every column on both tables is naive, so
`NaiveTimestampModel` applies and slice 1's microsecond padding matters here too.

### S5 — Date maths, three flavours, all drift-sensitive

**Subscriptions — `calculate_next_payment_date`:** iterative, not multiplicative.

```python
next_date = start
while next_date <= current:      # strictly-after: paying exactly on the due date advances a period
    next_date = next_date + delta
```

Applied N times, so `relativedelta`'s month-end clamp is **sticky**: `2026-01-31` monthly →
`02-28` → `03-28` → …, never returning to the 31st. `start + relativedelta(months=3)` would give
`04-30` — do not "simplify" it that way. Time-of-day is preserved from `start_date` and participates
in the comparison. Unknown frequency silently falls back to monthly.

`calculate_period_dates`: `period_start = payment_date`, `period_end = payment_date + delta - 1 day`.
Verified live: a monthly payment on `2026-08-11 15:27:26` gave `period_end 2026-09-10 15:27:26`.

**Installments — three separate functions, all in `service/common.py`:**

- `calculate_payments_made` walks the schedule from `first_payment_date` counting occurrences
  `<= today`, and is re-run on **every create and update** — so a PUT overwrites the counter that
  the payment path maintained. Uses `datetime.now()` (server-local), unlike the rest of the module.
  Verified live: a 12×100 installment starting 2026-06-01 came back `payments_made: 3`,
  `remaining_balance: "900.00"` on create.
- `calculate_end_date`: `first_payment_date + (n - 1) intervals`; **always** recomputed on update,
  discarding any client-supplied `end_date`.
- `calculate_next_installment_payment_date`: two passes over the schedule, returns `null` once
  exhausted.
- Per-payment scheduled date: `first_payment_date + delta * (payment_number - 1)` — multiplicative
  here, so the clamp applies **once** rather than accumulating. Different from subscriptions on
  purpose.

**No remainder handling on the final instalment.** `scheduled_amount` is `amount_per_payment` for
every payment including the last; `total_amount` and `amount_per_payment` are supplied independently
by the client and never cross-checked. Completion just zeroes the balance.

Interest split: `monthly_rate = interest_rate / 100 / 12` — always `/12` even for weekly and
biweekly — unrounded at 28 digits, written into `numeric(12,2)` so Postgres rounds.

### S6 — Multiplier tables: five of them across the two modules

Reproduce each where it is used; they disagree by design.

| Where | monthly | quarterly | annually | biannually | weekly | biweekly |
|---|---|---|---|---|---|---|
| subs `/stats` | `1` | `Decimal(str(1/3))` = `0.3333333333333333` | `Decimal(str(1/12))` = `0.08333333333333333` | `Decimal(str(1/6))` | — | — |
| subs `/history` | `1` | `0.333333` | `0.083333` | `0.166667` | — | — |
| subs `display_monthly_equivalent` | `1` (int) | `0.333333` | `0.083333` | `0.166667` | — | — |
| inst `/stats` | `1` | — | — | — | `4.33` | `2.17` |
| inst `/history` | `1` | — | — | — | `4.33333` | `2.16667` |

The subscriptions `/stats` row is the dangerous one: those constants come from **binary float
division** (`1/3`), stringified, so `monthly_cost` lands with ~16 significant digits
(e.g. `"9.9966666666666667"`). Hardcode the exact strings — `Decimal(str(1/3))` is
`0.3333333333333333` (16 threes), `Decimal(str(1/12))` is `0.08333333333333333`.

Annual: subs `/stats` uses a **separate** integer table — `monthly 12, quarterly 4, annually 1,
biannually 2` — so `total_annual_cost` is not `monthly_cost × 12`.

### S7 — Bugs to fix rather than replicate

1. **`get_due_subscriptions` / `get_due_installments` have no `user_id` predicate** — the endpoints
   load every tenant's due rows and filter in Python. No data leaks, but it is an unbounded read on
   a shared table. Push the predicate into SQL.
2. **The orphan mirror expense.** In the bulk path, the expense is flushed *before* the withdrawal
   is attempted; on `InsufficientFundsError` the loop continues without rolling back, and the next
   commit persists a `status='paid'` expense with **no payment row pointing at it**. One transaction
   per payment removes this by construction.
3. **`payment_account_id` is never validated as the caller's** in either module (same hole slice 1
   closed for expenses). Validate on create and update.
4. **Subscriptions' tier limit is dead code** — `tier_limits.get(current_user.tier)` looks up a
   `Tier` **entity** in a string-keyed dict, so it is always `None` and the 403 never fires. Port
   the endpoint without the cap and record it; do not silently start enforcing 10/50.
5. **`POST /batch-delete` has no feature gate** in either module (every other endpoint has one).
   Add `subscription_tracking` / `installment_tracking` and note the divergence.
6. Unscoped account/expense lookups inside the payment and reversal paths — scope them all.

**Replicate faithfully** (all observable): the per-verb serialization split, `display_*` null on
ORM-returning endpoints, `POST /{id}/pay` returning **200** rather than 201, subscriptions'
`SubscriptionPaymentCreate.amount` being **accepted and ignored**, installments' truthiness-based
body reading (`amount: 0` falls back to the default), `payments_made` being recomputed from the
calendar on update, `cancel` overwriting `end_date`, and `resume_date` being stored but never acted
on.

### S8 — Status codes and gates

201: `POST ""` (both). 204: `DELETE` (both). **200 everywhere else**, including both `/pay`
endpoints and both `/process-due-payments`.
Feature keys: `subscription_tracking` / `installment_tracking` on every endpoint except the two
batch-deletes (see S7.5). Installments' tier cap is enforced **in the handler** with hardcoded
`starter: 2, growth: 10, wealth: None` and a **`{"detail": "..."}`** 403 — not the
`TierLimitException` envelope the rest of the codebase uses.

---

## Tasks

Subscriptions first: it is the simpler of the two and it establishes the mirror-expense provider that
installments then reuses.

### Task 1: Mirror-expense provider + entities

**Files:** `src/modules/expenses/services/mirror-expense.service.ts` (+ export from `ExpensesModule`);
`src/modules/subscriptions/entities/{subscription,subscription-payment}.entity.ts`;
`src/modules/installments/entities/{installment,installment-payment}.entity.ts`;
test `test/mirror-expense.e2e-spec.ts`.

- [ ] **Step 1:** `MirrorExpenseService.create(manager, input)` writing exactly the fields in the S3
  table, and `.softDelete(manager, expenseId)` setting `deleted_at` + `is_active = false` and
  touching nothing else.
- [ ] **Step 2:** Entities. All four extend `NaiveTimestampModel`; none has `deletedAt`.
  `subscription_payments` and `installment_payments` have **`created_at` but no `updated_at`** —
  override the base or declare them explicitly.
  `frequency`/`status` are plain lowercase varchars — **no enum mapping**.
- [ ] **Step 3:** e2e proving the mirror expense round-trips and that its `frequency` is stored as
  `ONE_TIME` while the wire form is `one_time`.
- [ ] **Step 4:** commit.

### Task 2: Subscriptions — DTOs, mapper, CRUD

Mapper needs both shapes (`toSubscriptionOrm` raw / `toSubscriptionFloat` via `pyFloatMoney`), dates
as isoformat strings, `display_*` null on the ORM shape.
Endpoints: `POST` (201), `GET` list, `GET /{id}`, `PUT`, `DELETE` (204), `POST /batch-delete` (200).
Route order: `stats`, `history`, `batch-delete`, `process-due-payments` **before** `:id`.

- [ ] failing e2e → implement → green → commit.

### Task 3: Subscriptions — pause, resume, cancel, payments list

400 messages, exact: `"Subscription is already paused"`, `"Subscription is not paused"`,
`"Subscription is already cancelled"`. `cancel` sets `end_date = utcnow()`, destroying any
user-supplied value — replicate. Payments list envelope is `{items, total}` with **no page echo**.

- [ ] failing e2e → implement → green → commit.

### Task 4: Subscriptions — pay, process-due-payments, next-date maths

One transaction per payment (S7.2). `calculate_next_payment_date` per S5 — unit-test the sticky
month-end drift explicitly. `/pay` answers 200 with a float-repr-string body.

- [ ] failing e2e + unit tests for the date maths → implement → green → commit.

### Task 5: Subscriptions — stats and history

Five multiplier tables live here (S6); the `/stats` one is float-derived. Assert the long-digit
output byte-for-byte against CPython, as slice 1 did for expenses.

- [ ] failing e2e → implement → green → commit.

### Tasks 6–9: Installments

Same four-way split — CRUD; complete/default/reactivate + payments list; pay + process-due-payments +
schedule maths; stats + history. Additional specifics: the in-handler tier cap with its `{"detail"}`
403 shape, `payments_made` recomputation on update, the interest split, and `remaining_balance`
clamped at zero.

### Task 10: Parity, docs, wrap-up

Request lists for both modules; both `/process-due-payments` rows are safe (no `auto_pay` rows in
dev). Update the spec Progress table (36 → 64 done, 172 → 144 remaining), the README, and check off
this plan.

---

## Self-review

**Coverage.** 28 endpoints across Tasks 2–9; the shared mirror-expense contract in Task 1; parity and
docs in Task 10.

**Consistency.** Reuses slice 0/1 primitives unchanged: `OwnedRepository`, `NaiveTimestampModel` +
`naiveUtcNow`, `decAdd/decMul/decDiv/pyDecimalString`, `pyFloatMoney`, `toNaiveIso` (with its
microsecond padding), `PageQueryDto`, `uuidParam`, `IsUuidLike`,
`AccountTransactionService.createWithdrawal`, `DisplayCurrencyService`.

**Known thin spots.** Tasks 6–9 are specified at the level of "same shape as Tasks 2–5 plus these
named differences" rather than repeating the code, because the two modules are structurally
parallel; every constant and message string that differs is written out above. The reversal path
(`reverse_transaction`) is referenced but not itself ported — it is only reachable from the
`sync_historical` account-change branch, and Task 4 should confirm whether that branch is in scope
before implementing it.
