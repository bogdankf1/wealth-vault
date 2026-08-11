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
import { SubscriptionDateRangeQueryDto } from '../dto/subscription.dto';
import { Subscription } from '../entities/subscription.entity';

/**
 * The /stats multipliers come from BINARY FLOAT division in Python — `Decimal(str(1/3))` — so they
 * carry 16-17 significant digits into the response. `monthly_cost` for a quarterly subscription
 * lands as something like "9.9966666666666667". These strings are the exact values Python produces;
 * writing '0.333333' here instead would be a different number.
 */
const STATS_MONTHLY: Record<string, string> = {
  monthly: '1',
  quarterly: '0.3333333333333333',
  annually: '0.08333333333333333',
  biannually: '0.16666666666666666',
};

/** A separate INTEGER table, so total_annual_cost is not monthly_cost × 12. */
const STATS_ANNUAL: Record<string, string> = {
  monthly: '12',
  quarterly: '4',
  annually: '1',
  biannually: '2',
};

/** /history disagrees with both of the above — six-decimal string constants. */
const HISTORY_MONTHLY: Record<string, string> = {
  monthly: '1',
  quarterly: '0.333333',
  annually: '0.083333',
  biannually: '0.166667',
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

export interface SubscriptionStatsResponse {
  total_subscriptions: number;
  active_subscriptions: number;
  monthly_cost: string;
  total_annual_cost: string;
  currency: string;
  by_category: Record<string, string>;
  by_frequency: Record<string, number>;
}

export interface SubscriptionHistoryResponse {
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
export class SubscriptionStatsService {
  constructor(
    @Inject(ownedRepositoryToken(Subscription))
    private readonly subscriptions: OwnedRepository<Subscription>,
    private readonly display: DisplayCurrencyService,
    private readonly converter: CurrencyConverterService,
  ) {}

  async stats(
    userId: string,
    query: SubscriptionDateRangeQueryDto,
  ): Promise<SubscriptionStatsResponse> {
    const displayCurrency = await this.display.forUser(userId);
    const ranged = Boolean(query.start_date && query.end_date);

    let rows: Subscription[];
    if (ranged) {
      const start = toNaiveTimestamp(query.start_date!);
      const end = toNaiveTimestamp(query.end_date!);
      rows = await this.subscriptions
        .qb(userId, 's')
        .andWhere('s.is_active = true')
        .andWhere('s.start_date <= :end', { end })
        .andWhere('(s.end_date IS NULL OR s.end_date >= :start)', { start })
        .getMany();
    } else {
      rows = await this.subscriptions.find(userId);
    }

    let monthlyCost = '0';
    let annualCost = '0';
    const byCategory: Record<string, string> = {};
    const byFrequency: Record<string, number> = {};

    for (const row of rows) {
      // by_frequency counts EVERY subscription, active or not — the increment sits outside the
      // is_active guard in FastAPI. by_category and the costs only count active ones.
      byFrequency[row.frequency] = (byFrequency[row.frequency] ?? 0) + 1;
      if (!row.isActive) continue;

      const amount = await this.inDisplayCurrency(
        row.amount,
        row.currency,
        displayCurrency,
      );
      const monthly = decMul(amount, STATS_MONTHLY[row.frequency] ?? '1');
      monthlyCost = decAdd(monthlyCost, monthly);
      annualCost = decAdd(
        annualCost,
        decMul(amount, STATS_ANNUAL[row.frequency] ?? '12'),
      );

      // Rows with no category vanish from the breakdown but still count in monthly_cost, so the
      // map does not sum to the total.
      if (row.category) {
        byCategory[row.category] = decAdd(
          byCategory[row.category] ?? '0',
          monthly,
        );
      }
    }

    const counts = ranged
      ? { total: rows.length, active: rows.length }
      : {
          total: rows.length,
          active: rows.filter((row) => row.isActive).length,
        };

    return {
      total_subscriptions: counts.total,
      active_subscriptions: counts.active,
      monthly_cost: monthlyCost,
      total_annual_cost: annualCost,
      currency: displayCurrency,
      by_category: byCategory,
      by_frequency: byFrequency,
    };
  }

  async history(
    userId: string,
    query: SubscriptionDateRangeQueryDto,
  ): Promise<SubscriptionHistoryResponse> {
    const displayCurrency = await this.display.forUser(userId);
    const rangeStart = query.start_date
      ? toNaiveTimestamp(query.start_date)
      : null;
    const rangeEnd = query.end_date ? toNaiveTimestamp(query.end_date) : null;

    const rows = await this.subscriptions.find(userId, {
      where: { isActive: true },
    });

    const buckets = new Map<string, { total: string; count: number }>();
    for (const row of rows) {
      const subStart = toNaiveIso(row.startDate);
      const subEnd = toNaiveIso(row.endDate);
      if (!subStart) continue;

      if (rangeStart && rangeEnd) {
        const inRange = subEnd
          ? subStart <= rangeEnd && subEnd >= rangeStart
          : subStart <= rangeEnd;
        if (!inRange) continue;
      }

      const amount = await this.inDisplayCurrency(
        row.amount,
        row.currency,
        displayCurrency,
      );
      // The monthly equivalent is charged to EVERY month in range, so an annual subscription
      // contributes a twelfth to all twelve months rather than its full amount to one.
      const monthly = decMul(amount, HISTORY_MONTHLY[row.frequency] ?? '1');

      const walkStart =
        rangeStart && rangeStart > subStart ? rangeStart : subStart;
      let walkEnd: string;
      if (subEnd && rangeEnd) {
        walkEnd = subEnd < rangeEnd ? subEnd : rangeEnd;
      } else {
        // Ongoing subscriptions are projected twelve months past today, so /history returns
        // FUTURE months as well as past ones.
        walkEnd = subEnd ?? rangeEnd ?? this.twelveMonthsOut();
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

    const totalMonths = history.length;
    return {
      history,
      total_months: totalMonths,
      overall_average:
        totalMonths > 0
          ? decDiv(
              history.reduce((acc, item) => decAdd(acc, item.total), '0'),
              String(totalMonths),
            )
          : '0',
      currency: displayCurrency,
    };
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
