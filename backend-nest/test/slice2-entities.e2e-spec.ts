import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { Subscription } from '../src/modules/subscriptions/entities/subscription.entity';
import { SubscriptionPayment } from '../src/modules/subscriptions/entities/subscription-payment.entity';
import { Installment } from '../src/modules/installments/entities/installment.entity';
import { InstallmentPayment } from '../src/modules/installments/entities/installment-payment.entity';
import { MirrorExpenseService } from '../src/modules/expenses/services/mirror-expense.service';
import { Expense } from '../src/modules/expenses/entities/expense.entity';

async function queryRows<T>(
  ds: DataSource,
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const result: unknown = await ds.query(sql, params);
  return result as T[];
}

describe('Slice 2 entities and the mirror-expense contract', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let mirror: MirrorExpenseService;
  let userId: string;
  const createdExpenses: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
    dataSource = app.get(DataSource);
    mirror = app.get(MirrorExpenseService);
    const [user] = await queryRows<{ id: string }>(
      dataSource,
      'SELECT id FROM users LIMIT 1',
    );
    userId = user.id;
  });

  afterAll(async () => {
    try {
      if (createdExpenses.length) {
        await dataSource.query('DELETE FROM expenses WHERE id = ANY($1)', [
          createdExpenses,
        ]);
      }
    } finally {
      if (app) await app.close();
    }
  });

  it.each([
    ['Subscription', Subscription],
    ['SubscriptionPayment', SubscriptionPayment],
    ['Installment', Installment],
    ['InstallmentPayment', InstallmentPayment],
  ])('%s maps onto its table', async (_name, entity) => {
    await expect(
      dataSource.getRepository(entity).find({ take: 1 }),
    ).resolves.toBeDefined();
  });

  it('writes the mirror expense exactly as FastAPI does', async () => {
    const expense = await mirror.create(dataSource.manager, {
      userId,
      name: 'ZZ Netflix - Subscription',
      description: 'Auto-generated from subscription: ZZ Netflix',
      category: 'Subscriptions',
      amount: '15.99',
      currency: 'USD',
      paymentDate: '2026-08-11T10:00:00',
      paymentAccountId: null,
    });
    createdExpenses.push(expense.id);

    const [row] = await queryRows<{
      frequency: string;
      status: string;
      monthly_equivalent: string | null;
      payment_method: string | null;
      paid_amount: string;
      auto_pay: boolean;
    }>(
      dataSource,
      `SELECT frequency::text AS frequency, status, monthly_equivalent, payment_method,
              paid_amount, auto_pay
       FROM expenses WHERE id = $1`,
      [expense.id],
    );
    // The enum NAME is what lands in the native enum column.
    expect(row.frequency).toBe('ONE_TIME');
    expect(row.status).toBe('paid');
    expect(row.paid_amount).toBe('15.99');
    // Left NULL on purpose: a mirror is a record of a payment, not a recurring expense, and giving
    // it a monthly equivalent would double-count it in /expenses/stats.
    expect(row.monthly_equivalent).toBeNull();
    expect(row.payment_method).toBeNull();
    expect(row.auto_pay).toBe(false);
  });

  it("records payment_method 'transfer' when an account is linked", async () => {
    const [account] = await queryRows<{ id: string }>(
      dataSource,
      'SELECT id FROM savings_accounts WHERE user_id = $1 LIMIT 1',
      [userId],
    );
    const expense = await mirror.create(dataSource.manager, {
      userId,
      name: 'ZZ Linked - Subscription',
      description: 'd',
      category: 'Subscriptions',
      amount: '1.00',
      currency: 'USD',
      paymentDate: '2026-08-11T10:00:00',
      paymentAccountId: account ? account.id : null,
    });
    createdExpenses.push(expense.id);
    expect(expense.paymentMethod).toBe(account ? 'transfer' : null);
  });

  it('soft-deletes on reversal while leaving the payment fields behind', async () => {
    const expense = await mirror.create(dataSource.manager, {
      userId,
      name: 'ZZ Reversed - Subscription',
      description: 'd',
      category: 'Subscriptions',
      amount: '9.99',
      currency: 'USD',
      paymentDate: '2026-08-11T10:00:00',
      paymentAccountId: null,
    });
    createdExpenses.push(expense.id);

    await mirror.softDelete(dataSource.manager, expense.id);

    const [row] = await queryRows<{
      deleted_at: string | null;
      is_active: boolean;
      status: string;
      paid_amount: string;
    }>(
      dataSource,
      'SELECT deleted_at, is_active, status, paid_amount FROM expenses WHERE id = $1',
      [expense.id],
    );
    expect(row.deleted_at).not.toBeNull();
    expect(row.is_active).toBe(false);
    // Deliberately untouched — the reversal is asymmetric.
    expect(row.status).toBe('paid');
    expect(row.paid_amount).toBe('9.99');
  });

  // Proves the expense mapper reads it back as the wire value, closing the loop on the enum split.
  it('reads the mirror back as the lowercase wire value', async () => {
    const expense = await dataSource
      .getRepository(Expense)
      .findOne({ where: { id: createdExpenses[0] } });
    expect(expense!.frequency).toBe('ONE_TIME');
  });
});
