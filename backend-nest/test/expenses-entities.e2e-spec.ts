import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { Expense } from '../src/modules/expenses/entities/expense.entity';

async function queryRows<T>(
  ds: DataSource,
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const result: unknown = await ds.query(sql, params);
  return result as T[];
}

describe('Expense entity against the live dev DB', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userId: string;
  const createdIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
    dataSource = app.get(DataSource);
    const [user] = await queryRows<{ id: string }>(
      dataSource,
      'SELECT id FROM users LIMIT 1',
    );
    userId = user.id;
  });

  afterAll(async () => {
    try {
      if (createdIds.length) {
        await dataSource.query('DELETE FROM expenses WHERE id = ANY($1)', [
          createdIds,
        ]);
      }
    } finally {
      if (app) await app.close();
    }
  });

  const save = async (overrides: Partial<Expense> = {}): Promise<Expense> => {
    const repo = dataSource.getRepository(Expense);
    const row = await repo.save(
      repo.create({
        id: randomUUID(),
        userId,
        name: 'ZZ entity probe',
        description: null,
        category: null,
        amount: '123.45',
        currency: 'USD',
        frequency: 'MONTHLY',
        date: null,
        startDate: '2026-03-15T00:00:00',
        endDate: null,
        isActive: true,
        tags: null,
        monthlyEquivalent: null,
        paymentAccountId: null,
        status: 'pending',
        paidDate: null,
        paidAmount: null,
        accountTransactionId: null,
        receiptUrl: null,
        paymentMethod: null,
        autoPay: false,
        deletedAt: null,
        ...overrides,
      }),
    );
    createdIds.push(row.id);
    return row;
  };

  it('maps onto the expenses table', async () => {
    await expect(
      dataSource.getRepository(Expense).find({ take: 1 }),
    ).resolves.toBeDefined();
  });

  // The column is a native PG enum: a wrong label is rejected by Postgres, not silently stored.
  it('writes and reads the native enum by NAME', async () => {
    const saved = await save({ frequency: 'BIWEEKLY' });
    const [row] = await queryRows<{ frequency: string }>(
      dataSource,
      'SELECT frequency::text AS frequency FROM expenses WHERE id = $1',
      [saved.id],
    );
    expect(row.frequency).toBe('BIWEEKLY');

    const reread = await dataSource
      .getRepository(Expense)
      .findOne({ where: { id: saved.id } });
    expect(reread!.frequency).toBe('BIWEEKLY');
  });

  it('rejects a wire value written as a label', async () => {
    await expect(save({ frequency: 'monthly' as never })).rejects.toThrow(
      /invalid input value for enum/,
    );
  });

  it('round-trips a naive timestamp without shifting the day', async () => {
    const saved = await save({ date: '2025-12-01T00:00:00' });
    const [row] = await queryRows<{ d: string }>(
      dataSource,
      'SELECT date::text AS d FROM expenses WHERE id = $1',
      [saved.id],
    );
    expect(row.d).toBe('2025-12-01 00:00:00');
    const reread = await dataSource
      .getRepository(Expense)
      .findOne({ where: { id: saved.id } });
    expect(reread!.date).toBe('2025-12-01 00:00:00');
  });

  // The reason NaiveTimestampModel writes its own string: a JS Date would be serialized with a
  // local offset, which Postgres truncates to local wall clock — hours off FastAPI's utcnow().
  it('stamps created_at as UTC-naive, matching utcnow()', async () => {
    const saved = await save();
    const [row] = await queryRows<{ skew: string }>(
      dataSource,
      `SELECT ABS(EXTRACT(EPOCH FROM ((now() AT TIME ZONE 'UTC') - created_at)))::text AS skew
       FROM expenses WHERE id = $1`,
      [saved.id],
    );
    expect(Number(row.skew)).toBeLessThan(60);
  });

  it('reads money as a string with the column scale intact', async () => {
    const saved = await save({ amount: '10.00' });
    const reread = await dataSource
      .getRepository(Expense)
      .findOne({ where: { id: saved.id } });
    expect(reread!.amount).toBe('10.00');
  });

  it('round-trips jsonb tags', async () => {
    const saved = await save({ tags: ['a', 'b'] });
    const reread = await dataSource
      .getRepository(Expense)
      .findOne({ where: { id: saved.id } });
    expect(reread!.tags).toEqual(['a', 'b']);
  });
});
