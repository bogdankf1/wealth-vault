import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { decIsZero } from '../../../common/money/money';
import { CurrencyConverterService } from '../../currency/currency-converter.service';
import { UserPreferences } from '../../users/entities/user-preferences.entity';
import { IncomeSource } from '../entities/income-source.entity';
import {
  DisplayValues,
  monthlyEquivalent,
} from '../mappers/income-response.mapper';

/**
 * Port of get_user_display_currency + convert_income_to_display_currency.
 *
 * FastAPI mutates the ORM object with three attributes that are not columns and reads them back
 * through hasattr(). Here they are a return value instead — same numbers, without pretending an
 * entity has fields it doesn't.
 */
@Injectable()
export class DisplayCurrencyService {
  constructor(
    @InjectRepository(UserPreferences)
    private readonly preferences: Repository<UserPreferences>,
    private readonly converter: CurrencyConverterService,
  ) {}

  async forUser(userId: string): Promise<string> {
    const prefs = await this.preferences.findOne({ where: { userId } });
    return prefs?.displayCurrency ? prefs.displayCurrency : 'USD';
  }

  async forSource(
    userId: string,
    source: IncomeSource,
    displayCurrency?: string,
  ): Promise<DisplayValues> {
    const display = displayCurrency ?? (await this.forUser(userId));
    const monthly = monthlyEquivalent(source);

    if (source.currency === display) {
      return {
        displayAmount: source.amount,
        displayCurrency: display,
        displayMonthlyEquivalent: monthly,
      };
    }

    const convertedAmount = await this.converter.convert(
      source.amount,
      source.currency,
      display,
    );

    if (convertedAmount === null) {
      // FastAPI's fallback reports the source's OWN currency here, not the display one.
      return {
        displayAmount: source.amount,
        displayCurrency: source.currency,
        displayMonthlyEquivalent: monthly,
      };
    }

    if (decIsZero(monthly)) {
      return {
        displayAmount: convertedAmount,
        displayCurrency: display,
        displayMonthlyEquivalent: null,
      };
    }

    const convertedMonthly = await this.converter.convert(
      monthly,
      source.currency,
      display,
    );
    return {
      displayAmount: convertedAmount,
      displayCurrency: display,
      displayMonthlyEquivalent: convertedMonthly ?? monthly,
    };
  }
}
