# Wealth Vault API v2 (NestJS)

Learning port of the FastAPI backend (`../backend`). Same Postgres DB, same JWTs,
same routes under `/api/v1` — a drop-in twin for the core API. See
`docs/superpowers/specs/2026-08-10-nestjs-backend-v2-design.md`.

## Rules of the road
- **Alembic (FastAPI side) owns the schema.** `synchronize: false`, always. No TypeORM migrations.
- Response/error JSON must match FastAPI byte-for-byte where practical — verify with `npm run parity`.

## Setup
1. `cp .env.example .env`, copy `DATABASE_URL`, `SECRET_KEY`, `REDIS_URL`, `GOOGLE_CLIENT_ID` from `../backend/.env` (strip `+asyncpg`).
2. `npm install`
3. Dev DB + Redis must be running (same ones FastAPI dev uses).

## What is ported
- **Phase 0:** `/auth/google`, `/auth/me`, `/auth/me/features` + all cross-cutting infrastructure.
- **Phase 1:** the whole `income` module (18 endpoints), plus partial `savings`, `goals` and
  `currency` modules — only the deposit, goal-progress and rate-lookup paths income needs. Those
  three get built out properly in Phase 3.
- **Phase 2 slice 1:** the whole `expenses` module (15 endpoints) and the withdrawal half of the
  savings engine. Read the Phase 2 plan before touching it: expenses does NOT share income's wire
  format — two of its endpoints emit money as JSON numbers, its frequency column is a native
  Postgres enum, all of its timestamps are naive, and DELETE is a hard delete.
- **Phase 2 slice 2:** `subscriptions` and `installments` (14 endpoints each), plus the shared
  MirrorExpenseService — both record payments as rows in `expenses`, and their reversal is the only
  thing that writes `expenses.deleted_at`. Note these two store lowercase enum VALUES where income
  and expenses store NAMEs.
- **Phase 2 slice 3:** `taxes` (15 endpoints) and `debts` (11), completing Phase 2. These two share
  nothing with each other: taxes withdraw from a savings account, debts are receivables and deposit
  INTO one. Taxes deliberately do NOT use `AccountTransactionService` — FastAPI builds that
  withdrawal inline and writes no balance-history row, so neither may we.
- **Not yet ported:** all of phases 3-5. Everything not listed above is still served only by
  FastAPI.

## Running the parity diff
`TOKEN=<jwt> npm run parity <list>`, with FastAPI on :8000 and Nest on :8001. **Check that the
token's user actually owns rows in the module under test** — a parity run over two empty lists
passes and proves nothing. In the dev DB the finance data lives under `demo-template@wealthvault.app`
and `bogdankf1@gmail.com`; taxes and debts exist only under the former.

## Conventions that are not optional
Money and naive timestamps are **strings** end to end; the helpers in `src/common/money` and
`src/common/time` reproduce Python's `Decimal` and naive-datetime semantics exactly, and the parity
diff will catch you if you bypass them. Feature services take an `OwnedRepository`, never a bare
`Repository`. See the Phase 1 plan for the reasoning behind each.

## Commands
- `npm run start:dev` — dev server on :8001 (swagger at /docs)
- `npm test` — unit tests
- `npm run test:e2e` — e2e (needs live dev DB + Redis)
- `npm run parity scripts/requests/core.json` — Phase 0 rows
- `npm run parity scripts/requests/income.json` — Phase 1 rows
- `npm run parity scripts/requests/expenses.json` — Phase 2 slice 1 rows
- `npm run parity scripts/requests/slice2.json` — Phase 2 slice 2 rows
- `npm run parity scripts/requests/slice3.json` — Phase 2 slice 3 rows
- `npm run routes` — diff every registered route against FastAPI's OpenAPI (`npm run routes -- /taxes`
  to filter). This is what catches an endpoint that was never written: no test fails for a route
  that simply is not there, which is how slice 2 nearly shipped two modules missing one each.

Parity needs both servers up and `TOKEN=<jwt valid on both>`. Stop the dev server before running
`test:e2e` — both write to the same database, and a rebuild mid-run has produced spurious failures. The income list ends with one
deliberate write (it demonstrates an endpoint FastAPI 500s on); clean it up with
`DELETE FROM income_transactions WHERE description = 'parity probe';`.
