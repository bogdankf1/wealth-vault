import request from 'supertest';
import {
  IncomeTestContext,
  insertSource,
  insertTransaction,
  queryRows,
  setupIncomeContext,
  teardownIncomeContext,
} from './income-fixtures';

describe('Income transactions, stats and history (e2e)', () => {
  let ctx: IncomeTestContext;
  let sourceId: string;
  let otherUsersSourceId: string;

  beforeAll(async () => {
    ctx = await setupIncomeContext('txns');
    sourceId = await insertSource(ctx, {
      name: 'Acme Corp Salary',
      amount: '6500.00',
      startDate: '2026-01-01 00:00:00',
    });
    await insertSource(ctx, {
      name: 'Freelance Design',
      amount: '1000.00',
      startDate: '2026-01-01 00:00:00',
    });
    otherUsersSourceId = await insertSource(ctx, { userId: ctx.otherUserId });

    await insertTransaction(ctx, {
      sourceId,
      amount: '6500.00',
      date: '2026-05-01 00:00:00',
      description: 'Payroll deposit - Acme Corp',
    });
    await insertTransaction(ctx, {
      sourceId,
      amount: '900.00',
      date: '2026-04-20 00:00:00',
      description: 'Upwork payout',
    });
    await insertTransaction(ctx, { userId: ctx.otherUserId, amount: '111.00' });
  });

  afterAll(async () => {
    await teardownIncomeContext(ctx);
  });

  const auth = () => ({ Authorization: `Bearer ${ctx.token}` });

  it("GET /transactions returns only this user's rows, newest first", async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/v1/income/transactions?page=1&page_size=2')
      .set(auth())
      .expect(200);
    const body = res.body as {
      items: Array<Record<string, unknown>>;
      total: number;
    };
    expect(body.total).toBe(2);
    expect(body.items[0].date).toBe('2026-05-01T00:00:00');
    expect(body.items[1].date).toBe('2026-04-20T00:00:00');
    // Raw decimals on this endpoint family — no float collapse.
    expect(body.items[0].amount).toBe('6500.00');
    expect(body.items[0].status).toBe('received');
    expect(body.items[0].deposited_to_account_name).toBeNull();
  });

  it('filters by source_id and by date range', async () => {
    const bySource = await request(ctx.app.getHttpServer())
      .get(`/api/v1/income/transactions?source_id=${sourceId}`)
      .set(auth())
      .expect(200);
    expect((bySource.body as { total: number }).total).toBe(2);

    const byDate = await request(ctx.app.getHttpServer())
      .get('/api/v1/income/transactions?start_date=2026-04-25T00:00:00')
      .set(auth())
      .expect(200);
    expect((byDate.body as { total: number }).total).toBe(1);
  });

  // Deviation 1: FastAPI 500s on this endpoint; Nest implements it.
  it('POST /transactions creates the row and ignores deposit_to_account_id', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/v1/income/transactions')
      .set(auth())
      .send({
        amount: '12.34',
        currency: 'usd',
        date: '2026-08-01T00:00:00',
        description: 'E2E created',
        deposit_to_account_id: '00000000-0000-0000-0000-0000000000ff',
      })
      .expect(201);

    const body = res.body as Record<string, unknown>;
    expect(body.amount).toBe('12.34');
    expect(body.currency).toBe('USD');
    expect(body.date).toBe('2026-08-01T00:00:00');
    expect(body.status).toBe('received');
    expect(body.deposited_to_account_id).toBeNull();

    const rows = await queryRows<{ date: string }>(
      ctx.dataSource,
      'SELECT date::text FROM income_transactions WHERE id = $1',
      [body.id],
    );
    expect(rows[0].date).toBe('2026-08-01 00:00:00');
  });

  it('POST /transactions 404s when source_id belongs to someone else', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/v1/income/transactions')
      .set(auth())
      .send({
        amount: '1.00',
        date: '2026-08-01T00:00:00',
        source_id: otherUsersSourceId,
      })
      .expect(404);
    expect(res.body).toEqual({
      error: 'Income source not found',
      details: {},
      status_code: 404,
    });
  });

  it('GET /stats matches the FastAPI figures for two monthly sources', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/v1/income/stats')
      .set(auth())
      .expect(200);
    expect(res.body).toEqual({
      total_sources: 2,
      active_sources: 2,
      total_monthly_income: '7500.00',
      total_annual_income: '90000.00',
      // These three count SOURCES, not transactions — FastAPI's naming, preserved.
      total_transactions: 2,
      total_transactions_amount: '7500.00',
      transactions_current_month: 2,
      transactions_current_month_amount: '7500.00',
      transactions_last_month: 2,
      transactions_last_month_amount: '7500.00',
      currency: 'USD',
    });
  });

  it('GET /history buckets by month with scale-2 totals', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(
        '/api/v1/income/history?start_date=2026-01-01T00:00:00&end_date=2026-03-31T00:00:00',
      )
      .set(auth())
      .expect(200);
    const body = res.body as {
      history: Array<{
        month: string;
        total: string;
        count: number;
        currency: string;
      }>;
      total_months: number;
      overall_average: string;
      currency: string;
    };
    expect(body.history.map((h) => h.month)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
    ]);
    expect(body.history[0]).toEqual({
      month: '2026-01',
      total: '7500.00',
      count: 2,
      currency: 'USD',
    });
    expect(body.total_months).toBe(3);
    // Python pads an exact quotient to scale(dividend) - scale(divisor): 22500.00 / 3 is
    // Decimal('7500.00'), not 7500. Verified against the live FastAPI by the parity diff.
    expect(body.overall_average).toBe('7500.00');
    expect(body.currency).toBe('USD');
  });
});
