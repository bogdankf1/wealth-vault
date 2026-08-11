import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { toNaiveIso } from '../../../common/time/naive-timestamp';
import { AccountTransactionService } from '../../savings/account-transaction.service';
import { IncomeSource } from '../entities/income-source.entity';
import { IncomeTransaction } from '../entities/income-transaction.entity';
import { IncomeFrequencyName } from '../enums';

/** Calendar step per frequency, mirroring the relativedelta intervals in create_income_source. */
const STEP: Record<IncomeFrequencyName, { months?: number; days?: number }> = {
  ONE_TIME: { months: 1 }, // never used — one-time income emits a single deposit
  WEEKLY: { days: 7 },
  BIWEEKLY: { days: 14 },
  MONTHLY: { months: 1 },
  QUARTERLY: { months: 3 },
  ANNUALLY: { months: 12 },
};

/** 'YYYY-MM-DDTHH:MM:SS' → the date half, which is what every comparison here comes down to. */
function dayOf(timestamp: string): string {
  return timestamp.slice(0, 10);
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Advances a naive timestamp by a calendar step.
 *
 * Month steps clamp and then STAY clamped, because each step is taken from the previous value
 * rather than from the original anchor: Jan 31 → Feb 28 → Mar 28. That is what relativedelta does
 * and re-anchoring to the original day-of-month would silently produce different deposit dates.
 */
export function advance(
  timestamp: string,
  step: { months?: number; days?: number },
): string {
  // Accept either separator: Postgres hands back '2026-08-11 10:00:00' while our own helpers emit
  // the ISO 'T' form, and splitting on 'T' alone turned the space form into NaN.
  const [datePart, timePart = '00:00:00'] = timestamp
    .replace(' ', 'T')
    .split('T');
  const [year, month, day] = datePart.split('-').map(Number);

  if (step.days) {
    const shifted = new Date(Date.UTC(year, month - 1, day + step.days));
    return `${shifted.toISOString().slice(0, 10)}T${timePart}`;
  }

  const months = step.months ?? 1;
  const totalMonths = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDay);
  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}T${timePart}`;
}

/**
 * Historical auto-deposit backfill, run when a source has auto_deposit and a target account.
 *
 * Two differences from FastAPI, both deliberate:
 *  - it is atomic. FastAPI commits inside every create_deposit, so a weekly income backdated to
 *    2020 performs ~250 separate commits and a failure at #180 leaves 179 of them persisted.
 *  - the whole thing still cannot fail the request: the caller swallows errors exactly as FastAPI
 *    does, because creating the income source must succeed either way.
 */
@Injectable()
export class IncomeBackfillService {
  private readonly logger = new Logger(IncomeBackfillService.name);

  constructor(
    private readonly deposits: AccountTransactionService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** Returns the number of deposits written. Never throws — mirrors FastAPI's try/except. */
  async backfill(source: IncomeSource): Promise<number> {
    if (!source.autoDeposit || !source.targetAccountId) return 0;

    try {
      return await this.dataSource.transaction((manager) =>
        this.run(manager, source),
      );
    } catch (error) {
      // FastAPI logs and rolls back here without failing the request; the source still exists.
      this.logger.error(
        `Failed to auto-deposit income source ${source.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return 0;
    }
  }

  private async run(
    manager: EntityManager,
    source: IncomeSource,
  ): Promise<number> {
    const today = todayUtc();
    const existingDays = await this.existingDays(manager, source.id);

    const dueDates: string[] = [];
    if (source.frequency === 'ONE_TIME') {
      const date = toNaiveIso(source.date);
      if (date && dayOf(date) <= today) dueDates.push(date);
    } else {
      const start = toNaiveIso(source.startDate);
      if (!start) return 0;
      const end = toNaiveIso(source.endDate);
      let cursor = start;
      while (dayOf(cursor) <= today) {
        if (end && dayOf(cursor) > dayOf(end)) break;
        dueDates.push(cursor);
        cursor = advance(cursor, STEP[source.frequency]);
      }
    }

    let created = 0;
    for (const dueDate of dueDates) {
      // Dedup is by calendar day, not by timestamp — a source edited mid-day must not re-deposit.
      if (existingDays.has(dayOf(dueDate))) continue;

      const transaction = manager.create(IncomeTransaction, {
        userId: source.userId,
        sourceId: source.id,
        amount: source.amount,
        currency: source.currency,
        date: dueDate,
        description: `Income: ${source.name}`,
        category: source.category,
        notes: null,
        depositedToAccountId: null,
        accountTransactionId: null,
        status: 'RECEIVED' as const,
      });
      await manager.save(transaction);

      const accountTransaction = await this.deposits.createDeposit(manager, {
        accountId: source.targetAccountId!,
        userId: source.userId,
        amount: source.amount,
        sourceType: 'income',
        sourceId: transaction.id,
        description: `Income: ${source.name}`,
        category: source.category ?? 'income',
        transactionDate: new Date(`${dueDate}Z`),
      });

      transaction.status = 'DEPOSITED';
      transaction.depositedToAccountId = source.targetAccountId;
      transaction.accountTransactionId = accountTransaction.id;
      await manager.save(transaction);
      created += 1;
    }

    if (created > 0) {
      this.logger.log(
        `Auto-deposited ${created} transactions for income source ${source.id}`,
      );
    }
    return created;
  }

  private async existingDays(
    manager: EntityManager,
    sourceId: string,
  ): Promise<Set<string>> {
    const rows = await manager.find(IncomeTransaction, {
      where: { sourceId },
      select: { date: true },
    });
    return new Set(rows.map((row) => dayOf(toNaiveIso(row.date)!)));
  }
}
