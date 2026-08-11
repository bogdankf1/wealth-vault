import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

export interface Slice3Context {
  app: INestApplication;
  dataSource: DataSource;
  userId: string;
  token: string;
  auth: { Authorization: string };
  otherUserId: string;
  otherToken: string;
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

/**
 * tax_tracking and debt_tracking are Wealth-tier-only features, so every user here is on `wealth`.
 * A starter-tier user is created explicitly by the tests that check the 403 and the ungated
 * batch-delete.
 */
async function createUser(
  ds: DataSource,
  jwt: JwtService,
  label: string,
  tierName = 'wealth',
): Promise<{ id: string; token: string }> {
  const [tier] = await queryRows<{ id: string; name: string }>(
    ds,
    'SELECT id, name FROM tiers WHERE name = $1 LIMIT 1',
    [tierName],
  );
  const id = randomUUID();
  const email = `nest-s3-${label}-${id.slice(0, 8)}@example.com`;
  await ds.query(
    `INSERT INTO users (id, email, name, role, tier_id, is_demo, created_at, updated_at)
     VALUES ($1, $2, 'Slice3 E2E', 'USER', $3, false, now(), now())`,
    [id, email, tier.id],
  );
  return {
    id,
    token: jwt.sign({ sub: id, email, role: 'USER', tier: tier.name }),
  };
}

/** One app per suite — two in the same Jest process fight over the pg driver. */
export async function setupSlice3Context(
  label: string,
): Promise<Slice3Context> {
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
    auth: { Authorization: `Bearer ${primary.token}` },
    otherUserId: other.id,
    otherToken: other.token,
    userIds: [primary.id, other.id],
    jwt,
  };
}

export async function createExtraUser(
  ctx: Slice3Context,
  label: string,
  tierName = 'wealth',
): Promise<{ userId: string; token: string; auth: { Authorization: string } }> {
  const user = await createUser(ctx.dataSource, ctx.jwt, label, tierName);
  ctx.userIds.push(user.id);
  return {
    userId: user.id,
    token: user.token,
    auth: { Authorization: `Bearer ${user.token}` },
  };
}

/** Deleted in FK order; anything left behind pollutes a shared dev database. */
export async function teardownSlice3Context(
  ctx: Slice3Context | undefined,
): Promise<void> {
  if (!ctx) return;
  try {
    const ids = ctx.userIds;
    await ctx.dataSource.query(
      'DELETE FROM tax_payments WHERE user_id = ANY($1)',
      [ids],
    );
    await ctx.dataSource.query(
      'DELETE FROM debt_payments WHERE user_id = ANY($1)',
      [ids],
    );
    await ctx.dataSource.query('DELETE FROM taxes WHERE user_id = ANY($1)', [
      ids,
    ]);
    await ctx.dataSource.query('DELETE FROM debts WHERE user_id = ANY($1)', [
      ids,
    ]);
    await ctx.dataSource.query(
      'DELETE FROM balance_history WHERE account_id IN (SELECT id FROM savings_accounts WHERE user_id = ANY($1))',
      [ids],
    );
    await ctx.dataSource.query(
      'DELETE FROM account_transactions WHERE user_id = ANY($1)',
      [ids],
    );
    await ctx.dataSource.query(
      'DELETE FROM income_sources WHERE user_id = ANY($1)',
      [ids],
    );
    await ctx.dataSource.query(
      'DELETE FROM savings_accounts WHERE user_id = ANY($1)',
      [ids],
    );
    await ctx.dataSource.query('DELETE FROM users WHERE id = ANY($1)', [ids]);
  } finally {
    await ctx.app.close();
  }
}

export async function insertAccount(
  ctx: Slice3Context,
  overrides: Partial<{
    userId: string;
    name: string;
    balance: string;
    currency: string;
    isActive: boolean;
  }> = {},
): Promise<string> {
  const id = randomUUID();
  await ctx.dataSource.query(
    `INSERT INTO savings_accounts
       (id, user_id, name, account_type, current_balance, currency, interest_rate,
        interest_frequency, interest_accrual_method, accrued_interest, is_active,
        created_at, updated_at)
     VALUES ($1, $2, $3, 'savings', $4, $5, 0, 'monthly', 'simple', 0, $6, now(), now())`,
    [
      id,
      overrides.userId ?? ctx.userId,
      overrides.name ?? 'Slice3 Account',
      overrides.balance ?? '1000.00',
      overrides.currency ?? 'USD',
      overrides.isActive ?? true,
    ],
  );
  return id;
}

export async function insertIncomeSource(
  ctx: Slice3Context,
  overrides: Partial<{
    userId: string;
    name: string;
    amount: string;
    currency: string;
    /** The enum NAME, e.g. 'MONTHLY' — that is what the column holds. */
    frequency: string;
    isActive: boolean;
  }> = {},
): Promise<string> {
  const id = randomUUID();
  await ctx.dataSource.query(
    `INSERT INTO income_sources
       (id, user_id, name, amount, currency, frequency, is_active, auto_deposit,
        created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, false, now(), now())`,
    [
      id,
      overrides.userId ?? ctx.userId,
      overrides.name ?? 'Slice3 Salary',
      overrides.amount ?? '1000.00',
      overrides.currency ?? 'USD',
      overrides.frequency ?? 'MONTHLY',
      overrides.isActive ?? true,
    ],
  );
  return id;
}

export async function insertTax(
  ctx: Slice3Context,
  overrides: Partial<{
    userId: string;
    name: string;
    taxType: string;
    frequency: string;
    fixedAmount: string | null;
    percentage: string | null;
    currency: string;
    incomeSourceId: string | null;
    paymentAccountId: string | null;
    autoPay: boolean;
    isActive: boolean;
    deletedAt: string | null;
  }> = {},
): Promise<string> {
  const id = randomUUID();
  await ctx.dataSource.query(
    `INSERT INTO taxes
       (id, user_id, name, tax_type, frequency, fixed_amount, currency, percentage,
        income_source_id, payment_account_id, auto_pay, is_active, created_at, updated_at, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), now(), $13)`,
    [
      id,
      overrides.userId ?? ctx.userId,
      overrides.name ?? 'Federal Tax',
      overrides.taxType ?? 'fixed',
      overrides.frequency ?? 'annually',
      overrides.fixedAmount ?? '100.00',
      overrides.currency ?? 'USD',
      overrides.percentage ?? null,
      overrides.incomeSourceId ?? null,
      overrides.paymentAccountId ?? null,
      overrides.autoPay ?? false,
      overrides.isActive ?? true,
      overrides.deletedAt ?? null,
    ],
  );
  return id;
}

export async function insertDebt(
  ctx: Slice3Context,
  overrides: Partial<{
    userId: string;
    debtorName: string;
    amount: string;
    amountPaid: string;
    currency: string;
    isActive: boolean;
    isPaid: boolean;
    dueDate: string | null;
    depositAccountId: string | null;
    autoDeposit: boolean;
    accruedInterest: string;
    deletedAt: string | null;
  }> = {},
): Promise<string> {
  const id = randomUUID();
  await ctx.dataSource.query(
    `INSERT INTO debts
       (id, user_id, debtor_name, amount, amount_paid, currency, is_active, is_paid, due_date,
        deposit_account_id, auto_deposit, accrued_interest, reminder_days_before,
        created_at, updated_at, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 3, now(), now(), $13)`,
    [
      id,
      overrides.userId ?? ctx.userId,
      overrides.debtorName ?? 'Alex',
      overrides.amount ?? '500.00',
      overrides.amountPaid ?? '0.00',
      overrides.currency ?? 'USD',
      overrides.isActive ?? true,
      overrides.isPaid ?? false,
      overrides.dueDate ?? null,
      overrides.depositAccountId ?? null,
      overrides.autoDeposit ?? false,
      overrides.accruedInterest ?? '0.00',
      overrides.deletedAt ?? null,
    ],
  );
  return id;
}
