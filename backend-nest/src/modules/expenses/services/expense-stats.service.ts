import { Inject, Injectable } from '@nestjs/common';
import { DisplayCurrencyService } from '../../../common/currency/display-currency.service';
import { decAdd, decDiv, decMul } from '../../../common/money/money';
import {
  OwnedRepository,
  ownedRepositoryToken,
} from '../../../common/repository/owned.repository';
import {
  toNaiveIso,
  toNaiveTimestamp,
} from '../../../common/time/naive-timestamp';
import { CurrencyConverterService } from '../../currency/currency-converter.service';
import { ExpenseDateRangeQueryDto } from '../dto/expense.dto';
import { Expense } from '../entities/expense.entity';
import { DECIMAL_FROM_FLOAT_4_33, STATS_MULTIPLIER } from '../enums';

export interface ExpenseStatsResponse {
  total_expenses: number;
  active_expenses: number;
  total_daily_expense: string;
  total_weekly_expense: string;
  total_monthly_expense: string;
  total_annual_expense: string;
  expenses_by_category: Record<string, string>;
  currency: string;
}

export interface ExpenseHistoryResponse {
  history: Array<{
    month: string;
    total: string;
    count: number;
    currency: string;
  }>;
  total_months: number;
  overall_average: string;
  currency: string;
}

interface YearMonth {
  year: number;
  month: number;
}

const yearMonthOf = (ts: string): YearMonth => ({
  year: Number(ts.slice(0, 4)),
  month: Number(ts.slice(5, 7)),
});
const monthKey = ({ year, month }: YearMonth): string =>
  `${year}-${String(month).padStart(2, '0')}`;
const nextMonth = ({ year, month }: YearMonth): YearMonth =>
  month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
const isAfter = (a: YearMonth, b: YearMonth): boolean =>
  a.year > b.year || (a.year === b.year && a.month > b.month);

/**
 * Port of service/stats.py. All three endpoints loop in application code — FastAPI issues a bare
 * `SELECT * FROM expenses WHERE user_id = ...` with no GROUP BY and does the arithmetic in Python,
 * because every row may need a currency conversion first.
 *
 * Two filtering quirks are deliberate: neither /stats nor /history filters deleted_at (so rows
 * soft-deleted by the subscriptions and installments reversal paths still count), and /stats
 * filters is_active in application code rather than SQL.
 */
@Injectable()
export class ExpenseStatsService {
  constructor(
    @Inject(ownedRepositoryToken(Expense))
    private readonly expenses: OwnedRepository<Expense>,
    private readonly display: DisplayCurrencyService,
    private readonly converter: CurrencyConverterService,
  ) {}

  async stats(
    userId: string,
    query: ExpenseDateRangeQueryDto,
  ): Promise<ExpenseStatsResponse> {
    const displayCurrency = await this.display.forUser(userId);
    const rangeStart = query.start_date
      ? toNaiveTimestamp(query.start_date)
      : null;
    const rangeEnd = query.end_date ? toNaiveTimestamp(query.end_date) : null;
    const ranged = Boolean(rangeStart && rangeEnd);

    // No is_active and no deleted_at predicate — both are FastAPI's omissions.
    const rows = await this.expenses.find(userId);

    let totalDaily = '0';
    let totalWeekly = '0';
    let totalMonthly = '0';
    let totalAnnual = '0';
    let totalOneTime = '0';
    const byCategory: Record<string, string> = {};
    let filteredCount = 0;

    for (const row of rows) {
      if (!row.isActive) continue;
      if (ranged && !this.inRange(row, rangeStart!, rangeEnd!)) continue;
      filteredCount += 1;

      const amount = await this.inDisplayCurrency(
        row.amount,
        row.currency,
        displayCurrency,
      );

      // One-time expenses count at full amount, both in the category map and in their own bucket.
      let monthlyEquivalent: string;
      if (row.frequency === 'ONE_TIME') {
        monthlyEquivalent = amount;
        totalOneTime = decAdd(totalOneTime, amount);
      } else {
        monthlyEquivalent = decMul(amount, STATS_MULTIPLIER[row.frequency]);
      }

      // The frequency buckets use DIFFERENT maths from the category map above: biweekly halves
      // into the weekly bucket and quarterly thirds into the monthly one, where the map applies
      // the 2.16667 / 0.333333 multipliers. Same row, two answers — FastAPI's, preserved.
      switch (row.frequency) {
        case 'DAILY':
          totalDaily = decAdd(totalDaily, amount);
          break;
        case 'WEEKLY':
          totalWeekly = decAdd(totalWeekly, amount);
          break;
        case 'BIWEEKLY':
          totalWeekly = decAdd(totalWeekly, decDiv(amount, '2'));
          break;
        case 'MONTHLY':
          totalMonthly = decAdd(totalMonthly, amount);
          break;
        case 'QUARTERLY':
          totalMonthly = decAdd(totalMonthly, decDiv(amount, '3'));
          break;
        case 'ANNUALLY':
          totalAnnual = decAdd(totalAnnual, amount);
          break;
        default:
          break;
      }

      // Rows with no category are dropped from the map but still counted in the totals.
      if (row.category) {
        byCategory[row.category] = decAdd(
          byCategory[row.category] ?? '0',
          monthlyEquivalent,
        );
      }
    }

    // The roll-up. Decimal(4.33) here is built FROM A FLOAT in Python, so its binary expansion
    // leaks into the response: one weekly expense of 100.00 gives
    // total_monthly_expense "433.0000000000000071054273576".
    const totalMonthlyExpense = decAdd(
      decAdd(
        decAdd(
          decAdd(
            decMul(totalDaily, '30'),
            decMul(totalWeekly, DECIMAL_FROM_FLOAT_4_33),
          ),
          totalMonthly,
        ),
        decDiv(totalAnnual, '12'),
      ),
      totalOneTime,
    );

    return {
      total_expenses: ranged ? filteredCount : rows.length,
      active_expenses: ranged
        ? filteredCount
        : rows.filter((row) => row.isActive).length,
      total_daily_expense: decDiv(totalMonthlyExpense, '30'),
      total_weekly_expense: decDiv(decMul(totalMonthlyExpense, '7'), '30'),
      total_monthly_expense: totalMonthlyExpense,
      total_annual_expense: decMul(totalMonthlyExpense, '12'),
      expenses_by_category: byCategory,
      currency: displayCurrency,
    };
  }

  async history(
    userId: string,
    query: ExpenseDateRangeQueryDto,
  ): Promise<ExpenseHistoryResponse> {
    const displayCurrency = await this.display.forUser(userId);
    const rangeStart = query.start_date
      ? toNaiveTimestamp(query.start_date)
      : null;
    const rangeEnd = query.end_date ? toNaiveTimestamp(query.end_date) : null;

    // is_active IS filtered here, deleted_at is not.
    const rows = await this.expenses.find(userId, {
      where: { isActive: true },
    });

    const buckets = new Map<string, { total: string; count: number }>();
    const add = (key: string, amount: string): void => {
      const bucket = buckets.get(key) ?? { total: '0', count: 0 };
      buckets.set(key, {
        total: decAdd(bucket.total, amount),
        count: bucket.count + 1,
      });
    };

    for (const row of rows) {
      const rowDate = toNaiveIso(row.date);
      const rowStart = toNaiveIso(row.startDate);
      const rowEnd = toNaiveIso(row.endDate);

      if (rangeStart && rangeEnd && !this.inRange(row, rangeStart, rangeEnd)) {
        continue;
      }

      const amount = await this.inDisplayCurrency(
        row.amount,
        row.currency,
        displayCurrency,
      );

      if (row.frequency === 'ONE_TIME') {
        if (!rowDate) continue;
        if (rangeStart && rangeEnd) {
          if (rowDate < rangeStart || rowDate > rangeEnd) continue;
        }
        add(monthKey(yearMonthOf(rowDate)), amount);
        continue;
      }

      if (!rowStart) continue;
      const monthlyEquivalent = decMul(amount, STATS_MULTIPLIER[row.frequency]);

      const walkStart =
        rangeStart && rangeStart > rowStart ? rangeStart : rowStart;
      let walkEnd: string;
      if (rowEnd && rangeEnd) {
        walkEnd = rowEnd < rangeEnd ? rowEnd : rangeEnd;
      } else {
        walkEnd = rowEnd ?? rangeEnd ?? this.twelveMonthsOut();
      }

      let cursor = yearMonthOf(walkStart);
      const last = yearMonthOf(walkEnd);
      while (!isAfter(cursor, last)) {
        add(monthKey(cursor), monthlyEquivalent);
        cursor = nextMonth(cursor);
      }
    }

    const history = [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, bucket]) => ({
        month,
        total: bucket.total,
        count: bucket.count,
        currency: displayCurrency,
      }));

    const totalMonths = history.length;
    const overallAverage =
      totalMonths > 0
        ? decDiv(
            history.reduce((acc, item) => decAdd(acc, item.total), '0'),
            String(totalMonths),
          )
        : '0';

    return {
      history,
      total_months: totalMonths,
      overall_average: overallAverage,
      currency: displayCurrency,
    };
  }

  /** Only consulted when BOTH bounds were supplied. */
  private inRange(row: Expense, start: string, end: string): boolean {
    if (row.frequency === 'ONE_TIME') {
      const date = toNaiveIso(row.date);
      return Boolean(date && date >= start && date <= end);
    }
    const rowStart = toNaiveIso(row.startDate);
    if (!rowStart) return false;
    const rowEnd = toNaiveIso(row.endDate);
    return rowEnd ? rowStart <= end && rowEnd >= start : rowStart <= end;
  }

  private twelveMonthsOut(): string {
    const now = new Date();
    return `${now.getUTCFullYear() + 1}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01T00:00:00`;
  }

  private async inDisplayCurrency(
    amount: string,
    from: string,
    to: string,
  ): Promise<string> {
    if (from === to) return amount;
    const converted = await this.converter.convert(amount, from, to);
    return converted ?? amount;
  }
}
