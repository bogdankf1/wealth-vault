# NestJS Backend v2 — Phase 0 (Foundation) Implementation Plan

**Status: complete.** All 11 tasks executed and merged to `main` in PR #20 (2026-08-10). Verified at
merge: 42 unit tests, 17 e2e tests, lint clean, parity green on all four rows. Nothing here is left
to do — the plan is kept as the record of *why* Phase 0 looks the way it does, and the
non-obvious rules below (FK write path, soft-delete parity, lint, `useDefineForClassFields`) still
bind every later phase.

> **Reading this after the fact:** the code blocks are the plan *as written before implementation*.
> Where the shipped code deliberately diverges, an **As shipped** note sits next to the block. The
> repository is the source of truth; the snippets are not.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `backend-nest/` — a NestJS 11 app on port 8001 sharing the FastAPI backend's Postgres DB and JWTs, with auth (`/auth/google`, `/auth/me`, `/auth/me/features`), the full guards/pipes/filters/interceptors/middleware toolbox, rate limiting, health check, and a parity-diff script.

**Architecture:** Drop-in twin of the FastAPI core: same routes under `/api/v1`, same JSON shapes (snake_case keys), same HS256 JWTs signed with the shared `SECRET_KEY`. TypeORM maps onto the existing schema with `synchronize: false` (Alembic stays schema owner). Cross-cutting concerns are implemented the canonical Nest way: global `APP_GUARD`/`APP_FILTER`/`APP_INTERCEPTOR` providers, passport-jwt strategy, class-validator DTO pipe.

**Tech Stack:** NestJS 11, TypeScript (strict), TypeORM 0.3 + pg, @nestjs/passport + passport-jwt, @nestjs/jwt, @nestjs/throttler, @nestjs/swagger, class-validator/class-transformer, ioredis, Jest + supertest, npm, Node 22.

**Reference files (FastAPI source of truth):**
- `backend/app/api/v1/auth.py` — auth endpoints to mirror
- `backend/app/core/permissions.py` — `get_current_user`, role/feature checks (exact 401/403 strings)
- `backend/app/core/exceptions.py` — exception hierarchy and `{error, details, status_code}` shape
- `backend/app/models/{base,user,tier,user_preferences}.py` — column definitions
- `backend/app/schemas/user.py` — response shapes
- `backend/app/main.py` — middleware, CORS, health, root

**FK write-path rule (found in Task 3 review, verified empirically over three rounds):** every entity here
maps its foreign key twice — a scalar (`tierId`) and a relation (`tier`) over the same column. TypeORM merges
the `@Column` and the `@JoinColumn` into a **single** `ColumnMetadata` object, and `getEntityValue()` reads the
relation property first, falling back to the scalar only when the relation is falsy. So whenever both are set
the relation silently wins — including when the relation was merely hydrated by an earlier
`find({ relations: ... })` and the code then assigns the scalar, which is a silent no-op rather than an error.

There is **no entity-level fix**. `persistence: false` is only consulted for inverse-side/collection relations,
never owning-side `@ManyToOne` (verified). `{ insert: false, update: false }` on the scalar disables writes from
*both* sides and drops the column from INSERTs entirely, because scalar and relation are the same object
(verified). This is a TypeORM design characteristic, not a bug we introduced.

The rule is therefore enforced by convention, documented on the entities themselves:
**write FKs by assigning the relation entity, never the scalar, and never set both on one `save()`.**
Reading `user.tierId` is always safe — the scalar populates correctly on load.

**Soft-delete parity rule (found in Task 3 review):** `@DeleteDateColumn` makes TypeORM silently append
`deleted_at IS NULL` to every find. FastAPI is inconsistent here on purpose-by-accident: `get_current_user`
(`backend/app/core/permissions.py`) does NOT filter `deleted_at`, so a soft-deleted user keeps
authenticating there until their token expires, while `admin_service.py` list/count queries DO filter.
To match, **user lookups on the auth path must pass `withDeleted: true`** — otherwise Nest 401s where
FastAPI returns 200.

Caveat proven in the Task 6 review: `withDeleted` is a single flag on the query's `expressionMap`,
applied to the root WHERE **and every join** — it is not scoped to the root entity. So it also disables
`deleted_at IS NULL` on the joined `tier`, `tierFeatures`, and `feature` rows, which FastAPI's
`/auth/me/features` filters explicitly. `relations: {...}` cannot express "root unfiltered, joins
filtered", so the service layer restores parity in code: `getFeatures` skips any row where
`tf.deletedAt` or `tf.feature.deletedAt` is set. Do not remove those checks believing the ORM handles it.

**Lint reality check (learned in Task 2):** the CLI scaffold's `eslint.config.mjs` uses
`tseslint.configs.recommendedTypeChecked`. Several code blocks in this plan are illustrative and
will trip `no-unsafe-assignment` / `no-unsafe-return` / `no-unsafe-argument` wherever a library hands
back `any` (`class-transformer`'s `TransformFnParams.value`, `JSON.parse`, `exception.getResponse()`,
`request.user`, `error` in a `catch`). Fix these by laundering the value through an explicit `unknown`
local and narrowing — never with `eslint-disable`, `@ts-ignore`, or by relaxing the ESLint config.
`npm run lint` must exit 0 at the end of every task. The one acceptable pre-existing warning is
`no-floating-promises` on `bootstrap();` in the scaffold's `main.ts`.

**Required tsconfig setting (added during Task 1 review):** `backend-nest/tsconfig.json` must set
`"useDefineForClassFields": false`. The CLI scaffold targets ES2023, where TypeScript defaults that
flag to `true` and emits uninitialized class properties (the `id!: string` pattern all entities use)
as real fields set to `undefined`. TypeORM's `Repository.create()` then carries those keys into the
INSERT, turning omitted columns into explicit NULLs against the shared schema. Do not remove it.

**Known deliberate deviations (do NOT "fix" these):**
1. `/auth/demo` is NOT ported (demo module deferred).
2. Trial-subscription creation inside `/auth/google` new-user flow is NOT ported (billing deferred).
3. JWT from Nest includes `iat` (FastAPI's doesn't) — harmless, both backends validate fine.
4. 422 validation-error `msg` texts differ from pydantic's — shape matches, wording doesn't.
5. (Added during Task 6.) `FeatureGuard` runs its `tier_features` lookup without `withDeleted`, so
   TypeORM auto-filters soft-deleted grants and features. FastAPI's `check_feature_access` has no
   such filter and would still grant access on a soft-deleted grant. Nest is intentionally stricter
   — it denies where FastAPI allows. The rule is commented on the guard itself.
6. (Added during Task 8.) Rate limiting is enforced globally at 120/min; FastAPI configures the same
   number but never registers the middleware, so it enforces nothing. See the spec's
   "Known deviation: rate limiting is stricter than FastAPI".

**Prerequisites:** local dev Postgres (FastAPI's docker dev DB, with `wealth` tier seeded) and Redis running; `backend/.env` exists to copy values from. All commands run from repo root unless stated. Work happens on branch `feature/nestjs-backend-v2`.

---

## File Structure (end state)

```
backend-nest/
  .env                      # local only, gitignored
  .env.example
  README.md
  package.json / tsconfig / nest-cli.json / eslint / jest configs (CLI-generated)
  scripts/
    parity-diff.ts          # replay requests against :8000 and :8001, diff JSON
    requests/core.json      # starter request list
  src/
    main.ts                 # bootstrap: swagger, shutdown hooks, port 8001
    app.setup.ts            # configureApp(): body parsers, prefix, CORS, validation pipe
                            #   — shared by main.ts and every e2e suite
    app.module.ts           # wires everything; global guards/filter/interceptor
    app.controller.ts       # GET /  (root message)
    health/health.controller.ts  # GET /health (DB + Redis checks)
    config/env.validation.ts     # typed env validation + helpers
    database/database.module.ts  # TypeOrmModule.forRootAsync
    redis/redis.module.ts        # REDIS_CLIENT custom provider (ioredis)
    common/
      entities/base.entity.ts    # id/created_at/updated_at/deleted_at
      exceptions/app.exception.ts
      filters/global-exception.filter.ts
      middleware/security-headers.middleware.ts
      interceptors/logging.interceptor.ts
      decorators/{public,current-user,roles,require-feature,forbid-demo}.decorator.ts
      guards/{jwt-auth,roles,feature,demo}.guard.ts
    modules/
      users/ users.module.ts, users.service.ts, entities/{user,user-preferences}.entity.ts
      tiers/ tiers.module.ts, entities/{tier,feature,tier-feature}.entity.ts
      auth/  auth.module.ts, auth.controller.ts, auth.service.ts,
             google-oauth.service.ts, jwt.strategy.ts, dto/google-auth.dto.ts,
             mappers/user-response.mapper.ts
  test/
    app.e2e-spec.ts, entities.e2e-spec.ts, auth.e2e-spec.ts,
    throttling.e2e-spec.ts, health.e2e-spec.ts, jest-e2e.json
```

---

### Task 1: Scaffold the NestJS app

**Files:**
- Create: `backend-nest/` (entire tree via Nest CLI)
- Modify: `backend-nest/src/main.ts`
- Create: `backend-nest/.env.example`, `backend-nest/.env`

- [x] **Step 1: Generate project**

```bash
cd /Users/bohdanburukhin/Projects/personal/wealth-vault
npx @nestjs/cli@latest new backend-nest --package-manager npm --strict --skip-git
```

Expected: CLI scaffolds `backend-nest/` with `src/{main.ts,app.module.ts,app.controller.ts,app.service.ts}`, Jest configs, eslint/prettier. Verify `@nestjs/core` in `backend-nest/package.json` is `^11`.

- [x] **Step 2: Confirm it boots**

```bash
cd backend-nest && npm run start:dev
```

Expected: `Nest application successfully started` on port 3000; `curl localhost:3000` → `Hello World!`. Stop the server.

- [x] **Step 3: Create env files**

`backend-nest/.env.example`:

```bash
# Copy to .env and fill from backend/.env (same DB, same secret — that's the point)
DATABASE_URL=postgresql://wealth_vault:wealth_vault@localhost:5432/wealth_vault
SECRET_KEY=change-me-must-match-backend
REDIS_URL=redis://localhost:6379/0
PORT=8001
DEBUG=true
ACCESS_TOKEN_EXPIRE_MINUTES=30
GOOGLE_CLIENT_ID=
CORS_ORIGINS=["http://localhost:3000"]
```

Create `backend-nest/.env` by copying `DATABASE_URL`, `SECRET_KEY`, `REDIS_URL`, `GOOGLE_CLIENT_ID` values from `backend/.env` (strip any `+asyncpg` from DATABASE_URL — the validator also does this defensively). Append `.env` to `backend-nest/.gitignore`.

- [x] **Step 4: Commit**

```bash
cd /Users/bohdanburukhin/Projects/personal/wealth-vault
git add backend-nest && git commit -m "chore(nest): scaffold NestJS 11 app for backend v2"
```

---

### Task 2: Typed env validation (ConfigModule)

**Files:**
- Create: `backend-nest/src/config/env.validation.ts`
- Modify: `backend-nest/src/app.module.ts`
- Test: `backend-nest/src/config/env.validation.spec.ts`

- [x] **Step 1: Write the failing tests**

`backend-nest/src/config/env.validation.spec.ts`:

```typescript
import { validateEnv, parseCorsOrigins } from './env.validation';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  SECRET_KEY: 's3cret',
};

describe('validateEnv', () => {
  it('accepts minimal config and applies defaults', () => {
    const env = validateEnv({ ...base });
    expect(env.PORT).toBe(8001);
    expect(env.REDIS_URL).toBe('redis://localhost:6379/0');
    expect(env.ACCESS_TOKEN_EXPIRE_MINUTES).toBe(30);
    expect(env.DEBUG).toBe(false);
    expect(env.APP_VERSION).toBe('0.1.0');
  });

  it('throws when SECRET_KEY is missing', () => {
    expect(() => validateEnv({ DATABASE_URL: base.DATABASE_URL })).toThrow(/SECRET_KEY/);
  });

  it('strips +asyncpg from DATABASE_URL', () => {
    const env = validateEnv({ ...base, DATABASE_URL: 'postgresql+asyncpg://u:p@h:5432/db' });
    expect(env.DATABASE_URL).toBe('postgresql://u:p@h:5432/db');
  });

  it('coerces PORT and DEBUG from strings', () => {
    const env = validateEnv({ ...base, PORT: '8001', DEBUG: 'true' });
    expect(env.PORT).toBe(8001);
    expect(env.DEBUG).toBe(true);
  });
});

describe('parseCorsOrigins', () => {
  it('parses a JSON array', () => {
    expect(parseCorsOrigins('["http://localhost:3000","https://x.app"]')).toEqual([
      'http://localhost:3000',
      'https://x.app',
    ]);
  });

  it('parses a comma-separated list', () => {
    expect(parseCorsOrigins('http://a.com, http://b.com')).toEqual(['http://a.com', 'http://b.com']);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `cd backend-nest && npx jest src/config --verbose`
Expected: FAIL — `Cannot find module './env.validation'`

- [x] **Step 3: Implement**

`backend-nest/src/config/env.validation.ts`:

```typescript
import { plainToInstance, Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsString, MinLength, validateSync } from 'class-validator';

export class EnvironmentVariables {
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace('postgresql+asyncpg://', 'postgresql://') : value,
  )
  DATABASE_URL!: string;

  @IsString()
  @MinLength(1)
  SECRET_KEY!: string;

  @IsString()
  REDIS_URL: string = 'redis://localhost:6379/0';

  @IsInt()
  @Transform(({ value }) => (value === undefined ? 8001 : parseInt(String(value), 10)))
  PORT: number = 8001;

  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  DEBUG: boolean = false;

  @IsInt()
  @Transform(({ value }) => (value === undefined ? 30 : parseInt(String(value), 10)))
  ACCESS_TOKEN_EXPIRE_MINUTES: number = 30;

  @IsString()
  GOOGLE_CLIENT_ID: string = '';

  @IsString()
  CORS_ORIGINS: string = '["http://localhost:3000"]';

  @IsString()
  APP_NAME: string = 'Wealth Vault API';

  @IsString()
  APP_VERSION: string = '0.1.0';
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: false,
    exposeDefaultValues: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false, whitelist: true });
  if (errors.length > 0) {
    throw new Error(`Invalid environment: ${errors.map((e) => e.property).join(', ')} — ${errors}`);
  }
  return validated;
}

export function parseCorsOrigins(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // fall through to comma-separated parsing
  }
  return raw.split(',').map((s) => s.trim());
}
```

Wire into `backend-nest/src/app.module.ts` (replace the CLI-generated module contents):

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

Install: `npm i @nestjs/config class-validator class-transformer`

- [x] **Step 4: Run tests to verify they pass**

Run: `npx jest src/config --verbose`
Expected: PASS (6 tests)

- [x] **Step 5: Use PORT in main.ts and verify boot on 8001**

In `backend-nest/src/main.ts`:

```typescript
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { EnvironmentVariables } from './config/env.validation';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<EnvironmentVariables, true>);
  await app.listen(config.get('PORT', { infer: true }));
}
bootstrap();
```

Run: `npm run start:dev` → Expected: listening on 8001 (`curl localhost:8001` → `Hello World!`). Stop it.

- [x] **Step 6: Commit**

```bash
git add backend-nest && git commit -m "feat(nest): typed env validation via ConfigModule"
```

---

### Task 3: TypeORM + entities mapped onto the existing schema

**Files:**
- Create: `backend-nest/src/database/database.module.ts`
- Create: `backend-nest/src/common/entities/base.entity.ts`
- Create: `backend-nest/src/modules/tiers/entities/tier.entity.ts`, `feature.entity.ts`, `tier-feature.entity.ts`, `backend-nest/src/modules/tiers/tiers.module.ts`
- Create: `backend-nest/src/modules/users/entities/user.entity.ts`, `user-preferences.entity.ts`, `backend-nest/src/modules/users/users.module.ts`
- Modify: `backend-nest/src/app.module.ts`
- Test: `backend-nest/test/entities.e2e-spec.ts`

**Critical constraints:** `synchronize: false` always (Alembic owns the schema). UUIDs, `created_at`, `updated_at` are generated **client-side** in the FastAPI models — the DB columns have no server defaults — so entities must generate them client-side too (`@BeforeInsert` + `@CreateDateColumn`).

- [x] **Step 1: Install**

```bash
cd backend-nest && npm i @nestjs/typeorm typeorm pg typeorm-naming-strategies
```

- [x] **Step 2: Base entity**

`backend-nest/src/common/entities/base.entity.ts`:

```typescript
import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Mirrors backend/app/models/base.py: id, created_at, updated_at, deleted_at (soft delete). */
export abstract class BaseModel {
  @PrimaryColumn('uuid')
  id!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt!: Date | null;

  @BeforeInsert()
  generateId(): void {
    if (!this.id) this.id = randomUUID();
  }
}
```

- [x] **Step 3: Tier entities**

`backend-nest/src/modules/tiers/entities/tier.entity.ts`:

```typescript
import { Column, Entity, OneToMany } from 'typeorm';
import { BaseModel } from '../../../common/entities/base.entity';
import { TierFeature } from './tier-feature.entity';

@Entity('tiers')
export class Tier extends BaseModel {
  @Column({ type: 'varchar', length: 50, unique: true })
  name!: string;

  @Column({ type: 'varchar', length: 100 })
  displayName!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'int' })
  priceMonthly!: number;

  @Column({ type: 'int' })
  priceAnnual!: number;

  @Column({ type: 'boolean' })
  isActive!: boolean;

  @OneToMany(() => TierFeature, (tf) => tf.tier)
  tierFeatures!: TierFeature[];
}
```

`backend-nest/src/modules/tiers/entities/feature.entity.ts`:

```typescript
import { Column, Entity } from 'typeorm';
import { BaseModel } from '../../../common/entities/base.entity';

@Entity('features')
export class Feature extends BaseModel {
  @Column({ type: 'varchar', length: 100, unique: true })
  key!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  module!: string | null;
}
```

`backend-nest/src/modules/tiers/entities/tier-feature.entity.ts`:

```typescript
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../../../common/entities/base.entity';
import { Feature } from './feature.entity';
import { Tier } from './tier.entity';

@Entity('tier_features')
export class TierFeature extends BaseModel {
  @Column({ type: 'uuid' })
  tierId!: string;

  @Column({ type: 'uuid' })
  featureId!: string;

  @Column({ type: 'boolean' })
  enabled!: boolean;

  @Column({ type: 'int', nullable: true })
  limitValue!: number | null;

  @ManyToOne(() => Tier, (t) => t.tierFeatures)
  @JoinColumn({ name: 'tier_id' })
  tier!: Tier;

  @ManyToOne(() => Feature)
  @JoinColumn({ name: 'feature_id' })
  feature!: Feature;
}
```

`backend-nest/src/modules/tiers/tiers.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Feature } from './entities/feature.entity';
import { Tier } from './entities/tier.entity';
import { TierFeature } from './entities/tier-feature.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Tier, Feature, TierFeature])],
  exports: [TypeOrmModule],
})
export class TiersModule {}
```

- [x] **Step 4: User entities**

`backend-nest/src/modules/users/entities/user.entity.ts`:

```typescript
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../../../common/entities/base.entity';
import { Tier } from '../../tiers/entities/tier.entity';

/** Stored as varchar(20) — SQLAlchemy uses native_enum=False. */
export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
}

@Entity('users')
export class User extends BaseModel {
  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  avatarUrl!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  googleId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  appleId!: string | null;

  @Column({ type: 'varchar', length: 20 })
  role!: UserRole;

  @Column({ type: 'uuid', nullable: true })
  tierId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  stripeCustomerId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  stripeSubscriptionId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  paypalSubscriptionId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  paddleSubscriptionId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  paddleCustomerId!: string | null;

  @Column({ type: 'boolean' })
  isDemo!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  demoExpiresAt!: Date | null;

  @ManyToOne(() => Tier, { nullable: true })
  @JoinColumn({ name: 'tier_id' })
  tier!: Tier | null;

  isAdmin(): boolean {
    return this.role === UserRole.ADMIN;
  }
}
```

`backend-nest/src/modules/users/entities/user-preferences.entity.ts`:

```typescript
import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { BaseModel } from '../../../common/entities/base.entity';
import { User } from './user.entity';

@Entity('user_preferences')
export class UserPreferences extends BaseModel {
  @Column({ type: 'uuid', unique: true })
  userId!: string;

  @Column({ type: 'varchar', length: 20 })
  theme!: string;

  @Column({ type: 'varchar', length: 20 })
  accentColor!: string;

  @Column({ type: 'varchar', length: 20 })
  fontSize!: string;

  @Column({ type: 'varchar', length: 20 })
  defaultContentView!: string;

  @Column({ type: 'varchar', length: 20 })
  defaultStatsView!: string;

  @Column({ type: 'varchar', length: 10 })
  language!: string;

  @Column({ type: 'varchar', length: 2, nullable: true })
  country!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  occupation!: string | null;

  @Column({ type: 'varchar', length: 50 })
  timezone!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'varchar', length: 3, nullable: true })
  displayCurrency!: string | null;

  @Column({ type: 'varchar', length: 20 })
  dateFormat!: string;

  @Column({ type: 'json', nullable: true })
  emailNotifications!: Record<string, boolean> | null;

  @Column({ type: 'json', nullable: true })
  pushNotifications!: Record<string, boolean> | null;

  @Column({ type: 'json', nullable: true })
  analyticsOptOut!: Record<string, boolean> | null;

  @Column({ type: 'varchar', length: 20 })
  dataVisibility!: string;

  @Column({ type: 'json', nullable: true })
  dashboardLayout!: Record<string, unknown> | null;

  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
```

`backend-nest/src/modules/users/users.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserPreferences } from './entities/user-preferences.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserPreferences])],
  exports: [TypeOrmModule],
})
export class UsersModule {}
```

- [x] **Step 5: Database module and wiring**

`backend-nest/src/database/database.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { EnvironmentVariables } from '../config/env.validation';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        type: 'postgres' as const,
        url: config.get('DATABASE_URL', { infer: true }),
        autoLoadEntities: true,
        synchronize: false, // Alembic owns the schema — NEVER flip this
        namingStrategy: new SnakeNamingStrategy(),
        logging: config.get('DEBUG', { infer: true }) ? ['query', 'error'] : ['error'],
      }),
    }),
  ],
})
export class DatabaseModule {}
```

In `app.module.ts`, add `DatabaseModule`, `TiersModule`, `UsersModule` to `imports`.

- [x] **Step 6: Write the mapping smoke test (e2e)**

`backend-nest/test/entities.e2e-spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Tier } from '../src/modules/tiers/entities/tier.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { UserPreferences } from '../src/modules/users/entities/user-preferences.entity';

describe('Entity mappings against the live dev DB', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  // A find() selects every mapped column — it throws if any column doesn't exist in the DB.
  it('User maps onto users', async () => {
    await expect(
      dataSource.getRepository(User).find({ take: 1, withDeleted: true }),
    ).resolves.toBeDefined();
  });

  it('Tier maps and the wealth tier exists (with features relation)', async () => {
    const wealth = await dataSource.getRepository(Tier).findOne({
      where: { name: 'wealth' },
      relations: { tierFeatures: { feature: true } },
    });
    expect(wealth).not.toBeNull();
    expect(wealth!.displayName.length).toBeGreaterThan(0);
  });

  it('UserPreferences maps onto user_preferences', async () => {
    await expect(
      dataSource.getRepository(UserPreferences).find({ take: 1, withDeleted: true }),
    ).resolves.toBeDefined();
  });
});
```

- [x] **Step 7: Run the e2e test**

Run: `npx jest --config test/jest-e2e.json test/entities.e2e-spec.ts --verbose`
Expected: PASS (3 tests). If a column-mismatch error appears (e.g. `column User.xyz does not exist`), fix the entity — the DB is the source of truth; inspect it with `\d users` via psql.

- [x] **Step 8: Commit**

```bash
git add backend-nest && git commit -m "feat(nest): TypeORM wiring + User/Tier/Feature/UserPreferences entities on shared schema"
```

---

### Task 4: Exception hierarchy + global exception filter

**Files:**
- Create: `backend-nest/src/common/exceptions/app.exception.ts`
- Create: `backend-nest/src/common/filters/global-exception.filter.ts`
- Modify: `backend-nest/src/app.module.ts`
- Test: `backend-nest/src/common/filters/global-exception.filter.spec.ts`

FastAPI emits **two** error shapes; both must be reproduced:
- `WealthVaultException` → `{"error": msg, "details": {...}, "status_code": n}`
- `HTTPException` → `{"detail": msg}` (and 422 validation → `{"detail": [...]}`)

- [x] **Step 1: Write the failing tests**

`backend-nest/src/common/filters/global-exception.filter.spec.ts`:

```typescript
import { ArgumentsHost } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import {
  AppException,
  DetailException,
  NotFoundException,
  TierLimitException,
} from '../exceptions/app.exception';
import { GlobalExceptionFilter } from './global-exception.filter';

function mockHost() {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const host = {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => ({ method: 'GET', url: '/x' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

describe('GlobalExceptionFilter', () => {
  const filter = new GlobalExceptionFilter(false); // debug=false

  it('renders AppException as {error, details, status_code}', () => {
    const { host, res } = mockHost();
    filter.catch(new NotFoundException('Income source not found', { id: '1' }), host);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Income source not found',
      details: { id: '1' },
      status_code: 404,
    });
  });

  it('renders TierLimitException with tier details', () => {
    const { host, res } = mockHost();
    filter.catch(new TierLimitException('Higher tier required', 'starter', 'growth'), host);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Higher tier required',
      details: { current_tier: 'starter', required_tier: 'growth' },
      status_code: 403,
    });
  });

  it('renders DetailException as {detail}', () => {
    const { host, res } = mockHost();
    filter.catch(new DetailException(401, 'Could not validate credentials'), host);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ detail: 'Could not validate credentials' });
  });

  it('renders ThrottlerException like slowapi', () => {
    const { host, res } = mockHost();
    filter.catch(new ThrottlerException(), host);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({ error: 'Rate limit exceeded: 120 per 1 minute' });
  });

  it('renders unknown errors as FastAPI-style 500 (details hidden when not debug)', () => {
    const { host, res } = mockHost();
    filter.catch(new Error('boom'), host);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Internal server error',
      details: {},
      status_code: 500,
    });
  });

  it('includes error message in 500 details when debug', () => {
    const { host, res } = mockHost();
    new GlobalExceptionFilter(true).catch(new Error('boom'), host);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Internal server error',
      details: { message: 'boom' },
      status_code: 500,
    });
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npm i @nestjs/throttler && npx jest src/common/filters --verbose`
Expected: FAIL — modules not found.

- [x] **Step 3: Implement exceptions**

`backend-nest/src/common/exceptions/app.exception.ts`:

```typescript
/** Mirrors backend/app/core/exceptions.py — rendered as {error, details, status_code}. */
export class AppException extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export class NotFoundException extends AppException {
  constructor(message = 'Resource not found', details: Record<string, unknown> = {}) {
    super(message, 404, details);
  }
}

export class UnauthorizedException extends AppException {
  constructor(message = 'Unauthorized', details: Record<string, unknown> = {}) {
    super(message, 401, details);
  }
}

export class ForbiddenException extends AppException {
  constructor(message = 'Forbidden', details: Record<string, unknown> = {}) {
    super(message, 403, details);
  }
}

export class BadRequestException extends AppException {
  constructor(message = 'Bad request', details: Record<string, unknown> = {}) {
    super(message, 400, details);
  }
}

export class ConflictException extends AppException {
  constructor(message = 'Conflict', details: Record<string, unknown> = {}) {
    super(message, 409, details);
  }
}

export class TierLimitException extends AppException {
  constructor(
    message = 'Tier limit exceeded',
    currentTier = '',
    requiredTier = '',
    details: Record<string, unknown> = {},
  ) {
    super(message, 403, { ...details, current_tier: currentTier, required_tier: requiredTier });
  }
}

/** Mirrors FastAPI's HTTPException — rendered as {detail}. */
export class DetailException extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly detail: string | Array<Record<string, unknown>>,
  ) {
    super(typeof detail === 'string' ? detail : 'Validation error');
  }
}
```

- [x] **Step 4: Implement the filter**

`backend-nest/src/common/filters/global-exception.filter.ts`:

```typescript
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Response } from 'express';
import { AppException, DetailException } from '../exceptions/app.exception';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly debug: boolean) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof AppException) {
      this.logger.error(`AppException: ${exception.message}`);
      res.status(exception.statusCode).json({
        error: exception.message,
        details: exception.details,
        status_code: exception.statusCode,
      });
      return;
    }

    if (exception instanceof DetailException) {
      res.status(exception.statusCode).json({ detail: exception.detail });
      return;
    }

    if (exception instanceof ThrottlerException) {
      res.status(429).json({ error: 'Rate limit exceeded: 120 per 1 minute' });
      return;
    }

    // Nest built-ins (404 on unknown route, etc.) → FastAPI HTTPException shape
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const detail =
        typeof body === 'string' ? body : ((body as Record<string, unknown>).message ?? body);
      res.status(exception.getStatus()).json({ detail });
      return;
    }

    this.logger.error('Unhandled exception', exception instanceof Error ? exception.stack : String(exception));
    res.status(500).json({
      error: 'Internal server error',
      details: this.debug && exception instanceof Error ? { message: exception.message } : {},
      status_code: 500,
    });
  }
}
```

Register in `app.module.ts` providers (canonical DI registration):

```typescript
import { APP_FILTER } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
// in providers: [...]
{
  provide: APP_FILTER,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => new GlobalExceptionFilter(config.get('DEBUG') === true),
},
```

- [x] **Step 5: Run tests to verify they pass**

Run: `npx jest src/common/filters --verbose`
Expected: PASS (6 tests)

- [x] **Step 6: Commit**

```bash
git add backend-nest && git commit -m "feat(nest): AppException hierarchy + global filter matching FastAPI error shapes"
```

---

### Task 5: Middleware, interceptor, validation pipe, CORS, swagger, root endpoint

**Files:**
- Create: `backend-nest/src/common/middleware/security-headers.middleware.ts`
- Create: `backend-nest/src/common/interceptors/logging.interceptor.ts`
- Modify: `backend-nest/src/main.ts`, `backend-nest/src/app.module.ts`, `backend-nest/src/app.controller.ts`
- Delete: `backend-nest/src/app.service.ts` (and its spec) — root endpoint doesn't need a service
- Test: `backend-nest/test/app.e2e-spec.ts` (replace CLI-generated)

**Two parity gaps routed here from the Task 4 review — fix both in this task:**

1. **Unknown-route 404 message.** Starlette raises `HTTPException(404)` with no detail, which defaults to
   the status phrase, so FastAPI returns `{"detail":"Not Found"}`. Nest/Express carries its own wording and
   produces `{"detail":"Cannot GET /path"}`. Same shape, different string — Task 10's parity-diff script
   would flag it. Fix at the routing layer, not in the filter (the filter renders correctly given what it
   receives): add a catch-all that throws `DetailException(404, 'Not Found')`. Make sure it is registered
   last so it cannot shadow real routes, and mark it `@Public()` once guards exist in Task 6.

   **As shipped (the catch-all route was abandoned — do not reintroduce it):** a catch-all `@Controller('*')`
   cannot be made to lose reliably to the feature modules. Registration order across modules is not a
   guarantee you can lean on, and the wildcard swallowed real routes (`/api/v1/auth/*` among them) as soon as
   Task 7 landed. The fix moved into `GlobalExceptionFilter`: any `HttpException` that reaches the built-in
   branch carrying status 404 has its detail overwritten with `'Not Found'`. That is safe *only* because
   intentional 404s in this codebase never reach that branch — they are thrown as the app's own
   `NotFoundException`/`DetailException`, which are handled earlier — and that invariant is enforced by an
   eslint `no-restricted-imports` rule banning `NotFoundException` (and its four siblings) from
   `@nestjs/common`, added in Task 4. Residual gap, documented on the filter: a raw
   `new HttpException(msg, 404)` would also be overwritten. Throw `DetailException(404, msg)` instead.
2. **Malformed JSON bodies.** Express's body-parser throws a raw `SyntaxError` before Nest routing; it is
   not an `HttpException`, so it lands in the catch-all 500 branch, while FastAPI returns 422. Handle it so
   the response is a 422 `{"detail": [...]}` matching FastAPI's validation-error shape.

   **As shipped:** an error handler has to sit *after* the body parser in Express's middleware stack, but
   Nest only mounts its own parser inside `app.init()` — i.e. after `configureApp()` runs — so anything
   `app.use()`d here would land ahead of it and never see the error. So `configureApp()` mounts `json()` and
   `urlencoded()` itself, followed by the handler, and both entry points opt out of Nest's parser
   (`NestFactory.create(AppModule, { bodyParser: false })` in `main.ts`, the same option on
   `createNestApplication()` in the e2e suites). Consequence worth knowing before webhooks arrive: with
   manual parsers in place, `{ rawBody: true }` would stay silently empty — a future Stripe/Paddle webhook
   must mount its own `express.raw()` on that path ahead of these. Full reasoning is in the comment on
   `app.setup.ts`.

- [x] **Step 1: Write the failing e2e test**

`backend-nest/test/app.e2e-spec.ts` (replace existing):

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

describe('App bootstrap (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET / returns the FastAPI root shape', async () => {
    const res = await request(app.getHttpServer()).get('/').expect(200);
    expect(res.body).toEqual({
      message: 'Wealth Vault API',
      version: '0.1.0',
      docs: '/docs',
    });
  });

  it('sets the security headers', async () => {
    const res = await request(app.getHttpServer()).get('/');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-xss-protection']).toBe('1; mode=block');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');
  });

  it('unknown route renders {detail} shape', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/nope').expect(404);
    expect(res.body).toHaveProperty('detail');
  });
});
```

Note the import of `configureApp` from `../src/app.setup` — global pipe/prefix/CORS live there so e2e tests and `main.ts` share identical bootstrap (a Nest testing gotcha: `main.ts` is NOT executed by `Test.createTestingModule`).

- [x] **Step 2: Run test to verify it fails**

Run: `npm i -D supertest @types/supertest && npx jest --config test/jest-e2e.json test/app.e2e-spec.ts`
Expected: FAIL — `app.setup` not found.

- [x] **Step 3: Implement middleware + interceptor**

`backend-nest/src/common/middleware/security-headers.middleware.ts`:

```typescript
import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NextFunction, Request, Response } from 'express';

/** Mirrors SecurityHeadersMiddleware in backend/app/main.py. */
@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  constructor(private readonly config: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (this.config.get('DEBUG') !== true) {
      res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    }
    next();
  }
}
```

`backend-nest/src/common/interceptors/logging.interceptor.ts`:

```typescript
import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = Date.now();
    const req = context.switchToHttp().getRequest<Request>();
    return next.handle().pipe(
      tap(() => {
        const res = context.switchToHttp().getResponse<Response>();
        this.logger.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - start}ms`);
      }),
    );
  }
}
```

- [x] **Step 4: Shared bootstrap (`app.setup.ts`), root controller, wiring**

`backend-nest/src/app.setup.ts`:

```typescript
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DetailException } from './common/exceptions/app.exception';
import { parseCorsOrigins } from './config/env.validation';

/** Applied identically in main.ts and e2e tests. */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api/v1', { exclude: ['/', 'health'] });

  app.enableCors({
    origin: parseCorsOrigins(config.get('CORS_ORIGINS') ?? '[]'),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept', 'Accept-Language'],
  });

  // FastAPI returns 422 for body validation errors; mimic the {detail: [...]} shape.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors) =>
        new DetailException(
          422,
          errors.map((e) => ({
            loc: ['body', e.property],
            msg: Object.values(e.constraints ?? { error: 'Invalid value' })[0],
            type: 'value_error',
          })),
        ),
    }),
  );
}
```

`backend-nest/src/app.controller.ts` (replace):

```typescript
import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller()
export class AppController {
  constructor(private readonly config: ConfigService) {}

  @Get('/')
  root(): Record<string, string> {
    return {
      message: 'Wealth Vault API',
      version: this.config.get('APP_VERSION') ?? '0.1.0',
      docs: '/docs',
    };
  }
}
```

Delete `src/app.service.ts` and `src/app.controller.spec.ts` (replaced by e2e coverage); remove `AppService` from `app.module.ts`.

In `app.module.ts`: apply middleware and global interceptor:

```typescript
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { SecurityHeadersMiddleware } from './common/middleware/security-headers.middleware';
// ... existing imports

@Module({
  imports: [/* unchanged */],
  controllers: [AppController],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    /* APP_FILTER from Task 4 stays */
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SecurityHeadersMiddleware).forRoutes('*');
  }
}
```

`backend-nest/src/main.ts` (final form):

```typescript
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  configureApp(app);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Wealth Vault API')
    .setDescription('Ultimate personal finance management platform API (NestJS v2)')
    .setVersion(config.get('APP_VERSION') ?? '0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  await app.listen(config.get<number>('PORT') ?? 8001);
}
bootstrap();
```

**As shipped**, `main.ts` picked up two more lines:
- `NestFactory.create(AppModule, { bodyParser: false })` — required by the malformed-JSON fix above.
- `app.enableShutdownHooks()` before `listen()`. Without it, `RedisModule.onApplicationShutdown` and
  TypeORM's own shutdown hook only run when something calls `app.close()` explicitly (which the e2e
  suites do, which is why tests never caught it) — a real SIGTERM would leave connections dangling.

Install: `npm i @nestjs/swagger`

- [x] **Step 5: Run tests to verify they pass**

Run: `npx jest --config test/jest-e2e.json test/app.e2e-spec.ts --verbose`
Expected: PASS (3 tests). Also boot `npm run start:dev` and open `http://localhost:8001/docs` — swagger UI renders. Stop it.

- [x] **Step 6: Commit**

```bash
git add backend-nest && git commit -m "feat(nest): security headers middleware, logging interceptor, validation pipe, CORS, swagger"
```

---

### Task 6: JWT strategy, guards, and decorators

**Files:**
- Create: `backend-nest/src/modules/users/users.service.ts` (modify `users.module.ts` to provide/export it)
- Create: `backend-nest/src/modules/auth/jwt.strategy.ts`, `backend-nest/src/modules/auth/auth.module.ts`
- Create: `backend-nest/src/common/decorators/public.decorator.ts`, `current-user.decorator.ts`, `roles.decorator.ts`, `require-feature.decorator.ts`, `forbid-demo.decorator.ts`
- Create: `backend-nest/src/common/guards/jwt-auth.guard.ts`, `roles.guard.ts`, `feature.guard.ts`, `demo.guard.ts`
- Modify: `backend-nest/src/app.module.ts`
- Test: `backend-nest/src/common/guards/guards.spec.ts`

Exact FastAPI behaviors to mirror (from `permissions.py`): missing/malformed header → 401 `{"detail": "Invalid authorization header format. Expected: Bearer <token>"}`; bad token → 401 `{"detail": "Could not validate credentials"}`; unknown user → 401 `{"detail": "User not found"}`; non-admin on admin route → 403 `{"error": "Admin access required", ...}` (AppException shape); demo user on forbidden route → 403 `{"detail": "Demo accounts cannot make real purchases."}`; missing feature → 403 TierLimit shape with `required_tier: "growth"`.

- [x] **Step 1: Install**

```bash
npm i @nestjs/jwt @nestjs/passport passport passport-jwt && npm i -D @types/passport-jwt
```

- [x] **Step 2: Write the failing guard tests**

`backend-nest/src/common/guards/guards.spec.ts`:

```typescript
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../modules/users/entities/user.entity';
import { RolesGuard } from './roles.guard';
import { DemoGuard } from './demo.guard';

function ctxWithUser(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('passes when no @Roles metadata', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    expect(new RolesGuard(reflector).canActivate(ctxWithUser({ role: 'USER' }))).toBe(true);
  });

  it('passes an ADMIN when ADMIN required', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue([UserRole.ADMIN]) } as unknown as Reflector;
    expect(new RolesGuard(reflector).canActivate(ctxWithUser({ role: 'ADMIN' }))).toBe(true);
  });

  it('rejects a USER when ADMIN required with the FastAPI message', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue([UserRole.ADMIN]) } as unknown as Reflector;
    expect(() => new RolesGuard(reflector).canActivate(ctxWithUser({ role: 'USER' }))).toThrow(
      'Admin access required',
    );
  });
});

describe('DemoGuard', () => {
  it('passes non-demo users on @ForbidDemo routes', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) } as unknown as Reflector;
    expect(new DemoGuard(reflector).canActivate(ctxWithUser({ isDemo: false }))).toBe(true);
  });

  it('rejects demo users on @ForbidDemo routes', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) } as unknown as Reflector;
    expect(() => new DemoGuard(reflector).canActivate(ctxWithUser({ isDemo: true }))).toThrow(
      'Demo accounts cannot make real purchases.',
    );
  });
});
```

- [x] **Step 3: Run tests to verify they fail**

Run: `npx jest src/common/guards --verbose`
Expected: FAIL — modules not found.

- [x] **Step 4: Implement decorators**

`backend-nest/src/common/decorators/public.decorator.ts`:

```typescript
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

`backend-nest/src/common/decorators/current-user.decorator.ts`:

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '../../modules/users/entities/user.entity';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => ctx.switchToHttp().getRequest().user,
);
```

`backend-nest/src/common/decorators/roles.decorator.ts`:

```typescript
import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../modules/users/entities/user.entity';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
```

`backend-nest/src/common/decorators/require-feature.decorator.ts`:

```typescript
import { SetMetadata } from '@nestjs/common';

export const FEATURE_KEY = 'requiredFeature';
export const RequireFeature = (featureKey: string) => SetMetadata(FEATURE_KEY, featureKey);
```

`backend-nest/src/common/decorators/forbid-demo.decorator.ts`:

```typescript
import { SetMetadata } from '@nestjs/common';

export const FORBID_DEMO_KEY = 'forbidDemo';
export const ForbidDemo = () => SetMetadata(FORBID_DEMO_KEY, true);
```

- [x] **Step 5: Implement UsersService**

`backend-nest/src/modules/users/users.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly usersRepo: Repository<User>) {}

  // withDeleted: true mirrors FastAPI's get_current_user, which does not filter deleted_at.
  // Without it @DeleteDateColumn would auto-append `deleted_at IS NULL` and 401 a soft-deleted
  // user that FastAPI still authenticates. See the soft-delete parity rule at the top of this plan.
  findByIdWithTier(id: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { id }, relations: { tier: true }, withDeleted: true });
  }

  findByGoogleId(googleId: string): Promise<User | null> {
    return this.usersRepo.findOne({
      where: { googleId },
      relations: { tier: true },
      withDeleted: true,
    });
  }

  // The user row uses withDeleted for the same reason; the tier_features/features relations keep
  // TypeORM's automatic filtering because FastAPI filters those explicitly.
  findByIdWithFeatures(id: string): Promise<User | null> {
    return this.usersRepo.findOne({
      where: { id },
      relations: { tier: { tierFeatures: { feature: true } } },
      withDeleted: true,
    });
  }

  // Takes the Tier entity, not a tierId string. TypeORM merges the scalar @Column and the
  // @JoinColumn into one column and the relation always wins over the scalar when both are
  // set, so the relation is the only reliable write path (see the FK write-path rule at the
  // top of this plan — no entity-level flag fixes this; it is enforced by convention).
  async createFromGoogle(input: {
    email: string;
    name: string | null;
    avatarUrl: string | null;
    googleId: string;
    tier: Tier;
  }): Promise<User> {
    const user = this.usersRepo.create({
      ...input,
      role: UserRole.USER,
      isDemo: false,
    });
    return this.usersRepo.save(user);
  }
}
```

Add `UsersService` to `users.module.ts` `providers` and `exports` (keep the `TypeOrmModule` export).

- [x] **Step 6: Implement JWT strategy and guards**

`backend-nest/src/modules/auth/jwt.strategy.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { DetailException } from '../../common/exceptions/app.exception';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tier: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('SECRET_KEY')!,
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    const user = await this.usersService.findByIdWithTier(payload.sub);
    if (!user) throw new DetailException(401, 'User not found');
    return user; // attached as request.user
  }
}
```

`backend-nest/src/common/guards/jwt-auth.guard.ts`:

```typescript
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { DetailException } from '../exceptions/app.exception';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest<TUser>(err: unknown, user: TUser, info: unknown): TUser {
    if (err) throw err; // e.g. DetailException from strategy.validate
    if (!user) {
      const message = info instanceof Error ? info.message : '';
      if (message === 'No auth token') {
        throw new DetailException(401, 'Invalid authorization header format. Expected: Bearer <token>');
      }
      throw new DetailException(401, 'Could not validate credentials');
    }
    return user;
  }
}
```

`backend-nest/src/common/guards/roles.guard.ts`:

```typescript
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { User, UserRole } from '../../modules/users/entities/user.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ForbiddenException } from '../exceptions/app.exception';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user: User = context.switchToHttp().getRequest().user;
    if (!required.includes(user.role)) {
      throw new ForbiddenException(
        required.includes(UserRole.ADMIN)
          ? 'Admin access required'
          : `This action requires ${required[0]} role`,
      );
    }
    return true;
  }
}
```

`backend-nest/src/common/guards/demo.guard.ts`:

```typescript
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { User } from '../../modules/users/entities/user.entity';
import { FORBID_DEMO_KEY } from '../decorators/forbid-demo.decorator';
import { DetailException } from '../exceptions/app.exception';

@Injectable()
export class DemoGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const forbidden = this.reflector.getAllAndOverride<boolean>(FORBID_DEMO_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!forbidden) return true;

    const user: User = context.switchToHttp().getRequest().user;
    if (user?.isDemo) {
      throw new DetailException(403, 'Demo accounts cannot make real purchases.');
    }
    return true;
  }
}
```

`backend-nest/src/common/guards/feature.guard.ts`:

```typescript
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { TierFeature } from '../../modules/tiers/entities/tier-feature.entity';
import { User } from '../../modules/users/entities/user.entity';
import { FEATURE_KEY } from '../decorators/require-feature.decorator';
import { TierLimitException } from '../exceptions/app.exception';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const featureKey = this.reflector.getAllAndOverride<string | undefined>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!featureKey) return true;

    const user: User = context.switchToHttp().getRequest().user;
    if (user.isAdmin()) return true;

    const tierFeature = user.tierId
      ? await this.dataSource.getRepository(TierFeature).findOne({
          where: { tierId: user.tierId, enabled: true, feature: { key: featureKey } },
          relations: { feature: true },
        })
      : null;

    if (!tierFeature) {
      throw new TierLimitException(
        'This feature requires a higher tier subscription',
        user.tier?.name ?? 'none',
        'growth',
      );
    }
    return true;
  }
}
```

**As shipped**, two corrections to the three guard snippets above:
- `RolesGuard` and `FeatureGuard` read `request.user` as optional and throw
  `DetailException(401, 'Could not validate credentials')` when it is absent, instead of dereferencing it.
  It can only be absent if a route pairs `@Public()` with `@Roles()`/`@RequireFeature()` — a
  decorator conflict, not a real request — but a crash there would surface as a 500 rather than the 401
  the situation actually means.
- `FeatureGuard`'s `tier_features` lookup keeps TypeORM's automatic soft-delete filtering, which makes it
  stricter than FastAPI. That is deliberate — see deviation 5 at the top of this plan.

- [x] **Step 7: Auth module + global guard registration**

`backend-nest/src/modules/auth/auth.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('SECRET_KEY'),
        signOptions: {
          algorithm: 'HS256',
          expiresIn: `${config.get<number>('ACCESS_TOKEN_EXPIRE_MINUTES') ?? 30}m`,
        },
      }),
    }),
  ],
  providers: [JwtStrategy],
  exports: [JwtModule],
})
export class AuthModule {}
```

In `app.module.ts`, import `AuthModule` and register global guards **in this order** (order matters — auth must run before the guards that read `request.user`):

```typescript
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { FeatureGuard } from './common/guards/feature.guard';
import { DemoGuard } from './common/guards/demo.guard';
// in providers, after the interceptor/filter entries:
{ provide: APP_GUARD, useClass: JwtAuthGuard },
{ provide: APP_GUARD, useClass: RolesGuard },
{ provide: APP_GUARD, useClass: FeatureGuard },
{ provide: APP_GUARD, useClass: DemoGuard },
```

Mark `AppController.root` with `@Public()` so `GET /` stays open (add the decorator import).

- [x] **Step 8: Run tests to verify they pass**

Run: `npx jest src/common/guards --verbose` → Expected: PASS (5 tests).
Then re-run Task 5's e2e (root must still work because of `@Public`): `npx jest --config test/jest-e2e.json test/app.e2e-spec.ts` → Expected: PASS.

- [x] **Step 9: Commit**

```bash
git add backend-nest && git commit -m "feat(nest): passport-jwt strategy + global auth/roles/feature/demo guards"
```

---

### Task 7: Auth endpoints (/auth/google, /auth/me, /auth/me/features)

**Files:**
- Create: `backend-nest/src/modules/auth/google-oauth.service.ts`, `auth.service.ts`, `auth.controller.ts`, `dto/google-auth.dto.ts`, `mappers/user-response.mapper.ts`
- Modify: `backend-nest/src/modules/auth/auth.module.ts`
- Test: `backend-nest/src/modules/auth/auth.service.spec.ts`, `backend-nest/test/auth.e2e-spec.ts`

- [x] **Step 1: Write the failing unit test for AuthService**

`backend-nest/src/modules/auth/auth.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Tier } from '../tiers/entities/tier.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { GoogleOAuthService } from './google-oauth.service';

const googleInfo = { email: 'new@x.com', name: 'New', picture: null, sub: 'g-123' };

function makeUser(overrides: Partial<User> = {}): User {
  return Object.assign(new User(), {
    id: 'u-1',
    email: 'new@x.com',
    name: 'New',
    avatarUrl: null,
    role: UserRole.USER,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    tier: { id: 't-1', name: 'wealth', displayName: 'Wealth' },
    ...overrides,
  });
}

describe('AuthService.googleLogin', () => {
  let service: AuthService;
  const usersService = {
    findByGoogleId: jest.fn(),
    createFromGoogle: jest.fn(),
    findByIdWithTier: jest.fn(),
  };
  const tiersRepo = { findOne: jest.fn() };
  const googleService = { verifyIdToken: jest.fn().mockResolvedValue(googleInfo) };
  const jwtService = { sign: jest.fn().mockReturnValue('signed.jwt') };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: GoogleOAuthService, useValue: googleService },
        { provide: JwtService, useValue: jwtService },
        { provide: getRepositoryToken(Tier), useValue: tiersRepo },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('returns token + snake_case user for an existing user', async () => {
    const user = makeUser();
    usersService.findByGoogleId.mockResolvedValue(user);
    usersService.findByIdWithTier.mockResolvedValue(user);

    const result = await service.googleLogin('google-token');

    expect(result.access_token).toBe('signed.jwt');
    expect(result.token_type).toBe('bearer');
    expect(result.user).toEqual({
      id: 'u-1',
      email: 'new@x.com',
      name: 'New',
      role: 'USER',
      avatar_url: null,
      tier: { id: 't-1', name: 'wealth', display_name: 'Wealth' },
      created_at: '2026-01-01T00:00:00.000Z',
    });
    expect(jwtService.sign).toHaveBeenCalledWith({
      sub: 'u-1',
      email: 'new@x.com',
      role: 'USER',
      tier: 'wealth',
    });
  });

  it('creates a new user on the wealth tier when none exists', async () => {
    const user = makeUser();
    usersService.findByGoogleId.mockResolvedValue(null);
    tiersRepo.findOne.mockResolvedValue({ id: 't-1', name: 'wealth', displayName: 'Wealth' });
    usersService.createFromGoogle.mockResolvedValue(user);
    usersService.findByIdWithTier.mockResolvedValue(user);

    await service.googleLogin('google-token');

    expect(usersService.createFromGoogle).toHaveBeenCalledWith({
      email: 'new@x.com',
      name: 'New',
      avatarUrl: null,
      googleId: 'g-123',
      tier: { id: 't-1', name: 'wealth', displayName: 'Wealth' },
    });
  });

  it('throws 500 detail when the wealth tier is missing', async () => {
    usersService.findByGoogleId.mockResolvedValue(null);
    tiersRepo.findOne.mockResolvedValue(null);
    await expect(service.googleLogin('google-token')).rejects.toThrow(
      'Wealth tier not found. Please run database migrations.',
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest src/modules/auth --verbose`
Expected: FAIL — modules not found.

- [x] **Step 3: Implement mapper, DTO, services, controller**

`backend-nest/src/modules/auth/mappers/user-response.mapper.ts`:

```typescript
import { User } from '../../users/entities/user.entity';

/** Mirrors backend/app/schemas/user.py::UserResponse — snake_case JSON keys. */
export interface UserResponse {
  id: string;
  email: string;
  name: string | null;
  role: string;
  avatar_url: string | null;
  tier: { id: string; name: string; display_name: string } | null;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'bearer';
  user: UserResponse;
}

export function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatar_url: user.avatarUrl,
    tier: user.tier
      ? { id: user.tier.id, name: user.tier.name, display_name: user.tier.displayName }
      : null,
    created_at: user.createdAt.toISOString(),
  };
}
```

`backend-nest/src/modules/auth/dto/google-auth.dto.ts`:

```typescript
import { IsString, MinLength } from 'class-validator';

export class GoogleAuthDto {
  @IsString()
  @MinLength(1)
  token!: string;
}
```

`backend-nest/src/modules/auth/google-oauth.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DetailException } from '../../common/exceptions/app.exception';

export interface OAuthUserInfo {
  email: string;
  name: string | null;
  picture: string | null;
  sub: string;
}

/** Mirrors verify_google_token in backend/app/api/v1/auth.py. */
@Injectable()
export class GoogleOAuthService {
  constructor(private readonly config: ConfigService) {}

  async verifyIdToken(token: string): Promise<OAuthUserInfo> {
    let response: Response;
    try {
      response = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`,
      );
    } catch (err) {
      throw new DetailException(503, `Failed to verify token: ${(err as Error).message}`);
    }

    if (!response.ok) throw new DetailException(401, 'Invalid Google token');

    const data = (await response.json()) as Record<string, string>;
    if (data.aud !== this.config.get<string>('GOOGLE_CLIENT_ID')) {
      throw new DetailException(401, 'Token not issued for this application');
    }

    return {
      email: data.email,
      name: data.name ?? null,
      picture: data.picture ?? null,
      sub: data.sub,
    };
  }
}
```

`backend-nest/src/modules/auth/auth.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DetailException } from '../../common/exceptions/app.exception';
import { Tier } from '../tiers/entities/tier.entity';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { GoogleOAuthService } from './google-oauth.service';
import { TokenResponse, toUserResponse } from './mappers/user-response.mapper';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly googleOAuthService: GoogleOAuthService,
    private readonly jwtService: JwtService,
    @InjectRepository(Tier) private readonly tiersRepo: Repository<Tier>,
  ) {}

  async googleLogin(googleToken: string): Promise<TokenResponse> {
    const info = await this.googleOAuthService.verifyIdToken(googleToken);

    let user = await this.usersService.findByGoogleId(info.sub);
    if (!user) {
      const wealthTier = await this.tiersRepo.findOne({ where: { name: 'wealth' } });
      if (!wealthTier) {
        throw new DetailException(500, 'Wealth tier not found. Please run database migrations.');
      }
      // Deviation from FastAPI: trial-subscription creation is skipped (billing deferred).
      const created = await this.usersService.createFromGoogle({
        email: info.email,
        name: info.name,
        avatarUrl: info.picture,
        googleId: info.sub,
        tier: wealthTier,
      });
      user = (await this.usersService.findByIdWithTier(created.id))!;
    }

    return this.buildTokenResponse(user);
  }

  buildTokenResponse(user: User): TokenResponse {
    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      tier: user.tier?.name ?? null,
    });
    return { access_token: accessToken, token_type: 'bearer', user: toUserResponse(user) };
  }

  /** Mirrors GET /auth/me/features. */
  async getFeatures(userId: string): Promise<{ features: Record<string, unknown> }> {
    const user = await this.usersService.findByIdWithFeatures(userId);
    if (!user?.tier) return { features: {} };

    const features: Record<string, unknown> = {};
    for (const tf of user.tier.tierFeatures) {
      if (tf.feature && tf.enabled && !tf.deletedAt && !tf.feature.deletedAt) {
        features[tf.feature.key] = {
          enabled: true,
          limit: tf.limitValue,
          name: tf.feature.name,
          module: tf.feature.module,
        };
      }
    }
    return { features };
  }
}
```

`backend-nest/src/modules/auth/auth.controller.ts`:

```typescript
import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { User } from '../users/entities/user.entity';
import { AuthService } from './auth.service';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { TokenResponse, toUserResponse, UserResponse } from './mappers/user-response.mapper';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('google')
  googleAuth(@Body() dto: GoogleAuthDto): Promise<TokenResponse> {
    return this.authService.googleLogin(dto.token);
  }

  @Get('me')
  me(@CurrentUser() user: User): UserResponse {
    return toUserResponse(user);
  }

  @Get('me/features')
  meFeatures(@CurrentUser() user: User): Promise<{ features: Record<string, unknown> }> {
    return this.authService.getFeatures(user.id);
  }
}
```

Update `auth.module.ts`: add `TiersModule` to imports, `AuthController` to `controllers`, and `AuthService`, `GoogleOAuthService` to `providers`.

- [x] **Step 4: Run unit tests to verify they pass**

Run: `npx jest src/modules/auth --verbose`
Expected: PASS (3 tests)

- [x] **Step 5: Write the auth e2e test**

`backend-nest/test/auth.e2e-spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { GoogleOAuthService } from '../src/modules/auth/google-oauth.service';

describe('Auth (e2e, against live dev DB)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const email = `nest-e2e-${randomUUID().slice(0, 8)}@example.com`;
  const googleSub = `nest-e2e-sub-${randomUUID()}`;
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleOAuthService)
      .useValue({
        verifyIdToken: jest
          .fn()
          .mockResolvedValue({ email, name: 'E2E User', picture: null, sub: googleSub }),
      })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM users WHERE email = $1', [email]);
    await app.close();
  });

  it('POST /api/v1/auth/google creates a user and returns TokenResponse', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/google')
      .send({ token: 'mocked' })
      .expect(201);
    expect(res.body.token_type).toBe('bearer');
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.tier.name).toBe('wealth');
    expect(res.body.user).toHaveProperty('avatar_url');
    expect(res.body.user).toHaveProperty('created_at');
    token = res.body.access_token;
  });

  it('GET /api/v1/auth/me returns the user with a valid token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.email).toBe(email);
    expect(res.body.role).toBe('USER');
  });

  it('GET /api/v1/auth/me without a header → FastAPI 401 shape', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    expect(res.body).toEqual({
      detail: 'Invalid authorization header format. Expected: Bearer <token>',
    });
  });

  it('GET /api/v1/auth/me with a garbage token → 401 credentials message', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);
    expect(res.body).toEqual({ detail: 'Could not validate credentials' });
  });

  it('POST /api/v1/auth/google with missing token → 422 validation shape', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/auth/google').send({}).expect(422);
    expect(Array.isArray(res.body.detail)).toBe(true);
    expect(res.body.detail[0]).toHaveProperty('loc');
    expect(res.body.detail[0]).toHaveProperty('msg');
  });

  it('GET /api/v1/auth/me/features returns the features map', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me/features')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toHaveProperty('features');
  });
});
```

Note: FastAPI returns 200 for POST endpoints unless specified; Nest defaults POST to 201. The frontend treats 2xx alike, so 201 is accepted here — if parity diffing later flags it, add `@HttpCode(200)`.

- [x] **Step 6: Run the e2e test**

Run: `npx jest --config test/jest-e2e.json test/auth.e2e-spec.ts --verbose`
Expected: PASS (6 tests). Requires dev DB with seeded `wealth` tier.

- [x] **Step 7: Cross-backend token check (manual, the whole point of shared JWTs)**

With FastAPI running on :8000 and Nest on :8001 (`npm run start:dev`):

```bash
cd /Users/bohdanburukhin/Projects/personal/wealth-vault/backend
# Prints a 30-day JWT for the seeded demo user, signed with SECRET_KEY (see the script's docstring)
TOKEN=$(.venv/bin/python -m app.scripts.make_demo_token)
curl -s localhost:8000/api/v1/auth/me -H "Authorization: Bearer $TOKEN" | head -c 300; echo
curl -s localhost:8001/api/v1/auth/me -H "Authorization: Bearer $TOKEN" | head -c 300; echo
```

Expected: both backends accept the same token and return the same user JSON. (Requires the
seeded demo user from `app/scripts/seed_demo_data.py` to exist in the dev DB; if it doesn't,
use a token from the auth e2e run instead.)

- [x] **Step 8: Commit**

```bash
git add backend-nest && git commit -m "feat(nest): auth endpoints — google login, me, me/features with FastAPI-parity shapes"
```

---

### Task 8: Rate limiting (@nestjs/throttler)

**Files:**
- Modify: `backend-nest/src/app.module.ts`
- Test: `backend-nest/test/throttling.e2e-spec.ts`

FastAPI uses slowapi with in-memory storage, default `120/minute` per client IP. Mirror that (in-memory is fine — parity, and Redis-backed throttling arrives with BullMQ later if needed).

**Correction found after this task shipped:** FastAPI *configures* `default_limits=["120/minute"]` but
`main.py` never registers `SlowAPIMiddleware`, so it enforces no global limit at all — only the explicit
`@limiter.limit("5/hour")` on `/auth/demo`. Nest's `ThrottlerGuard` really does enforce 120/min on every
route, so this is a deliberate divergence rather than parity (deviation 6 above), kept because it is what
the FastAPI config intends. Revisit if a Phase 1+ client starts seeing 429s that never occur on :8000.

- [x] **Step 1: Write the failing e2e test**

`backend-nest/test/throttling.e2e-spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

describe('Throttling (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 429 with the slowapi-style body after 120 requests/minute', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 120; i++) {
      await request(server).get('/').expect(200);
    }
    const res = await request(server).get('/').expect(429);
    expect(res.body).toEqual({ error: 'Rate limit exceeded: 120 per 1 minute' });
  }, 30000);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest --config test/jest-e2e.json test/throttling.e2e-spec.ts --verbose`
Expected: FAIL — the 121st request returns 200 (no throttler yet).

- [x] **Step 3: Implement**

In `app.module.ts` imports add (package was installed in Task 4):

```typescript
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
// imports:
ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
```

And register the guard FIRST in the `APP_GUARD` list (before `JwtAuthGuard`), so rate limiting applies to unauthenticated requests too:

```typescript
{ provide: APP_GUARD, useClass: ThrottlerGuard },
{ provide: APP_GUARD, useClass: JwtAuthGuard },
// ...RolesGuard, FeatureGuard, DemoGuard unchanged
```

The 429 body shape is already handled by `GlobalExceptionFilter` (Task 4).

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest --config test/jest-e2e.json test/throttling.e2e-spec.ts --verbose`
Expected: PASS. Then re-run auth e2e to confirm it doesn't trip the limit: `npx jest --config test/jest-e2e.json test/auth.e2e-spec.ts` → PASS.

- [x] **Step 5: Commit**

```bash
git add backend-nest && git commit -m "feat(nest): global rate limiting matching slowapi defaults"
```

---

### Task 9: Redis provider + health endpoint

**Files:**
- Create: `backend-nest/src/redis/redis.module.ts`
- Create: `backend-nest/src/health/health.controller.ts`
- Modify: `backend-nest/src/app.module.ts`
- Test: `backend-nest/test/health.e2e-spec.ts`

- [x] **Step 1: Write the failing e2e test**

`backend-nest/test/health.e2e-spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns the FastAPI health shape with ok checks', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.version).toBe('0.1.0');
    expect(res.body.checks).toEqual({ database: 'ok', redis: 'ok' });
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm i ioredis && npx jest --config test/jest-e2e.json test/health.e2e-spec.ts`
Expected: FAIL — 404 on /health.

- [x] **Step 3: Implement the Redis custom provider**

`backend-nest/src/redis/redis.module.ts`:

```typescript
import { Global, Module, OnApplicationShutdown, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

/** Custom provider with an injection token — the Nest-idiomatic way to wrap a raw client. */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis(config.get<string>('REDIS_URL')!, { lazyConnect: false, maxRetriesPerRequest: 1 }),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}
```

**As shipped:** `quit()` is wrapped in a try/catch that swallows the failure. It rejects when the
connection never opened or was already closed by a prior shutdown, and the e2e suites call
`app.close()` repeatedly across files sharing one process — unswallowed, that blows up teardown.
The `REDIS_URL` lookup also carries a `?? 'redis://localhost:6379/0'` fallback rather than `!`.

- [x] **Step 4: Implement the health controller**

`backend-nest/src/health/health.controller.ts`:

```typescript
import { Controller, Get, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { Public } from '../common/decorators/public.decorator';
import { REDIS_CLIENT } from '../redis/redis.module';

/** Mirrors GET /health in backend/app/main.py. */
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Public()
  @Get()
  async check(): Promise<Record<string, unknown>> {
    const health: { status: string; version: string; checks: Record<string, string> } = {
      status: 'healthy',
      version: this.config.get('APP_VERSION') ?? '0.1.0',
      checks: {},
    };

    try {
      await this.dataSource.query('SELECT 1');
      health.checks.database = 'ok';
    } catch (err) {
      health.status = 'degraded';
      health.checks.database = `error: ${(err as Error).message}`;
    }

    try {
      await this.redis.ping();
      health.checks.redis = 'ok';
    } catch (err) {
      health.status = 'degraded';
      health.checks.redis = `error: ${(err as Error).message}`;
    }

    return health;
  }
}
```

Add `RedisModule` to `app.module.ts` imports and `HealthController` to `controllers`.

- [x] **Step 5: Run test to verify it passes**

Run: `npx jest --config test/jest-e2e.json test/health.e2e-spec.ts --verbose`
Expected: PASS (requires local Postgres + Redis up).

- [x] **Step 6: Commit**

```bash
git add backend-nest && git commit -m "feat(nest): redis custom provider + health endpoint matching FastAPI shape"
```

---

### Task 10: Parity-diff script

**Files:**
- Create: `backend-nest/scripts/parity-diff.ts`
- Create: `backend-nest/scripts/requests/core.json`
- Modify: `backend-nest/package.json` (add `parity` script)

- [x] **Step 1: Create the request list**

`backend-nest/scripts/requests/core.json`:

```json
[
  { "method": "GET", "path": "/" },
  { "method": "GET", "path": "/health" },
  { "method": "GET", "path": "/api/v1/auth/me", "auth": true },
  { "method": "GET", "path": "/api/v1/auth/me/features", "auth": true }
]
```

- [x] **Step 2: Implement the script**

`backend-nest/scripts/parity-diff.ts`:

```typescript
/**
 * Replays a request list against FastAPI (:8000) and Nest (:8001) and diffs
 * normalized JSON responses. The acceptance oracle for every ported module.
 *
 * Usage:
 *   TOKEN=<jwt> npx ts-node scripts/parity-diff.ts [scripts/requests/core.json]
 * Env: FASTAPI_URL (default http://localhost:8000), NEST_URL (default http://localhost:8001)
 */
import { readFileSync } from 'node:fs';

interface Req {
  method: string;
  path: string;
  auth?: boolean;
  body?: unknown;
}

const FASTAPI_URL = process.env.FASTAPI_URL ?? 'http://localhost:8000';
const NEST_URL = process.env.NEST_URL ?? 'http://localhost:8001';
const TOKEN = process.env.TOKEN ?? '';
const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** Sort keys recursively and collapse timestamp formatting differences. */
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, normalize(v)]),
    );
  }
  if (typeof value === 'string' && ISO_TS.test(value)) {
    return new Date(value).toISOString().replace(/\.\d+Z$/, 'Z'); // drop sub-second precision
  }
  return value;
}

async function call(base: string, req: Req): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (req.auth) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(`${base}${req.path}`, {
    method: req.method,
    headers,
    body: req.body ? JSON.stringify(req.body) : undefined,
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // keep raw text for non-JSON responses
  }
  return { status: res.status, body };
}

async function main(): Promise<void> {
  const file = process.argv[2] ?? 'scripts/requests/core.json';
  const requests: Req[] = JSON.parse(readFileSync(file, 'utf-8'));
  let failures = 0;

  for (const req of requests) {
    if (req.auth && !TOKEN) {
      console.log(`SKIP  ${req.method} ${req.path} (no TOKEN set)`);
      continue;
    }
    const [a, b] = await Promise.all([call(FASTAPI_URL, req), call(NEST_URL, req)]);
    const bothOk = Math.floor(a.status / 100) === Math.floor(b.status / 100);
    const same = JSON.stringify(normalize(a.body)) === JSON.stringify(normalize(b.body));
    if (bothOk && same) {
      console.log(`PASS  ${req.method} ${req.path}`);
    } else {
      failures += 1;
      console.log(`DIFF  ${req.method} ${req.path} (fastapi=${a.status}, nest=${b.status})`);
      console.log(`  fastapi: ${JSON.stringify(normalize(a.body)).slice(0, 500)}`);
      console.log(`  nest:    ${JSON.stringify(normalize(b.body)).slice(0, 500)}`);
    }
  }

  console.log(failures ? `\n${failures} request(s) differ` : '\nAll requests match');
  process.exit(failures ? 1 : 0);
}

main();
```

Add to `backend-nest/package.json` scripts:

```json
"parity": "ts-node scripts/parity-diff.ts"
```

- [x] **Step 3: Verify manually**

With both backends running (FastAPI :8000, Nest :8001):

```bash
cd backend-nest
npm run parity                     # unauthenticated requests
TOKEN=<jwt from /auth/google> npm run parity   # full list
```

Expected: `PASS` for `/` and `/health` requires known acceptable diffs to be absent; `/health` `version` differs only if APP_VERSION mismatches — align `.env` if so. Auth rows PASS with a token valid on both backends. Note in output any legitimate diffs discovered — they become fix-tasks, not things to hide.

- [x] **Step 4: Commit**

```bash
git add backend-nest && git commit -m "feat(nest): parity-diff script — replay requests against both backends"
```

---

### Task 11: Wrap-up — README, full test run, docs

**Files:**
- Create: `backend-nest/README.md`
- Modify: `docs/superpowers/plans/2026-08-10-nestjs-backend-v2-phase0-foundation.md` (check off completed tasks)

- [x] **Step 1: Write the README**

`backend-nest/README.md`:

```markdown
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

## Commands
- `npm run start:dev` — dev server on :8001 (swagger at /docs)
- `npm test` — unit tests
- `npm run test:e2e` — e2e (needs live dev DB + Redis)
- `npm run parity` — diff responses against FastAPI (both servers running; `TOKEN=<jwt>` for authed routes)
```

- [x] **Step 2: Full verification run**

```bash
cd backend-nest
npm run lint && npm test && npm run test:e2e
```

Expected: lint clean, all unit + e2e suites PASS. Fix anything that fails before proceeding.

- [x] **Step 3: Boot both backends and run parity one final time**

```bash
npm run parity   # plus TOKEN=<jwt> variant
```

Expected: all rows PASS (or every DIFF is understood and captured as a follow-up task).

- [x] **Step 4: Commit**

```bash
git add backend-nest docs && git commit -m "docs(nest): README + Phase 0 wrap-up"
```
