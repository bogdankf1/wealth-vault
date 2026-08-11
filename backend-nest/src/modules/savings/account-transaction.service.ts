import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { decAdd, decCmp, decMul, decSub } from '../../common/money/money';
import { AccountTransaction } from './entities/account-transaction.entity';
import { BalanceHistory } from './entities/balance-history.entity';
import { SavingsAccount } from './entities/savings-account.entity';
import {
  AccountNotFoundError,
  InsufficientFundsError,
  InvalidTransactionError,
} from './errors';

export interface MoneyMovementInput {
  accountId: string;
  userId: string;
  amount: string;
  description?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  category?: string | null;
  transactionDate?: Date | null;
  /** Set when the caller's amount is in a different currency than the account. */
  sourceCurrency?: string | null;
  exchangeRate?: string | null;
}

/** Naive-timestamp columns take a string; format 'now' the way Postgres prints it. */
function naiveNow(now: Date): string {
  return now.toISOString().replace('T', ' ').replace('Z', '');
}

/**
 * Port of TransactionService.create_deposit
 * (backend/app/modules/savings/transaction_service/mutations.py).
 *
 * One deliberate difference: this does NOT commit. FastAPI commits inside the helper, which is why
 * a 3-rule distribution there performs four separate commits and a mid-loop failure leaves money
 * half-moved. Here the caller owns the transaction and passes its EntityManager in.
 *
 * Not ported (deferred with their modules): currency conversion of the deposited amount, and the
 * `savings.deposit` event dispatch — the event bus arrives in a later phase. Nothing in the income
 * endpoints observes either.
 */
@Injectable()
export class AccountTransactionService {
  createDeposit(
    manager: EntityManager,
    input: MoneyMovementInput,
  ): Promise<AccountTransaction> {
    return this.move(manager, input, 'deposit');
  }

  /**
   * Port of TransactionService.create_withdrawal. Mirror of the deposit apart from four things:
   * the balance goes down, a negative result throws (FastAPI never passes allow_negative, so an
   * expense payment can never overdraw), balance_history records a NEGATIVE change_amount with
   * reason 'Withdrawal', and the amount may be FX-converted before the balance check.
   */
  createWithdrawal(
    manager: EntityManager,
    input: MoneyMovementInput,
  ): Promise<AccountTransaction> {
    return this.move(manager, input, 'withdrawal');
  }

  private async move(
    manager: EntityManager,
    input: MoneyMovementInput,
    kind: 'deposit' | 'withdrawal',
  ): Promise<AccountTransaction> {
    const verb = kind === 'deposit' ? 'Deposit' : 'Withdrawal';
    if (decCmp(input.amount, '0') <= 0) {
      throw new InvalidTransactionError(`${verb} amount must be positive`);
    }

    const account = await manager.findOne(SavingsAccount, {
      where: {
        id: input.accountId,
        userId: input.userId,
        isActive: true,
      },
    });
    if (!account) {
      throw new AccountNotFoundError(`Account ${input.accountId} not found`);
    }

    // FX happens before the balance check, exactly as FastAPI orders it, so an overdraft is
    // judged on the converted amount.
    let amount = input.amount;
    let description = input.description ?? null;
    if (input.sourceCurrency && input.sourceCurrency !== account.currency) {
      if (!input.exchangeRate) {
        throw new InvalidTransactionError(
          `Exchange rate required to convert ${input.sourceCurrency} to ${account.currency}`,
        );
      }
      const note = `(Converted from ${input.sourceCurrency} ${input.amount} @ ${input.exchangeRate})`;
      amount = decMul(input.amount, input.exchangeRate);
      description = description ? `${description} ${note}` : note;
    }

    const balanceBefore = account.currentBalance;
    const balanceAfter =
      kind === 'deposit'
        ? decAdd(balanceBefore, amount)
        : decSub(balanceBefore, amount);

    if (kind === 'withdrawal' && decCmp(balanceAfter, '0') < 0) {
      throw new InsufficientFundsError(
        `Insufficient funds. Available: ${balanceBefore}, Requested: ${amount}`,
      );
    }

    const now = new Date();

    const transaction = manager.create(AccountTransaction, {
      accountId: account.id,
      userId: input.userId,
      transactionType: kind,
      amount,
      // The account's currency, not the income row's — FastAPI does the same.
      currency: account.currency,
      balanceBefore,
      balanceAfter,
      sourceType: input.sourceType ?? 'manual',
      sourceId: input.sourceId ?? null,
      description,
      category: input.category ?? null,
      referenceNumber: null,
      transactionDate: input.transactionDate ?? now,
      postedDate: now,
      status: 'completed',
      createdAt: now,
      updatedAt: now,
    });
    await manager.save(transaction);

    account.currentBalance = balanceAfter;
    account.updatedAt = naiveNow(now);
    await manager.save(account);

    await manager.save(
      manager.create(BalanceHistory, {
        accountId: account.id,
        balance: balanceAfter,
        date: naiveNow(now),
        // Withdrawals record the change as negative — the sign is what tells the two apart in
        // balance history.
        changeAmount: kind === 'deposit' ? amount : `-${amount}`,
        changeReason: verb,
        createdAt: naiveNow(now),
      }),
    );

    return transaction;
  }
}
