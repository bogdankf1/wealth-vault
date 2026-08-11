import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { naiveUtcNow } from '../../../common/entities/naive-timestamp.entity';
import {
  OwnedRepository,
  ownedRepositoryToken,
} from '../../../common/repository/owned.repository';
import { toNaiveIso } from '../../../common/time/naive-timestamp';
import { advance } from '../../income/services/income-backfill.service';
import { AccountTransactionService } from '../../savings/account-transaction.service';
import { Expense } from '../entities/expense.entity';
import { EXPENSE_STATUS } from '../enums';
import type { ExpenseFrequencyName } from '../enums';

/** Calendar steps from get_frequency_interval. DAILY has no income equivalent. */
const STEP: Record<ExpenseFrequencyName, { months?: number; days?: number }> = {
  ONE_TIME: { months: 1 },
  DAILY: { days: 1 },
  WEEKLY: { days: 7 },
  BIWEEKLY: { days: 14 },
  MONTHLY: { months: 1 },
  QUARTERLY: { months: 3 },
  ANNUALLY: { months: 12 },
};

const dayOf = (timestamp: string): string => timestamp.slice(0, 10);

export interface ProcessDuePaymentsResponse {
  status: string;
  due_count: number;
  processed: number;
  auto_paid: number;
  failed_payments: Array<{
    expense_id: string;
    expense_name: string;
    reason: string;
    amount: number;
    currency: string;
  }>;
  errors: Array<{ expense_id: string; expense_name: string; error: string }>;
  timestamp: string;
}

@Injectable()
export class ExpenseDueService {
  private readonly logger = new Logger(ExpenseDueService.name);

  constructor(
    @Inject(ownedRepositoryToken(Expense))
    private readonly expenses: OwnedRepository<Expense>,
    private readonly accountTransactions: AccountTransactionService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * Historical payment backfill, run when sync_historical is asked for on a expense that pays
   * itself from an account.
   *
   * Atomic, unlike FastAPI, which commits inside every create_withdrawal and catches per iteration
   * — so a mid-loop insufficient-funds there leaves a half-filled history and reports only a count.
   * Like FastAPI, a failure never fails the request that triggered it.
   */
  async backfill(expense: Expense): Promise<number> {
    if (!expense.autoPay || !expense.paymentAccountId) return 0;
    try {
      return await this.dataSource.transaction((manager) =>
        this.runBackfill(manager, expense),
      );
    } catch (error) {
      this.logger.error(
        `Failed to backfill expense ${expense.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return 0;
    }
  }

  private async runBackfill(
    manager: EntityManager,
    expense: Expense,
  ): Promise<number> {
    const today = new Date().toISOString().slice(0, 10);
    const start = toNaiveIso(expense.startDate);
    if (!start) return 0;
    const end = toNaiveIso(expense.endDate);

    // Dedupe against ledger rows this expense already produced. FastAPI omits the user filter.
    const existing = await manager
      .createQueryBuilder()
      .select('t.transaction_date', 'transaction_date')
      .from('account_transactions', 't')
      .where('t.source_type = :sourceType', { sourceType: 'expense' })
      .andWhere('t.source_id = :sourceId', { sourceId: expense.id })
      .andWhere('t.user_id = :userId', { userId: expense.userId })
      .getRawMany<{ transaction_date: Date }>();
    const paidDays = new Set(
      existing.map((row) => row.transaction_date.toISOString().slice(0, 10)),
    );

    let created = 0;
    let cursor = start;
    let lastDate = start;
    let lastTransactionId: string | null = null;

    while (dayOf(cursor) <= today) {
      if (end && dayOf(cursor) > dayOf(end)) break;
      if (!paidDays.has(dayOf(cursor))) {
        const transaction = await this.accountTransactions.createWithdrawal(
          manager,
          {
            accountId: expense.paymentAccountId!,
            userId: expense.userId,
            amount: expense.amount,
            description: `Payment for expense: ${expense.name}`,
            sourceType: 'expense',
            sourceId: expense.id,
            category: expense.category,
            transactionDate: new Date(`${cursor}Z`),
          },
        );
        lastTransactionId = transaction.id;
        lastDate = cursor;
        created += 1;
      }
      cursor = advance(cursor, STEP[expense.frequency]);
    }

    if (created > 0) {
      // The expense keeps only the LAST payment — there is no per-payment child table, so
      // history lives solely in account_transactions.
      expense.status = EXPENSE_STATUS.PAID;
      expense.paidDate = lastDate.replace('T', ' ');
      expense.paidAmount = expense.amount;
      expense.accountTransactionId = lastTransactionId;
      expense.updatedAt = naiveUtcNow();
      await manager.save(expense);
    }
    return created;
  }

  /**
   * POST /process-due-payments. Deliberately does NOT require auto_pay — FastAPI's comment says
   * manual processing shouldn't — while the Celery task that runs nightly does require it.
   *
   * Note there is no end_date check on this path in FastAPI, so an expired recurring expense keeps
   * paying forever. Replicated.
   */
  async processDuePayments(
    userId: string,
  ): Promise<ProcessDuePaymentsResponse> {
    const now = new Date();
    const rows = await this.expenses
      .qb(userId, 'e')
      .andWhere('e.is_active = true')
      .andWhere('e.deleted_at IS NULL')
      .andWhere('e.payment_account_id IS NOT NULL')
      .andWhere("e.frequency <> 'ONE_TIME'")
      .andWhere('e.start_date IS NOT NULL')
      .getMany();

    const failed: ProcessDuePaymentsResponse['failed_payments'] = [];
    const errors: ProcessDuePaymentsResponse['errors'] = [];
    let dueCount = 0;
    let processed = 0;

    for (const expense of rows) {
      if (!this.isDueToday(expense, now)) continue;
      // Rows already paid today are skipped BEFORE due_count increments.
      const paidDate = toNaiveIso(expense.paidDate);
      if (paidDate && dayOf(paidDate) === now.toISOString().slice(0, 10)) {
        continue;
      }
      dueCount += 1;

      try {
        await this.dataSource.transaction(async (manager) => {
          const transaction = await this.accountTransactions.createWithdrawal(
            manager,
            {
              accountId: expense.paymentAccountId!,
              userId,
              amount: expense.amount,
              description: `Auto-payment for recurring expense: ${expense.name} (manual trigger)`,
              sourceType: 'expense',
              sourceId: expense.id,
              category: expense.category,
            },
          );
          expense.status = EXPENSE_STATUS.PAID;
          expense.paidDate = naiveUtcNow(now);
          expense.paidAmount = expense.amount;
          expense.accountTransactionId = transaction.id;
          expense.updatedAt = naiveUtcNow(now);
          await manager.save(expense);
        });
        processed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.startsWith('Insufficient funds')) {
          failed.push({
            expense_id: expense.id,
            expense_name: expense.name,
            reason: 'insufficient_funds',
            // Floats, like everything else in this hand-built dict.
            amount: Number(expense.amount),
            currency: expense.currency,
          });
        } else {
          errors.push({
            expense_id: expense.id,
            expense_name: expense.name,
            error: message,
          });
        }
      }
    }

    return {
      status: 'success',
      due_count: dueCount,
      processed,
      auto_paid: processed,
      failed_payments: failed,
      errors,
      // The only tz-aware timestamp in the module — isoformat() of a UTC datetime, so '+00:00'.
      timestamp: `${now.toISOString().replace('Z', '')}+00:00`,
    };
  }

  /**
   * is_expense_due_today. Modular arithmetic anchored on start_date, with no clamping — a start on
   * the 31st simply never fires in a short month — and no end_date guard.
   */
  private isDueToday(expense: Expense, now: Date): boolean {
    const start = toNaiveIso(expense.startDate);
    if (!start) return false;
    const startDay = new Date(`${dayOf(start)}T00:00:00Z`);
    const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
    if (startDay > today) return false;

    const daysSince = Math.round(
      (today.getTime() - startDay.getTime()) / 86_400_000,
    );
    switch (expense.frequency) {
      case 'DAILY':
        return true;
      case 'WEEKLY':
        return daysSince % 7 === 0;
      case 'BIWEEKLY':
        return daysSince % 14 === 0;
      case 'MONTHLY':
        return today.getUTCDate() === startDay.getUTCDate();
      case 'QUARTERLY': {
        const monthsDiff =
          (today.getUTCFullYear() - startDay.getUTCFullYear()) * 12 +
          (today.getUTCMonth() - startDay.getUTCMonth());
        return (
          monthsDiff % 3 === 0 && today.getUTCDate() === startDay.getUTCDate()
        );
      }
      case 'ANNUALLY':
        return (
          today.getUTCMonth() === startDay.getUTCMonth() &&
          today.getUTCDate() === startDay.getUTCDate()
        );
      default:
        return false;
    }
  }
}
