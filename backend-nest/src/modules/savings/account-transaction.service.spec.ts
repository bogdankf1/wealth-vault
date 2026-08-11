import { EntityManager } from 'typeorm';
import { AccountTransactionService } from './account-transaction.service';
import {
  AccountNotFoundError,
  InsufficientFundsError,
  InvalidTransactionError,
} from './errors';

interface Saved {
  transactionType?: string;
  amount?: string;
  balanceBefore?: string;
  balanceAfter?: string;
  changeAmount?: string;
  changeReason?: string;
  currentBalance?: string;
  description?: string | null;
}

function managerWith(balance: string | null) {
  const saved: Saved[] = [];
  const manager = {
    findOne: jest
      .fn()
      .mockResolvedValue(
        balance === null
          ? null
          : { id: 'acct', currency: 'USD', currentBalance: balance },
      ),
    create: jest.fn((_entity: unknown, data: Saved) => data),
    save: jest.fn((row: Saved) => {
      saved.push(row);
      return Promise.resolve(row);
    }),
  } as unknown as EntityManager;
  return { manager, saved };
}

const input = {
  accountId: 'acct',
  userId: 'u-1',
  amount: '250.00',
  sourceType: 'expense',
  sourceId: 'e-1',
};

describe('AccountTransactionService.createWithdrawal', () => {
  it('takes the amount off the balance and records the ledger row', async () => {
    const { manager, saved } = managerWith('1000.00');
    await new AccountTransactionService().createWithdrawal(manager, input);

    const [txn, account, history] = saved;
    expect(txn.transactionType).toBe('withdrawal');
    expect(txn.balanceBefore).toBe('1000.00');
    expect(txn.balanceAfter).toBe('750.00');
    expect(account.currentBalance).toBe('750.00');
    // The sign is what distinguishes the two directions in balance history.
    expect(history.changeAmount).toBe('-250.00');
    expect(history.changeReason).toBe('Withdrawal');
  });

  it('still credits on a deposit', async () => {
    const { manager, saved } = managerWith('1000.00');
    await new AccountTransactionService().createDeposit(manager, input);
    expect(saved[0].transactionType).toBe('deposit');
    expect(saved[0].balanceAfter).toBe('1250.00');
    expect(saved[2].changeAmount).toBe('250.00');
    expect(saved[2].changeReason).toBe('Deposit');
  });

  // FastAPI never passes allow_negative from the expense path, so an expense can never overdraw.
  it("refuses to overdraw, with FastAPI's message", async () => {
    const { manager } = managerWith('100.00');
    await expect(
      new AccountTransactionService().createWithdrawal(manager, input),
    ).rejects.toThrow(
      new InsufficientFundsError(
        'Insufficient funds. Available: 100.00, Requested: 250.00',
      ),
    );
  });

  it('allows a withdrawal that lands exactly on zero', async () => {
    const { manager, saved } = managerWith('250.00');
    await new AccountTransactionService().createWithdrawal(manager, input);
    expect(saved[0].balanceAfter).toBe('0.00');
  });

  it('rejects a non-positive amount', async () => {
    const { manager } = managerWith('100.00');
    await expect(
      new AccountTransactionService().createWithdrawal(manager, {
        ...input,
        amount: '0',
      }),
    ).rejects.toThrow(InvalidTransactionError);
  });

  it("throws when the account is missing or not the caller's", async () => {
    const { manager } = managerWith(null);
    await expect(
      new AccountTransactionService().createWithdrawal(manager, input),
    ).rejects.toThrow(AccountNotFoundError);
  });

  describe('cross-currency', () => {
    it('converts before the balance check and annotates the description', async () => {
      const { manager, saved } = managerWith('1000.00');
      await new AccountTransactionService().createWithdrawal(manager, {
        ...input,
        amount: '100.00',
        description: 'Payment for expense: Rent',
        sourceCurrency: 'EUR',
        exchangeRate: '1.10',
      });
      // 100.00 EUR × 1.10 → 110.0000 charged in the account's currency.
      expect(saved[0].amount).toBe('110.0000');
      expect(saved[0].balanceAfter).toBe('890.0000');
      expect(saved[0].description).toBe(
        'Payment for expense: Rent (Converted from EUR 100.00 @ 1.10)',
      );
    });

    it('demands a rate when the currencies differ', async () => {
      const { manager } = managerWith('1000.00');
      await expect(
        new AccountTransactionService().createWithdrawal(manager, {
          ...input,
          sourceCurrency: 'EUR',
        }),
      ).rejects.toThrow('Exchange rate required to convert EUR to USD');
    });
  });
});
