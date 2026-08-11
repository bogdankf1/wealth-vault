import request from 'supertest';
import {
  Slice3Context,
  createExtraUser,
  insertAccount,
  insertIncomeSource,
  insertTax,
  queryRows,
  setupSlice3Context,
  teardownSlice3Context,
} from './slice3-fixtures';

/**
 * supertest types `res.body` as `any`, which the lint rules reject on every access. One narrow cast
 * per response keeps the assertions readable and the types honest: ids and totals are known, the
 * rest is `unknown` and only ever reaches expect().
 */
interface Body {
  id: string;
  items: Body[];
  total: number;
  [key: string]: unknown;
}

const bodyOf = (res: request.Response): Body => res.body as Body;

const rowsOf = (res: request.Response): Body[] => res.body as Body[];

describe('Taxes (e2e)', () => {
  let ctx: Slice3Context;

  beforeAll(async () => {
    ctx = await setupSlice3Context('taxes');
  }, 60_000);

  afterAll(async () => {
    await teardownSlice3Context(ctx);
  });

  describe('CRUD', () => {
    it('creates a tax and reads it back with the same body shape', async () => {
      const created = await request(ctx.app.getHttpServer())
        .post('/api/v1/taxes')
        .set(ctx.auth)
        .send({
          name: 'Federal Income Tax',
          tax_type: 'fixed',
          frequency: 'annually',
          fixed_amount: '1200.00',
          currency: 'USD',
        })
        .expect(201);

      expect(bodyOf(created)).toMatchObject({
        name: 'Federal Income Tax',
        tax_type: 'fixed',
        frequency: 'annually',
        fixed_amount: '1200.00',
        is_active: true,
        auto_pay: false,
        calculated_amount: '1200.00',
        display_fixed_amount: '1200.00',
        display_currency: 'USD',
        is_paid_current_period: false,
      });

      const fetched = await request(ctx.app.getHttpServer())
        .get(`/api/v1/taxes/${bodyOf(created).id}`)
        .set(ctx.auth)
        .expect(200);
      expect(bodyOf(fetched)).toEqual(bodyOf(created));
    });

    it('emits keys in pydantic field order', async () => {
      const id = await insertTax(ctx, { name: 'Order check' });
      const res0 = await request(ctx.app.getHttpServer())
        .get(`/api/v1/taxes/${id}`)
        .set(ctx.auth)
        .expect(200);
      const body = bodyOf(res0);

      // Base-class fields first, then the subclass fields, then the enrichment block — the order
      // pydantic serializes TaxResponse in, and therefore the order the bytes must appear in.
      expect(Object.keys(body)).toEqual([
        'name',
        'description',
        'tax_type',
        'frequency',
        'fixed_amount',
        'currency',
        'percentage',
        'income_source_id',
        'payment_account_id',
        'auto_pay',
        'next_payment_date',
        'is_active',
        'notes',
        'id',
        'user_id',
        'created_at',
        'updated_at',
        'display_fixed_amount',
        'display_currency',
        'calculated_amount',
        'income_source',
        'payment_account',
        'is_paid_current_period',
        'current_period_start',
        'current_period_end',
        'last_payment_date',
        'last_payment_amount',
      ]);
    });

    it('derives next_payment_date only when auto_pay is set without one', async () => {
      const withAuto = await request(ctx.app.getHttpServer())
        .post('/api/v1/taxes')
        .set(ctx.auth)
        .send({
          name: 'Auto',
          tax_type: 'fixed',
          fixed_amount: '10.00',
          auto_pay: true,
        })
        .expect(201);
      expect(bodyOf(withAuto).next_payment_date).not.toBeNull();

      const withoutAuto = await request(ctx.app.getHttpServer())
        .post('/api/v1/taxes')
        .set(ctx.auth)
        .send({ name: 'Manual', tax_type: 'fixed', fixed_amount: '10.00' })
        .expect(201);
      expect(bodyOf(withoutAuto).next_payment_date).toBeNull();
    });

    it('filters by is_active and income_source_id', async () => {
      const sourceId = await insertIncomeSource(ctx, { name: 'Filter source' });
      await insertTax(ctx, { name: 'Linked', incomeSourceId: sourceId });
      await insertTax(ctx, { name: 'Inactive', isActive: false });

      const active = await request(ctx.app.getHttpServer())
        .get('/api/v1/taxes?is_active=false')
        .set(ctx.auth)
        .expect(200);
      expect(bodyOf(active).items.every((t) => t.is_active === false)).toBe(
        true,
      );

      const linked = await request(ctx.app.getHttpServer())
        .get(`/api/v1/taxes?income_source_id=${sourceId}`)
        .set(ctx.auth)
        .expect(200);
      expect(bodyOf(linked).items).toHaveLength(1);
      expect(bodyOf(linked).items[0].name).toBe('Linked');
      expect(bodyOf(linked).items[0].income_source).toMatchObject({
        id: sourceId,
        name: 'Filter source',
        frequency: 'monthly',
      });
    });

    it('soft-deletes: the row survives but stops being visible', async () => {
      const id = await insertTax(ctx, { name: 'To delete' });
      await request(ctx.app.getHttpServer())
        .delete(`/api/v1/taxes/${id}`)
        .set(ctx.auth)
        .expect(204);

      await request(ctx.app.getHttpServer())
        .get(`/api/v1/taxes/${id}`)
        .set(ctx.auth)
        .expect(404);

      const rows = await queryRows<{ deleted_at: string | null }>(
        ctx.dataSource,
        'SELECT deleted_at FROM taxes WHERE id = $1',
        [id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].deleted_at).not.toBeNull();
    });

    it('reports unknown ids in failed_ids rather than failing the batch', async () => {
      const keep = await insertTax(ctx, { name: 'Batch keep' });
      const missing = '00000000-0000-0000-0000-000000000999';

      const res1 = await request(ctx.app.getHttpServer())
        .post('/api/v1/taxes/batch-delete')
        .set(ctx.auth)
        .send({ ids: [keep, missing] })
        .expect(201);
      const body = bodyOf(res1);

      expect(body).toEqual({ deleted_count: 1, failed_ids: [missing] });
    });
  });

  describe('feature gating', () => {
    it('403s a starter-tier user on everything except batch-delete', async () => {
      const starter = await createExtraUser(ctx, 'starter', 'starter');

      await request(ctx.app.getHttpServer())
        .get('/api/v1/taxes')
        .set(starter.auth)
        .expect(403);

      // FastAPI leaves require_feature off this one handler (router.py:144), so it answers even
      // though tax_tracking is a Wealth-only feature. Replicated deliberately.
      await request(ctx.app.getHttpServer())
        .post('/api/v1/taxes/batch-delete')
        .set(starter.auth)
        .send({ ids: ['00000000-0000-0000-0000-000000000999'] })
        .expect(201);
    });
  });

  describe('cross-tenant isolation', () => {
    it('refuses to link another user’s income source or account', async () => {
      const otherSource = await insertIncomeSource(ctx, {
        userId: ctx.otherUserId,
        name: 'Their salary',
      });
      const otherAccount = await insertAccount(ctx, {
        userId: ctx.otherUserId,
        name: 'Their account',
      });

      await request(ctx.app.getHttpServer())
        .post('/api/v1/taxes')
        .set(ctx.auth)
        .send({
          name: 'Leaky',
          tax_type: 'fixed',
          fixed_amount: '10.00',
          income_source_id: otherSource,
        })
        .expect(404);

      await request(ctx.app.getHttpServer())
        .post('/api/v1/taxes')
        .set(ctx.auth)
        .send({
          name: 'Leaky',
          tax_type: 'fixed',
          fixed_amount: '10.00',
          payment_account_id: otherAccount,
        })
        .expect(404);
    });

    it('never enriches with another user’s linked rows', async () => {
      const otherSource = await insertIncomeSource(ctx, {
        userId: ctx.otherUserId,
        name: 'Their salary',
      });
      // Written straight to the DB, bypassing the write-side guard, to prove the READ is scoped too.
      const id = await insertTax(ctx, {
        name: 'Pre-existing leak',
        incomeSourceId: otherSource,
      });

      const res2 = await request(ctx.app.getHttpServer())
        .get(`/api/v1/taxes/${id}`)
        .set(ctx.auth)
        .expect(200);
      const body = bodyOf(res2);
      expect(body.income_source).toBeNull();
    });

    it('404s on another user’s tax', async () => {
      const id = await insertTax(ctx, { userId: ctx.otherUserId });
      await request(ctx.app.getHttpServer())
        .get(`/api/v1/taxes/${id}`)
        .set(ctx.auth)
        .expect(404);
    });
  });

  describe('percentage taxes', () => {
    it('computes calculated_amount from monthly income with the taxes multiplier table', async () => {
      const user = await createExtraUser(ctx, 'pct');
      await ctx.dataSource.query(
        `INSERT INTO income_sources
           (id, user_id, name, amount, currency, frequency, is_active, auto_deposit,
            created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'Annual', '12000.00', 'USD', 'ANNUALLY', true, false, now(), now())`,
        [user.userId],
      );

      const res3 = await request(ctx.app.getHttpServer())
        .post('/api/v1/taxes')
        .set(user.auth)
        .send({
          name: 'Flat rate',
          tax_type: 'percentage',
          percentage: '10.00',
        })
        .expect(201);
      const body = bodyOf(res3);

      // 12000.00 / 12 = 1000.00 (taxes DIVIDES for annual income; the income module would have
      // multiplied by 0.083 and produced 996.000). 1000.00 * 10.00 / 100 = 100.000000.
      expect(body.calculated_amount).toBe('100.0000');
      expect(body.display_fixed_amount).toBeNull();
      expect(body.display_currency).toBe('USD');
    });
  });

  describe('payments', () => {
    it('records a payment and lists it under both payment routes', async () => {
      const taxId = await insertTax(ctx, { name: 'Payable' });

      const created = await request(ctx.app.getHttpServer())
        .post('/api/v1/taxes/payments')
        .set(ctx.auth)
        .send({
          tax_id: taxId,
          amount: '250.00',
          currency: 'USD',
          payment_date: '2026-03-01T00:00:00',
        })
        .expect(201);

      expect(Object.keys(bodyOf(created))).toEqual([
        'id',
        'tax_id',
        'user_id',
        'amount',
        'currency',
        'payment_date',
        'period_start',
        'period_end',
        'account_transaction_id',
        'status',
        'notes',
        'created_at',
        'updated_at',
      ]);

      const viaFlat = await request(ctx.app.getHttpServer())
        .get(`/api/v1/taxes/payments?tax_id=${taxId}`)
        .set(ctx.auth)
        .expect(200);
      expect(bodyOf(viaFlat).total).toBe(1);

      const viaNested = await request(ctx.app.getHttpServer())
        .get(`/api/v1/taxes/${taxId}/payments`)
        .set(ctx.auth)
        .expect(200);
      expect(bodyOf(viaNested).items[0].id).toBe(bodyOf(created).id);

      await request(ctx.app.getHttpServer())
        .delete(`/api/v1/taxes/payments/${bodyOf(created).id}`)
        .set(ctx.auth)
        .expect(204);
    });

    it('404s when the payment references an unknown tax', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/v1/taxes/payments')
        .set(ctx.auth)
        .send({
          tax_id: '00000000-0000-0000-0000-000000000999',
          amount: '10.00',
          payment_date: '2026-03-01T00:00:00',
        })
        .expect(404);
    });

    it('marks the current period paid once a payment lands inside it', async () => {
      const taxId = await insertTax(ctx, {
        name: 'Monthly',
        frequency: 'monthly',
      });
      const today = new Date().toISOString().slice(0, 10);

      await request(ctx.app.getHttpServer())
        .post('/api/v1/taxes/payments')
        .set(ctx.auth)
        .send({
          tax_id: taxId,
          amount: '5.00',
          payment_date: `${today}T12:00:00`,
        })
        .expect(201);

      const res4 = await request(ctx.app.getHttpServer())
        .get(`/api/v1/taxes/${taxId}`)
        .set(ctx.auth)
        .expect(200);
      const body = bodyOf(res4);
      expect(body.is_paid_current_period).toBe(true);
      expect(body.last_payment_amount).toBe('5.00');
    });
  });

  describe('POST /:id/pay', () => {
    it('withdraws from the account WITHOUT writing a balance-history row', async () => {
      const accountId = await insertAccount(ctx, { balance: '900.00' });
      const taxId = await insertTax(ctx, {
        name: 'Payable via account',
        fixedAmount: '200.00',
        paymentAccountId: accountId,
      });

      const res5 = await request(ctx.app.getHttpServer())
        .post(`/api/v1/taxes/${taxId}/pay`)
        .set(ctx.auth)
        .send({})
        .expect(201);
      const body = bodyOf(res5);

      expect(body.message).toBe('Tax payment processed successfully');
      expect((body.payment as Body).amount).toBe('200.00');
      expect(body.transaction_id).not.toBeNull();

      const [account] = await queryRows<{ current_balance: string }>(
        ctx.dataSource,
        'SELECT current_balance FROM savings_accounts WHERE id = $1',
        [accountId],
      );
      expect(account.current_balance).toBe('700.00');

      // The whole point of not reusing AccountTransactionService: FastAPI's inline path writes no
      // history row, and neither may this one.
      const history = await queryRows(
        ctx.dataSource,
        'SELECT id FROM balance_history WHERE account_id = $1',
        [accountId],
      );
      expect(history).toHaveLength(0);

      const [txn] = await queryRows<{
        source_type: string | null;
        posted_date: string | null;
        category: string;
      }>(
        ctx.dataSource,
        'SELECT source_type, posted_date, category FROM account_transactions WHERE id = $1',
        [body.transaction_id],
      );
      expect(txn.source_type).toBeNull();
      expect(txn.posted_date).toBeNull();
      expect(txn.category).toBe('tax');
    });

    it('answers 400 with a structured INSUFFICIENT_FUNDS detail', async () => {
      const accountId = await insertAccount(ctx, { balance: '5.00' });
      const taxId = await insertTax(ctx, {
        name: 'Too expensive',
        fixedAmount: '900.00',
        paymentAccountId: accountId,
      });

      const res6 = await request(ctx.app.getHttpServer())
        .post(`/api/v1/taxes/${taxId}/pay`)
        .set(ctx.auth)
        .send({})
        .expect(400);
      const body = bodyOf(res6);

      expect(body.detail).toEqual({
        message: 'Insufficient funds',
        error_code: 'INSUFFICIENT_FUNDS',
        account_name: 'Slice3 Account',
        current_balance: 5,
        required_amount: 900,
        currency: 'USD',
      });
    });

    it('400s when no payment account is available', async () => {
      const taxId = await insertTax(ctx, { name: 'No account' });
      await request(ctx.app.getHttpServer())
        .post(`/api/v1/taxes/${taxId}/pay`)
        .set(ctx.auth)
        .send({})
        .expect(400);
    });

    it('advances next_payment_date only when auto_pay is on', async () => {
      const accountId = await insertAccount(ctx, { balance: '900.00' });
      const taxId = await insertTax(ctx, {
        name: 'Auto payer',
        fixedAmount: '10.00',
        frequency: 'monthly',
        paymentAccountId: accountId,
        autoPay: true,
      });

      await request(ctx.app.getHttpServer())
        .post(`/api/v1/taxes/${taxId}/pay`)
        .set(ctx.auth)
        .send({})
        .expect(201);

      const [row] = await queryRows<{ next_payment_date: string | null }>(
        ctx.dataSource,
        'SELECT next_payment_date FROM taxes WHERE id = $1',
        [taxId],
      );
      expect(row.next_payment_date).not.toBeNull();
    });
  });

  describe('stats and summaries', () => {
    it('totals only active taxes, split by type', async () => {
      const user = await createExtraUser(ctx, 'stats');
      await insertTax(ctx, { userId: user.userId, fixedAmount: '100.00' });
      await insertTax(ctx, { userId: user.userId, fixedAmount: '50.00' });
      await insertTax(ctx, {
        userId: user.userId,
        fixedAmount: '999.00',
        isActive: false,
      });

      const res7 = await request(ctx.app.getHttpServer())
        .get('/api/v1/taxes/stats')
        .set(user.auth)
        .expect(200);
      const body = bodyOf(res7);

      expect(body).toEqual({
        total_taxes: 2,
        // FastAPI counts the same already-filtered list twice, so these always agree.
        active_taxes: 2,
        total_tax_amount: '150.00',
        total_fixed_taxes: '150.00',
        total_percentage_taxes: '0',
        currency: 'USD',
      });
    });

    it('serves income-summary, which FastAPI shadows behind GET /{tax_id}', async () => {
      const user = await createExtraUser(ctx, 'summary');
      await ctx.dataSource.query(
        `INSERT INTO income_sources
           (id, user_id, name, amount, currency, frequency, is_active, auto_deposit,
            created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'Wages', '2000.00', 'USD', 'MONTHLY', true, false, now(), now())`,
        [user.userId],
      );
      await insertTax(ctx, {
        userId: user.userId,
        name: 'Global 10%',
        taxType: 'percentage',
        percentage: '10.00',
      });

      const res8 = await request(ctx.app.getHttpServer())
        .get('/api/v1/taxes/income-summary')
        .set(user.auth)
        .expect(200);
      const rows = rowsOf(res8);

      expect(rows).toHaveLength(1);
      // Built with float() in FastAPI, so these are JSON numbers rather than decimal strings —
      // the only endpoint in the module that departs from strings.
      expect(rows[0]).toMatchObject({
        income_source_name: 'Wages',
        monthly_income: 2000,
        total_tax: 200,
        net_income: 1800,
        currency: 'USD',
      });
      expect((rows[0].taxes as Body[])[0]).toMatchObject({
        tax_name: 'Global 10%',
        percentage: 10,
        amount: 200,
        is_global: true,
      });
    });
  });

  describe('POST /process-due-payments', () => {
    it('charges due taxes, skips paid ones, and always reports auto_paid as 0', async () => {
      const user = await createExtraUser(ctx, 'due');
      const accountId = await insertAccount(ctx, {
        userId: user.userId,
        balance: '500.00',
      });
      await insertTax(ctx, {
        userId: user.userId,
        name: 'Due now',
        frequency: 'monthly',
        fixedAmount: '75.00',
        paymentAccountId: accountId,
      });

      const res9 = await request(ctx.app.getHttpServer())
        .post('/api/v1/taxes/process-due-payments')
        .set(user.auth)
        .send({})
        .expect(201);
      const body = bodyOf(res9);

      expect(body).toMatchObject({
        status: 'completed',
        due_count: 1,
        processed: 1,
        // Declared and returned but never incremented anywhere in FastAPI.
        auto_paid: 0,
        failed_payments: [],
        errors: [],
      });

      // Second run: the tax is now paid for the period, so nothing is due.
      const second = await request(ctx.app.getHttpServer())
        .post('/api/v1/taxes/process-due-payments')
        .set(user.auth)
        .send({})
        .expect(201);
      expect(bodyOf(second).due_count).toBe(0);
      expect(bodyOf(second).processed).toBe(0);
    });

    it('reports an underfunded tax under failed_payments, not errors', async () => {
      const user = await createExtraUser(ctx, 'due-broke');
      const accountId = await insertAccount(ctx, {
        userId: user.userId,
        balance: '1.00',
      });
      await insertTax(ctx, {
        userId: user.userId,
        name: 'Unaffordable',
        frequency: 'monthly',
        fixedAmount: '75.00',
        paymentAccountId: accountId,
      });

      const res10 = await request(ctx.app.getHttpServer())
        .post('/api/v1/taxes/process-due-payments')
        .set(user.auth)
        .send({})
        .expect(201);
      const body = bodyOf(res10);

      expect(body.processed).toBe(0);
      const failed = body.failed_payments as Body[];
      expect(failed).toHaveLength(1);
      expect(failed[0]).toMatchObject({
        tax_name: 'Unaffordable',
        reason: 'Insufficient funds in payment account',
        amount: '75.00',
        currency: 'USD',
      });
      expect(body.errors).toEqual([]);
    });
  });
});
