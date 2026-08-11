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

/** Subscriptions reuse the expenses fixtures — same users, accounts and teardown ordering. */
describe('Subscriptions (e2e)', () => {
  let ctx: ExpenseTestContext;
  let accountId: string;
  let otherUsersAccountId: string;

  beforeAll(async () => {
    ctx = await setupExpenseContext('subs');
    accountId = await insertAccount(ctx, { balance: '1000.00' });
    otherUsersAccountId = await insertAccount(ctx, { userId: ctx.otherUserId });
  });

  afterAll(async () => {
    // Subscriptions and their payments cascade from the user delete; mirror expenses are removed
    // by the expenses cleanup in the shared teardown.
    await ctx.dataSource.query(
      'DELETE FROM subscription_payments WHERE user_id = ANY($1)',
      [ctx.userIds],
    );
    await ctx.dataSource.query(
      'DELETE FROM subscriptions WHERE user_id = ANY($1)',
      [ctx.userIds],
    );
    await teardownExpenseContext(ctx);
  });

  const auth = () => ({ Authorization: `Bearer ${ctx.token}` });
  const create = async (
    body: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set(auth())
      .send({
        name: `ZZ Sub ${randomUUID().slice(0, 6)}`,
        amount: '20.00',
        currency: 'USD',
        frequency: 'monthly',
        start_date: '2026-01-15T00:00:00',
        ...body,
      })
      .expect(201);
    return res.body as Record<string, unknown>;
  };

  describe('crud', () => {
    it('creates with DB-scale decimals and null display_*', async () => {
      const body = await create({ amount: '12.30' });
      expect(body.amount).toBe('12.30');
      expect(body.display_amount).toBeNull();
      expect(body.display_currency).toBeNull();
      expect(body.status).toBe('active');
      // Stored, and anchored at now — a past start date yields the first FUTURE occurrence.
      expect(body.next_payment_date).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00$/);
      expect(body.start_date).toBe('2026-01-15T00:00:00');
      expect(body.created_at).not.toMatch(/(Z|[+-]\d{2}:\d{2})$/);
    });

    it('list float-collapses the same row and fills display_*', async () => {
      const created = await create({ amount: '20.00' });
      const res = await request(ctx.app.getHttpServer())
        .get('/api/v1/subscriptions?page_size=100')
        .set(auth())
        .expect(200);
      const body = res.body as {
        items: Array<Record<string, unknown>>;
        total: number;
        page: number;
        page_size: number;
      };
      const row = body.items.find((i) => i.id === created.id)!;
      expect(row.amount).toBe('20.0'); // string, float-repr — not 20 and not "20.00"
      expect(row.display_amount).toBe('20.0');
      expect(row.display_currency).toBe('USD');
      expect(Object.keys(body).sort()).toEqual([
        'items',
        'page',
        'page_size',
        'total',
      ]);
    });

    it('filters by frequency and category', async () => {
      await create({ frequency: 'annually', category: 'ZZ-Cat' });
      const res = await request(ctx.app.getHttpServer())
        .get('/api/v1/subscriptions?frequency=annually&category=ZZ-Cat')
        .set(auth())
        .expect(200);
      const body = res.body as {
        items: Array<{ frequency: string }>;
        total: number;
      };
      expect(body.total).toBe(1);
      expect(body.items[0].frequency).toBe('annually');
    });

    it('PUT applies only present keys and returns raw scale', async () => {
      const created = await create({ amount: '10.00' });
      const res = await request(ctx.app.getHttpServer())
        .put(`/api/v1/subscriptions/${created.id as string}`)
        .set(auth())
        .send({ amount: '99.99' })
        .expect(200);
      const body = res.body as Record<string, unknown>;
      expect(body.amount).toBe('99.99');
      expect(body.name).toBe(created.name);
      expect(body.display_amount).toBeNull();
    });

    it('DELETE hard-deletes and 404s afterwards', async () => {
      const created = await create();
      await request(ctx.app.getHttpServer())
        .delete(`/api/v1/subscriptions/${created.id as string}`)
        .set(auth())
        .expect(204);
      const rows = await queryRows<{ id: string }>(
        ctx.dataSource,
        'SELECT id FROM subscriptions WHERE id = $1',
        [created.id],
      );
      expect(rows).toHaveLength(0);
      await request(ctx.app.getHttpServer())
        .get(`/api/v1/subscriptions/${created.id as string}`)
        .set(auth())
        .expect(404);
    });

    it('batch-delete reports deleted_count and failed_ids', async () => {
      const a = await create();
      const other = await createExtraUser(ctx, 'sub-other');
      const foreign = await request(ctx.app.getHttpServer())
        .post('/api/v1/subscriptions')
        .set(other.auth)
        .send({
          name: 'ZZ Foreign',
          amount: '1.00',
          frequency: 'monthly',
          start_date: '2026-01-01T00:00:00',
        })
        .expect(201);

      const res = await request(ctx.app.getHttpServer())
        .post('/api/v1/subscriptions/batch-delete')
        .set(auth())
        .send({
          ids: [a.id as string, (foreign.body as { id: string }).id],
        })
        .expect(200);
      expect(res.body).toEqual({
        deleted_count: 1,
        failed_ids: [(foreign.body as { id: string }).id],
      });
    });

    it("rejects another user's payment account", async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/api/v1/subscriptions')
        .set(auth())
        .send({
          name: 'ZZ Foreign acct',
          amount: '1.00',
          frequency: 'monthly',
          start_date: '2026-01-01T00:00:00',
          payment_account_id: otherUsersAccountId,
        })
        .expect(400);
      expect(res.body).toEqual({ detail: 'Invalid payment account' });
    });
  });

  describe('lifecycle', () => {
    it('pauses, refuses a second pause, then resumes', async () => {
      const created = await create();
      const id = created.id as string;

      const paused = await request(ctx.app.getHttpServer())
        .post(`/api/v1/subscriptions/${id}/pause`)
        .set(auth())
        .send({ resume_date: '2026-12-01T00:00:00' })
        .expect(200);
      expect((paused.body as Record<string, unknown>).status).toBe('paused');
      expect((paused.body as Record<string, unknown>).resume_date).toBe(
        '2026-12-01T00:00:00',
      );

      const again = await request(ctx.app.getHttpServer())
        .post(`/api/v1/subscriptions/${id}/pause`)
        .set(auth())
        .send({})
        .expect(400);
      expect(again.body).toEqual({ detail: 'Subscription is already paused' });

      const resumed = await request(ctx.app.getHttpServer())
        .post(`/api/v1/subscriptions/${id}/resume`)
        .set(auth())
        .expect(200);
      expect((resumed.body as Record<string, unknown>).status).toBe('active');
    });

    it('refuses to resume something that is not paused', async () => {
      const created = await create();
      const res = await request(ctx.app.getHttpServer())
        .post(`/api/v1/subscriptions/${created.id as string}/resume`)
        .set(auth())
        .expect(400);
      expect(res.body).toEqual({ detail: 'Subscription is not paused' });
    });

    it('cancels, overwriting end_date, and refuses a second cancel', async () => {
      const created = await create({ end_date: '2030-01-01T00:00:00' });
      const id = created.id as string;
      const res = await request(ctx.app.getHttpServer())
        .post(`/api/v1/subscriptions/${id}/cancel`)
        .set(auth())
        .expect(200);
      const body = res.body as Record<string, unknown>;
      expect(body.status).toBe('cancelled');
      // The user-supplied end date is destroyed — FastAPI's behaviour.
      expect(body.end_date).not.toBe('2030-01-01T00:00:00');

      const again = await request(ctx.app.getHttpServer())
        .post(`/api/v1/subscriptions/${id}/cancel`)
        .set(auth())
        .expect(400);
      expect(again.body).toEqual({
        detail: 'Subscription is already cancelled',
      });
    });
  });

  describe('pay', () => {
    it('records a payment, writes the mirror expense, and advances the due date', async () => {
      const created = await create({
        amount: '15.99',
        category: 'Streaming',
        start_date: '2026-01-15T00:00:00',
      });
      const id = created.id as string;

      const res = await request(ctx.app.getHttpServer())
        .post(`/api/v1/subscriptions/${id}/pay`)
        .set(auth())
        .send({ payment_date: '2026-08-11T10:00:00', notes: 'manual' })
        .expect(200);

      const body = res.body as Record<string, unknown>;
      expect(body.amount).toBe('15.99');
      expect(body.status).toBe('completed');
      expect(body.payment_date).toBe('2026-08-11T10:00:00');
      // period_end is one period on, minus a day, at the same time of day.
      expect(body.period_start).toBe('2026-08-11T10:00:00');
      expect(body.period_end).toBe('2026-09-10T10:00:00');
      // No account linked, so no withdrawal happened.
      expect(body.account_transaction_id).toBeNull();

      const mirror = await queryRows<{
        name: string;
        frequency: string;
        status: string;
        category: string;
        amount: string;
      }>(
        ctx.dataSource,
        `SELECT name, frequency::text AS frequency, status, category, amount
         FROM expenses WHERE id = $1`,
        [body.expense_id],
      );
      expect(mirror[0]).toEqual({
        name: `${created.name as string} - Subscription`,
        frequency: 'ONE_TIME',
        status: 'paid',
        category: 'Streaming',
        amount: '15.99',
      });

      const after = await request(ctx.app.getHttpServer())
        .get(`/api/v1/subscriptions/${id}`)
        .set(auth())
        .expect(200);
      expect((after.body as Record<string, unknown>).last_payment_date).toBe(
        '2026-08-11T10:00:00',
      );
    });

    it('withdraws from the account when auto_pay is on', async () => {
      const before = await queryRows<{ current_balance: string }>(
        ctx.dataSource,
        'SELECT current_balance FROM savings_accounts WHERE id = $1',
        [accountId],
      );
      const created = await create({
        amount: '25.00',
        payment_account_id: accountId,
        auto_pay: true,
      });

      const res = await request(ctx.app.getHttpServer())
        .post(`/api/v1/subscriptions/${created.id as string}/pay`)
        .set(auth())
        .send({})
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
        Number(before[0].current_balance) - 25,
      );
    });

    it('ignores an amount sent in the body', async () => {
      const created = await create({ amount: '7.00' });
      const res = await request(ctx.app.getHttpServer())
        .post(`/api/v1/subscriptions/${created.id as string}/pay`)
        .set(auth())
        .send({ amount: '999.00' })
        .expect(200);
      // The subscription's own amount wins — the request field is accepted and dropped.
      expect((res.body as Record<string, unknown>).amount).toBe('7.0');
    });

    it('lists payments in a {items,total} envelope with no page echo', async () => {
      const created = await create({ amount: '3.00' });
      await request(ctx.app.getHttpServer())
        .post(`/api/v1/subscriptions/${created.id as string}/pay`)
        .set(auth())
        .send({})
        .expect(200);
      const res = await request(ctx.app.getHttpServer())
        .get(`/api/v1/subscriptions/${created.id as string}/payments`)
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
    it('emits the float-derived multiplier digits', async () => {
      const user = await createExtraUser(ctx, 'sub-stats');
      await request(ctx.app.getHttpServer())
        .post('/api/v1/subscriptions')
        .set(user.auth)
        .send({
          name: 'ZZ Quarterly',
          amount: '30.00',
          frequency: 'quarterly',
          start_date: '2026-01-01T00:00:00',
          category: 'Software',
        })
        .expect(201);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/v1/subscriptions/stats')
        .set(user.auth)
        .expect(200);
      const body = res.body as Record<string, unknown>;
      // 30.00 × Decimal(str(1/3)) — the constant comes from binary float division in Python, and
      // the product keeps its full 18-decimal scale. Value taken from CPython.
      expect(body.monthly_cost).toBe('9.999999999999999000');
      // A separate integer table, so this is not monthly_cost × 12.
      expect(body.total_annual_cost).toBe('120.00');
      expect(body.by_frequency).toEqual({ quarterly: 1 });
      expect((body.by_category as Record<string, string>).Software).toBe(
        '9.999999999999999000',
      );
    });

    it('history spreads the monthly equivalent across months', async () => {
      const user = await createExtraUser(ctx, 'sub-history');
      await request(ctx.app.getHttpServer())
        .post('/api/v1/subscriptions')
        .set(user.auth)
        .send({
          name: 'ZZ Monthly',
          amount: '10.00',
          frequency: 'monthly',
          start_date: '2026-01-01T00:00:00',
          end_date: '2026-03-31T00:00:00',
        })
        .expect(201);

      const res = await request(ctx.app.getHttpServer())
        .get(
          '/api/v1/subscriptions/history?start_date=2026-01-01T00:00:00&end_date=2026-03-31T00:00:00',
        )
        .set(user.auth)
        .expect(200);
      const body = res.body as {
        history: Array<{ month: string; total: string; count: number }>;
        total_months: number;
        overall_average: string;
      };
      expect(body.history.map((h) => h.month)).toEqual([
        '2026-01',
        '2026-02',
        '2026-03',
      ]);
      expect(body.history[0].total).toBe('10.00');
      expect(body.total_months).toBe(3);
      expect(body.overall_average).toBe('10.00');
    });
  });
});
