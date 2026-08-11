import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { DisplayCurrencyService } from '../../../common/currency/display-currency.service';
import { decAdd, decDiv, decMul } from '../../../common/money/money';
import {
  OwnedRepository,
  ownedRepositoryToken,
} from '../../../common/repository/owned.repository';
import { CurrencyConverterService } from '../../currency/currency-converter.service';
import { INCOME_FREQUENCY_TO_WIRE } from '../../income/enums';
import { IncomeSource } from '../../income/entities/income-source.entity';
import { SavingsAccount } from '../../savings/entities/savings-account.entity';
import { Tax } from '../entities/tax.entity';
import { TaxPayment } from '../entities/tax-payment.entity';
import { TaxEnrichment } from '../mappers/tax-response.mapper';
import { currentPeriodRange } from '../tax-period';

/**
 * The taxes module carries its OWN monthly-income table — a third one, disagreeing with both
 * income's MONTHLY_MULTIPLIER and its HISTORY_MULTIPLIER. Annually and quarterly are DIVISIONS here
 * (/12, /3) where income multiplies by 0.083 and 0.33, so the same income source is worth a
 * different amount per month depending on which module is asked. Live behaviour; do not unify.
 *
 * ONE_TIME is absent from FastAPI's if/elif chain, so a one-time source contributes nothing at all.
 */
const MULTIPLY: Record<string, string> = { weekly: '4.33', biweekly: '2.17' };
const DIVIDE: Record<string, string> = { annually: '12', quarterly: '3' };

@Injectable()
export class TaxEnrichmentService {
  constructor(
    @Inject(ownedRepositoryToken(IncomeSource))
    private readonly incomeSources: OwnedRepository<IncomeSource>,
    @Inject(ownedRepositoryToken(SavingsAccount))
    private readonly accounts: OwnedRepository<SavingsAccount>,
    @Inject(ownedRepositoryToken(TaxPayment))
    private readonly payments: OwnedRepository<TaxPayment>,
    private readonly displayCurrency: DisplayCurrencyService,
    private readonly converter: CurrencyConverterService,
  ) {}

  /**
   * convert_tax_to_display_currency + the linked-entity loads FastAPI does with selectinload.
   *
   * Deliberate divergence: the two linked reads are scoped by user_id. FastAPI follows the FK
   * alone, and nothing validates on write that the ids belong to the caller, so a tax pointed at
   * another user's income source leaks that source's name and amount. Same class of leak as the one
   * slice 1 closed on expenses.payment_account_name. Writes are validated too (see TaxesService).
   */
  async enrich(
    userId: string,
    tax: Tax,
    displayCurrency?: string,
  ): Promise<TaxEnrichment> {
    const display =
      displayCurrency ?? (await this.displayCurrency.forUser(userId));

    let displayFixedAmount: string | null = null;
    let resolvedCurrency: string | null = null;
    let calculatedAmount: string | null = null;

    if (tax.taxType === 'fixed' && isTruthyAmount(tax.fixedAmount)) {
      const fixed = tax.fixedAmount!;
      if (tax.currency === display) {
        displayFixedAmount = fixed;
        resolvedCurrency = display;
        calculatedAmount = fixed;
      } else {
        const converted = await this.converter.convert(
          fixed,
          tax.currency,
          display,
        );
        // The fallback reports the tax's OWN currency, matching FastAPI's else-branch.
        displayFixedAmount = converted ?? fixed;
        resolvedCurrency = converted === null ? tax.currency : display;
        calculatedAmount = converted ?? fixed;
      }
    } else if (tax.taxType === 'percentage' && isTruthyAmount(tax.percentage)) {
      const income = await this.totalMonthlyIncome(
        userId,
        tax.incomeSourceId,
        display,
      );
      // display_fixed_amount stays null on this branch — only calculated_amount is filled.
      calculatedAmount = decDiv(decMul(income, tax.percentage!), '100');
      resolvedCurrency = display;
    }

    const status = await this.paymentStatus(userId, tax);

    return {
      displayFixedAmount,
      displayCurrency: resolvedCurrency,
      calculatedAmount,
      incomeSource: await this.linkedIncomeSource(userId, tax.incomeSourceId),
      paymentAccount: await this.linkedAccount(userId, tax.paymentAccountId),
      ...status,
    };
  }

  /** get_tax_payment_status — the most recent completed payment inside the current period. */
  async paymentStatus(
    userId: string,
    tax: Tax,
    reference?: string,
  ): Promise<
    Pick<
      TaxEnrichment,
      | 'isPaidCurrentPeriod'
      | 'currentPeriodStart'
      | 'currentPeriodEnd'
      | 'lastPaymentDate'
      | 'lastPaymentAmount'
    >
  > {
    const { periodStart, periodEnd } = currentPeriodRange(
      tax.frequency,
      reference,
    );

    const payment = await this.payments
      .qb(userId, 'p')
      .andWhere('p.tax_id = :taxId', { taxId: tax.id })
      .andWhere("p.status = 'completed'")
      .andWhere('p.payment_date >= :start', { start: periodStart })
      .andWhere('p.payment_date <= :end', { end: periodEnd })
      .orderBy('p.payment_date', 'DESC')
      .limit(1)
      .getOne();

    return {
      isPaidCurrentPeriod: payment !== null,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      lastPaymentDate: payment?.paymentDate ?? null,
      lastPaymentAmount: payment?.amount ?? null,
    };
  }

  /**
   * get_total_monthly_income. A null incomeSourceId means EVERY active source, not none — the
   * filter is only applied when an id is present.
   */
  async totalMonthlyIncome(
    userId: string,
    incomeSourceId: string | null,
    displayCurrency?: string,
  ): Promise<string> {
    const display =
      displayCurrency ?? (await this.displayCurrency.forUser(userId));

    const sources = await this.incomeSources.find(userId, {
      where: {
        isActive: true,
        ...(incomeSourceId ? { id: incomeSourceId } : {}),
      },
    });

    let total = '0';
    for (const source of sources) {
      let amount = source.amount;
      if (source.currency !== display) {
        const converted = await this.converter.convert(
          amount,
          source.currency,
          display,
        );
        if (converted !== null) amount = converted;
      }

      const wire = INCOME_FREQUENCY_TO_WIRE[source.frequency];
      if (wire === 'monthly') total = decAdd(total, amount);
      else if (MULTIPLY[wire])
        total = decAdd(total, decMul(amount, MULTIPLY[wire]));
      else if (DIVIDE[wire])
        total = decAdd(total, decDiv(amount, DIVIDE[wire]));
      // one_time falls through — FastAPI has no branch for it.
    }
    return total;
  }

  async linkedIncomeSource(userId: string, id: string | null) {
    if (!id) return null;
    const source = await this.incomeSources.findOne(userId, { id });
    if (!source) return null;
    return {
      id: source.id,
      name: source.name,
      amount: source.amount,
      currency: source.currency,
      frequency: INCOME_FREQUENCY_TO_WIRE[source.frequency],
    };
  }

  async linkedAccount(userId: string, id: string | null) {
    if (!id) return null;
    const account = await this.accounts.findOne(userId, { id });
    if (!account) return null;
    return {
      id: account.id,
      name: account.name,
      current_balance: account.currentBalance,
      currency: account.currency,
    };
  }

  /** Rebinds the payment lookup onto a transaction, for the pay/process paths. */
  withManager(manager: EntityManager): TaxEnrichmentService {
    const bound = new TaxEnrichmentService(
      this.incomeSources.withManager(manager),
      this.accounts.withManager(manager),
      this.payments.withManager(manager),
      this.displayCurrency,
      this.converter,
    );
    return bound;
  }
}

/**
 * FastAPI guards these branches with a bare `if tax.fixed_amount:` — a Decimal('0.00') is falsy, so
 * a zero-valued tax takes NEITHER branch and its display fields all stay null.
 */
function isTruthyAmount(value: string | null): boolean {
  return value !== null && Number(value) !== 0;
}
