import request from 'supertest';
import {
  IncomeTestContext,
  insertSource,
  queryRows,
  setupIncomeContext,
  teardownIncomeContext,
} from './income-fixtures';

describe('Income sources (e2e, against live dev DB)', () => {
  let ctx: IncomeTestContext;
  let salaryId: string;
  let freelanceId: string;
  let otherUsersSourceId: string;

  beforeAll(async () => {
    ctx = await setupIncomeContext('sources');
    // start_date descending puts freelance (2026-02) ahead of salary (2026-01).
    salaryId = await insertSource(ctx, {
      name: 'Acme Corp Salary',
      amount: '6500.00',
      startDate: '2026-01-01 00:00:00',
      category: 'Salary',
    });
    freelanceId = await insertSource(ctx, {
      name: 'Freelance Design',
      amount: '1000.00',
      startDate: '2026-02-01 00:00:00',
      category: 'Freelance',
    });
    otherUsersSourceId = await insertSource(ctx, { userId: ctx.otherUserId });
  });

  afterAll(async () => {
    await teardownIncomeContext(ctx);
  });

  const auth = () => ({ Authorization: `Bearer ${ctx.token}` });

  it('GET /api/v1/income/sources returns the FastAPI envelope', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/v1/income/sources?page=1&page_size=2')
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
    expect(body.total).toBe(2);
    expect(body.page).toBe(1);
    expect(body.page_size).toBe(2);
    // Ordered by coalesce(date, start_date) DESC.
    expect(body.items[0].name).toBe('Freelance Design');
    expect(body.items[1].name).toBe('Acme Corp Salary');
  });

  it('serializes a listed source exactly like FastAPI does', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/v1/income/sources?page=1&page_size=1')
      .set(auth())
      .expect(200);
    const item = (res.body as { items: Array<Record<string, unknown>> })
      .items[0];

    // Decimals collapse through float() on this endpoint: "1000.00" in the DB, "1000.0" on the wire.
    expect(item.amount).toBe('1000.0');
    expect(item.monthly_equivalent).toBe('1000.0');
    // Enum: DB stores the member name, the wire carries the value.
    expect(item.frequency).toBe('monthly');
    // Naive timestamp, unshifted and with no zone suffix.
    expect(item.start_date).toBe('2026-02-01T00:00:00');
    expect(item.date).toBeNull();
    // Dead fields that must still be present.
    expect(item.target_account_name).toBeNull();
    expect(item).toHaveProperty('display_amount', '1000.0');
    expect(item).toHaveProperty('display_currency', 'USD');
    expect(item).toHaveProperty('display_monthly_equivalent', '1000.0');
  });

  it('paginates', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/v1/income/sources?page=2&page_size=1')
      .set(auth())
      .expect(200);
    const body = res.body as { items: Array<{ id: string }>; total: number };
    expect(body.total).toBe(2);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe(salaryId);
  });

  it('filters by is_active', async () => {
    await ctx.dataSource.query(
      'UPDATE income_sources SET is_active = false WHERE id = $1',
      [salaryId],
    );
    try {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/v1/income/sources?is_active=false')
        .set(auth())
        .expect(200);
      const body = res.body as { items: Array<{ id: string }>; total: number };
      expect(body.total).toBe(1);
      expect(body.items[0].id).toBe(salaryId);
    } finally {
      await ctx.dataSource.query(
        'UPDATE income_sources SET is_active = true WHERE id = $1',
        [salaryId],
      );
    }
  });

  it('rejects page=0 with a 422', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/v1/income/sources?page=0')
      .set(auth())
      .expect(422);
    expect(res.body).toHaveProperty('detail');
  });

  it('GET /api/v1/income/sources/{id} returns one source', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/v1/income/sources/${freelanceId}`)
      .set(auth())
      .expect(200);
    const body = res.body as Record<string, unknown>;
    expect(body.id).toBe(freelanceId);
    expect(body.amount).toBe('1000.0');
    expect(body.user_id).toBe(ctx.userId);
  });

  it('404s for a source owned by another user, with the FastAPI error body', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/v1/income/sources/${otherUsersSourceId}`)
      .set(auth())
      .expect(404);
    expect(res.body).toEqual({
      error: 'Income source not found',
      details: {},
      status_code: 404,
    });
  });

  it('404s for a soft-deleted source', async () => {
    const deletedId = await insertSource(ctx, { name: 'Deleted' });
    await ctx.dataSource.query(
      'UPDATE income_sources SET deleted_at = now() WHERE id = $1',
      [deletedId],
    );
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/income/sources/${deletedId}`)
      .set(auth())
      .expect(404);

    // …and it must not appear in the list or the count either.
    const res = await request(ctx.app.getHttpServer())
      .get('/api/v1/income/sources')
      .set(auth())
      .expect(200);
    expect((res.body as { total: number }).total).toBe(2);
  });

  it('422s on a malformed path UUID, matching FastAPI', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/v1/income/sources/not-a-uuid')
      .set(auth())
      .expect(422);
    const body = res.body as { detail: Array<Record<string, unknown>> };
    expect(Array.isArray(body.detail)).toBe(true);
    expect(body.detail[0].loc).toEqual(['path', 'source_id']);
  });

  // pydantic's UUID parser accepts any 8-4-4-4-12 hex, and this database contains such ids (the
  // seeded demo users are ...0000d1/d2). A version-checking validator would 422 where FastAPI 404s.
  it('accepts a non-v4 UUID in the path and answers 404, not 422', async () => {
    await request(ctx.app.getHttpServer())
      .get('/api/v1/income/sources/00000000-0000-0000-0000-0000000000d1')
      .set(auth())
      .expect(404);
  });

  it('401s without a token', async () => {
    await request(ctx.app.getHttpServer())
      .get('/api/v1/income/sources')
      .expect(401);
  });

  describe('writes', () => {
    let createdId: string;

    it('POST /api/v1/income/sources returns 201 with DB-precision decimals', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/api/v1/income/sources')
        .set(auth())
        .send({
          name: 'E2E Created',
          amount: '1000.00',
          currency: 'usd',
          frequency: 'monthly',
          start_date: '2026-03-15T00:00:00',
        })
        .expect(201);

      const body = res.body as Record<string, unknown>;
      // Not float-collapsed on this verb, unlike the GET of the very same row.
      expect(body.amount).toBe('1000.00');
      expect(body.monthly_equivalent).toBe('1000.00');
      expect(body.currency).toBe('USD'); // upper-cased by the DTO transform
      expect(body.display_amount).toBeNull();
      expect(body.display_currency).toBeNull();
      expect(body.start_date).toBe('2026-03-15T00:00:00');
      expect(body.is_active).toBe(true);
      expect(body.auto_deposit).toBe(false);
      createdId = body.id as string;
    });

    it('GET of that same row float-collapses it', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get(`/api/v1/income/sources/${createdId}`)
        .set(auth())
        .expect(200);
      expect((res.body as Record<string, unknown>).amount).toBe('1000.0');
    });

    it('discards a timezone offset on create rather than converting it', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/api/v1/income/sources')
        .set(auth())
        .send({
          name: 'E2E Offset',
          amount: '1.00',
          date: '2026-03-15T23:00:00-05:00',
          frequency: 'one_time',
        })
        .expect(201);
      // The wall clock is preserved; 23:00 stays 23:00 on the 15th.
      expect((res.body as Record<string, unknown>).date).toBe(
        '2026-03-15T23:00:00',
      );
    });

    it('422s on an amount with three decimal places', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/v1/income/sources')
        .set(auth())
        .send({ name: 'E2E Bad', amount: '10.005' })
        .expect(422);
    });

    it('PUT applies only the keys present in the body', async () => {
      const res = await request(ctx.app.getHttpServer())
        .put(`/api/v1/income/sources/${createdId}`)
        .set(auth())
        .send({ amount: '1234.56' })
        .expect(200);
      const body = res.body as Record<string, unknown>;
      expect(body.amount).toBe('1234.56');
      expect(body.name).toBe('E2E Created');
      expect(body.start_date).toBe('2026-03-15T00:00:00');
    });

    it("PUT 404s on another user's source", async () => {
      await request(ctx.app.getHttpServer())
        .put(`/api/v1/income/sources/${otherUsersSourceId}`)
        .set(auth())
        .send({ amount: '1.00' })
        .expect(404);
    });

    it('DELETE soft-deletes and returns 204 with an empty body', async () => {
      const res = await request(ctx.app.getHttpServer())
        .delete(`/api/v1/income/sources/${createdId}`)
        .set(auth())
        .expect(204);
      expect(res.body).toEqual({});

      const rows = await queryRows<{ deleted_at: string | null }>(
        ctx.dataSource,
        'SELECT deleted_at FROM income_sources WHERE id = $1',
        [createdId],
      );
      expect(rows[0].deleted_at).not.toBeNull();
    });

    it('POST /sources/batch-delete reports deleted_count and failed_ids', async () => {
      const a = await insertSource(ctx, { name: 'Batch A' });
      const b = await insertSource(ctx, { name: 'Batch B' });
      const res = await request(ctx.app.getHttpServer())
        .post('/api/v1/income/sources/batch-delete')
        .set(auth())
        .send({ source_ids: [a, b, otherUsersSourceId] })
        .expect(200);

      expect(res.body).toEqual({
        deleted_count: 2,
        failed_ids: [otherUsersSourceId],
      });
      const rows = await queryRows<{ id: string }>(
        ctx.dataSource,
        'SELECT id FROM income_sources WHERE id = $1 AND deleted_at IS NULL',
        [otherUsersSourceId],
      );
      expect(rows).toHaveLength(1); // the other user's row is untouched
    });

    it('POST /sources/batch-delete with an empty list → 422', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/v1/income/sources/batch-delete')
        .set(auth())
        .send({ source_ids: [] })
        .expect(422);
    });
  });
});
