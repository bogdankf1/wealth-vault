import { Expense } from '../entities/expense.entity';
import {
  storedMonthlyEquivalent,
  toExpenseListItem,
  toExpenseModel,
} from './expense-response.mapper';

function expense(overrides: Partial<Expense> = {}): Expense {
  return Object.assign(new Expense(), {
    id: '1e86620e-50be-4daa-a2e3-9b456581f255',
    userId: '6d8464bc-864b-4e7d-85c6-944d7a24bee9',
    name: 'Rent',
    description: null,
    category: 'housing',
    amount: '1000.00',
    currency: 'USD',
    frequency: 'MONTHLY',
    date: null,
    startDate: '2025-01-01 00:00:00',
    endDate: null,
    isActive: true,
    tags: null,
    monthlyEquivalent: '1000.00',
    paymentAccountId: null,
    status: 'pending',
    paidDate: null,
    paidAmount: null,
    accountTransactionId: null,
    receiptUrl: null,
    paymentMethod: null,
    autoPay: false,
    deletedAt: null,
    createdAt: '2025-01-01 12:30:45.123456',
    updatedAt: '2025-01-01 12:30:45.123456',
    ...overrides,
  });
}

const noDisplay = {
  displayAmount: null,
  displayCurrency: null,
  displayMonthlyEquivalent: null,
};

describe('storedMonthlyEquivalent — table 1 of 3', () => {
  it.each([
    ['MONTHLY', '1000.00', '1000.00'],
    ['ONE_TIME', '1000.00', '0.00'],
    ['DAILY', '10.00', '300.00'],
    ['QUARTERLY', '900.00', '300.00'],
    ['ANNUALLY', '1200.00', '100.00'],
  ])('%s %s → %s', (frequency, amount, expected) => {
    expect(storedMonthlyEquivalent(amount, frequency as 'MONTHLY')).toBe(
      expected,
    );
  });

  // The float-derived constants: Decimal(4.33) is not 4.33. The noise is quantized away by the
  // numeric(12,2) column, but the multiplication itself must still be the float-derived one.
  it('uses the float expansion for weekly and biweekly', () => {
    // 28 significant digits — the context rounds the exact 50-digit product. Values from CPython.
    expect(storedMonthlyEquivalent('100.00', 'WEEKLY')).toBe(
      '433.0000000000000071054273576',
    );
    expect(storedMonthlyEquivalent('100.00', 'BIWEEKLY')).toBe(
      '216.9999999999999928945726424',
    );
  });
});

describe('toExpenseModel — the response_model shape', () => {
  it('matches the captured FastAPI bytes', () => {
    expect(toExpenseModel(expense())).toEqual({
      name: 'Rent',
      description: null,
      category: 'housing',
      amount: '1000.00', // string, stored scale
      currency: 'USD',
      frequency: 'monthly',
      is_active: true,
      tags: null,
      date: null,
      start_date: '2025-01-01T00:00:00',
      end_date: null,
      payment_account_id: null,
      payment_method: null,
      auto_pay: false,
      id: '1e86620e-50be-4daa-a2e3-9b456581f255',
      user_id: '6d8464bc-864b-4e7d-85c6-944d7a24bee9',
      monthly_equivalent: '1000.00',
      // Naive columns: no Z, no offset, microseconds preserved.
      created_at: '2025-01-01T12:30:45.123456',
      updated_at: '2025-01-01T12:30:45.123456',
      display_amount: null,
      display_currency: null,
      display_monthly_equivalent: null,
      status: 'pending',
      paid_date: null,
      paid_amount: null,
      account_transaction_id: null,
      receipt_url: null,
      payment_account_name: null,
    });
  });

  it('keeps a zero monthly equivalent as a string, unlike the list', () => {
    const body = toExpenseModel(
      expense({ frequency: 'ONE_TIME', monthlyEquivalent: '0.00' }),
    );
    expect(body.monthly_equivalent).toBe('0.00');
  });
});

describe('toExpenseListItem — the hand-built dict shape', () => {
  it('renders money as JSON numbers', () => {
    const item = toExpenseListItem(
      expense({ amount: '123.45' }),
      {
        displayAmount: '123.45',
        displayCurrency: 'USD',
        displayMonthlyEquivalent: '1000.00',
      },
      'Everyday',
    );
    expect(item.amount).toBe(123.45);
    expect(typeof item.amount).toBe('number');
    expect(item.display_amount).toBe(123.45);
    expect(item.monthly_equivalent).toBe(1000);
    // The only endpoint that fills this in.
    expect(item.payment_account_name).toBe('Everyday');
  });

  it("reproduces FastAPI's inconsistent falsy guards", () => {
    // `float(x) if x else 0` → integer 0 …
    expect(
      toExpenseListItem(expense({ amount: '0.00' }), noDisplay, null).amount,
    ).toBe(0);
    // … `float(m) if m else None` → null for a zero equivalent, where the detail endpoint says "0.00" …
    expect(
      toExpenseListItem(expense({ monthlyEquivalent: '0.00' }), noDisplay, null)
        .monthly_equivalent,
    ).toBeNull();
    // … but display_* use `is not None`, so a zero there survives as 0.
    expect(
      toExpenseListItem(
        expense(),
        {
          displayAmount: '0.00',
          displayCurrency: 'USD',
          displayMonthlyEquivalent: '0.00',
        },
        null,
      ).display_amount,
    ).toBe(0);
  });

  it('carries the same 28 keys as the model, in the dict order', () => {
    const item = toExpenseListItem(expense(), noDisplay, null);
    const model = toExpenseModel(expense());
    expect(Object.keys(item).sort()).toEqual(Object.keys(model).sort());
    // Key ORDER differs between the two — id/user_id lead here, sit 15th/16th there.
    expect(Object.keys(item).slice(0, 3)).toEqual(['id', 'user_id', 'name']);
    expect(Object.keys(model).slice(0, 3)).toEqual([
      'name',
      'description',
      'category',
    ]);
  });
});
