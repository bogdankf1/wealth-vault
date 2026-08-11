# NestJS Backend v2 — Design

**Date:** 2026-08-10
**Status:** Approved (pending spec review)

## Context

Wealth Vault's backend is a FastAPI app (`backend/`): ~49k lines of Python, 267 HTTP
endpoints across 26 routers, 19 feature modules, 46 DB tables, 51 Celery tasks with
~40 beat cron entries, three billing providers, and an AI/LangGraph agent with RAG.

We are building a second backend, **`backend-nest/`**, in NestJS. Purpose: learning.
The goal is to practice canonical NestJS — guards, pipes, interceptors, middleware,
exception filters, DI/providers, queues, scheduled jobs, events, SSE — by porting a
real, non-trivial API. The FastAPI backend keeps running unchanged and remains the
production backend.

## Decisions (made with user)

1. **Scope:** Core first, decide later. Port foundation + all finance modules +
   background jobs. Defer billing, AI, agent, RAG, admin panel, demo seeding.
2. **Database:** Shared. Nest maps onto the existing Postgres schema.
   **Alembic remains the only schema owner** — Nest runs `synchronize: false` and
   never migrates.
3. **ORM:** TypeORM via `@nestjs/typeorm` (the canonical Nest pairing; decorator
   entities, `@InjectRepository` DI).
4. **Location:** `backend-nest/` in this repo, sibling of `backend/` and `frontend/`.

## Goals

- A drop-in twin for the core API: same routes, same JSON shapes, same auth.
- Exercise every major NestJS concept at least once, idiomatically.
- Frontend can switch backends with one env var (`:8000` vs `:8001`) on the same data.
- A parity-diff harness that proves the port is faithful.

## Non-goals

- Replacing FastAPI in production.
- Porting billing (Stripe/PayPal/Paddle), AI insights/categorization/vision,
  LangGraph agent, RAG, admin endpoints, demo seeding — deferred until core works.
- Schema changes of any kind.

## Stack

- NestJS 11, TypeScript strict, Node 22, npm (matches frontend), Jest + supertest.
- Postgres via TypeORM (`synchronize: false`, snake_case naming strategy).
- Redis for rate limiting (`@nestjs/throttler`) and BullMQ.
- `@nestjs/event-emitter` for the in-process event bus.
- `@nestjs/schedule` + BullMQ for cron/background jobs.
- Port **8001**.

## Layout

```
backend-nest/src/
  main.ts                 # bootstrap: global pipes/filters/interceptors, CORS, helmet
  app.module.ts
  config/                 # ConfigModule + env validation (reads same .env values)
  database/               # TypeORM setup, naming strategy
  common/
    guards/               # JwtAuthGuard, RolesGuard, FeatureGuard, DemoUserGuard
    decorators/           # @CurrentUser, @Roles, @RequireFeature, @Public
    pipes/                # ValidationPipe config, custom pipes
    interceptors/         # logging/timing, response serialization
    filters/              # AppExceptionFilter (FastAPI-identical error JSON)
    middleware/           # security headers, request logging
  events/                 # event handler wiring (per-module handlers)
  jobs/                   # BullMQ queues + cron schedules
  modules/                # income/, expenses/, savings/, ... same names as FastAPI
```

Each module: `*.module.ts`, `*.controller.ts`, service(s), `entities/`, `dto/`.
Large FastAPI service packages (e.g. `expenses/service/{crud,payments,stats}.py`)
become multiple providers in the module rather than one giant service class.

## Compatibility contract

- **Routes:** identical paths (`/api/v1/...`), methods, and query params.
- **Responses:** identical JSON shapes; error shape `{error, details, status_code}`
  matches the FastAPI exception handler byte-for-byte where practical.
- **Auth:** same `SECRET_KEY` + HS256, so tokens are interchangeable between
  backends. There is **no password auth** in FastAPI — real endpoints are
  `POST /auth/google` (Google OAuth id_token), `POST /auth/demo` (demo clone,
  deferred with the demo module), `GET /auth/me`, `GET /auth/me/features`.
  Nest ports google/me/me/features; trial-subscription creation inside
  `/auth/google` is skipped (deferred with billing).
- **Error shapes:** FastAPI actually has two — `{error, details, status_code}`
  from `WealthVaultException` and `{detail}` from `HTTPException` (plus 422
  `{detail: [...]}` validation errors). Nest replicates both via a global filter.
- **DB:** entities mirror existing tables/columns/enums exactly. Known quirks to
  respect: `interest_rate` stored as a fraction, existing Postgres enum types,
  money columns as `Numeric` (serialize like FastAPI does — verify with parity
  diffs whether that's string or number per field).

## FastAPI → NestJS concept map

| FastAPI (today) | NestJS v2 |
|---|---|
| `get_current_user`, `require_role`, `require_tier`, `require_feature`, `forbid_demo_users` | Guards + custom decorators + `Reflector` |
| Pydantic schemas | DTOs + global `ValidationPipe` (class-validator) |
| `SecurityHeadersMiddleware`, logging setup | Middleware (helmet + custom) |
| Response shaping / timing | Interceptors |
| `WealthVaultException` + handlers | `AppException` hierarchy + global exception filter |
| Services + `Depends()` | Providers + Nest DI |
| Event bus (`EventDispatcher`, 32 handlers) | `@nestjs/event-emitter`, same event names |
| Celery tasks + beat | BullMQ processors + `@nestjs/schedule` cron |
| slowapi rate limiting | `@nestjs/throttler` + Redis storage |
| SSE (agent/exports) | `@Sse()` (exports in scope; agent deferred) |

## Phases

Each phase gets its own implementation plan (separate spec→plan cycle not needed;
this spec covers all phases, but plans are written per phase).

- **Phase 0 — Foundation:** skeleton, config with env validation, TypeORM wiring +
  User/UserPreferences/Tier/Feature/TierFeature entities, auth endpoints
  (`/auth/google`, `/auth/me`, `/auth/me/features`), all guards/
  pipes/filters/interceptors/middleware, throttler, health check (DB + Redis),
  parity-diff script scaffold.
- **Phase 1 — Template module:** `income` (18 endpoints incl. distribution
  service), done carefully as the pattern for all other modules.
- **Phase 2 — Payment-pattern family:** expenses, subscriptions, installments,
  taxes, debts.
- **Phase 3 — Money & assets:** savings (incl. transaction/interest engine),
  portfolio, goals, budgets, currency, preferences.
- **Phase 4 — Aggregation & extras:** dashboard, dashboard_layouts, notifications,
  exports (SSE), backups, support.
- **Phase 5 — Jobs:** BullMQ + cron ports of the Celery tasks belonging to ported
  modules (recurring payments, snapshots, notifications). Beat schedule mirrored;
  **jobs run disabled by default** in dev to avoid double-processing against the
  shared DB while FastAPI's Celery beat is also running.

Estimated effort: ~12–15 working sessions for phases 0–5.

## Error handling

`AppException` base (message, statusCode, details) with subclasses mirroring
`app/core/exceptions.py` (NotFound, Unauthorized, Forbidden, Validation, …).
One global filter renders them as `{error, details, status_code}`. Unhandled
errors → 500 with the same shape, details hidden outside debug mode.

## Events

Same event names as `app/core/events.py`. Handlers live with their owning module
and are registered via `@OnEvent`. Handlers whose targets are deferred (e.g.
billing events) are skipped until those modules are ported.

## Testing

- **Unit (Jest):** services with mocked repositories; dedicated tests for guards,
  pipes, interceptors, filters — these are the learning core.
- **E2E (supertest):** per module — happy paths plus auth/ownership rejections,
  against the local dev DB.
- **Parity diff:** script that logs in as the same seeded user, replays a request
  list against `:8000` and `:8001`, and diffs JSON responses. This is the
  acceptance oracle for every ported module.

## Conventions established in Phase 0 (apply to every Phase 1+ module)

1. **Numeric columns stay strings, end to end.** Verified empirically on both sides: pydantic v2
   serializes `Decimal` as a JSON string preserving the column's scale (`Decimal('0.0450')` →
   `"0.0450"`), and node-postgres returns `numeric` (OID 1700) as a string which TypeORM passes
   through untouched. The two stacks therefore already agree byte-for-byte across all ~88 numeric
   columns — **as long as nobody attaches a `transformer: { from: parseFloat }`**, which is the
   usual "fix" for TypeORM's string-numeric surprise and would silently reintroduce float rounding
   and break parity. Never add one. `portfolio_assets.quantity` is `numeric(18,8)` — more
   significant digits than a JS `number` holds exactly — so money DTOs must validate numeric
   strings rather than coerce with `@Type(() => Number)`.
2. **FK writes go through the relation, never the scalar** (see the plan's FK write-path rule).
3. **Auth-path user lookups pass `withDeleted: true`**; nested tier/feature filtering is re-applied
   in code (see the plan's soft-delete parity rule).
4. **Decide pagination, ownership scoping, and transaction boundaries once, in Phase 1**, and reuse
   them. FastAPI's shape is `{items, total, page, page_size}` with per-query
   `.where(Model.user_id == current_user.id)`. Phase 1 (income) is the template the other 18 modules
   copy — divergence there multiplies by 19.

## Known deviation: rate limiting is stricter than FastAPI

FastAPI sets `default_limits=["120/minute"]` on its slowapi `Limiter`, but `main.py` never registers
`SlowAPIMiddleware` — so those defaults are dead config and **FastAPI currently enforces no rate
limit at all** except the explicit `@limiter.limit("5/hour")` on `/auth/demo`. Nest's global
`ThrottlerGuard` does enforce 120/min on every route. This is a deliberate, documented divergence:
the Nest behavior is what the FastAPI config intends. Revisit if a Phase 1+ client (e.g. a dashboard
polling several widgets) starts hitting 429s that never occur on :8000.

## Risks

- **Serialization drift:** Python `Decimal`/date formatting vs JS — caught by the
  parity diff; fix per field.
- **Double side-effects on shared DB:** two backends writing + two schedulers.
  Mitigation: Nest jobs disabled by default; only one backend receives frontend
  traffic at a time during comparison.
- **TypeORM ↔ existing enum/type mismatches:** entities are written against the
  live schema (verified by connecting, not by guessing from Alembic files).
- **Scope creep:** deferred list is explicit; anything outside core waits until
  phases 0–5 are done.
