import { Inject, Injectable } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { DisplayCurrencyService } from '../../../common/currency/display-currency.service';
import {
  decAdd,
  decDiv,
  decMul,
  decSub,
  pyFloatMoney,
} from '../../../common/money/money';
import {
  OwnedRepository,
  ownedRepositoryToken,
} from '../../../common/repository/owned.repository';
import { CurrencyConverterService } from '../../currency/currency-converter.service';
import { IncomeSource } from '../../income/entities/income-source.entity';
import { monthlyEquivalent } from '../../income/mappers/income-response.mapper';
import { Tax } from '../entities/tax.entity';
import { TaxEnrichmentService } from './tax-enrichment.service';

export interface TaxStatsResponse {
  total_taxes: number;
  active_taxes: number;
  total_tax_amount: string;
  total_fixed_taxes: string;
  total_percentage_taxes: string;
  currency: string;
}

@Injectable()
export class TaxStatsService {
  constructor(
    @Inject(ownedRepositoryToken(Tax))
    private readonly taxes: OwnedRepository<Tax>,
    @Inject(ownedRepositoryToken(IncomeSource))
    private readonly incomeSources: OwnedRepository<IncomeSource>,
    private readonly enrichment: TaxEnrichmentService,
    private readonly displayCurrency: DisplayCurrencyService,
    private readonly converter: CurrencyConverterService,
  ) {}

  /**
   * get_tax_stats. total_taxes and active_taxes are the SAME number — the query already filters
   * is_active, and FastAPI then counts the same list twice. Replicated, not fixed.
   */
  async stats(userId: string): Promise<TaxStatsResponse> {
    const display = await this.displayCurrency.forUser(userId);
    const rows = await this.taxes.find(userId, {
      where: { deletedAt: IsNull(), isActive: true },
    });

    let totalTaxAmount = '0';
    let totalFixed = '0';
    let totalPercentage = '0';

    for (const tax of rows) {
      if (tax.taxType === 'fixed' && truthy(tax.fixedAmount)) {
        let amount = tax.fixedAmount!;
        if (tax.currency !== display) {
          const converted = await this.converter.convert(
            amount,
            tax.currency,
            display,
          );
          if (converted !== null) amount = converted;
        }
        totalFixed = decAdd(totalFixed, amount);
        totalTaxAmount = decAdd(totalTaxAmount, amount);
      } else if (tax.taxType === 'percentage' && truthy(tax.percentage)) {
        const income = await this.enrichment.totalMonthlyIncome(
          userId,
          tax.incomeSourceId,
          display,
        );
        const amount = decDiv(decMul(income, tax.percentage!), '100');
        totalPercentage = decAdd(totalPercentage, amount);
        totalTaxAmount = decAdd(totalTaxAmount, amount);
      }
    }

    return {
      total_taxes: rows.length,
      active_taxes: rows.length,
      total_tax_amount: totalTaxAmount,
      total_fixed_taxes: totalFixed,
      total_percentage_taxes: totalPercentage,
      currency: display,
    };
  }

  /**
   * get_income_tax_summary — the one endpoint in this module whose numbers are JSON FLOATS rather
   * than decimal strings, because it is declared `response_model=List[dict]` and built with
   * float(). It is also unreachable in FastAPI (shadowed by GET /{tax_id}), so its shape cannot be
   * verified by the parity diff; it is reproduced from the source instead.
   *
   * Note it derives monthly income from IncomeSource.calculate_monthly_amount() — the multiplier
   * table income itself uses (×0.083 annually) — NOT the /12 division get_total_monthly_income
   * applies two functions away in the same module.
   */
  async incomeSummary(userId: string): Promise<IncomeTaxSummaryRow[]> {
    const display = await this.displayCurrency.forUser(userId);

    const sources = await this.incomeSources.find(userId, {
      where: { isActive: true },
    });
    const taxes = await this.taxes.find(userId, {
      where: { isActive: true, deletedAt: IsNull() },
    });

    const globalTaxes = taxes.filter((tax) => tax.incomeSourceId === null);
    const summary: IncomeTaxSummaryRow[] = [];

    for (const source of sources) {
      let monthlyIncome = monthlyEquivalent(source);
      if (source.currency !== display) {
        const converted = await this.converter.convert(
          monthlyIncome,
          source.currency,
          display,
        );
        if (converted !== null) monthlyIncome = converted;
      }

      // Source-specific taxes first, then the global ones — the order the breakdown appears in.
      const applicable = [
        ...taxes.filter((tax) => tax.incomeSourceId === source.id),
        ...globalTaxes,
      ];

      const breakdown: TaxBreakdownRow[] = [];
      let totalTax = '0';

      for (const tax of applicable) {
        if (tax.taxType === 'percentage' && truthy(tax.percentage)) {
          // Both branches of FastAPI's if/else compute the same thing; a global tax is charged
          // against each source's income in full, so the totals across sources double-count it.
          const amount = decDiv(decMul(monthlyIncome, tax.percentage!), '100');
          breakdown.push({
            tax_id: tax.id,
            tax_name: tax.name,
            tax_type: tax.taxType,
            percentage: Number(pyFloatMoney(tax.percentage!)),
            amount: Number(pyFloatMoney(amount)),
            is_global: tax.incomeSourceId === null,
          });
          totalTax = decAdd(totalTax, amount);
        } else if (tax.taxType === 'fixed' && truthy(tax.fixedAmount)) {
          let amount = tax.fixedAmount!;
          if (tax.currency !== display) {
            const converted = await this.converter.convert(
              amount,
              tax.currency,
              display,
            );
            if (converted !== null) amount = converted;
          }
          breakdown.push({
            tax_id: tax.id,
            tax_name: tax.name,
            tax_type: tax.taxType,
            fixed_amount: Number(pyFloatMoney(amount)),
            amount: Number(pyFloatMoney(amount)),
            is_global: tax.incomeSourceId === null,
          });
          totalTax = decAdd(totalTax, amount);
        }
      }

      summary.push({
        income_source_id: source.id,
        income_source_name: source.name,
        monthly_income: Number(pyFloatMoney(monthlyIncome)),
        currency: display,
        taxes: breakdown,
        total_tax: Number(pyFloatMoney(totalTax)),
        net_income: Number(pyFloatMoney(decSub(monthlyIncome, totalTax))),
      });
    }

    return summary;
  }
}

export interface TaxBreakdownRow {
  tax_id: string;
  tax_name: string;
  tax_type: string;
  percentage?: number;
  fixed_amount?: number;
  amount: number;
  is_global: boolean;
}

export interface IncomeTaxSummaryRow {
  income_source_id: string;
  income_source_name: string;
  monthly_income: number;
  currency: string;
  taxes: TaxBreakdownRow[];
  total_tax: number;
  net_income: number;
}

/** A Decimal('0.00') is falsy in Python, so a zero-valued tax is skipped entirely. */
function truthy(value: string | null): boolean {
  return value !== null && Number(value) !== 0;
}
