import { Inject, Injectable } from '@nestjs/common';
import { decAdd, decIsZero, decMul } from '../../../common/money/money';
import {
  OwnedRepository,
  ownedRepositoryToken,
} from '../../../common/repository/owned.repository';
import { toNaiveTimestamp } from '../../../common/time/naive-timestamp';
import { CurrencyConverterService } from '../../currency/currency-converter.service';
import { DateRangeQueryDto } from '../dto/income-query.dto';
import { IncomeSource } from '../entities/income-source.entity';
import { MONTHLY_MULTIPLIER } from '../enums';
import { DisplayCurrencyService } from '../../../common/currency/display-currency.service';

export interface IncomeStatsResponse {
  total_sources: number;
  active_sources: number;
  total_monthly_income: string;
  total_annual_income: string;
  total_transactions: number;
  total_transactions_amount: string;
  transactions_current_month: number;
  transactions_current_month_amount: string;
  transactions_last_month: number;
  transactions_last_month_amount: string;
  currency: string;
}

/** UTC month boundary as the naive text Postgres compares against. */
function monthStart(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01T00:00:00`;
}

/**
 * Port of get_income_stats.
 *
 * Read the field names with care: `total_transactions`,
 * `transactions_current_month` and `transactions_last_month` count income *sources*, not
 * transactions — the income_transactions table is never read by this endpoint. That is FastAPI's
 * behaviour and it is observable, so it is reproduced rather than corrected.
 */
@Injectable()
export class IncomeStatsService {
  constructor(
    @Inject(ownedRepositoryToken(IncomeSource))
    private readonly sources: OwnedRepository<IncomeSource>,
    private readonly display: DisplayCurrencyService,
    private readonly converter: CurrencyConverterService,
  ) {}

  async stats(
    userId: string,
    query: DateRangeQueryDto,
  ): Promise<IncomeStatsResponse> {
    const displayCurrency = await this.display.forUser(userId);
    // FastAPI takes the filtered branch only when BOTH bounds are present.
    const filtered = Boolean(query.start_date && query.end_date);

    const activeSources = filtered
      ? await this.windowed(
          userId,
          toNaiveTimestamp(query.start_date!),
          toNaiveTimestamp(query.end_date!),
          'inclusive',
        )
      : await this.activeSources(userId);

    let totalSources: number;
    let activeCount: number;
    if (filtered) {
      totalSources = activeSources.length;
      activeCount = activeSources.length;
    } else {
      const counts = await this.sources
        .qb(userId, 's')
        .select('COUNT(s.id)', 'total')
        .addSelect('SUM(CASE WHEN s.is_active THEN 1 ELSE 0 END)', 'active')
        .getRawOne<{ total: string; active: string | null }>();
      totalSources = Number(counts?.total ?? 0);
      activeCount = Number(counts?.active ?? 0);
    }

    // Monthly total: skips a zero monthly equivalent entirely (`if monthly_amount:` in Python),
    // which is how one-time sources contribute nothing here.
    let totalMonthly = '0';
    for (const source of activeSources) {
      const monthly = decMul(
        source.amount,
        MONTHLY_MULTIPLIER[source.frequency],
      );
      if (decIsZero(monthly)) continue;
      totalMonthly = decAdd(
        totalMonthly,
        await this.inDisplayCurrency(monthly, source.currency, displayCurrency),
      );
    }
    const totalAnnual = decMul(totalMonthly, '12');

    // Always over ALL active sources, regardless of the requested window.
    const allActive = await this.activeSources(userId);
    const totalTransactionsAmount = await this.sumSourceAmounts(
      allActive,
      displayCurrency,
    );

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const currentStart = monthStart(year, month);
    const currentEnd =
      month === 12 ? monthStart(year + 1, 1) : monthStart(year, month + 1);
    const lastStart =
      month === 1 ? monthStart(year - 1, 12) : monthStart(year, month - 1);
    const lastEnd = currentStart;

    const currentMonthSources = await this.windowed(
      userId,
      currentStart,
      currentEnd,
      'half-open',
    );
    const lastMonthSources = await this.windowed(
      userId,
      lastStart,
      lastEnd,
      'half-open',
    );

    return {
      total_sources: totalSources,
      active_sources: activeCount,
      total_monthly_income: totalMonthly,
      total_annual_income: totalAnnual,
      total_transactions: allActive.length,
      total_transactions_amount: totalTransactionsAmount,
      transactions_current_month: currentMonthSources.length,
      transactions_current_month_amount: await this.sumSourceAmounts(
        currentMonthSources,
        displayCurrency,
      ),
      transactions_last_month: lastMonthSources.length,
      transactions_last_month_amount: await this.sumSourceAmounts(
        lastMonthSources,
        displayCurrency,
      ),
      currency: displayCurrency,
    };
  }

  private activeSources(userId: string): Promise<IncomeSource[]> {
    return this.sources.find(userId, { where: { isActive: true } });
  }

  /**
   * The window predicate, used for the caller's range and for both month windows. The only
   * difference between them is the right-hand boundary: the caller's range is inclusive
   * (`date <= end`), the month windows are half-open (`date < end`). FastAPI writes it both ways
   * and the difference is observable at a month boundary, so it is preserved here.
   */
  private windowed(
    userId: string,
    start: string,
    end: string,
    bound: 'inclusive' | 'half-open',
  ): Promise<IncomeSource[]> {
    const endComparator = bound === 'inclusive' ? '<=' : '<';
    return this.sources
      .qb(userId, 's')
      .andWhere('s.is_active = true')
      .andWhere(
        `((s.frequency = 'ONE_TIME' AND s.date IS NOT NULL
             AND s.date >= :start AND s.date ${endComparator} :end)
          OR (s.frequency <> 'ONE_TIME' AND s.start_date IS NOT NULL
             AND s.start_date ${endComparator} :end
             AND (s.end_date IS NULL OR s.end_date >= :start)))`,
        { start, end },
      )
      .getMany();
  }

  /** One-time sources contribute their full amount; recurring ones their monthly equivalent. */
  private async sumSourceAmounts(
    sources: IncomeSource[],
    displayCurrency: string,
  ): Promise<string> {
    let total = '0';
    for (const source of sources) {
      const amount =
        source.frequency === 'ONE_TIME'
          ? source.amount
          : decMul(source.amount, MONTHLY_MULTIPLIER[source.frequency]);
      total = decAdd(
        total,
        await this.inDisplayCurrency(amount, source.currency, displayCurrency),
      );
    }
    return total;
  }

  /** Falls back to the unconverted amount when no rate is available, exactly as FastAPI does. */
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
