import request from 'supertest';
import {
  Slice3Context,
  createExtraUser,
  insertAccount,
  insertDebt,
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

describe('Debts (e2e)', () => {
  let ctx: Slice3Context;

  beforeAll(async () => {
    ctx = await setupSlice3Context('debts');
  }, 60_000);

  afterAll(async () => {
    await teardownSlice3Context(ctx);
  });

  describe('CRUD', () => {
    it('creates a debt and answers the computed fields', async () => {
      const res0 = await request(ctx.app.getHttpServer())
        .post('/api/v1/debts')
        .set(ctx.auth)
        .send({
          debtor_name: 'Alex',
          amount: '500.00',
          amount_paid: '100.00',
          currency: 'USD',
        })
        .expect(201);
      const body = bodyOf(res0);

      expect(body).toMatchObject({
        debtor_name: 'Alex',
        amount: '500.00',
        amount_paid: '100.00',
        is_paid: false,
        is_overdue: false,
        // 100.00 / 500.00 = 0.2 exactly, so *100 keeps one place.
        progress_percentage: '20.0',
        amount_remaining: '400.00',
        total_with_interest: '500.00',
      });
    });

    it('emits keys in pydantic order with the computed fields last', async () => {
      const id = await insertDebt(ctx, { debtorName: 'Order check' });
      const res1 = await request(ctx.app.getHttpServer())
        .get(`/api/v1/debts/${id}`)
        .set(ctx.auth)
        .expect(200);
      const body = bodyOf(res1);

      expect(Object.keys(body)).toEqual([
        'debtor_name',
        'description',
        'amount',
        'amount_paid',
        'currency',
        'is_active',
        'is_paid',
        'due_date',
        'paid_date',
        'notes',
        'deposit_account_id',
        'auto_deposit',
        'interest_rate',
        'reminder_days_before',
        'next_payment_date',
        'payment_frequency',
        'expected_payment_amount',
        'id',
        'user_id',
        'created_at',
        'updated_at',
        'accrued_interest',
        'display_amount',
        'display_amount_paid',
        'display_currency',
        // @computed_field always serializes after every declared field.
        'is_overdue',
        'progress_percentage',
        'amount_remaining',
        'total_with_interest',
      ]);
    });

    it('reports a fully paid debt as 100 with no scale, and a zero remainder with scale', async () => {
      const id = await insertDebt(ctx, {
        debtorName: 'Settled',
        amount: '50.00',
        amountPaid: '50.00',
      });
      const res2 = await request(ctx.app.getHttpServer())
        .get(`/api/v1/debts/${id}`)
        .set(ctx.auth)
        .expect(200);
      const body = bodyOf(res2);

      // 50.00/50.00 divides exactly to "1" (ideal exponent 0), so *100 answers a bare "100".
      expect(body.progress_percentage).toBe('100');
      // The subtraction keeps its scale because Python's max() returns the first operand on a tie.
      expect(body.amount_remaining).toBe('0.00');
    });

    it('flags an unpaid debt past its due date as overdue', async () => {
      const overdue = await insertDebt(ctx, {
        debtorName: 'Late',
        dueDate: '2020-01-01 00:00:00',
      });
      const paidLate = await insertDebt(ctx, {
        debtorName: 'Late but paid',
        dueDate: '2020-01-01 00:00:00',
        isPaid: true,
      });

      const a = await request(ctx.app.getHttpServer())
        .get(`/api/v1/debts/${overdue}`)
        .set(ctx.auth)
        .expect(200);
      expect(bodyOf(a).is_overdue).toBe(true);

      const b = await request(ctx.app.getHttpServer())
        .get(`/api/v1/debts/${paidLate}`)
        .set(ctx.auth)
        .expect(200);
      expect(bodyOf(b).is_overdue).toBe(false);
    });

    it('filters by is_paid and is_active', async () => {
      const user = await createExtraUser(ctx, 'filters');
      await insertDebt(ctx, { userId: user.userId, isPaid: true });
      await insertDebt(ctx, { userId: user.userId, isPaid: false });

      const res3 = await request(ctx.app.getHttpServer())
        .get('/api/v1/debts?is_paid=true')
        .set(user.auth)
        .expect(200);
      const body = bodyOf(res3);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].is_paid).toBe(true);
    });

    it('soft-deletes and 404s afterwards', async () => {
      const id = await insertDebt(ctx, { debtorName: 'Doomed' });
      await request(ctx.app.getHttpServer())
        .delete(`/api/v1/debts/${id}`)
        .set(ctx.auth)
        .expect(204);
      await request(ctx.app.getHttpServer())
        .get(`/api/v1/debts/${id}`)
        .set(ctx.auth)
        .expect(404);

      const rows = await queryRows<{ deleted_at: string | null }>(
        ctx.dataSource,
        'SELECT deleted_at FROM debts WHERE id = $1',
        [id],
      );
      expect(rows[0].deleted_at).not.toBeNull();
    });

    it('runs batch-delete ungated, like taxes', async () => {
      const starter = await createExtraUser(ctx, 'starter', 'starter');
      await request(ctx.app.getHttpServer())
        .get('/api/v1/debts')
        .set(starter.auth)
        .expect(403);
      await request(ctx.app.getHttpServer())
        .post('/api/v1/debts/batch-delete')
        .set(starter.auth)
        .send({ ids: ['00000000-0000-0000-0000-000000000999'] })
        .expect(201);
    });

    it('404s on another user’s debt', async () => {
      const id = await insertDebt(ctx, { userId: ctx.otherUserId });
      await request(ctx.app.getHttpServer())
        .get(`/api/v1/debts/${id}`)
        .set(ctx.auth)
        .expect(404);
    });
  });

  describe('payments', () => {
    it('deposits into the linked account and advances amount_paid', async () => {
      const accountId = await insertAccount(ctx, { balance: '1000.00' });
      const debtId = await insertDebt(ctx, {
        debtorName: 'Payer',
        amount: '500.00',
        depositAccountId: accountId,
      });

      const res4 = await request(ctx.app.getHttpServer())
        .post(`/api/v1/debts/${debtId}/payments`)
        .set(ctx.auth)
        .send({ amount: '200.00' })
        .expect(201);
      const body = bodyOf(res4);

      expect(body).toMatchObject({
        amount: '200.00',
        principal_amount: '200.00',
        interest_amount: '0.00',
        balance_before: '500.00',
        balance_after: '300.00',
        status: 'completed',
      });
      expect(body.account_transaction_id).not.toBeNull();

      const [account] = await queryRows<{ current_balance: string }>(
        ctx.dataSource,
        'SELECT current_balance FROM savings_accounts WHERE id = $1',
        [accountId],
      );
      // A debt is a receivable: collecting on it ADDS to savings.
      expect(account.current_balance).toBe('1200.00');

      // Unlike the tax path, this one goes through the savings engine, so history IS written.
      const history = await queryRows(
        ctx.dataSource,
        'SELECT id FROM balance_history WHERE account_id = $1',
        [accountId],
      );
      expect(history).toHaveLength(1);

      const debt = await request(ctx.app.getHttpServer())
        .get(`/api/v1/debts/${debtId}`)
        .set(ctx.auth)
        .expect(200);
      expect(bodyOf(debt).amount_paid).toBe('200.00');
      expect(bodyOf(debt).is_paid).toBe(false);
    });

    it('marks the debt paid once payments cover the amount', async () => {
      const debtId = await insertDebt(ctx, {
        debtorName: 'Completer',
        amount: '100.00',
      });
      await request(ctx.app.getHttpServer())
        .post(`/api/v1/debts/${debtId}/payments`)
        .set(ctx.auth)
        .send({ amount: '100.00' })
        .expect(201);

      const res5 = await request(ctx.app.getHttpServer())
        .get(`/api/v1/debts/${debtId}`)
        .set(ctx.auth)
        .expect(200);
      const body = bodyOf(res5);
      expect(body.is_paid).toBe(true);
      expect(body.paid_date).not.toBeNull();
      expect(body.progress_percentage).toBe('100');
    });

    it('floors balance_after at zero on an overpayment', async () => {
      const debtId = await insertDebt(ctx, {
        debtorName: 'Overpayer',
        amount: '100.00',
      });
      const res6 = await request(ctx.app.getHttpServer())
        .post(`/api/v1/debts/${debtId}/payments`)
        .set(ctx.auth)
        .send({ amount: '150.00' })
        .expect(201);
      const body = bodyOf(res6);
      expect(body.balance_after).toBe('0.00');
    });

    it('records the payment even when the deposit fails', async () => {
      // An inactive account makes the savings engine throw; FastAPI swallows that and keeps the
      // payment, with a null transaction id.
      const accountId = await insertAccount(ctx, { isActive: false });
      const debtId = await insertDebt(ctx, {
        debtorName: 'Broken link',
        depositAccountId: accountId,
      });

      const res7 = await request(ctx.app.getHttpServer())
        .post(`/api/v1/debts/${debtId}/payments`)
        .set(ctx.auth)
        .send({ amount: '25.00' })
        .expect(201);
      const body = bodyOf(res7);

      expect(body.amount).toBe('25.00');
      expect(body.account_transaction_id).toBeNull();
    });

    it('skips the deposit when deposit_to_account is false', async () => {
      const accountId = await insertAccount(ctx, { balance: '10.00' });
      const debtId = await insertDebt(ctx, {
        debtorName: 'No deposit',
        depositAccountId: accountId,
      });

      const res8 = await request(ctx.app.getHttpServer())
        .post(`/api/v1/debts/${debtId}/payments`)
        .set(ctx.auth)
        .send({ amount: '5.00', deposit_to_account: false })
        .expect(201);
      const body = bodyOf(res8);
      expect(body.account_transaction_id).toBeNull();

      const [account] = await queryRows<{ current_balance: string }>(
        ctx.dataSource,
        'SELECT current_balance FROM savings_accounts WHERE id = $1',
        [accountId],
      );
      expect(account.current_balance).toBe('10.00');
    });

    it('lists payments in the {items, total} envelope', async () => {
      const debtId = await insertDebt(ctx, { debtorName: 'Lister' });
      await request(ctx.app.getHttpServer())
        .post(`/api/v1/debts/${debtId}/payments`)
        .set(ctx.auth)
        .send({ amount: '10.00' })
        .expect(201);

      const res9 = await request(ctx.app.getHttpServer())
        .get(`/api/v1/debts/${debtId}/payments`)
        .set(ctx.auth)
        .expect(200);
      const body = bodyOf(res9);

      // No page/page_size on this endpoint — total is len(items), not a COUNT.
      expect(Object.keys(body).sort()).toEqual(['items', 'total']);
      expect(body.total).toBe(1);
    });

    it('404s listing payments for an unknown debt', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/v1/debts/00000000-0000-0000-0000-000000000999/payments')
        .set(ctx.auth)
        .expect(404);
    });
  });

  describe('sync_historical', () => {
    it('backfills one historical payment when created with a linked account', async () => {
      const accountId = await insertAccount(ctx, { balance: '0.00' });

      const res10 = await request(ctx.app.getHttpServer())
        .post('/api/v1/debts')
        .set(ctx.auth)
        .send({
          debtor_name: 'Historic',
          amount: '400.00',
          amount_paid: '150.00',
          deposit_account_id: accountId,
          sync_historical: true,
        })
        .expect(201);
      const body = bodyOf(res10);

      const payments = await queryRows<{ notes: string; amount: string }>(
        ctx.dataSource,
        'SELECT notes, amount FROM debt_payments WHERE debt_id = $1',
        [body.id],
      );
      expect(payments).toHaveLength(1);
      expect(payments[0]).toMatchObject({
        notes: 'Historical payment (backfilled)',
        amount: '150.00',
      });

      const [account] = await queryRows<{ current_balance: string }>(
        ctx.dataSource,
        'SELECT current_balance FROM savings_accounts WHERE id = $1',
        [accountId],
      );
      expect(account.current_balance).toBe('150.00');
    });

    it('reverses and re-backfills when the deposit account changes', async () => {
      const first = await insertAccount(ctx, {
        balance: '0.00',
        name: 'First',
      });
      const second = await insertAccount(ctx, {
        balance: '0.00',
        name: 'Second',
      });

      const created = await request(ctx.app.getHttpServer())
        .post('/api/v1/debts')
        .set(ctx.auth)
        .send({
          debtor_name: 'Mover',
          amount: '400.00',
          amount_paid: '100.00',
          deposit_account_id: first,
          sync_historical: true,
        })
        .expect(201);

      await request(ctx.app.getHttpServer())
        .put(`/api/v1/debts/${bodyOf(created).id}`)
        .set(ctx.auth)
        .send({ deposit_account_id: second, sync_historical: true })
        .expect(200);

      const payments = await queryRows<{ amount: string }>(
        ctx.dataSource,
        'SELECT amount FROM debt_payments WHERE debt_id = $1',
        [bodyOf(created).id],
      );
      expect(payments).toHaveLength(1);

      // The reversal writes an offsetting withdrawal rather than deleting, so the first account is
      // back to zero and its original deposit is marked 'reversed'.
      const [firstAccount] = await queryRows<{ current_balance: string }>(
        ctx.dataSource,
        'SELECT current_balance FROM savings_accounts WHERE id = $1',
        [first],
      );
      expect(firstAccount.current_balance).toBe('0.00');

      const [secondAccount] = await queryRows<{ current_balance: string }>(
        ctx.dataSource,
        'SELECT current_balance FROM savings_accounts WHERE id = $1',
        [second],
      );
      expect(secondAccount.current_balance).toBe('100.00');

      const reversed = await queryRows<{ status: string }>(
        ctx.dataSource,
        "SELECT status FROM account_transactions WHERE account_id = $1 AND status = 'reversed'",
        [first],
      );
      expect(reversed).toHaveLength(1);
    });
  });

  describe('mark-paid and forgive', () => {
    it('mark-paid settles the debt and pushes amount_paid to the full amount', async () => {
      const id = await insertDebt(ctx, {
        debtorName: 'Settle me',
        amount: '300.00',
        amountPaid: '50.00',
      });

      const res11 = await request(ctx.app.getHttpServer())
        .post(`/api/v1/debts/${id}/mark-paid`)
        .set(ctx.auth)
        .expect(201);
      const body = bodyOf(res11);

      expect(body.is_paid).toBe(true);
      expect(body.amount_paid).toBe('300.00');
      expect(body.amount_remaining).toBe('0.00');
      expect(body.paid_date).not.toBeNull();
    });

    it('forgive marks paid and appends the note but leaves amount_paid alone', async () => {
      const id = await insertDebt(ctx, {
        debtorName: 'Forgive me',
        amount: '300.00',
        amountPaid: '50.00',
      });

      const res12 = await request(ctx.app.getHttpServer())
        .post(`/api/v1/debts/${id}/forgive`)
        .set(ctx.auth)
        .expect(201);
      const body = bodyOf(res12);

      expect(body.is_paid).toBe(true);
      expect(body.notes).toContain('[Debt forgiven]');
      // FastAPI does not zero the balance on forgiveness, so the debt still looks part-paid.
      expect(body.amount_paid).toBe('50.00');
      expect(body.amount_remaining).toBe('250.00');
    });
  });

  describe('stats', () => {
    it('counts unpaid as active, and owes only what is still outstanding', async () => {
      const user = await createExtraUser(ctx, 'stats');
      await insertDebt(ctx, {
        userId: user.userId,
        amount: '400.00',
        amountPaid: '100.00',
      });
      await insertDebt(ctx, {
        userId: user.userId,
        amount: '200.00',
        amountPaid: '200.00',
        isPaid: true,
      });
      await insertDebt(ctx, {
        userId: user.userId,
        amount: '100.00',
        dueDate: '2020-01-01 00:00:00',
      });

      const res13 = await request(ctx.app.getHttpServer())
        .get('/api/v1/debts/stats')
        .set(user.auth)
        .expect(200);
      const body = bodyOf(res13);

      expect(body).toEqual({
        total_debts: 3,
        active_debts: 2,
        paid_debts: 1,
        // The settled debt contributes nothing: its remaining balance is not positive.
        total_amount_owed: '400.00',
        total_amount_paid: '300.00',
        overdue_debts: 1,
        currency: 'USD',
      });
    });
  });
});
