import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { IncomeSource } from '../src/modules/income/entities/income-source.entity';
import { IncomeTransaction } from '../src/modules/income/entities/income-transaction.entity';
import { IncomeDistributionRule } from '../src/modules/income/entities/income-distribution-rule.entity';
import { SavingsAccount } from '../src/modules/savings/entities/savings-account.entity';
import { AccountTransaction } from '../src/modules/savings/entities/account-transaction.entity';
import { BalanceHistory } from '../src/modules/savings/entities/balance-history.entity';
import { Goal } from '../src/modules/goals/entities/goal.entity';
import { GoalProgressHistory } from '../src/modules/goals/entities/goal-progress-history.entity';
import { Currency } from '../src/modules/currency/entities/currency.entity';
import { ExchangeRate } from '../src/modules/currency/entities/exchange-rate.entity';

describe('Phase 1 entity mappings against the live dev DB', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // A find() selects every mapped column, so it throws if any column name is wrong.
  it.each([
    ['IncomeSource', IncomeSource],
    ['IncomeTransaction', IncomeTransaction],
    ['IncomeDistributionRule', IncomeDistributionRule],
    ['SavingsAccount', SavingsAccount],
    ['AccountTransaction', AccountTransaction],
    ['BalanceHistory', BalanceHistory],
    ['Goal', Goal],
    ['GoalProgressHistory', GoalProgressHistory],
    ['Currency', Currency],
    ['ExchangeRate', ExchangeRate],
  ])('%s maps onto its table', async (_name, entity) => {
    await expect(
      dataSource.getRepository(entity).find({ take: 1 }),
    ).resolves.toBeDefined();
  });

  // The reason the OID 1114 parser exists: without it node-postgres hands back a Date built in the
  // process timezone, and 2025-12-01 00:00:00 reads back as 2025-11-30T22:00:00Z — a different day.
  it('reads naive timestamps as raw strings, not shifted Dates', async () => {
    const row = await dataSource
      .getRepository(IncomeTransaction)
      .findOne({ where: {}, order: { date: 'DESC' } });
    expect(row).not.toBeNull();
    expect(typeof row!.date).toBe('string');
    expect(row!.date).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
  });

  // created_at IS timezone-aware on this table, and Phase 0's mapper calls .toISOString() on it.
  it('still reads timestamptz columns as Dates', async () => {
    const row = await dataSource
      .getRepository(IncomeSource)
      .findOne({ where: {} });
    expect(row).not.toBeNull();
    expect(row!.createdAt).toBeInstanceOf(Date);
  });

  // Writes matter as much as reads: an untyped string parameter must land in the timestamp column
  // unchanged, or the whole string-timestamp convention only works in one direction.
  it('round-trips a naive timestamp through an insert without shifting it', async () => {
    const repo = dataSource.getRepository(IncomeTransaction);
    const [{ id: userId }] = await dataSource.query(
      'SELECT id FROM users LIMIT 1',
    );
    const saved = await repo.save(
      repo.create({
        userId,
        sourceId: null,
        description: 'ZZ-entity-roundtrip',
        amount: '1.00',
        currency: 'USD',
        date: '2025-12-01T00:00:00',
        status: 'RECEIVED',
      }),
    );
    try {
      const [row] = await dataSource.query(
        'SELECT date::text AS d FROM income_transactions WHERE id = $1',
        [saved.id],
      );
      expect(row.d).toBe('2025-12-01 00:00:00');
      const reread = await repo.findOne({ where: { id: saved.id } });
      expect(reread!.date).toBe('2025-12-01 00:00:00');
    } finally {
      await dataSource.query('DELETE FROM income_transactions WHERE id = $1', [
        saved.id,
      ]);
    }
  });

  it('reads numeric columns as strings with the column scale intact', async () => {
    const row = await dataSource
      .getRepository(IncomeSource)
      .findOne({ where: {} });
    expect(typeof row!.amount).toBe('string');
    expect(row!.amount).toMatch(/^\d+\.\d{2}$/);
  });
});
