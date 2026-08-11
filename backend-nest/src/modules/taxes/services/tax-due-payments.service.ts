import { Inject, Injectable } from '@nestjs/common';
import { DataSource, IsNull, Not } from 'typeorm';
import { DisplayCurrencyService } from '../../../common/currency/display-currency.service';
import { naiveUtcNow } from '../../../common/entities/naive-timestamp.entity';
import { decCmp } from '../../../common/money/money';
import {
  OwnedRepository,
  ownedRepositoryToken,
} from '../../../common/repository/owned.repository';
import { toNaiveIso } from '../../../common/time/naive-timestamp';
import { Tax } from '../entities/tax.entity';
import { TaxEnrichmentService } from './tax-enrichment.service';
import {
  InsufficientTaxFundsError,
  TaxPaymentsService,
} from './tax-payments.service';

export interface ProcessDuePaymentsResponse {
  status: string;
  due_count: number;
  processed: number;
  auto_paid: number;
  failed_payments: {
    tax_id: string;
    tax_name: string;
    reason: string;
    amount: string;
    currency: string;
  }[];
  errors: { tax_id: string; tax_name: string; error: string }[];
  timestamp: string;
}

@Injectable()
export class TaxDuePaymentsService {
  constructor(
    @Inject(ownedRepositoryToken(Tax))
    private readonly taxes: OwnedRepository<Tax>,
    private readonly enrichment: TaxEnrichmentService,
    private readonly payments: TaxPaymentsService,
    private readonly displayCurrency: DisplayCurrencyService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * POST /taxes/process-due-payments.
   *
   * `auto_paid` is declared, returned, and never incremented — FastAPI computes it nowhere, so it
   * is always 0 regardless of how many auto-pay taxes were charged. Replicated deliberately.
   *
   * Each tax is paid in its own transaction: one failure must not roll back the ones that already
   * succeeded, which is the behaviour FastAPI gets from committing inside pay_tax.
   */
  async process(userId: string): Promise<ProcessDuePaymentsResponse> {
    const now = naiveUtcNow();
    const display = await this.displayCurrency.forUser(userId);

    const candidates = await this.taxes.find(userId, {
      where: {
        isActive: true,
        deletedAt: IsNull(),
        paymentAccountId: Not(IsNull()),
      },
    });

    const due: Tax[] = [];
    for (const tax of candidates) {
      const status = await this.enrichment.paymentStatus(userId, tax);
      if (!status.isPaidCurrentPeriod) due.push(tax);
    }

    let processed = 0;
    const failed_payments: ProcessDuePaymentsResponse['failed_payments'] = [];
    const errors: ProcessDuePaymentsResponse['errors'] = [];

    for (const tax of due) {
      const enriched = await this.enrichment.enrich(userId, tax, display);

      // The amount is recomputed here purely to decide whether the tax is chargeable at all; pay()
      // works it out again from scratch.
      const amount =
        tax.taxType === 'fixed' && tax.fixedAmount !== null
          ? tax.fixedAmount
          : enriched.calculatedAmount;
      const currency =
        tax.taxType === 'fixed' && tax.fixedAmount !== null
          ? tax.currency
          : (enriched.displayCurrency ?? tax.currency);

      if (amount === null || decCmp(amount, '0') <= 0) {
        errors.push({
          tax_id: tax.id,
          tax_name: tax.name,
          error: 'Could not calculate tax amount',
        });
        continue;
      }

      try {
        await this.dataSource.transaction((manager) =>
          this.payments.payWithin(manager, userId, tax.id, undefined),
        );
        processed += 1;
      } catch (error) {
        if (error instanceof InsufficientTaxFundsError) {
          failed_payments.push({
            tax_id: tax.id,
            tax_name: tax.name,
            reason: 'Insufficient funds in payment account',
            amount,
            currency,
          });
        } else {
          errors.push({
            tax_id: tax.id,
            tax_name: tax.name,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return {
      status: 'completed',
      due_count: due.length,
      processed,
      auto_paid: 0,
      failed_payments,
      errors,
      timestamp: toNaiveIso(now)!,
    };
  }
}
