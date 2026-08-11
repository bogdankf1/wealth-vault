import { Inject, Injectable } from '@nestjs/common';
import { DisplayCurrencyService } from '../../../common/currency/display-currency.service';
import { decAdd, decCmp, decDiv, decMul } from '../../../common/money/money';
import {
  OwnedRepository,
  ownedRepositoryToken,
} from '../../../common/repository/owned.repository';
import {
  toNaiveIso,
  toNaiveTimestamp,
} from '../../../common/time/naive-timestamp';
import { InstallmentDateRangeQueryDto } from '../dto/installment.dto';
import { Installment } from '../entities/installment.entity';

/** /stats — the two-decimal approximations. */
const STATS_MONTHLY: Record<string, string> = {
  weekly: '4.33',
  biweekly: '2.17',
  monthly: '1',
};

/** /history — more precise, and therefore disagrees with /stats for the same installment. */
const HISTORY_MONTHLY: Record<string, string> = {
  weekly: '4.33333',
  biweekly: '2.16667',
  monthly: '1',
};

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

export interface InstallmentStatsResponse {
  total_installments: number;
  active_installments: number;
  total_debt: string;
  monthly_payment: string;
  total_paid: string;
  currency: string;
  by_category: Record<string, string>;
  by_frequency: Record<string, number>;
  average_interest_rate: string | null;
  debt_free_date: string | null;
}

export interface InstallmentHistoryResponse {
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

@Injectable()
export class InstallmentStatsService {
  constructor(
    @Inject(ownedRepositoryToken(Installment))
    private readonly installments: OwnedRepository<Installment>,
    private readonly display: DisplayCurrencyService,
  ) {}

  async stats(
    userId: string,
    query: InstallmentDateRangeQueryDto,
  ): Promise<InstallmentStatsResponse> {
    const displayCurrency = await this.display.forUser(userId);
    const ranged = Boolean(query.start_date && query.end_date);

    const rows = ranged
      ? await this.installments
          .qb(userId, 'i')
          .andWhere('i.is_active = true')
          .andWhere('i.first_payment_date <= :end', {
            end: toNaiveTimestamp(query.end_date!),
          })
          .andWhere('(i.end_date IS NULL OR i.end_date >= :start)', {
            start: toNaiveTimestamp(query.start_date!),
          })
          .getMany()
      : await this.installments.find(userId);

    let totalDebt = '0';
    let monthlyPayment = '0';
    let totalPaid = '0';
    const byCategory: Record<string, string> = {};
    const byFrequency: Record<string, number> = {};
    const rates: string[] = [];
    let latestEnd: string | null = null;

    for (const row of rows) {
      const paidOff = row.paymentsMade >= row.numberOfPayments;

      // Falsy guard: a remaining balance of exactly 0.00 is skipped, not added.
      if (row.remainingBalance && decCmp(row.remainingBalance, '0') !== 0) {
        totalDebt = decAdd(totalDebt, row.remainingBalance);
      }
      if (row.isActive && !paidOff) {
        monthlyPayment = decAdd(
          monthlyPayment,
          decMul(row.amountPerPayment, STATS_MONTHLY[row.frequency] ?? '1'),
        );
      }
      // Unconditional — inactive and defaulted installments count too, and it uses the
      // calendar-derived payments_made rather than the recorded payment rows.
      totalPaid = decAdd(
        totalPaid,
        decMul(row.amountPerPayment, String(row.paymentsMade)),
      );

      byFrequency[row.frequency] = (byFrequency[row.frequency] ?? 0) + 1;
      if (row.category) {
        byCategory[row.category] = decAdd(
          byCategory[row.category] ?? '0',
          row.remainingBalance ?? '0',
        );
      }
      if (row.interestRate && decCmp(row.interestRate, '0') > 0) {
        rates.push(row.interestRate);
      }
      if (row.isActive && row.endDate) {
        const end = toNaiveIso(row.endDate)!;
        if (!latestEnd || end > latestEnd) latestEnd = end;
      }
    }

    return {
      total_installments: ranged ? rows.length : rows.length,
      active_installments: ranged
        ? rows.length
        : rows.filter((row) => row.isActive).length,
      total_debt: totalDebt,
      monthly_payment: monthlyPayment,
      total_paid: totalPaid,
      currency: displayCurrency,
      by_category: byCategory,
      by_frequency: byFrequency,
      // Unrounded Decimal division — e.g. "5.166666666666666666666666667".
      average_interest_rate:
        rates.length > 0
          ? decDiv(
              rates.reduce((acc, rate) => decAdd(acc, rate), '0'),
              String(rates.length),
            )
          : null,
      debt_free_date: latestEnd,
    };
  }

  async history(
    userId: string,
    query: InstallmentDateRangeQueryDto,
  ): Promise<InstallmentHistoryResponse> {
    const displayCurrency = await this.display.forUser(userId);
    const rangeStart = query.start_date
      ? toNaiveTimestamp(query.start_date)
      : null;
    const rangeEnd = query.end_date ? toNaiveTimestamp(query.end_date) : null;

    const rows = await this.installments.find(userId, {
      where: { isActive: true },
    });
    const buckets = new Map<string, { total: string; count: number }>();

    for (const row of rows) {
      const start = toNaiveIso(row.firstPaymentDate)!;
      const end = toNaiveIso(row.endDate);
      if (rangeStart && rangeEnd) {
        const inRange = end
          ? start <= rangeEnd && end >= rangeStart
          : start <= rangeEnd;
        if (!inRange) continue;
      }

      const monthly = decMul(
        row.amountPerPayment,
        HISTORY_MONTHLY[row.frequency] ?? '1',
      );
      const walkStart = rangeStart && rangeStart > start ? rangeStart : start;
      let walkEnd: string;
      if (end && rangeEnd) {
        walkEnd = end < rangeEnd ? end : rangeEnd;
      } else {
        walkEnd = end ?? rangeEnd ?? this.today();
      }

      let cursor = yearMonthOf(walkStart);
      const last = yearMonthOf(walkEnd);
      while (!isAfter(cursor, last)) {
        const key = monthKey(cursor);
        const bucket = buckets.get(key) ?? { total: '0', count: 0 };
        buckets.set(key, {
          total: decAdd(bucket.total, monthly),
          count: bucket.count + 1,
        });
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

    return {
      history,
      total_months: history.length,
      overall_average:
        history.length > 0
          ? decDiv(
              history.reduce((acc, item) => decAdd(acc, item.total), '0'),
              String(history.length),
            )
          : '0',
      currency: displayCurrency,
    };
  }

  /** Open-ended schedules project to today, not twelve months out as subscriptions do. */
  private today(): string {
    return new Date().toISOString().slice(0, 10) + 'T00:00:00';
  }
}
