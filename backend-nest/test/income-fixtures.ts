import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

/**
 * Shared setup for the income e2e suites. Every suite creates its own user and deletes it (and
 * everything hanging off it) afterwards, because these run against the shared dev DB that FastAPI
 * also uses — no fixture may touch a row it did not create.
 */
export interface IncomeTestContext {
  app: INestApplication;
  dataSource: DataSource;
  userId: string;
  token: string;
  /** A second user, for the ownership assertions. */
  otherUserId: string;
  otherToken: string;
  /** Every user this context created, in creation order, for teardown. */
  userIds: string[];
  jwt: JwtService;
}

/**
 * A clean-slate user inside the SAME app. Do not stand up a second Nest app to get isolation:
 * two apps in one Jest process end up sharing the postgres driver, so closing one leaves the
 * other throwing "Driver not Connected" on its next query.
 */
export async function createExtraUser(
  ctx: IncomeTestContext,
  label: string,
): Promise<{ userId: string; token: string; auth: { Authorization: string } }> {
  const user = await createUser(ctx.dataSource, ctx.jwt, label);
  ctx.userIds.push(user.id);
  return {
    userId: user.id,
    token: user.token,
    auth: { Authorization: `Bearer ${user.token}` },
  };
}

/** dataSource.query() is typed `any`; launder it through unknown rather than spreading `any`. */
export async function queryRows<T>(
  ds: DataSource,
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const result: unknown = await ds.query(sql, params);
  return result as T[];
}

async function createUser(
  ds: DataSource,
  jwt: JwtService,
  label: string,
): Promise<{ id: string; token: string }> {
  const [tier] = await queryRows<{ id: string; name: string }>(
    ds,
    "SELECT id, name FROM tiers WHERE name = 'wealth' LIMIT 1",
  );
  if (!tier) {
    throw new Error(
      "The dev DB has no 'wealth' tier — run the FastAPI seed_data script first.",
    );
  }

  const id = randomUUID();
  const email = `nest-income-${label}-${id.slice(0, 8)}@example.com`;
  await ds.query(
    `INSERT INTO users (id, email, name, role, tier_id, is_demo, created_at, updated_at)
     VALUES ($1, $2, 'Income E2E', 'USER', $3, false, now(), now())`,
    [id, email, tier.id],
  );

  // Signed with the app's own JwtService, so the token is valid on FastAPI too (shared SECRET_KEY).
  const token = jwt.sign({
    sub: id,
    email,
    role: 'USER',
    tier: tier.name,
  });
  return { id, token };
}

export async function setupIncomeContext(
  label: string,
): Promise<IncomeTestContext> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication({ bodyParser: false });
  configureApp(app);
  await app.init();

  const dataSource = app.get(DataSource);
  const jwt = app.get(JwtService);
  const primary = await createUser(dataSource, jwt, label);
  const other = await createUser(dataSource, jwt, `${label}-other`);

  return {
    app,
    dataSource,
    userId: primary.id,
    token: primary.token,
    otherUserId: other.id,
    otherToken: other.token,
    userIds: [primary.id, other.id],
    jwt,
  };
}

/**
 * Deletes in FK order. income_transactions/income_sources have no ON DELETE CASCADE from users,
 * which is why they have to go first — the same reason FastAPI's demo purge lists them explicitly.
 */
export async function teardownIncomeContext(
  ctx: IncomeTestContext | undefined,
): Promise<void> {
  if (!ctx) return;
  try {
    const ids = ctx.userIds;
    await ctx.dataSource.query(
      'DELETE FROM balance_history WHERE account_id IN (SELECT id FROM savings_accounts WHERE user_id = ANY($1))',
      [ids],
    );
    await ctx.dataSource.query(
      'DELETE FROM account_transactions WHERE user_id = ANY($1)',
      [ids],
    );
    await ctx.dataSource.query(
      'DELETE FROM goal_progress_history WHERE user_id = ANY($1)',
      [ids],
    );
    await ctx.dataSource.query(
      'DELETE FROM income_distribution_rules WHERE user_id = ANY($1)',
      [ids],
    );
    await ctx.dataSource.query(
      'DELETE FROM income_transactions WHERE user_id = ANY($1)',
      [ids],
    );
    await ctx.dataSource.query(
      'DELETE FROM income_sources WHERE user_id = ANY($1)',
      [ids],
    );
    await ctx.dataSource.query('DELETE FROM goals WHERE user_id = ANY($1)', [
      ids,
    ]);
    await ctx.dataSource.query(
      'DELETE FROM savings_accounts WHERE user_id = ANY($1)',
      [ids],
    );
    await ctx.dataSource.query('DELETE FROM users WHERE id = ANY($1)', [ids]);
  } finally {
    await ctx.app.close();
  }
}

export async function insertSource(
  ctx: IncomeTestContext,
  overrides: Partial<{
    userId: string;
    name: string;
    amount: string;
    currency: string;
    frequency: string;
    isActive: boolean;
    date: string | null;
    startDate: string | null;
    endDate: string | null;
    category: string | null;
    targetAccountId: string | null;
    autoDeposit: boolean;
  }> = {},
): Promise<string> {
  const id = randomUUID();
  const row = {
    userId: ctx.userId,
    name: 'E2E Source',
    amount: '1000.00',
    currency: 'USD',
    frequency: 'MONTHLY',
    isActive: true,
    date: null,
    startDate: '2026-01-01 00:00:00',
    endDate: null,
    category: null,
    targetAccountId: null,
    autoDeposit: false,
    ...overrides,
  };
  await ctx.dataSource.query(
    `INSERT INTO income_sources
       (id, user_id, name, description, category, amount, currency, frequency, is_active,
        date, start_date, end_date, target_account_id, auto_deposit, created_at, updated_at)
     VALUES ($1,$2,$3,NULL,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now(), now())`,
    [
      id,
      row.userId,
      row.name,
      row.category,
      row.amount,
      row.currency,
      row.frequency,
      row.isActive,
      row.date,
      row.startDate,
      row.endDate,
      row.targetAccountId,
      row.autoDeposit,
    ],
  );
  return id;
}

export async function insertTransaction(
  ctx: IncomeTestContext,
  overrides: Partial<{
    userId: string;
    sourceId: string | null;
    description: string | null;
    amount: string;
    currency: string;
    date: string;
    category: string | null;
    status: string;
  }> = {},
): Promise<string> {
  const id = randomUUID();
  const row = {
    userId: ctx.userId,
    sourceId: null,
    description: 'E2E Transaction',
    amount: '6500.00',
    currency: 'USD',
    date: '2026-05-01 00:00:00',
    category: 'Salary',
    status: 'RECEIVED',
    ...overrides,
  };
  await ctx.dataSource.query(
    `INSERT INTO income_transactions
       (id, user_id, source_id, description, amount, currency, date, category, notes, status,
        created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9, now(), now())`,
    [
      id,
      row.userId,
      row.sourceId,
      row.description,
      row.amount,
      row.currency,
      row.date,
      row.category,
      row.status,
    ],
  );
  return id;
}

export async function insertAccount(
  ctx: IncomeTestContext,
  overrides: Partial<{
    userId: string;
    balance: string;
    currency: string;
  }> = {},
): Promise<string> {
  const id = randomUUID();
  const row = {
    userId: ctx.userId,
    balance: '0.00',
    currency: 'USD',
    ...overrides,
  };
  await ctx.dataSource.query(
    `INSERT INTO savings_accounts
       (id, user_id, name, account_type, current_balance, currency, interest_frequency,
        interest_accrual_method, accrued_interest, is_active, created_at, updated_at)
     VALUES ($1,$2,'E2E Account','savings',$3,$4,'monthly','simple','0.00',true, now(), now())`,
    [id, row.userId, row.balance, row.currency],
  );
  return id;
}

export async function insertGoal(
  ctx: IncomeTestContext,
  overrides: Partial<{
    userId: string;
    target: string;
    current: string;
    currency: string;
  }> = {},
): Promise<string> {
  const id = randomUUID();
  const row = {
    userId: ctx.userId,
    target: '1000.00',
    current: '0.00',
    currency: 'USD',
    ...overrides,
  };
  await ctx.dataSource.query(
    `INSERT INTO goals
       (id, user_id, name, target_amount, current_amount, currency, start_date, is_active,
        is_completed, auto_track_progress, created_at, updated_at)
     VALUES ($1,$2,'E2E Goal',$3,$4,$5,'2026-01-01 00:00:00',true,false,false, now(), now())`,
    [id, row.userId, row.target, row.current, row.currency],
  );
  return id;
}
