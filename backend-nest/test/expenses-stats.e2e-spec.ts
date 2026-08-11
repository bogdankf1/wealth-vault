import request from 'supertest';
import {
  ExpenseTestContext,
  createExtraUser,
  insertExpense,
  setupExpenseContext,
  teardownExpenseContext,
} from './expenses-fixtures';

describe('Expense stats and history (e2e)', () => {
  let ctx: ExpenseTestContext;

  beforeAll(async () => {
    ctx = await setupExpenseContext('stats');
  });

  afterAll(async () => {
    await teardownExpenseContext(ctx);
  });

  it('reproduces the float-poisoned roll-up byte for byte', async () => {
    const user = await createExtraUser(ctx, 'rollup');
    await insertExpense(ctx, {
      userId: user.userId,
      name: 'Weekly shop',
      amount: '100.00',
      frequency: 'WEEKLY',
      monthlyEquivalent: '433.00',
    });

    const res = await request(ctx.app.getHttpServer())
      .get('/api/v1/expenses/stats')
      .set(user.auth)
      .expect(200);

    const body = res.body as Record<string, unknown>;
    // Every value below came from CPython: Decimal(4.33) is built from a float, so its binary
    // expansion survives into the response through the 28-digit context.
    expect(body.total_monthly_expense).toBe('433.0000000000000071054273576');
    expect(body.total_annual_expense).toBe('5196.000000000000085265128291');
    expect(body.total_daily_expense).toBe('14.43333333333333357018091192');
    expect(body.total_weekly_expense).toBe('101.0333333333333349912663834');
  });

  it('groups by category with the OTHER multiplier table', async () => {
    const user = await createExtraUser(ctx, 'category');
    await insertExpense(ctx, {
      userId: user.userId,
      amount: '100.00',
      frequency: 'WEEKLY',
      category: 'Groceries',
    });
    await insertExpense(ctx, {
      userId: user.userId,
      amount: '50.00',
      frequency: 'ONE_TIME',
      category: 'Travel',
      date: '2026-05-01T00:00:00',
      startDate: null,
    });
    await insertExpense(ctx, {
      userId: user.userId,
      amount: '20.00',
      frequency: 'MONTHLY',
      category: null,
    });

    const res = await request(ctx.app.getHttpServer())
      .get('/api/v1/expenses/stats')
      .set(user.auth)
      .expect(200);
    const body = res.body as {
      expenses_by_category: Record<string, string>;
      total_expenses: number;
    };

    // 100.00 × 4.33333 — the stats map, not the 4.33 used by the roll-up above.
    expect(body.expenses_by_category.Groceries).toBe('433.3330000');
    // One-time expenses enter the map at full amount.
    expect(body.expenses_by_category.Travel).toBe('50.00');
    // The uncategorised row is dropped from the map but still counted.
    expect(Object.keys(body.expenses_by_category).sort()).toEqual([
      'Groceries',
      'Travel',
    ]);
    expect(body.total_expenses).toBe(3);
  });

  it('counts soft-deleted and inactive rows the way FastAPI does', async () => {
    const user = await createExtraUser(ctx, 'counts');
    await insertExpense(ctx, { userId: user.userId, amount: '10.00' });
    await insertExpense(ctx, {
      userId: user.userId,
      amount: '10.00',
      isActive: false,
    });
    await insertExpense(ctx, {
      userId: user.userId,
      amount: '10.00',
      deletedAt: '2026-01-01T00:00:00',
    });

    const res = await request(ctx.app.getHttpServer())
      .get('/api/v1/expenses/stats')
      .set(user.auth)
      .expect(200);
    const body = res.body as {
      total_expenses: number;
      active_expenses: number;
    };
    // No deleted_at filter on this endpoint, so all three rows are counted…
    expect(body.total_expenses).toBe(3);
    // …but only the active ones count as active, and only they contribute money.
    expect(body.active_expenses).toBe(2);
  });

  it('history buckets a recurring expense across months', async () => {
    const user = await createExtraUser(ctx, 'history');
    await insertExpense(ctx, {
      userId: user.userId,
      amount: '100.00',
      frequency: 'MONTHLY',
      startDate: '2026-01-01T00:00:00',
      endDate: '2026-03-31T00:00:00',
    });

    const res = await request(ctx.app.getHttpServer())
      .get(
        '/api/v1/expenses/history?start_date=2026-01-01T00:00:00&end_date=2026-03-31T00:00:00',
      )
      .set(user.auth)
      .expect(200);

    const body = res.body as {
      history: Array<{ month: string; total: string; count: number }>;
      total_months: number;
      overall_average: string;
      currency: string;
    };
    expect(body.history.map((h) => h.month)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
    ]);
    expect(body.history[0].total).toBe('100.00');
    expect(body.history[0].count).toBe(1);
    expect(body.total_months).toBe(3);
    // Exact division pads to the dividend's scale — Python's ideal-exponent rule.
    expect(body.overall_average).toBe('100.00');
    expect(body.currency).toBe('USD');
  });

  it('history is empty, not an error, for a user with no expenses', async () => {
    const user = await createExtraUser(ctx, 'empty');
    const res = await request(ctx.app.getHttpServer())
      .get('/api/v1/expenses/history')
      .set(user.auth)
      .expect(200);
    expect(res.body).toEqual({
      history: [],
      total_months: 0,
      overall_average: '0',
      currency: 'USD',
    });
  });

  it('stats is all zeros for a user with no expenses', async () => {
    const user = await createExtraUser(ctx, 'empty2');
    const res = await request(ctx.app.getHttpServer())
      .get('/api/v1/expenses/stats')
      .set(user.auth)
      .expect(200);
    // '0E-49', not '0'. The roll-up multiplies the empty weekly bucket by the float-derived
    // Decimal(4.33), producing a zero with exponent -49, and Python's str() renders that in
    // scientific notation. Confirmed against the live FastAPI with a freshly created user.
    expect(res.body).toEqual({
      total_expenses: 0,
      active_expenses: 0,
      total_daily_expense: '0E-49',
      total_weekly_expense: '0E-49',
      total_monthly_expense: '0E-49',
      total_annual_expense: '0E-49',
      expenses_by_category: {},
      currency: 'USD',
    });
  });
});
