import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

export interface ExpenseTestContext {
  app: INestApplication;
  dataSource: DataSource;
  userId: string;
  token: string;
  otherUserId: string;
  userIds: string[];
  jwt: JwtService;
}

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
  const id = randomUUID();
  const email = `nest-exp-${label}-${id.slice(0, 8)}@example.com`;
  await ds.query(
    `INSERT INTO users (id, email, name, role, tier_id, is_demo, created_at, updated_at)
     VALUES ($1, $2, 'Expense E2E', 'USER', $3, false, now(), now())`,
    [id, email, tier.id],
  );
  return {
    id,
    token: jwt.sign({ sub: id, email, role: 'USER', tier: tier.name }),
  };
}

/** One app per suite. Never a second one in the same Jest process — they share the pg driver. */
export async function setupExpenseContext(
  label: string,
): Promise<ExpenseTestContext> {
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
    userIds: [primary.id, other.id],
    jwt,
  };
}

export async function createExtraUser(
  ctx: ExpenseTestContext,
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

export async function teardownExpenseContext(
  ctx: ExpenseTestContext | undefined,
): Promise<void> {
  if (!ctx) return;
  try {
    const ids = ctx.userIds;
    await ctx.dataSource.query(
      'DELETE FROM balance_history WHERE account_id IN (SELECT id FROM savings_accounts WHERE user_id = ANY($1))',
      [ids],
    );
    await ctx.dataSource.query(
      'UPDATE expenses SET account_transaction_id = NULL WHERE user_id = ANY($1)',
      [ids],
    );
    await ctx.dataSource.query(
      'DELETE FROM account_transactions WHERE user_id = ANY($1)',
      [ids],
    );
    await ctx.dataSource.query('DELETE FROM expenses WHERE user_id = ANY($1)', [
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

export async function insertExpense(
  ctx: ExpenseTestContext,
  overrides: Partial<{
    userId: string;
    name: string;
    amount: string;
    currency: string;
    frequency: string;
    status: string;
    isActive: boolean;
    category: string | null;
    date: string | null;
    startDate: string | null;
    endDate: string | null;
    monthlyEquivalent: string | null;
    paymentAccountId: string | null;
    autoPay: boolean;
    deletedAt: string | null;
  }> = {},
): Promise<string> {
  const id = randomUUID();
  const row = {
    userId: ctx.userId,
    name: 'E2E Expense',
    amount: '100.00',
    currency: 'USD',
    frequency: 'MONTHLY',
    status: 'pending',
    isActive: true,
    category: 'Groceries',
    date: null,
    startDate: '2026-01-01T00:00:00',
    endDate: null,
    monthlyEquivalent: '100.00',
    paymentAccountId: null,
    autoPay: false,
    deletedAt: null,
    ...overrides,
  };
  await ctx.dataSource.query(
    `INSERT INTO expenses
       (id, user_id, name, description, category, amount, currency, frequency, date, start_date,
        end_date, is_active, tags, monthly_equivalent, payment_account_id, status, auto_pay,
        deleted_at, created_at, updated_at)
     VALUES ($1,$2,$3,NULL,$4,$5,$6,$7::expensefrequency,$8,$9,$10,$11,NULL,$12,$13,$14,$15,$16,
             now() at time zone 'UTC', now() at time zone 'UTC')`,
    [
      id,
      row.userId,
      row.name,
      row.category,
      row.amount,
      row.currency,
      row.frequency,
      row.date,
      row.startDate,
      row.endDate,
      row.isActive,
      row.monthlyEquivalent,
      row.paymentAccountId,
      row.status,
      row.autoPay,
      row.deletedAt,
    ],
  );
  return id;
}

export async function insertAccount(
  ctx: ExpenseTestContext,
  overrides: Partial<{
    userId: string;
    balance: string;
    currency: string;
  }> = {},
): Promise<string> {
  const id = randomUUID();
  const row = {
    userId: ctx.userId,
    balance: '1000.00',
    currency: 'USD',
    ...overrides,
  };
  await ctx.dataSource.query(
    `INSERT INTO savings_accounts
       (id, user_id, name, account_type, current_balance, currency, interest_frequency,
        interest_accrual_method, accrued_interest, is_active, created_at, updated_at)
     VALUES ($1,$2,'E2E Account','savings',$3,$4,'monthly','simple','0.00',true,
             now() at time zone 'UTC', now() at time zone 'UTC')`,
    [id, row.userId, row.balance, row.currency],
  );
  return id;
}
