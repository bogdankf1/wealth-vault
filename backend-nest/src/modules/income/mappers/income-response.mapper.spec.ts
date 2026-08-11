import { IncomeSource } from '../entities/income-source.entity';
import { IncomeTransaction } from '../entities/income-transaction.entity';
import { IncomeDistributionRule } from '../entities/income-distribution-rule.entity';
import {
  monthlyEquivalent,
  toRuleResponse,
  toSourceResponseFloat,
  toSourceResponseRaw,
  toTransactionResponse,
} from './income-response.mapper';

function source(overrides: Partial<IncomeSource> = {}): IncomeSource {
  return Object.assign(new IncomeSource(), {
    id: '7a5bb0ca-d1f2-454a-9ca3-4b57bfedfdcf',
    userId: '6d8464bc-864b-4e7d-85c6-944d7a24bee9',
    name: 'Freelance Design',
    description: null,
    category: 'Freelance',
    amount: '1000.00',
    currency: 'USD',
    frequency: 'MONTHLY',
    isActive: true,
    date: null,
    startDate: '2026-01-01 00:00:00',
    endDate: null,
    targetAccountId: null,
    autoDeposit: false,
    createdAt: new Date('2026-06-24T09:16:51.946Z'),
    updatedAt: new Date('2026-06-24T09:16:51.946Z'),
    deletedAt: null,
    ...overrides,
  });
}

describe('monthlyEquivalent — IncomeSource.calculate_monthly_amount()', () => {
  it.each([
    ['MONTHLY', '1000.00', '1000.00'],
    ['ANNUALLY', '100.50', '8.34150'],
    ['WEEKLY', '0.10', '0.4330'],
    ['ONE_TIME', '500.00', '0.00'],
    ['QUARTERLY', '900.00', '297.0000'],
    ['BIWEEKLY', '100.00', '217.0000'],
  ])('%s %s → %s', (frequency, amount, expected) => {
    expect(
      monthlyEquivalent(source({ frequency, amount } as Partial<IncomeSource>)),
    ).toBe(expected);
  });
});

describe('toSourceResponseRaw — the POST/PUT shape', () => {
  it('keeps DB precision and leaves every display_* field null', () => {
    expect(toSourceResponseRaw(source())).toEqual({
      name: 'Freelance Design',
      description: null,
      category: 'Freelance',
      amount: '1000.00',
      currency: 'USD',
      frequency: 'monthly',
      is_active: true,
      date: null,
      start_date: '2026-01-01T00:00:00',
      end_date: null,
      target_account_id: null,
      auto_deposit: false,
      id: '7a5bb0ca-d1f2-454a-9ca3-4b57bfedfdcf',
      user_id: '6d8464bc-864b-4e7d-85c6-944d7a24bee9',
      created_at: '2026-06-24T09:16:51.946Z',
      updated_at: '2026-06-24T09:16:51.946Z',
      monthly_equivalent: '1000.00',
      display_amount: null,
      display_currency: null,
      display_monthly_equivalent: null,
      target_account_name: null,
    });
  });
});

describe('toSourceResponseFloat — the GET list/detail shape', () => {
  it('collapses decimals through Python float repr and fills display_*', () => {
    const body = toSourceResponseFloat(source(), {
      displayAmount: '1000.00',
      displayCurrency: 'USD',
      displayMonthlyEquivalent: '1000.00',
    });
    expect(body.amount).toBe('1000.0');
    expect(body.monthly_equivalent).toBe('1000.0');
    expect(body.display_amount).toBe('1000.0');
    expect(body.display_currency).toBe('USD');
    expect(body.display_monthly_equivalent).toBe('1000.0');
    expect(body.start_date).toBe('2026-01-01T00:00:00');
    expect(body.target_account_name).toBeNull();
  });

  it('matches the live response for an annually-paid source', () => {
    // Captured from FastAPI: amount 100.50 annually → "100.5" / "8.3415".
    const body = toSourceResponseFloat(
      source({
        amount: '100.50',
        frequency: 'ANNUALLY',
      }),
      {
        displayAmount: null,
        displayCurrency: null,
        displayMonthlyEquivalent: null,
      },
    );
    expect(body.amount).toBe('100.5');
    expect(body.monthly_equivalent).toBe('8.3415');
  });

  it('emits "0" for a zero amount and null for a zero monthly equivalent', () => {
    // FastAPI's truthiness checks, not ours: `float(x) if x else 0` and
    // `float(calc()) if calc() else None`.
    const body = toSourceResponseFloat(
      source({
        amount: '0.00',
        frequency: 'ONE_TIME',
      }),
      {
        displayAmount: null,
        displayCurrency: null,
        displayMonthlyEquivalent: null,
      },
    );
    expect(body.amount).toBe('0');
    expect(body.monthly_equivalent).toBeNull();
  });
});

describe('toTransactionResponse', () => {
  it('matches the captured FastAPI transaction shape', () => {
    const txn = Object.assign(new IncomeTransaction(), {
      id: 'c04324e3-0d0c-4081-ac60-bf63d9a88b33',
      userId: '6d8464bc-864b-4e7d-85c6-944d7a24bee9',
      sourceId: '232071fb-75f6-49d2-ae50-2298d94f67af',
      description: 'Payroll deposit - Acme Corp',
      amount: '6500.00',
      currency: 'USD',
      date: '2026-05-01 00:00:00',
      category: 'Salary',
      notes: null,
      depositedToAccountId: null,
      accountTransactionId: null,
      status: 'RECEIVED',
      createdAt: new Date('2026-06-24T09:16:51.948Z'),
      updatedAt: new Date('2026-06-24T09:16:51.948Z'),
      deletedAt: null,
    });
    expect(toTransactionResponse(txn)).toEqual({
      source_id: '232071fb-75f6-49d2-ae50-2298d94f67af',
      description: 'Payroll deposit - Acme Corp',
      amount: '6500.00', // raw, never float-collapsed on this endpoint family
      currency: 'USD',
      date: '2026-05-01T00:00:00',
      category: 'Salary',
      notes: null,
      id: 'c04324e3-0d0c-4081-ac60-bf63d9a88b33',
      user_id: '6d8464bc-864b-4e7d-85c6-944d7a24bee9',
      created_at: '2026-06-24T09:16:51.948Z',
      updated_at: '2026-06-24T09:16:51.948Z',
      deposited_to_account_id: null,
      account_transaction_id: null,
      status: 'received',
      deposited_to_account_name: null,
    });
  });
});

describe('toRuleResponse', () => {
  it('emits the enriched rule shape with wire-value enums', () => {
    const rule = Object.assign(new IncomeDistributionRule(), {
      id: 'r-1',
      userId: 'u-1',
      incomeSourceId: null,
      targetAccountId: 'a-1',
      targetGoalId: null,
      distributionType: 'FIXED_AMOUNT',
      amount: '100.00',
      percentage: null,
      priority: 0,
      name: 'Rent pot',
      isActive: true,
      createdAt: new Date('2026-06-24T09:16:51.946Z'),
      updatedAt: new Date('2026-06-24T09:16:51.946Z'),
      deletedAt: null,
    });
    expect(
      toRuleResponse(rule, {
        incomeSourceName: null,
        targetAccountName: 'Everyday',
        targetGoalName: null,
      }),
    ).toEqual({
      income_source_id: null,
      target_account_id: 'a-1',
      target_goal_id: null,
      distribution_type: 'fixed_amount',
      amount: '100.00',
      percentage: null,
      priority: 0,
      name: 'Rent pot',
      is_active: true,
      id: 'r-1',
      user_id: 'u-1',
      created_at: '2026-06-24T09:16:51.946Z',
      updated_at: '2026-06-24T09:16:51.946Z',
      income_source_name: null,
      target_account_name: 'Everyday',
      target_goal_name: null,
    });
  });
});
