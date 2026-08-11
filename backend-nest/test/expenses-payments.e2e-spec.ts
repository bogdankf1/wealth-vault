import request from 'supertest';
import {
  ExpenseTestContext,
  insertAccount,
  insertExpense,
  queryRows,
  setupExpenseContext,
  teardownExpenseContext,
} from './expenses-fixtures';

describe('Expense payments (e2e)', () => {
  let ctx: ExpenseTestContext;
  let accountId: string;
  let otherUsersAccountId: string;

  beforeAll(async () => {
    ctx = await setupExpenseContext('pay');
    accountId = await insertAccount(ctx, { balance: '1000.00' });
    otherUsersAccountId = await insertAccount(ctx, { userId: ctx.otherUserId });
  });

  afterAll(async () => {
    await teardownExpenseContext(ctx);
  });

  const auth = () => ({ Authorization: `Bearer ${ctx.token}` });
  const balanceOf = async (id: string): Promise<string> => {
    const rows = await queryRows<{ current_balance: string }>(
      ctx.dataSource,
      'SELECT current_balance FROM savings_accounts WHERE id = $1',
      [id],
    );
    return rows[0].current_balance;
  };

  describe('pay', () => {
    it('withdraws from the account and marks the expense paid', async () => {
      const before = await balanceOf(accountId);
      const id = await insertExpense(ctx, {
        name: 'Rent',
        amount: '250.00',
        paymentAccountId: accountId,
      });

      const res = await request(ctx.app.getHttpServer())
        .post(`/api/v1/expenses/${id}/pay`)
        .set(auth())
        .send({ payment_method: 'card' })
        .expect(200);

      const body = res.body as Record<string, unknown>;
      expect(body.expense_id).toBe(id);
      expect(body.paid_amount).toBe('250.00');
      expect(body.status).toBe('paid');
      expect(body.message).toBe(
        'Expense paid successfully and deducted from account',
      );
      // paid_date is a naive timestamp — no Z, no offset.
      expect(body.paid_date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(body.paid_date).not.toMatch(/(Z|[+-]\d{2}:\d{2})$/);

      expect(await balanceOf(accountId)).toBe('750.00');

      const ledger = await queryRows<{
        transaction_type: string;
        amount: string;
        source_type: string;
        source_id: string;
        balance_after: string;
      }>(
        ctx.dataSource,
        `SELECT transaction_type, amount, source_type, source_id, balance_after
         FROM account_transactions WHERE id = $1`,
        [body.account_transaction_id],
      );
      expect(ledger[0]).toEqual({
        transaction_type: 'withdrawal',
        amount: '250.00',
        source_type: 'expense',
        // The EXPENSE id, not a payment row's — income puts a different id in this field.
        source_id: id,
        balance_after: '750.00',
      });

      const history = await queryRows<{
        change_amount: string;
        change_reason: string;
      }>(
        ctx.dataSource,
        `SELECT change_amount, change_reason FROM balance_history
         WHERE account_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [accountId],
      );
      expect(history[0]).toEqual({
        change_amount: '-250.00',
        change_reason: 'Withdrawal',
      });

      const row = await queryRows<{
        status: string;
        paid_amount: string;
        payment_method: string;
      }>(
        ctx.dataSource,
        'SELECT status, paid_amount, payment_method FROM expenses WHERE id = $1',
        [id],
      );
      expect(row[0]).toEqual({
        status: 'paid',
        paid_amount: '250.00',
        payment_method: 'card',
      });
      expect(before).toBe('1000.00');
    });

    it('pays without an account when none is set, and says so', async () => {
      const id = await insertExpense(ctx, {
        name: 'Cash only',
        amount: '5.00',
      });
      const res = await request(ctx.app.getHttpServer())
        .post(`/api/v1/expenses/${id}/pay`)
        .set(auth())
        .send({})
        .expect(200);
      const body = res.body as Record<string, unknown>;
      expect(body.account_transaction_id).toBeNull();
      expect(body.message).toBe('Expense paid successfully');
    });

    it('echoes the request amount literally', async () => {
      const id = await insertExpense(ctx, { amount: '80.00' });
      const res = await request(ctx.app.getHttpServer())
        .post(`/api/v1/expenses/${id}/pay`)
        .set(auth())
        .send({ amount: '12.5' })
        .expect(200);
      // "12.5", not "12.50" — the parsed request Decimal goes straight back out.
      expect((res.body as Record<string, unknown>).paid_amount).toBe('12.5');
    });

    it('refuses a second payment', async () => {
      const id = await insertExpense(ctx, { amount: '10.00' });
      await request(ctx.app.getHttpServer())
        .post(`/api/v1/expenses/${id}/pay`)
        .set(auth())
        .send({})
        .expect(200);
      const res = await request(ctx.app.getHttpServer())
        .post(`/api/v1/expenses/${id}/pay`)
        .set(auth())
        .send({})
        .expect(400);
      expect(res.body).toEqual({ detail: 'Expense is already paid' });
    });

    it('400s for an unknown expense', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/api/v1/expenses/00000000-0000-0000-0000-000000000999/pay')
        .set(auth())
        .send({})
        .expect(400);
      expect(res.body).toEqual({ detail: 'Expense not found' });
    });

    it("rejects another user's account without moving money", async () => {
      const before = await balanceOf(otherUsersAccountId);
      const id = await insertExpense(ctx, { amount: '10.00' });
      const res = await request(ctx.app.getHttpServer())
        .post(`/api/v1/expenses/${id}/pay`)
        .set(auth())
        .send({ account_id: otherUsersAccountId })
        .expect(400);
      expect(res.body).toEqual({ detail: 'Invalid payment account' });
      expect(await balanceOf(otherUsersAccountId)).toBe(before);
    });

    it('reports insufficient funds with float money fields, and rolls back', async () => {
      const poor = await insertAccount(ctx, { balance: '10.00' });
      const id = await insertExpense(ctx, {
        amount: '500.00',
        paymentAccountId: poor,
      });
      const res = await request(ctx.app.getHttpServer())
        .post(`/api/v1/expenses/${id}/pay`)
        .set(auth())
        .send({})
        .expect(400);

      expect(res.body).toEqual({
        detail: {
          message: 'Insufficient funds',
          error_code: 'INSUFFICIENT_FUNDS',
          account_name: 'E2E Account',
          current_balance: 10, // numbers, unlike every other amount in the module
          required_amount: 500,
          currency: 'USD',
        },
      });
      // The whole use case is one transaction, so nothing partial survives.
      expect(await balanceOf(poor)).toBe('10.00');
      const row = await queryRows<{ status: string }>(
        ctx.dataSource,
        'SELECT status FROM expenses WHERE id = $1',
        [id],
      );
      expect(row[0].status).toBe('pending');
    });
  });

  describe('cancel', () => {
    it('cancels a paid expense without refunding it', async () => {
      const id = await insertExpense(ctx, {
        amount: '30.00',
        paymentAccountId: accountId,
      });
      await request(ctx.app.getHttpServer())
        .post(`/api/v1/expenses/${id}/pay`)
        .set(auth())
        .send({})
        .expect(200);
      const afterPay = await balanceOf(accountId);

      const res = await request(ctx.app.getHttpServer())
        .post(`/api/v1/expenses/${id}/cancel`)
        .set(auth())
        .expect(200);
      expect((res.body as Record<string, unknown>).status).toBe('cancelled');

      // No refund, and the payment fields stay behind — FastAPI's behaviour.
      expect(await balanceOf(accountId)).toBe(afterPay);
      const row = await queryRows<{
        paid_amount: string;
        account_transaction_id: string | null;
      }>(
        ctx.dataSource,
        'SELECT paid_amount, account_transaction_id FROM expenses WHERE id = $1',
        [id],
      );
      expect(row[0].paid_amount).toBe('30.00');
      expect(row[0].account_transaction_id).not.toBeNull();
    });
  });

  describe('the routes FastAPI shadows', () => {
    it('GET /pending is reachable and lists pending expenses', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/v1/expenses/pending')
        .set(auth())
        .expect(200);
      const body = res.body as { items: Array<{ status: string }> };
      expect(body.items.every((i) => i.status === 'pending')).toBe(true);
    });

    it('GET /overdue is reachable', async () => {
      await insertExpense(ctx, { name: 'Late', status: 'overdue' });
      const res = await request(ctx.app.getHttpServer())
        .get('/api/v1/expenses/overdue')
        .set(auth())
        .expect(200);
      const body = res.body as {
        items: Array<{ status: string }>;
        total: number;
      };
      expect(body.total).toBeGreaterThan(0);
      expect(body.items.every((i) => i.status === 'overdue')).toBe(true);
    });

    it('GET /payment-summary is reachable and counts only the three tracked statuses', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/v1/expenses/payment-summary')
        .set(auth())
        .expect(200);
      const body = res.body as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual([
        'currency',
        'overdue_amount',
        'paid_amount',
        'pending_amount',
        'total_overdue',
        'total_paid',
        'total_pending',
      ]);
      expect(body.currency).toBe('USD');
      // Cancelled rows exist in this suite and must appear in none of the buckets.
      expect(typeof body.total_paid).toBe('number');
    });
  });
});
