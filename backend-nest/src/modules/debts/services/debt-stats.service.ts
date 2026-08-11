import { Inject, Injectable } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { DisplayCurrencyService } from '../../../common/currency/display-currency.service';
import { naiveUtcNow } from '../../../common/entities/naive-timestamp.entity';
import { decAdd, decCmp, decSub } from '../../../common/money/money';
import {
  OwnedRepository,
  ownedRepositoryToken,
} from '../../../common/repository/owned.repository';
import { CurrencyConverterService } from '../../currency/currency-converter.service';
import { Debt } from '../entities/debt.entity';

export interface DebtStatsResponse {
  total_debts: number;
  active_debts: number;
  paid_debts: number;
  total_amount_owed: string;
  total_amount_paid: string;
  overdue_debts: number;
  currency: string;
}

@Injectable()
export class DebtStatsService {
  constructor(
    @Inject(ownedRepositoryToken(Debt))
    private readonly debts: OwnedRepository<Debt>,
    private readonly displayCurrency: DisplayCurrencyService,
    private readonly converter: CurrencyConverterService,
  ) {}

  /**
   * get_debt_stats over active, non-deleted debts.
   *
   * Two asymmetries worth keeping straight: total_amount_owed counts a debt only when its remaining
   * balance is POSITIVE (so a settled debt adds nothing), while total_amount_paid counts every
   * debt unconditionally. And `active_debts` here means "not paid", which is a different sense of
   * active than the is_active column the query already filtered on.
   */
  async stats(userId: string): Promise<DebtStatsResponse> {
    const display = await this.displayCurrency.forUser(userId);
    const rows = await this.debts.find(userId, {
      where: { deletedAt: IsNull(), isActive: true },
    });

    const now = naiveUtcNow();
    let activeDebts = 0;
    let paidDebts = 0;
    let overdueDebts = 0;
    let totalOwed = '0';
    let totalPaid = '0';

    for (const debt of rows) {
      const remaining = decSub(debt.amount, debt.amountPaid);

      let owedInDisplay = remaining;
      if (debt.currency !== display) {
        const converted = await this.converter.convert(
          remaining,
          debt.currency,
          display,
        );
        if (converted !== null) owedInDisplay = converted;
      }

      let paidInDisplay = debt.amountPaid;
      // The paid conversion is guarded by a truthiness check as well, so a zero amount_paid is
      // never converted and stays at the row's own scale.
      if (debt.currency !== display && Number(debt.amountPaid) !== 0) {
        const converted = await this.converter.convert(
          debt.amountPaid,
          debt.currency,
          display,
        );
        if (converted !== null) paidInDisplay = converted;
      }

      if (debt.isPaid) {
        paidDebts += 1;
      } else {
        activeDebts += 1;
        if (debt.dueDate && now > debt.dueDate) overdueDebts += 1;
      }

      if (decCmp(remaining, '0') > 0) {
        totalOwed = decAdd(totalOwed, owedInDisplay);
      }
      totalPaid = decAdd(totalPaid, paidInDisplay);
    }

    return {
      total_debts: rows.length,
      active_debts: activeDebts,
      paid_debts: paidDebts,
      total_amount_owed: totalOwed,
      total_amount_paid: totalPaid,
      overdue_debts: overdueDebts,
      currency: display,
    };
  }
}
