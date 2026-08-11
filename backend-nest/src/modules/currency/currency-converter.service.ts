import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { decIsZero, decMul, decQuantize } from '../../common/money/money';
import { Currency } from './entities/currency.entity';
import { ExchangeRate } from './entities/exchange-rate.entity';

/**
 * The read half of CurrencyService.convert_amount. Same currency → rate 1. Otherwise the most
 * recently fetched stored rate.
 *
 * FastAPI additionally calls an external API when its cache is stale and writes the fresh rate back.
 * Nest does neither: no outbound HTTP on a read path, no writes during a GET. It returns null
 * exactly where FastAPI returns None, so callers keep FastAPI's fallback behaviour (use the
 * unconverted amount). The divergence only shows for a user whose display currency differs from an
 * income row's currency AND whose rate is missing or stale.
 */
@Injectable()
export class CurrencyConverterService {
  constructor(
    @InjectRepository(ExchangeRate)
    private readonly rates: Repository<ExchangeRate>,
    @InjectRepository(Currency)
    private readonly currencies: Repository<Currency>,
  ) {}

  async convert(
    amount: string,
    from: string,
    to: string,
  ): Promise<string | null> {
    // FastAPI returns Decimal("0.0") for a zero amount before it ever looks up a rate.
    if (decIsZero(amount)) return '0.0';

    const rate = await this.getRate(from, to);
    if (rate === null) return null;

    const converted = decMul(amount, rate);
    const target = await this.currencies.findOne({ where: { code: to } });
    return target ? decQuantize(converted, target.decimalPlaces) : converted;
  }

  private async getRate(from: string, to: string): Promise<string | null> {
    if (from === to) return '1.0';
    const row = await this.rates.findOne({
      where: { fromCurrency: from, toCurrency: to },
      order: { fetchedAt: 'DESC' },
    });
    return row ? row.rate : null;
  }
}
