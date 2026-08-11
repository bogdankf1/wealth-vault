# NestJS Backend v2 — Design

**Date:** 2026-08-10
**Status:** Phases 0 and 1 complete. Phase 2 slices 1 and 2 done (expenses, subscriptions, installments); slice 3 (taxes, debts) remains.
Spec last reconciled against `backend-nest/` on 2026-08-11.
See [Progress](#progress) for what is done, what remains, and the conventions Phase 1 settled.

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
- Rate limiting via `@nestjs/throttler`, **in-memory storage** — matching slowapi's own default on
  the FastAPI side. Redis-backed throttler storage arrives with BullMQ in Phase 5 if it's needed
  then; today Redis is a dependency only for the health check.
- `@nestjs/event-emitter` for the in-process event bus.
- `@nestjs/schedule` + BullMQ for cron/background jobs.
- Port **8001**.

## Layout

```
backend-nest/src/
  main.ts                 # bootstrap: swagger, shutdown hooks, listen
  app.setup.ts            # configureApp(): body parsers, route prefix, CORS, validation pipe.
                          #   Shared by main.ts and every e2e suite — main.ts does NOT run under
                          #   Test.createTestingModule, so bootstrap must live somewhere both call.
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
  common/
    money/                # decimal.js helpers with Python Decimal semantics + @IsMoneyString
    time/                 # naive-timestamp parser and converters
    repository/           # OwnedRepository — the only DB handle a feature service gets
    dto/                  # PageQueryDto + the two list envelopes
    validation/           # @IsUuidLike (pydantic-equivalent UUID acceptance)
  modules/                # income/, expenses/, savings/, ... same names as FastAPI
```

Modules ported before their own phase (savings, goals, currency in Phase 1) land as **partial**
modules in their final location — only the providers a caller actually needs, marked as such in a
header comment. The owning phase grows them rather than replacing them.

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
| slowapi rate limiting | `@nestjs/throttler` (in-memory, like slowapi's default) |
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
  service), done carefully as the pattern for all other modules. **Done 2026-08-11.**
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

## Progress

Counts below are of FastAPI endpoints to port, measured from `backend/app/` on 2026-08-11.
Update this section at the end of each phase.

**Scope arithmetic:** 267 endpoints exist in FastAPI. 59 are deliberately deferred and stay on
FastAPI — billing (16), AI (14), the LangGraph agent (3), admin (25), and `/auth/demo` (1). That
leaves **208 in scope**, of which **64 are done** and **144 remain**.

| Phase | Modules | Endpoints | Python LOC | Status |
|---|---|---:|---:|---|
| 0 — Foundation | auth (`/auth/google`, `/auth/me`, `/auth/me/features`) + all cross-cutting infrastructure | 3 | — | **Done**, merged in PR #20 |
| 1 — Template module | income | 18 | 2,900 | **Done** (2026-08-11) |
| 2 — Payment-pattern family | expenses, subscriptions, installments **(done)**, taxes, debts | 69 (43 done) | 9,500 | **Slices 1-2 done** (2026-08-11) |
| 3 — Money & assets | savings, portfolio, goals, budgets, currency, preferences | 66 | 7,500 | Not started |
| 4 — Aggregation & extras | dashboard, dashboard_layouts, notifications, exports, backups, support | 52 | 7,000 | Not started |
| 5 — Jobs | BullMQ + cron ports of the Celery tasks belonging to ported modules | — | 116 task fns | Not started |

### What Phase 0 delivered

~1,480 lines of source across 37 files plus ~1,000 lines of tests (644 in 6 unit specs, 352 in 5 e2e
specs — 42 unit tests and 17 e2e tests), all passing, lint clean. Three endpoints is 1.4% of the
surface, which undersells it: Phase 0 is the part that does not repeat. Every NestJS mechanism the project set out to practise is built and exercised —
DI with custom providers and injection tokens, five ordered global guards, decorators driving them
through `Reflector`, pipes, interceptors, middleware, exception filters, and module composition.
Phases 1–5 mostly apply those patterns rather than invent them.

Also delivered: the parity-diff script (`npm run parity`), which replays a request list against
both backends and diffs normalised JSON. It passes on all four current rows. Extend its request
list as each module lands — it is the acceptance oracle for every port.

Verified working: a JWT minted by FastAPI authenticates against Nest and vice versa, live, in both
directions.

### What Phase 1 delivered

All 18 income endpoints, plus the partial `savings/`, `goals/` and `currency/` modules their deposit
and distribution paths require (Phase 3 owns those properly and will grow them). 93 unit tests and
73 e2e tests, lint clean, and **21 of 22 parity rows byte-identical to the live FastAPI** — the
22nd being `POST /transactions`, which FastAPI 500s on and Nest implements.

The seven conventions below are the real deliverable; the module is the demonstration. Four findings
were only discoverable by measurement, and each would have been a silent data bug:

1. **Naive timestamps shift a calendar day.** node-postgres reads `timestamp without time zone` in
   the process timezone, so `2025-12-01 00:00:00` came back as `2025-11-30T22:00:00Z`. Registering
   a raw-string parser for OID 1114 is necessary but not sufficient — TypeORM re-hydrates anything
   it considers a date column through `new Date(value)` anyway, so those columns are declared
   `varchar` as well.
2. **The same row serializes differently per verb.** FastAPI's list/detail handlers cast Decimals
   through `float()`; create/update hand the ORM object to `model_validate`. So `GET /sources`
   answers `"1000.0"` where the `POST` that created it answered `"1000.00"`, and `display_amount` is
   populated only on the GETs. Two mapper functions, chosen per endpoint.
3. **Python's Decimal division pads exact quotients** to `scale(a) - scale(b)`; decimal.js
   normalizes. `/history`'s `overall_average` was `"7500"` instead of `"7500.00"` until the parity
   diff caught it.
4. **class-validator's `@IsUUID()` is stricter than pydantic** — it demands a version nibble, so it
   would 422 the seeded demo user ids (`00000000-...-0000000000d1`) that this database contains.

### What Phase 2 slice 1 delivered

All 15 expense endpoints, plus the withdrawal half of the savings engine that subscriptions,
installments and debts will also need. 121 unit tests and 120 e2e tests; 12 of 15 parity rows
byte-identical to the live FastAPI, the other 3 being endpoints FastAPI cannot serve at all.

The headline lesson is that **conventions are per-module, not global**. Expenses shares the
database and the framework with income and still differs on nearly every axis:

| | Income | Expenses |
|---|---|---|
| Money on the wire | strings everywhere | **numbers** on the 2 endpoints without a `response_model`, strings on the other 13 |
| `frequency` | varchar, name stored | **native PG enum** (rejects a wrong label) with an extra `DAILY` member |
| `created_at` | timestamptz → `…Z` | **naive** → no suffix |
| `DELETE` | soft | **hard** |
| Savings direction | deposit | **withdrawal**, with an overdraft guard |

**Three endpoints are unreachable in FastAPI.** `GET /expenses/{expense_id}` is declared before
`/pending`, `/overdue` and `/payment-summary`, so all three 422 on UUID parsing and their handlers
have never run in production. Nest declares literals first — approved divergence, annotated in the
parity list.

Four measurement-only findings, each of which would otherwise have been a silent wrong number:

1. **Python's 28-digit context applies to arithmetic**, so `Decimal('100.00') * Decimal(4.33)` is
   `433.0000000000000071054273576`, not the exact 50-digit product.
2. **`Decimal(4.33)` is built from a float** and its binary expansion reaches the response.
   `new Decimal(4.33)` in decimal.js is plain 4.33 and will not reproduce it.
3. **A scale-49 zero propagates.** An empty weekly bucket makes `/stats` answer `"0E-49"` — Python
   renders zero in scientific notation once the adjusted exponent drops below -6, and the same zero
   forces every sum it joins to 28-digit rounding (`"17300.40000000000000000000000"`).
4. **Postgres strips trailing zeros from fractional seconds; Python's `isoformat()` pads to six.**
   `.92364` vs `.923640` — the parity diff caught it on every row of the expenses list.

Also closed here: `payment_account_id` was never validated as the caller's, and the list endpoint
joined `savings_accounts` with no owner predicate, so a user could store a foreign account id and
read that account's name back.

### What Phase 2 slice 2 delivered

All 28 subscription and installment endpoints, and the **mirror-expense contract** both modules
share. 121 unit tests and 160 e2e tests; all 13 parity rows byte-identical on the first run, and
all four parity lists (core, income, expenses, slice 2) green together.

These two modules are the first that write into another ported module's table: each payment INSERTs
a row into `expenses`, and their reversal path soft-deletes it — the only writer of
`expenses.deleted_at`, which slice 1 deliberately left inert. That row now has one provider,
`MirrorExpenseService`, ready for slice 3.

**A third enum storage convention.** Three modules, three answers for the same idea:

| | Column | DB holds | Wire |
|---|---|---|---|
| income | varchar | `MONTHLY` | `monthly` |
| expenses | native PG enum | `MONTHLY` | `monthly` |
| subscriptions, installments | varchar | **`monthly`** | `monthly` |

Mapping the last pair the way the first two are mapped would corrupt every row. Neither has a
`deleted_at` column at all, and both store their next due date rather than deriving it.

**Five multiplier tables across two modules**, all disagreeing. The subscriptions `/stats` set is
built from binary float division in Python, so a quarterly subscription's `monthly_cost` is
`"9.999999999999999000"` — the constants are hardcoded as exact strings because
`new Decimal(1/3)` would be a different number.

Two bugs the tests caught, both ours rather than FastAPI's: the shared `advance()` helper split
timestamps on `'T'` only, so a Postgres-style `'YYYY-MM-DD HH:MM:SS'` argument produced `NaN`; and
the installments tier table maps `wealth` to an explicit `null` for *unlimited*, which `?? 2` turned
into the starter cap of 2.

### Revised effort estimate

The original estimate of ~12–15 sessions for phases 0–5 was optimistic. Phase 0 alone took a full
session, largely absorbed by foundational discovery — three non-obvious defects (TypeORM not
generating timestamps client-side, a catch-all route swallowing feature-module routes, FK
precedence between scalar and relation) that are now solved once and documented in this spec and
the Phase 0 plan.

Current estimate: **10–14 further sessions**, front-loaded in difficulty. Phase 1 is the expensive
one — a single module, but it fixes the conventions the other 17 copy, so budget a full session for
income alone. Phases 2–4 should move faster once the template exists, roughly a session per two or
three modules.

### Decisions settled in Phase 1 (apply to every module from here)

These were the open questions; the answers are in code under `backend-nest/src/common/` and are
explained at length in the Phase 1 plan.

1. **Pagination** — a shared `PageQueryDto` (page ≥ 1 default 1, page_size 1–100 default 50) and two
   builders, because FastAPI has two envelopes: `{items, total, page, page_size}` for sources and
   transactions, `{items, total}` for distribution rules (where `total` is `len(items)`, not a
   COUNT).
2. **Ownership** — `OwnedRepository<T>`. Every method takes the owner's id first and folds
   `user_id = :userId` into the query; services never receive a bare `Repository`. Forgetting to
   scope now requires deliberately reaching around the API rather than merely forgetting a clause.
3. **Transactions** — one `dataSource.transaction()` per use case, and the deposit helper takes an
   `EntityManager` instead of committing internally. This is a deliberate improvement: FastAPI
   commits per deposit, so a failed distribution leaves money in some targets and not others.
4. **Money** — strings end to end. `@IsMoneyString()` inbound (never `@Type(() => Number)`),
   `decimal.js` configured to Python's context (28 digits, ROUND_HALF_EVEN) for arithmetic, and
   `decMul`/`decAdd`/`decDiv` reimposing Python's scale rules, which decimal.js normalizes away.
5. **Naive timestamps** — strings end to end too, via the OID 1114 parser plus a `varchar` column
   declaration. See finding 1 above.
6. **Enums** — the DB stores the member NAME (`MONTHLY`), the wire carries the VALUE (`monthly`).
   One explicit mapping object per enum; never `toLowerCase()`.
7. **UUID validation** — `@IsUuidLike()`, matching pydantic's "any 8-4-4-4-12 hex".

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
4. **Throw the app's own exceptions, never Nest's built-ins.** `NotFoundException`,
   `UnauthorizedException`, `ForbiddenException`, `BadRequestException` and `ConflictException` exist
   in both `@nestjs/common` and `src/common/exceptions/app.exception.ts` with the same names and
   different response shapes, so an eslint `no-restricted-imports` rule blocks the `@nestjs/common`
   ones. This matters more than it looks: `GlobalExceptionFilter` rewrites the detail of any *other*
   404 to `"Not Found"` (that is how the unmatched-route parity gap is closed), so a 404 raised the
   wrong way loses its message silently. Phase 1 modules raise 404s constantly — use
   `NotFoundException` from `app.exception.ts`, or `DetailException(404, msg)` for the `{detail}` shape.
5. **Every e2e suite that issues HTTP requests calls `configureApp(app)` and opts out of Nest's body
   parser** (`createNestApplication({ bodyParser: false })`), exactly as `main.ts` does. `main.ts`
   never runs under `Test.createTestingModule`, so a suite that skips this tests an app with no route
   prefix, no validation pipe, and no CORS — i.e. not the app that ships. (`entities.e2e-spec.ts` is
   the one exception: it only resolves the `DataSource` and never makes a request.)
6. **The conventions Phase 1 settled** — pagination, ownership, transactions, money, naive
   timestamps, enums and UUID validation — are listed under "Decisions settled in Phase 1" above and
   implemented in `backend-nest/src/common/`. Copy them; do not re-decide them per module.
7. **Two e2e rules learned the hard way.** Never create a second Nest app inside one Jest process
   (they share the postgres driver, so closing one leaves the other on "Driver not Connected") —
   create another user instead. And every suite must delete the rows it created: these run against
   the dev DB that FastAPI also uses.

## Known deviation: feature checks are stricter than FastAPI

`FeatureGuard` looks up `tier_features` without `withDeleted`, so TypeORM appends `deleted_at IS NULL`
to the grant and the feature row. FastAPI's `check_feature_access` (`backend/app/core/permissions.py`)
has no such filter and would still grant access on a soft-deleted grant. Nest denies where FastAPI
allows. Kept deliberately — a revoked grant should not keep working — but it means a parity diff on a
soft-deleted grant is expected, not a bug. `/auth/me/features` is the opposite case: it must return the
same list FastAPI does, so `AuthService.getFeatures` re-applies the `deletedAt` checks in code
(`withDeleted: true` on the user lookup disables them on the joins — see the conventions above).

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
