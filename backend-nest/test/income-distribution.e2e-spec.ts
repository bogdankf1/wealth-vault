import request from 'supertest';
import {
  IncomeTestContext,
  createExtraUser,
  insertAccount,
  insertGoal,
  insertSource,
  insertTransaction,
  queryRows,
  setupIncomeContext,
  teardownIncomeContext,
} from './income-fixtures';

describe('Income deposit and distribution (e2e)', () => {
  let ctx: IncomeTestContext;
  let accountId: string;
  let goalId: string;
  let otherUsersAccountId: string;

  beforeAll(async () => {
    ctx = await setupIncomeContext('dist');
    accountId = await insertAccount(ctx, { balance: '100.00' });
    goalId = await insertGoal(ctx, { target: '1000.00', current: '0.00' });
    otherUsersAccountId = await insertAccount(ctx, { userId: ctx.otherUserId });
  });

  afterAll(async () => {
    await teardownIncomeContext(ctx);
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

  describe('POST /transactions/{id}/deposit', () => {
    it('credits the account, writes the ledger rows and marks the income deposited', async () => {
      const txnId = await insertTransaction(ctx, { amount: '250.00' });
      const res = await request(ctx.app.getHttpServer())
        .post(`/api/v1/income/transactions/${txnId}/deposit`)
        .set(auth())
        .send({ account_id: accountId })
        .expect(200);

      const body = res.body as Record<string, unknown>;
      expect(body.income_transaction_id).toBe(txnId);
      expect(body.deposited_to_account_id).toBe(accountId);
      expect(body.amount).toBe('250.00');
      expect(body.message).toBe('Successfully deposited 250.00 USD to account');

      expect(await balanceOf(accountId)).toBe('350.00');

      const ledger = await queryRows<{
        amount: string;
        balance_before: string;
        balance_after: string;
        transaction_type: string;
        source_type: string;
        status: string;
      }>(
        ctx.dataSource,
        `SELECT amount, balance_before, balance_after, transaction_type, source_type, status
         FROM account_transactions WHERE id = $1`,
        [body.account_transaction_id],
      );
      expect(ledger[0]).toEqual({
        amount: '250.00',
        balance_before: '100.00',
        balance_after: '350.00',
        transaction_type: 'deposit',
        source_type: 'income',
        status: 'completed',
      });

      const history = await queryRows<{
        balance: string;
        change_reason: string;
      }>(
        ctx.dataSource,
        'SELECT balance, change_reason FROM balance_history WHERE account_id = $1 ORDER BY created_at DESC LIMIT 1',
        [accountId],
      );
      expect(history[0]).toEqual({
        balance: '350.00',
        change_reason: 'Deposit',
      });

      const income = await queryRows<{ status: string }>(
        ctx.dataSource,
        'SELECT status FROM income_transactions WHERE id = $1',
        [txnId],
      );
      expect(income[0].status).toBe('DEPOSITED');
    });

    it('refuses a second deposit of the same income', async () => {
      const txnId = await insertTransaction(ctx, { amount: '10.00' });
      await request(ctx.app.getHttpServer())
        .post(`/api/v1/income/transactions/${txnId}/deposit`)
        .set(auth())
        .send({ account_id: accountId })
        .expect(200);

      const res = await request(ctx.app.getHttpServer())
        .post(`/api/v1/income/transactions/${txnId}/deposit`)
        .set(auth())
        .send({ account_id: accountId })
        .expect(400);
      expect(res.body).toEqual({ detail: 'Income has already been deposited' });
    });

    it('rejects an account owned by someone else without moving money', async () => {
      const txnId = await insertTransaction(ctx, { amount: '10.00' });
      const before = await balanceOf(otherUsersAccountId);
      const res = await request(ctx.app.getHttpServer())
        .post(`/api/v1/income/transactions/${txnId}/deposit`)
        .set(auth())
        .send({ account_id: otherUsersAccountId })
        .expect(400);
      expect(res.body).toEqual({ detail: 'Invalid target account' });
      expect(await balanceOf(otherUsersAccountId)).toBe(before);
    });

    it('404-equivalent 400 for an unknown transaction', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(
          '/api/v1/income/transactions/00000000-0000-0000-0000-000000000999/deposit',
        )
        .set(auth())
        .send({ account_id: accountId })
        .expect(400);
      expect(res.body).toEqual({ detail: 'Income transaction not found' });
    });
  });

  describe('distribution rules', () => {
    it('rejects a rule with no target', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/api/v1/income/distribution-rules')
        .set(auth())
        .send({ distribution_type: 'percentage', percentage: '10' })
        .expect(400);
      expect(res.body).toEqual({
        detail: 'Rule must have either a target account or target goal',
      });
    });

    it('rejects a percentage rule with no percentage', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/api/v1/income/distribution-rules')
        .set(auth())
        .send({ distribution_type: 'percentage', target_account_id: accountId })
        .expect(400);
      expect(res.body).toEqual({
        detail: 'Percentage type requires percentage value',
      });
    });

    it('rejects a fixed_amount rule with no amount', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/api/v1/income/distribution-rules')
        .set(auth())
        .send({
          distribution_type: 'fixed_amount',
          target_account_id: accountId,
        })
        .expect(400);
      expect(res.body).toEqual({
        detail: 'Fixed amount type requires amount value',
      });
    });

    it("rejects another user's target account", async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/api/v1/income/distribution-rules')
        .set(auth())
        .send({
          distribution_type: 'remainder',
          target_account_id: otherUsersAccountId,
        })
        .expect(400);
      expect(res.body).toEqual({ detail: 'Invalid target account' });
    });

    it('creates, reads, updates and deletes a rule', async () => {
      const created = await request(ctx.app.getHttpServer())
        .post('/api/v1/income/distribution-rules')
        .set(auth())
        .send({
          distribution_type: 'fixed_amount',
          amount: '100.00',
          target_account_id: accountId,
          name: 'Rent pot',
          priority: 5,
        })
        .expect(201);
      const rule = created.body as Record<string, unknown>;
      expect(rule.distribution_type).toBe('fixed_amount');
      expect(rule.amount).toBe('100.00');
      expect(rule.target_account_name).toBe('E2E Account');
      expect(rule.income_source_name).toBeNull();

      const ruleId = rule.id as string;
      const listed = await request(ctx.app.getHttpServer())
        .get('/api/v1/income/distribution-rules')
        .set(auth())
        .expect(200);
      // {items, total} — no page/page_size on this envelope.
      expect(Object.keys(listed.body as object).sort()).toEqual([
        'items',
        'total',
      ]);

      const updated = await request(ctx.app.getHttpServer())
        .put(`/api/v1/income/distribution-rules/${ruleId}`)
        .set(auth())
        .send({ name: 'Renamed' })
        .expect(200);
      expect((updated.body as Record<string, unknown>).name).toBe('Renamed');
      expect((updated.body as Record<string, unknown>).amount).toBe('100.00');

      await request(ctx.app.getHttpServer())
        .delete(`/api/v1/income/distribution-rules/${ruleId}`)
        .set(auth())
        .expect(204);

      const res = await request(ctx.app.getHttpServer())
        .get(`/api/v1/income/distribution-rules/${ruleId}`)
        .set(auth())
        .expect(404);
      expect(res.body).toEqual({
        error: 'Distribution rule not found',
        details: {},
        status_code: 404,
      });
    });

    // FastAPI's update path never validates income_source_id ownership, and its enrichment then
    // reads the name off whatever row that id points at. This is the leak, closed.
    it("refuses to point a rule at another user's income source", async () => {
      const otherSourceId = await insertSource(ctx, {
        userId: ctx.otherUserId,
        name: 'Secret Salary',
      });
      const created = await request(ctx.app.getHttpServer())
        .post('/api/v1/income/distribution-rules')
        .set(auth())
        .send({ distribution_type: 'remainder', target_account_id: accountId })
        .expect(201);

      const res = await request(ctx.app.getHttpServer())
        .put(
          `/api/v1/income/distribution-rules/${(created.body as { id: string }).id}`,
        )
        .set(auth())
        .send({ income_source_id: otherSourceId })
        .expect(400);
      expect(res.body).toEqual({ detail: 'Invalid income source' });
    });
  });

  describe('POST /distribution-preview', () => {
    it('returns the empty shape when no rules exist', async () => {
      const fresh = await createExtraUser(ctx, 'preview');
      {
        const res = await request(ctx.app.getHttpServer())
          .post(
            '/api/v1/income/distribution-preview?income_amount=1000&currency=USD',
          )
          .set(fresh.auth)
          .expect(200);
        // Captured verbatim from FastAPI — note the un-padded strings.
        expect(res.body).toEqual({
          income_amount: '1000',
          currency: 'USD',
          distributions: [],
          remaining_amount: '1000',
          total_distributed: '0',
        });
      }
    });

    it('applies percentage off the gross, then a remainder rule', async () => {
      const fresh = await createExtraUser(ctx, 'preview2');
      {
        const account = await insertAccount(ctx, { userId: fresh.userId });
        const goal = await insertGoal(ctx, { userId: fresh.userId });
        const freshAuth = fresh.auth;
        await request(ctx.app.getHttpServer())
          .post('/api/v1/income/distribution-rules')
          .set(freshAuth)
          .send({
            distribution_type: 'percentage',
            percentage: '25.00',
            target_account_id: account,
            priority: 1,
            name: 'Quarter',
          })
          .expect(201);
        await request(ctx.app.getHttpServer())
          .post('/api/v1/income/distribution-rules')
          .set(freshAuth)
          .send({
            distribution_type: 'remainder',
            target_goal_id: goal,
            priority: 2,
            name: 'Rest',
          })
          .expect(201);

        const res = await request(ctx.app.getHttpServer())
          .post('/api/v1/income/distribution-preview?income_amount=1000.00')
          .set(freshAuth)
          .expect(200);
        const body = res.body as {
          distributions: Array<Record<string, unknown>>;
          remaining_amount: string;
          total_distributed: string;
        };
        expect(body.distributions).toHaveLength(2);
        // 1000.00 × (25.00/100): Python Decimal scale arithmetic, not a normalized 250.
        expect(body.distributions[0].amount).toBe('250.0000');
        expect(body.distributions[0].target_type).toBe('account');
        expect(body.distributions[1].target_type).toBe('goal');
        expect(body.distributions[1].amount).toBe('750.0000');
        expect(body.remaining_amount).toBe('0.0000');
        expect(body.total_distributed).toBe('1000.0000');
      }
    });
  });

  describe('POST /transactions/{id}/distribute', () => {
    it('moves money into the account and the goal, then marks the income deposited', async () => {
      const fresh = await createExtraUser(ctx, 'apply');
      {
        const freshAuth = fresh.auth;
        const account = await insertAccount(ctx, {
          userId: fresh.userId,
          balance: '0.00',
        });
        const goal = await insertGoal(ctx, {
          userId: fresh.userId,
          target: '1000.00',
          current: '0.00',
        });
        await request(ctx.app.getHttpServer())
          .post('/api/v1/income/distribution-rules')
          .set(freshAuth)
          .send({
            distribution_type: 'fixed_amount',
            amount: '400.00',
            target_account_id: account,
            priority: 1,
          })
          .expect(201);
        await request(ctx.app.getHttpServer())
          .post('/api/v1/income/distribution-rules')
          .set(freshAuth)
          .send({
            distribution_type: 'remainder',
            target_goal_id: goal,
            priority: 2,
          })
          .expect(201);

        const txnId = await insertTransaction(ctx, {
          userId: fresh.userId,
          amount: '1000.00',
        });
        const res = await request(ctx.app.getHttpServer())
          .post(`/api/v1/income/transactions/${txnId}/distribute`)
          .set(freshAuth)
          .expect(200);

        const body = res.body as {
          message: string;
          deposits: Array<{ account_transaction_id: string; amount: number }>;
        };
        expect(body.message).toBe(
          'Successfully distributed income to 1 account(s)',
        );
        // The only amount in the module that is a JSON number rather than a string.
        expect(typeof body.deposits[0].amount).toBe('number');
        expect(body.deposits[0].amount).toBe(400);

        const accountRows = await queryRows<{ current_balance: string }>(
          ctx.dataSource,
          'SELECT current_balance FROM savings_accounts WHERE id = $1',
          [account],
        );
        expect(accountRows[0].current_balance).toBe('400.00');

        const goalRows = await queryRows<{
          current_amount: string;
          progress_percentage: string;
        }>(
          ctx.dataSource,
          'SELECT current_amount, progress_percentage FROM goals WHERE id = $1',
          [goal],
        );
        expect(goalRows[0].current_amount).toBe('600.00');
        expect(goalRows[0].progress_percentage).toBe('60.00');

        const snapshots = await queryRows<{ trigger_type: string }>(
          ctx.dataSource,
          'SELECT trigger_type FROM goal_progress_history WHERE goal_id = $1',
          [goal],
        );
        expect(snapshots).toHaveLength(1);

        const income = await queryRows<{
          status: string;
          deposited_to_account_id: string;
        }>(
          ctx.dataSource,
          'SELECT status, deposited_to_account_id FROM income_transactions WHERE id = $1',
          [txnId],
        );
        expect(income[0].status).toBe('DEPOSITED');
        // The account that was actually credited — never the goal id.
        expect(income[0].deposited_to_account_id).toBe(account);
      }
    });

    it('400s for an unknown transaction', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(
          '/api/v1/income/transactions/00000000-0000-0000-0000-000000000999/distribute',
        )
        .set(auth())
        .expect(400);
      expect(res.body).toEqual({ detail: 'Income transaction not found' });
    });
  });
});
