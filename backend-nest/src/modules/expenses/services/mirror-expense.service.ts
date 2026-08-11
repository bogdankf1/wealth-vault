import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { naiveUtcNow } from '../../../common/entities/naive-timestamp.entity';
import { Expense } from '../entities/expense.entity';

export interface MirrorExpenseInput {
  userId: string;
  /** '{subscription} - Subscription' or '{installment} - Payment #{n}' — the caller owns the wording. */
  name: string;
  description: string;
  /** The parent's category, or the caller's fallback ('Subscriptions' / 'Installments'). */
  category: string;
  amount: string;
  currency: string;
  paymentDate: string;
  paymentAccountId: string | null;
}

/**
 * Subscriptions and installments each record a payment by INSERTing a row into `expenses`. This is
 * that row, in one place, because the two modules write it identically and slice 3 (taxes, debts)
 * will want it too.
 *
 * Note what is deliberately NOT set: monthly_equivalent stays NULL, start_date/end_date/tags stay
 * NULL, auto_pay stays false. The mirror is a record of a payment that already happened, not a
 * recurring expense — giving it a monthly equivalent would double-count it in /expenses/stats.
 */
@Injectable()
export class MirrorExpenseService {
  create(manager: EntityManager, input: MirrorExpenseInput): Promise<Expense> {
    const expense = manager.create(Expense, {
      userId: input.userId,
      name: input.name,
      description: input.description,
      category: input.category,
      amount: input.amount,
      currency: input.currency,
      // The enum NAME, because expenses.frequency is a native Postgres enum whose labels are the
      // member names. The wire form of this same row is 'one_time'.
      frequency: 'ONE_TIME' as const,
      date: input.paymentDate,
      startDate: null,
      endDate: null,
      isActive: true,
      tags: null,
      monthlyEquivalent: null,
      paymentAccountId: input.paymentAccountId,
      status: 'paid' as const,
      paidDate: input.paymentDate,
      paidAmount: input.amount,
      accountTransactionId: null,
      receiptUrl: null,
      // Set from the presence of an ACCOUNT, not from auto_pay — so a linked account with auto_pay
      // off still records 'transfer' with no transaction behind it. FastAPI's behaviour.
      paymentMethod: input.paymentAccountId ? 'transfer' : null,
      autoPay: false,
      deletedAt: null,
    });
    return manager.save(expense);
  }

  /**
   * Reversal. Asymmetric on purpose and must stay so: the expense is SOFT-deleted while the payment
   * row that points at it is hard-deleted by the caller, `status` stays 'paid', `paid_amount` stays
   * set, and `account_transaction_id` is NOT cleared even though the transaction was reversed.
   *
   * This is the only writer of expenses.deleted_at in the whole port.
   */
  async softDelete(manager: EntityManager, expenseId: string): Promise<void> {
    const expense = await manager.findOne(Expense, {
      where: { id: expenseId },
    });
    if (!expense) return;
    expense.deletedAt = naiveUtcNow();
    expense.isActive = false;
    await manager.save(expense);
  }
}
