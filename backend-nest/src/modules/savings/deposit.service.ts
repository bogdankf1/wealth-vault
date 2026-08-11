import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { decAdd, decCmp } from '../../common/money/money';
import { AccountTransaction } from './entities/account-transaction.entity';
import { BalanceHistory } from './entities/balance-history.entity';
import { SavingsAccount } from './entities/savings-account.entity';

export class AccountNotFoundError extends Error {}
export class InvalidTransactionError extends Error {}

export interface CreateDepositInput {
  accountId: string;
  userId: string;
  amount: string;
  description?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  category?: string | null;
  transactionDate?: Date | null;
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
export class DepositService {
  async createDeposit(
    manager: EntityManager,
    input: CreateDepositInput,
  ): Promise<AccountTransaction> {
    if (decCmp(input.amount, '0') <= 0) {
      throw new InvalidTransactionError('Deposit amount must be positive');
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

    const balanceBefore = account.currentBalance;
    const balanceAfter = decAdd(balanceBefore, input.amount);
    const now = new Date();

    const transaction = manager.create(AccountTransaction, {
      accountId: account.id,
      userId: input.userId,
      transactionType: 'deposit',
      amount: input.amount,
      // The account's currency, not the income row's — FastAPI does the same.
      currency: account.currency,
      balanceBefore,
      balanceAfter,
      sourceType: input.sourceType ?? 'manual',
      sourceId: input.sourceId ?? null,
      description: input.description ?? null,
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
        changeAmount: input.amount,
        changeReason: 'Deposit',
        createdAt: naiveNow(now),
      }),
    );

    return transaction;
  }
}
