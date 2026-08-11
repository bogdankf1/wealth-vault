import request from 'supertest';
import {
  ExpenseTestContext,
  insertAccount,
  insertExpense,
  queryRows,
  setupExpenseContext,
  teardownExpenseContext,
} from './expenses-fixtures';

describe('Expenses CRUD (e2e)', () => {
  let ctx: ExpenseTestContext;
  let accountId: string;
  let otherUsersAccountId: string;
  let otherUsersExpenseId: string;

  beforeAll(async () => {
    ctx = await setupExpenseContext('crud');
    accountId = await insertAccount(ctx);
    otherUsersAccountId = await insertAccount(ctx, { userId: ctx.otherUserId });
    otherUsersExpenseId = await insertExpense(ctx, { userId: ctx.otherUserId });
  });

  afterAll(async () => {
    await teardownExpenseContext(ctx);
  });

  const auth = () => ({ Authorization: `Bearer ${ctx.token}` });

  describe('list', () => {
    it('renders money as JSON numbers and fills payment_account_name', async () => {
      const id = await insertExpense(ctx, {
        name: 'Rent',
        amount: '1200.00',
        paymentAccountId: accountId,
      });
      const res = await request(ctx.app.getHttpServer())
        .get('/api/v1/expenses?page=1&page_size=50')
        .set(auth())
        .expect(200);

      const body = res.body as {
        items: Array<Record<string, unknown>>;
        total: number;
        page: number;
        page_size: number;
      };
      expect(Object.keys(body).sort()).toEqual([
        'items',
        'page',
        'page_size',
        'total',
      ]);
      const row = body.items.find((i) => i.id === id)!;
      expect(row.amount).toBe(1200); // number, not "1200.00"
      expect(typeof row.amount).toBe('number');
      expect(row.frequency).toBe('monthly');
      expect(row.payment_account_name).toBe('E2E Account');
      expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(row.created_at).not.toMatch(/Z$/); // naive column — no zone suffix
    });

    it('excludes soft-deleted rows', async () => {
      const id = await insertExpense(ctx, {
        name: 'Reversed',
        deletedAt: '2026-01-01T00:00:00',
      });
      const res = await request(ctx.app.getHttpServer())
        .get('/api/v1/expenses?page_size=100')
        .set(auth())
        .expect(200);
      const ids = (res.body as { items: Array<{ id: string }> }).items.map(
        (i) => i.id,
      );
      expect(ids).not.toContain(id);
    });

    // FastAPI's count query mirrors only `category`, so a status-filtered page reports a total
    // larger than its own contents. Faithfully wrong.
    it('reports a total that ignores the is_active and status filters', async () => {
      await insertExpense(ctx, { name: 'Paid one', status: 'paid' });
      const res = await request(ctx.app.getHttpServer())
        .get('/api/v1/expenses?status=paid')
        .set(auth())
        .expect(200);
      const body = res.body as { items: unknown[]; total: number };
      expect(body.items).toHaveLength(1);
      expect(body.total).toBeGreaterThan(1);
    });

    it('filters by category, and the total follows that one', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/v1/expenses?category=Nothing')
        .set(auth())
        .expect(200);
      expect(res.body).toMatchObject({ items: [], total: 0 });
    });

    it("never returns another user's rows", async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/v1/expenses?page_size=100')
        .set(auth())
        .expect(200);
      const ids = (res.body as { items: Array<{ id: string }> }).items.map(
        (i) => i.id,
      );
      expect(ids).not.toContain(otherUsersExpenseId);
    });
  });

  describe('create', () => {
    it('returns 201 with Decimal strings and null display_*', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/api/v1/expenses')
        .set(auth())
        .send({
          name: 'ZZ Created',
          amount: '123.45',
          currency: 'usd',
          frequency: 'monthly',
          start_date: '2026-03-15T00:00:00',
        })
        .expect(201);

      const body = res.body as Record<string, unknown>;
      expect(body.amount).toBe('123.45'); // string here, number on the list
      expect(body.currency).toBe('USD');
      expect(body.monthly_equivalent).toBe('123.45');
      expect(body.display_amount).toBeNull();
      expect(body.display_currency).toBeNull();
      expect(body.payment_account_name).toBeNull();
      expect(body.status).toBe('pending');
      expect(body.start_date).toBe('2026-03-15T00:00:00');
    });

    it('stores a one-time expense with a zero equivalent, which the list then nulls', async () => {
      const created = await request(ctx.app.getHttpServer())
        .post('/api/v1/expenses')
        .set(auth())
        .send({
          name: 'ZZ OneTime',
          amount: '50.00',
          frequency: 'one_time',
          date: '2026-03-15T00:00:00',
        })
        .expect(201);
      expect((created.body as Record<string, unknown>).monthly_equivalent).toBe(
        '0.00',
      );

      const list = await request(ctx.app.getHttpServer())
        .get('/api/v1/expenses?page_size=100')
        .set(auth())
        .expect(200);
      const row = (
        list.body as { items: Array<Record<string, unknown>> }
      ).items.find((i) => i.id === (created.body as { id: string }).id)!;
      expect(row.monthly_equivalent).toBeNull();
    });

    it('422s on a zero amount (gt=0, unlike income)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/v1/expenses')
        .set(auth())
        .send({ name: 'ZZ Zero', amount: '0.00', frequency: 'monthly' })
        .expect(422);
    });

    it('422s when frequency is missing (required here)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/v1/expenses')
        .set(auth())
        .send({ name: 'ZZ NoFreq', amount: '10.00' })
        .expect(422);
    });

    // Closes the leak: FastAPI stores a foreign account id and later renders its name.
    it("rejects another user's payment account", async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/api/v1/expenses')
        .set(auth())
        .send({
          name: 'ZZ Foreign',
          amount: '10.00',
          frequency: 'monthly',
          payment_account_id: otherUsersAccountId,
        })
        .expect(400);
      expect(res.body).toEqual({ detail: 'Invalid payment account' });
    });
  });

  describe('detail, update, delete', () => {
    let id: string;

    beforeAll(async () => {
      id = await insertExpense(ctx, {
        name: 'Detail target',
        amount: '200.00',
        paymentAccountId: accountId,
      });
    });

    it('detail returns strings and a null payment_account_name', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get(`/api/v1/expenses/${id}`)
        .set(auth())
        .expect(200);
      const body = res.body as Record<string, unknown>;
      expect(body.amount).toBe('200.00');
      // Populated on the list, never here — the router calls the un-enriched service function.
      expect(body.payment_account_name).toBeNull();
      expect(body.display_amount).toBe('200.00');
    });

    it("404s on another user's expense", async () => {
      const res = await request(ctx.app.getHttpServer())
        .get(`/api/v1/expenses/${otherUsersExpenseId}`)
        .set(auth())
        .expect(404);
      expect(res.body).toEqual({ detail: 'Expense not found' });
    });

    it('PUT applies only present keys and returns STALE display values', async () => {
      const res = await request(ctx.app.getHttpServer())
        .put(`/api/v1/expenses/${id}`)
        .set(auth())
        .send({ amount: '400.00' })
        .expect(200);
      const body = res.body as Record<string, unknown>;
      expect(body.amount).toBe('400.00');
      expect(body.name).toBe('Detail target');
      expect(body.monthly_equivalent).toBe('400.00'); // recomputed: amount was in the payload
      // FastAPI reads display_* before applying the patch and never refreshes them.
      expect(body.display_amount).toBe('200.00');
    });

    it('PUT leaves monthly_equivalent alone when neither amount nor frequency is sent', async () => {
      const res = await request(ctx.app.getHttpServer())
        .put(`/api/v1/expenses/${id}`)
        .set(auth())
        .send({ category: 'Utilities' })
        .expect(200);
      expect((res.body as Record<string, unknown>).monthly_equivalent).toBe(
        '400.00',
      );
    });

    it('DELETE hard-deletes the row', async () => {
      await request(ctx.app.getHttpServer())
        .delete(`/api/v1/expenses/${id}`)
        .set(auth())
        .expect(204);
      const rows = await queryRows<{ id: string }>(
        ctx.dataSource,
        'SELECT id FROM expenses WHERE id = $1',
        [id],
      );
      expect(rows).toHaveLength(0); // gone, not flagged
    });
  });

  describe('batch', () => {
    // batch-create gates on `batch_operations`, and NO tier in this database grants that feature —
    // not even wealth, the top tier. So the endpoint is a 403 for every real user, on FastAPI as
    // much as here. The gate is reproduced faithfully; the handler below it is exercised by the
    // unit-level test of ExpensesCrudService.batchCreate.
    it('batch-create 403s because no tier grants batch_operations', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/api/v1/expenses/batch-create')
        .set(auth())
        .send({
          expenses: [
            { name: 'ZZ Batch A', amount: '10.00', frequency: 'monthly' },
          ],
        })
        .expect(403);
      expect(res.body).toEqual({
        error: 'This feature requires a higher tier subscription',
        details: { current_tier: 'wealth', required_tier: 'growth' },
        status_code: 403,
      });
    });

    it('batch-delete returns deleted_count and failed_ids', async () => {
      const a = await insertExpense(ctx, { name: 'ZZ Del A' });
      const res = await request(ctx.app.getHttpServer())
        .post('/api/v1/expenses/batch-delete')
        .set(auth())
        .send({ expense_ids: [a, otherUsersExpenseId] })
        .expect(200);
      expect(res.body).toEqual({
        deleted_count: 1,
        failed_ids: [otherUsersExpenseId],
      });
    });

    it('batch-delete with an empty list → 422', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/v1/expenses/batch-delete')
        .set(auth())
        .send({ expense_ids: [] })
        .expect(422);
    });
  });
});
