import { Inject, Injectable } from '@nestjs/common';
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
import { DateRangeQueryDto } from '../dto/income-query.dto';
import { IncomeSource } from '../entities/income-source.entity';
import { HISTORY_MULTIPLIER } from '../enums';
import { DisplayCurrencyService } from './display-currency.service';

export interface MonthlyIncomeHistory {
  month: string;
  total: string;
  count: number;
  currency: string;
}

export interface IncomeHistoryResponse {
  history: MonthlyIncomeHistory[];
  total_months: number;
  overall_average: string;
  currency: string;
}

interface YearMonth {
  year: number;
  month: number;
}

/** All timestamps here are 'YYYY-MM-DDTHH:MM:SS' strings, so lexical order is chronological. */
function yearMonthOf(timestamp: string): YearMonth {
  return {
    year: Number(timestamp.slice(0, 4)),
    month: Number(timestamp.slice(5, 7)),
  };
}

function monthKey({ year, month }: YearMonth): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function nextMonth({ year, month }: YearMonth): YearMonth {
  return month === 12
    ? { year: year + 1, month: 1 }
    : { year, month: month + 1 };
}

function isAfter(a: YearMonth, b: YearMonth): boolean {
  return a.year > b.year || (a.year === b.year && a.month > b.month);
}

/**
 * Port of get_income_history — a projection over income_sources, not a read of recorded
 * transactions. Note it uses HISTORY_MULTIPLIER, whose constants differ from the ones
 * `monthly_equivalent` and /stats use (4.33333 vs 4.33). Both are live behaviour; /stats and
 * /history genuinely disagree about what a weekly income is worth per month.
 */
@Injectable()
export class IncomeHistoryService {
  constructor(
    @Inject(ownedRepositoryToken(IncomeSource))
    private readonly sources: OwnedRepository<IncomeSource>,
    private readonly display: DisplayCurrencyService,
    private readonly converter: CurrencyConverterService,
  ) {}

  async history(
    userId: string,
    query: DateRangeQueryDto,
  ): Promise<IncomeHistoryResponse> {
    const displayCurrency = await this.display.forUser(userId);
    const rangeStart = query.start_date
      ? toNaiveTimestamp(query.start_date)
      : null;
    const rangeEnd = query.end_date ? toNaiveTimestamp(query.end_date) : null;

    const sources = await this.sources.find(userId, {
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

    for (const source of sources) {
      const sourceDate = toNaiveIso(source.date);
      const sourceStart = toNaiveIso(source.startDate);
      const sourceEnd = toNaiveIso(source.endDate);

      // The in-range test only runs when BOTH bounds were supplied.
      if (rangeStart && rangeEnd) {
        if (
          !this.inRange(
            source,
            sourceDate,
            sourceStart,
            sourceEnd,
            rangeStart,
            rangeEnd,
          )
        ) {
          continue;
        }
      }

      const amount = await this.inDisplayCurrency(
        source.amount,
        source.currency,
        displayCurrency,
      );

      if (source.frequency === 'ONE_TIME') {
        // One-time income lands in the month it occurred, at its FULL amount — the history
        // multiplier of 0 is never applied to it.
        if (!sourceDate) continue;
        if (rangeStart && rangeEnd) {
          if (sourceDate < rangeStart || sourceDate > rangeEnd) continue;
        }
        add(monthKey(yearMonthOf(sourceDate)), amount);
        continue;
      }

      if (!sourceStart) continue;
      const monthlyEquivalent = decMul(
        amount,
        HISTORY_MULTIPLIER[source.frequency],
      );

      const walkStart =
        rangeStart && rangeStart > sourceStart ? rangeStart : sourceStart;
      let walkEnd: string;
      if (sourceEnd && rangeEnd) {
        walkEnd = sourceEnd < rangeEnd ? sourceEnd : rangeEnd;
      } else {
        walkEnd = sourceEnd ?? rangeEnd ?? this.twelveMonthsOut();
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
    let overallAverage = '0';
    if (totalMonths > 0) {
      const sum = history.reduce((acc, item) => decAdd(acc, item.total), '0');
      // An unrounded 28-significant-digit division, exactly like Python's. It can legitimately
      // emit something like "3333.333333333333333333333333" — do not round it.
      overallAverage = decDiv(sum, String(totalMonths));
    }

    return {
      history,
      total_months: totalMonths,
      overall_average: overallAverage,
      currency: displayCurrency,
    };
  }

  private inRange(
    source: IncomeSource,
    sourceDate: string | null,
    sourceStart: string | null,
    sourceEnd: string | null,
    rangeStart: string,
    rangeEnd: string,
  ): boolean {
    if (source.frequency === 'ONE_TIME') {
      return Boolean(
        sourceDate && sourceDate >= rangeStart && sourceDate <= rangeEnd,
      );
    }
    if (!sourceStart) return false;
    return sourceEnd
      ? sourceStart <= rangeEnd && sourceEnd >= rangeStart
      : sourceStart <= rangeEnd;
  }

  /** FastAPI's open-ended horizon: datetime.now() + 12 months. */
  private twelveMonthsOut(): string {
    const now = new Date();
    const year = now.getUTCFullYear() + 1;
    const month = now.getUTCMonth() + 1;
    return `${year}-${String(month).padStart(2, '0')}-01T00:00:00`;
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
