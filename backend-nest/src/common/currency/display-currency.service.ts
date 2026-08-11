import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { decIsZero } from '../money/money';
import { CurrencyConverterService } from '../../modules/currency/currency-converter.service';
import { UserPreferences } from '../../modules/users/entities/user-preferences.entity';

export interface DisplayValues {
  displayAmount: string | null;
  displayCurrency: string | null;
  displayMonthlyEquivalent: string | null;
}

export interface ConvertibleRow {
  amount: string;
  currency: string;
  /** Already computed by the caller — income derives it, expenses reads a stored column. */
  monthlyEquivalent: string | null;
}

/**
 * Port of get_user_display_currency + convert_*_to_display_currency, which FastAPI implements
 * byte-identically in both the income and expenses modules. One copy serves both here.
 *
 * FastAPI mutates the ORM object with three non-column attributes and reads them back through
 * hasattr(); this returns them instead.
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

  async forRow(
    userId: string,
    row: ConvertibleRow,
    displayCurrency?: string,
  ): Promise<DisplayValues> {
    const display = displayCurrency ?? (await this.forUser(userId));
    const monthly = row.monthlyEquivalent;

    if (row.currency === display) {
      return {
        displayAmount: row.amount,
        displayCurrency: display,
        displayMonthlyEquivalent: monthly,
      };
    }

    const convertedAmount = await this.converter.convert(
      row.amount,
      row.currency,
      display,
    );

    if (convertedAmount === null) {
      // FastAPI's fallback reports the row's OWN currency here, not the display one.
      return {
        displayAmount: row.amount,
        displayCurrency: row.currency,
        displayMonthlyEquivalent: monthly,
      };
    }

    if (monthly === null || decIsZero(monthly)) {
      return {
        displayAmount: convertedAmount,
        displayCurrency: display,
        displayMonthlyEquivalent: monthly === null ? null : monthly,
      };
    }

    const convertedMonthly = await this.converter.convert(
      monthly,
      row.currency,
      display,
    );
    return {
      displayAmount: convertedAmount,
      displayCurrency: display,
      displayMonthlyEquivalent: convertedMonthly ?? monthly,
    };
  }
}
