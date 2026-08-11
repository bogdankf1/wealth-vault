import request from 'supertest';
import {
  ExpenseTestContext,
  createExtraUser,
  insertAccount,
  insertExpense,
  queryRows,
  setupExpenseContext,
  teardownExpenseContext,
} from './expenses-fixtures';

describe('Expense backfill and due payments (e2e)', () => {
  let ctx: ExpenseTestContext;

  beforeAll(async () => {
    ctx = await setupExpenseContext('due');
  });

  afterAll(async () => {
    await teardownExpenseContext(ctx);
  });

  const balanceOf = async (id: string): Promise<string> => {
    const rows = await queryRows<{ current_balance: string }>(
      ctx.dataSource,
      'SELECT current_balance FROM savings_accounts WHERE id = $1',
      [id],
    );
    return rows[0].current_balance;
  };

  it('backfills one withdrawal per due date when sync_historical is asked for', async () => {
    const user = await createExtraUser(ctx, 'backfill');
    const account = await insertAccount(ctx, {
      userId: user.userId,
      balance: '1000.00',
    });
    const start = new Date();
    start.setUTCMonth(start.getUTCMonth() - 2);

    const res = await request(ctx.app.getHttpServer())
      .post('/api/v1/expenses')
      .set(user.auth)
      .send({
        name: 'Rent',
        amount: '100.00',
        frequency: 'monthly',
        start_date: `${start.toISOString().slice(0, 10)}T00:00:00`,
        payment_account_id: account,
        auto_pay: true,
        sync_historical: true,
      })
      .expect(201);

    // Three due dates: two months back, one month back, today.
    const ledger = await queryRows<{ n: string }>(
      ctx.dataSource,
      `SELECT count(*)::text AS n FROM account_transactions
       WHERE source_type = 'expense' AND source_id = $1`,
      [(res.body as { id: string }).id],
    );
    expect(ledger[0].n).toBe('3');
    expect(await balanceOf(account)).toBe('700.00');

    // Only the LAST payment is kept on the expense — there is no per-payment child table.
    const row = await queryRows<{ status: string; paid_amount: string }>(
      ctx.dataSource,
      'SELECT status, paid_amount FROM expenses WHERE id = $1',
      [(res.body as { id: string }).id],
    );
    expect(row[0]).toEqual({ status: 'paid', paid_amount: '100.00' });
  });

  it('does not backfill without sync_historical', async () => {
    const user = await createExtraUser(ctx, 'nobackfill');
    const account = await insertAccount(ctx, { userId: user.userId });
    const start = new Date();
    start.setUTCMonth(start.getUTCMonth() - 2);

    const res = await request(ctx.app.getHttpServer())
      .post('/api/v1/expenses')
      .set(user.auth)
      .send({
        name: 'Quiet',
        amount: '100.00',
        frequency: 'monthly',
        start_date: `${start.toISOString().slice(0, 10)}T00:00:00`,
        payment_account_id: account,
        auto_pay: true,
      })
      .expect(201);

    expect((res.body as { status: string }).status).toBe('pending');
    expect(await balanceOf(account)).toBe('1000.00');
  });

  it('is idempotent — a second sync does not re-charge the same days', async () => {
    const user = await createExtraUser(ctx, 'idempotent');
    const account = await insertAccount(ctx, { userId: user.userId });
    const start = new Date();
    start.setUTCMonth(start.getUTCMonth() - 1);
    const body = {
      name: 'Twice',
      amount: '50.00',
      frequency: 'monthly',
      start_date: `${start.toISOString().slice(0, 10)}T00:00:00`,
      payment_account_id: account,
      auto_pay: true,
      sync_historical: true,
    };

    const created = await request(ctx.app.getHttpServer())
      .post('/api/v1/expenses')
      .set(user.auth)
      .send(body)
      .expect(201);
    const afterFirst = await balanceOf(account);

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/expenses/${(created.body as { id: string }).id}`)
      .set(user.auth)
      .send({ sync_historical: true })
      .expect(200);

    expect(await balanceOf(account)).toBe(afterFirst);
  });

  it('process-due-payments answers the hand-built dict shape', async () => {
    const user = await createExtraUser(ctx, 'due');
    const res = await request(ctx.app.getHttpServer())
      .post('/api/v1/expenses/process-due-payments')
      .set(user.auth)
      .expect(200);

    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      'auto_paid',
      'due_count',
      'errors',
      'failed_payments',
      'processed',
      'status',
      'timestamp',
    ]);
    expect(body.status).toBe('success');
    expect(body.due_count).toBe(0);
    // The one tz-aware timestamp in the module.
    expect(body.timestamp).toMatch(/\+00:00$/);
  });

  it('pays a due daily expense and reports insufficient funds as a float', async () => {
    const user = await createExtraUser(ctx, 'duepay');
    const rich = await insertAccount(ctx, {
      userId: user.userId,
      balance: '500.00',
    });
    const poor = await insertAccount(ctx, {
      userId: user.userId,
      balance: '1.00',
    });
    // Daily is always due, so both rows are picked up today.
    await insertExpense(ctx, {
      userId: user.userId,
      name: 'Coffee',
      amount: '5.00',
      frequency: 'DAILY',
      startDate: '2026-01-01T00:00:00',
      paymentAccountId: rich,
    });
    await insertExpense(ctx, {
      userId: user.userId,
      name: 'Too big',
      amount: '900.00',
      frequency: 'DAILY',
      startDate: '2026-01-01T00:00:00',
      paymentAccountId: poor,
    });

    const res = await request(ctx.app.getHttpServer())
      .post('/api/v1/expenses/process-due-payments')
      .set(user.auth)
      .expect(200);

    const body = res.body as {
      due_count: number;
      processed: number;
      failed_payments: Array<Record<string, unknown>>;
    };
    expect(body.due_count).toBe(2);
    expect(body.processed).toBe(1);
    expect(body.failed_payments).toHaveLength(1);
    expect(body.failed_payments[0]).toEqual({
      expense_id: expect.any(String),
      expense_name: 'Too big',
      reason: 'insufficient_funds',
      amount: 900, // a number, like everything in this hand-built dict
      currency: 'USD',
    });
    expect(await balanceOf(rich)).toBe('495.00');
    expect(await balanceOf(poor)).toBe('1.00');
  });
});
