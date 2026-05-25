# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack at a glance

- **Backend**: FastAPI + SQLAlchemy 2.0 async + PostgreSQL + Redis + Celery (Python 3.11+)
- **Frontend**: Next.js 14 (App Router) + TypeScript strict + Tailwind + shadcn/ui + RTK Query + Zustand
- **Auth**: NextAuth.js v5 (Google OAuth) on the frontend, JWT validated by FastAPI
- **Billing**: Stripe is primary; PayPal and Paddle scaffolding also exists

## Commands

### Backend (`cd backend`, with `venv` activated)

```bash
uvicorn app.main:app --reload                       # dev server (http://localhost:8000, docs at /docs)
alembic upgrade head                                # apply migrations
alembic revision -m "msg"                           # new migration (prefer hand-written, see "Migrations" below)
python -m app.scripts.seed_data                     # seed tiers/features (run once on a fresh DB)
pytest                                              # tests (sparse — Phase 1+ scope per README)
pytest path/to/test_x.py::test_name                 # single test
ruff check .                                        # lint
black .                                             # format
celery -A app.core.celery_app worker --beat --pool=solo --loglevel=info   # combined worker+beat (matches prod)
```

### Frontend (`cd frontend`)

```bash
npm run dev            # next dev --turbopack
npm run build          # next build --turbopack
npm run lint           # eslint
npx tsc --noEmit       # type check (no script wired; run tsc directly)
npx shadcn@latest add <component>   # add a shadcn component
```

There is no top-level test runner for the frontend; tests, if added, would use whatever the package chooses.

## Architecture

### Backend module layout

Every domain lives in `backend/app/modules/<name>/` with this canonical file set:

- `models.py` — SQLAlchemy ORM, all inheriting `app.core.database.Base`
- `schemas.py` — Pydantic request/response DTOs
- `router.py` *or* `api.py` — FastAPI router (both names exist; check neighbors before picking)
- `service.py` — business logic; split into `<thing>_service.py` files when a module grows (see `savings/transaction_service.py`)

Routers are wired in `app/main.py`. Some routers declare their own `prefix=...` (e.g. `monobank/router.py` uses `/api/v1/integrations/monobank`); others rely on `app.include_router(x, prefix="/api/v1")` at registration. Match the convention of the module you're editing.

### Celery tasks live OUTSIDE modules

Task files live in `backend/app/tasks/<module>_tasks.py`, not inside `app/modules/<module>/`. Register new task modules in two places:

1. `app/core/celery_app.py` → `include=[...]` list
2. `app/tasks/base.py` → **import every new model used by tasks** at the top of this file. SQLAlchemy mappers won't resolve in the Celery worker process unless models are imported here. Forgetting this produces confusing `Mapper has no property` errors at task runtime, not at import time.

The Celery beat schedule consolidates daily tasks into a tight **00:00–01:15 UTC window** (then weekly/monthly at 02:00) — this is intentional to keep the Railway worker active for ~75 min/day. Slot new daily tasks into that window.

Prod runs a single combined process: `celery ... worker --beat --pool=solo`. No prefork, no multi-worker. Anything that assumes parallel workers will break.

### Migrations

Until the Monobank integration, `alembic/versions/` was empty and the project applied schema via `backend/create_all_tables.py` (`Base.metadata.create_all`) plus ad-hoc `backend/add_*.py` / `backend/create_*.py` scripts. **From now on, use Alembic.** The first real migration (`alembic/versions/20260522_0000_a1mono_...`) has `down_revision = None` and only adds Monobank-specific objects — it does not baseline the rest of the schema, because the rest was already created via `create_all_tables.py`. New migrations should set `down_revision` to the latest revision in `versions/`.

`alembic/env.py` imports models explicitly so autogen can see them — **add new model imports there** when introducing new tables.

### Tier gating

Three helpers in `app/core/permissions.py`:

- `@require_tier("growth")` — exact tier match, admins bypass
- `@require_any_tier("growth", "wealth")` — any-of list, admins bypass (added with the Monobank work)
- `@require_feature("feature_key")` — finer-grained via the `tier_features` join table

Admins (`current_user.is_admin()`) bypass all tier checks. New premium features should normally use `require_any_tier("growth", "wealth")`; reserve `require_tier("wealth")` for Wealth-exclusive.

Tier names are lowercase: `starter`, `growth`, `wealth`.

### External integrations

- Pattern lives in `app/modules/monobank/` and `app/modules/savings/`. External-source data uses two columns on `SavingsAccount` and `AccountTransaction`: `external_source` (e.g. `"monobank"`) + `external_id`. Both have a partial unique index `(user_id, external_source, external_id) WHERE external_id IS NOT NULL` for idempotent upserts from webhooks/backfill.
- Third-party tokens are encrypted at rest via `app/core/encryption.py` (Fernet, key HKDF-derived from `SECRET_KEY`). **Rotating `SECRET_KEY` invalidates every encrypted token** — currently `MonobankConnection.encrypted_token`.
- Monobank's 1-req-per-60s rate limit is enforced cross-process via Redis keys `monobank:ratelimit:<token_hash>`. The backfill task sleeps 65 s between window pulls. Don't bypass this.
- Webhook URLs are secret-in-path: `/api/v1/integrations/monobank/webhook/{secret}`, where `secret` is a per-connection token stored on the connection row. Mono itself uses this pattern (no signature header).

### Multi-currency

Currency conversion uses live rates from exchangerate-api.com with a 1-hour DB cache, falling back to last-known rates if the API is down. `EXCHANGE_RATE_API_KEY` is optional — the app works without it via the cache. Conversion happens on read in display widgets; storage is always in the account's native currency (`Numeric(12, 2)`, ISO-4217 alpha).

### Frontend data layer

- All HTTP through `frontend/lib/api/apiSlice.ts` (RTK Query). New domains add via `apiSlice.injectEndpoints({...})` in `<module>Api.ts`.
- **When adding a new domain, register its tag name in the `tagTypes` array** in `apiSlice.ts` — otherwise `providesTags` / `invalidatesTags` silently no-op.
- `currentUser.tier?.name` is the source of truth for tier-gated UI. Pattern: render a `<Badge>Requires Growth</Badge>` when the user lacks access, disable mutations, link to `/dashboard/settings/subscription`.
- i18n via `next-intl`'s `useTranslations(...)`. Most settings components use it; new ones should too, but plain English is tolerated for v1 of a feature.

### Routing & auth

- FastAPI auth dependency: `Depends(get_current_user)` from `app.core.permissions`, expects `Authorization: Bearer <jwt>`. The JWT is issued by NextAuth on the frontend and validated by FastAPI.
- Frontend protected routes live under `app/dashboard/*`; the route guard is handled by NextAuth middleware.

## Conventions worth knowing

- **Single combined process** in prod (web + worker on Railway): no assumptions of multiple workers, no in-memory state across requests.
- **Async everywhere** on the backend — DB sessions are `AsyncSession`; never use sync SQLAlchemy or `requests`. Use `httpx.AsyncClient` for outbound HTTP.
- **Numeric(12, 2)** is the standard for monetary fields. Currency codes are ISO-4217 alpha (3 chars) in our DB; some external APIs (Monobank) return numeric — convert at the boundary via `app/modules/monobank/client.py:currency_alpha`.
- **Per-user uniqueness**: most things scope by `user_id`. New "one row per user" tables should add `UniqueConstraint("user_id", name="uq_<thing>_user")` like `MonobankConnection` does.
- TypeScript strict mode is on; `any` is disallowed by ESLint. README states "0 ESLint errors/warnings" and "0 TypeScript errors" as quality bars.

## Things not to do

- Don't add new schema via `backend/add_*.py` / `backend/create_*.py` scripts. That was the old workflow; use Alembic now.
- Don't add a new model without importing it in `app/tasks/base.py` and `alembic/env.py`.
- Don't add a Celery task without including its module in `app/core/celery_app.py`'s `include=[...]` list.
- Don't add a new frontend API slice without adding its tag name to `apiSlice.ts:tagTypes`.
- Don't put new periodic tasks outside the 00:00–01:15 UTC window unless there's a real reason (Mono's nightly safety-net sync at 04:00 is one — it sleeps 65 s per linked account so it can't share the main window).
- Don't bypass Mono's rate limiter when adding new Mono API calls; route them through `MonobankClient` so the Redis gate kicks in.
