import request from 'supertest';
import { randomUUID } from 'node:crypto';
import {
  ExpenseTestContext,
  createExtraUser,
  insertAccount,
  queryRows,
  setupExpenseContext,
  teardownExpenseContext,
} from './expenses-fixtures';

describe('Installments (e2e)', () => {
  let ctx: ExpenseTestContext;
  let accountId: string;

  beforeAll(async () => {
    ctx = await setupExpenseContext('inst');
    accountId = await insertAccount(ctx, { balance: '1000.00' });
  });

  afterAll(async () => {
    await ctx.dataSource.query(
      'DELETE FROM installment_payments WHERE user_id = ANY($1)',
      [ctx.userIds],
    );
    await ctx.dataSource.query(
      'DELETE FROM installments WHERE user_id = ANY($1)',
      [ctx.userIds],
    );
    await teardownExpenseContext(ctx);
  });

  const auth = () => ({ Authorization: `Bearer ${ctx.token}` });

  const create = async (
    body: Record<string, unknown> = {},
    who = auth(),
  ): Promise<Record<string, unknown>> => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/v1/installments')
      .set(who)
      .send({
        name: `ZZ Inst ${randomUUID().slice(0, 6)}`,
        total_amount: '1200.00',
        amount_per_payment: '100.00',
        currency: 'USD',
        frequency: 'monthly',
        number_of_payments: 12,
        start_date: '2026-06-01T00:00:00',
        first_payment_date: '2026-06-01T00:00:00',
        ...body,
      })
      .expect(201);
    return res.body as Record<string, unknown>;
  };

  it('creates with DB scale, derives payments_made from the calendar', async () => {
    const body = await create({ interest_rate: '5.5' });
    expect(body.total_amount).toBe('1200.00');
    expect(body.amount_per_payment).toBe('100.00');
    expect(body.interest_rate).toBe('5.5');
    expect(body.display_total_amount).toBeNull();
    // first_payment 2026-06-01 with "today" past it — the counter comes from the calendar, not
    // from recorded payments, so a backdated schedule reports progress immediately.
    expect(Number(body.payments_made)).toBeGreaterThanOrEqual(1);
    // remaining = total - per_payment * payments_made
    expect(body.remaining_balance).toBe(
      String(1200 - 100 * Number(body.payments_made)) + '.00',
    );
    expect(body.status).toBe('active');
  });

  it('float-collapses the same row on get-by-id', async () => {
    const created = await create({ interest_rate: '5.50' });
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/v1/installments/${created.id as string}`)
      .set(auth())
      .expect(200);
    const body = res.body as Record<string, unknown>;
    expect(body.total_amount).toBe('1200.0');
    expect(body.amount_per_payment).toBe('100.0');
    expect(body.interest_rate).toBe('5.5');
    expect(body.display_total_amount).toBe('1200.0');
    expect(body.display_currency).toBe('USD');
  });

  it('recomputes payments_made and end_date on update, discarding the input', async () => {
    const created = await create();
    const res = await request(ctx.app.getHttpServer())
      .put(`/api/v1/installments/${created.id as string}`)
      .set(auth())
      .send({ end_date: '2099-01-01T00:00:00', name: 'ZZ Renamed' })
      .expect(200);
    const body = res.body as Record<string, unknown>;
    expect(body.name).toBe('ZZ Renamed');
    // The client's end_date is thrown away and recomputed from the schedule.
    expect(body.end_date).not.toBe('2099-01-01T00:00:00');
    expect(body.end_date).toBe('2027-05-01T00:00:00');
  });

  // The cap table is hardcoded in the handler (starter 2, growth 10, wealth unlimited) rather than
  // driven by tier_features. wealth maps to an explicit null, and reading that table with `??`
  // would turn "unlimited" into the starter limit — so prove the top tier really is uncapped.
  it('leaves the wealth tier uncapped', async () => {
    const user = await createExtraUser(ctx, 'inst-uncapped');
    for (let i = 0; i < 3; i += 1) {
      await create({ name: `ZZ Uncapped ${i}` }, user.auth);
    }
    const res = await request(ctx.app.getHttpServer())
      .get('/api/v1/installments')
      .set(user.auth)
      .expect(200);
    expect((res.body as { total: number }).total).toBe(3);
  });

  describe('lifecycle', () => {
    it('completes, refuses a second complete, then reactivates', async () => {
      const created = await create();
      const id = created.id as string;

      const done = await request(ctx.app.getHttpServer())
        .post(`/api/v1/installments/${id}/complete`)
        .set(auth())
        .expect(200);
      expect((done.body as Record<string, unknown>).status).toBe('completed');
      expect((done.body as Record<string, unknown>).remaining_balance).toBe(
        '0',
      );

      const again = await request(ctx.app.getHttpServer())
        .post(`/api/v1/installments/${id}/complete`)
        .set(auth())
        .expect(400);
      expect(again.body).toEqual({
        detail: 'Installment is already completed',
      });

      const back = await request(ctx.app.getHttpServer())
        .post(`/api/v1/installments/${id}/reactivate`)
        .set(auth())
        .expect(200);
      expect((back.body as Record<string, unknown>).status).toBe('active');
    });

    it('marks defaulted and refuses a repeat', async () => {
      const created = await create();
      const id = created.id as string;
      const res = await request(ctx.app.getHttpServer())
        .post(`/api/v1/installments/${id}/default`)
        .set(auth())
        .send({ reason: 'missed three' })
        .expect(200);
      expect((res.body as Record<string, unknown>).status).toBe('defaulted');

      const again = await request(ctx.app.getHttpServer())
        .post(`/api/v1/installments/${id}/default`)
        .set(auth())
        .send({})
        .expect(400);
      expect(again.body).toEqual({
        detail: 'Installment is already defaulted',
      });
    });

    it('refuses to reactivate an active installment', async () => {
      const created = await create();
      const res = await request(ctx.app.getHttpServer())
        .post(`/api/v1/installments/${created.id as string}/reactivate`)
        .set(auth())
        .expect(400);
      expect(res.body).toEqual({ detail: 'Installment is already active' });
    });
  });

  describe('pay', () => {
    it('records a payment with the mirror expense and the interest split', async () => {
      const created = await create({
        interest_rate: '12.00',
        first_payment_date: '2026-06-01T00:00:00',
      });
      const id = created.id as string;
      const remainingBefore = created.remaining_balance as string;

      const res = await request(ctx.app.getHttpServer())
        .post(`/api/v1/installments/${id}/pay`)
        .set(auth())
        .send({ payment_date: '2026-08-11T10:00:00', payment_number: 1 })
        .expect(200);

      const body = res.body as Record<string, unknown>;
      expect(body.payment_number).toBe(1);
      expect(body.status).toBe('completed');
      expect(body.scheduled_amount).toBe('100.00');
      // Payment #1 is scheduled on first_payment_date, and we paid in August — late.
      expect(body.scheduled_date).toBe('2026-06-01T00:00:00');
      expect(body.is_late).toBe(true);
      expect(Number(body.days_late)).toBe(71);
      // interest = remaining * (12 / 100 / 12) = remaining * 0.01
      const expectedInterest = Number(remainingBefore) * 0.01;
      expect(Number(body.interest_amount)).toBeCloseTo(expectedInterest, 2);
      expect(Number(body.principal_amount)).toBeCloseTo(
        100 - expectedInterest,
        2,
      );

      const mirror = await queryRows<{ name: string; status: string }>(
        ctx.dataSource,
        'SELECT name, status FROM expenses WHERE id = $1',
        [body.expense_id],
      );
      expect(mirror[0].name).toBe(`${created.name as string} - Payment #1`);
      expect(mirror[0].status).toBe('paid');
    });

    it('assigns payments_made rather than incrementing it', async () => {
      const created = await create();
      const id = created.id as string;
      await request(ctx.app.getHttpServer())
        .post(`/api/v1/installments/${id}/pay`)
        .set(auth())
        .send({ payment_number: 5 })
        .expect(200);

      const res = await request(ctx.app.getHttpServer())
        .get(`/api/v1/installments/${id}`)
        .set(auth())
        .expect(200);
      // Recording payment #5 jumps the counter straight to 5 — it is an assignment in FastAPI.
      expect((res.body as Record<string, unknown>).payments_made).toBe(5);
    });

    it('completes the installment on the final payment', async () => {
      const created = await create({ number_of_payments: 2 });
      const id = created.id as string;
      await request(ctx.app.getHttpServer())
        .post(`/api/v1/installments/${id}/pay`)
        .set(auth())
        .send({ payment_number: 2 })
        .expect(200);

      const rows = await queryRows<{
        status: string;
        is_active: boolean;
        remaining_balance: string;
      }>(
        ctx.dataSource,
        'SELECT status, is_active, remaining_balance FROM installments WHERE id = $1',
        [id],
      );
      expect(rows[0]).toEqual({
        status: 'completed',
        is_active: false,
        remaining_balance: '0.00',
      });
    });

    it('withdraws when auto_pay is on', async () => {
      const before = await queryRows<{ current_balance: string }>(
        ctx.dataSource,
        'SELECT current_balance FROM savings_accounts WHERE id = $1',
        [accountId],
      );
      const created = await create({
        amount_per_payment: '50.00',
        payment_account_id: accountId,
        auto_pay: true,
      });
      const res = await request(ctx.app.getHttpServer())
        .post(`/api/v1/installments/${created.id as string}/pay`)
        .set(auth())
        .send({ payment_number: 1 })
        .expect(200);
      expect(
        (res.body as Record<string, unknown>).account_transaction_id,
      ).not.toBeNull();

      const after = await queryRows<{ current_balance: string }>(
        ctx.dataSource,
        'SELECT current_balance FROM savings_accounts WHERE id = $1',
        [accountId],
      );
      expect(Number(after[0].current_balance)).toBe(
        Number(before[0].current_balance) - 50,
      );
    });

    it('lists payments in a {items,total} envelope', async () => {
      const created = await create();
      await request(ctx.app.getHttpServer())
        .post(`/api/v1/installments/${created.id as string}/pay`)
        .set(auth())
        .send({ payment_number: 1 })
        .expect(200);
      const res = await request(ctx.app.getHttpServer())
        .get(`/api/v1/installments/${created.id as string}/payments`)
        .set(auth())
        .expect(200);
      expect(Object.keys(res.body as object).sort()).toEqual([
        'items',
        'total',
      ]);
      expect((res.body as { total: number }).total).toBe(1);
    });
  });

  describe('stats and history', () => {
    it('uses the two-decimal multipliers and an unrounded average rate', async () => {
      const user = await createExtraUser(ctx, 'inst-stats');
      await create(
        {
          amount_per_payment: '100.00',
          frequency: 'weekly',
          interest_rate: '5.00',
          category: 'Debt',
        },
        user.auth,
      );
      await create(
        {
          amount_per_payment: '10.00',
          frequency: 'monthly',
          interest_rate: '10.00',
          category: 'Debt',
        },
        user.auth,
      );

      const res = await request(ctx.app.getHttpServer())
        .get('/api/v1/installments/stats')
        .set(user.auth)
        .expect(200);
      const body = res.body as Record<string, unknown>;
      expect(body.by_frequency).toEqual({ weekly: 1, monthly: 1 });
      // 100.00 × 4.33 + 10.00 × 1
      expect(body.monthly_payment).toBe('443.0000');
      // (5.00 + 10.00) / 2 — an exact quotient, padded to the dividend's scale.
      expect(body.average_interest_rate).toBe('7.50');
      expect(body.debt_free_date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('history uses the more precise multipliers', async () => {
      const user = await createExtraUser(ctx, 'inst-history');
      await create(
        {
          amount_per_payment: '100.00',
          frequency: 'monthly',
          first_payment_date: '2026-01-01T00:00:00',
          number_of_payments: 3,
        },
        user.auth,
      );
      const res = await request(ctx.app.getHttpServer())
        .get(
          '/api/v1/installments/history?start_date=2026-01-01T00:00:00&end_date=2026-03-31T00:00:00',
        )
        .set(user.auth)
        .expect(200);
      const body = res.body as {
        history: Array<{ month: string; total: string }>;
        total_months: number;
      };
      expect(body.history.map((h) => h.month)).toEqual([
        '2026-01',
        '2026-02',
        '2026-03',
      ]);
      expect(body.history[0].total).toBe('100.00');
      expect(body.total_months).toBe(3);
    });
  });
});
