import { Inject, Injectable } from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { DisplayCurrencyService } from '../../../common/currency/display-currency.service';
import { DetailException } from '../../../common/exceptions/app.exception';
import {
  PaginatedResponse,
  paginated,
} from '../../../common/dto/page-query.dto';
import { naiveUtcNow } from '../../../common/entities/naive-timestamp.entity';
import { reload } from '../../../common/repository/reload';
import {
  OwnedRepository,
  ownedRepositoryToken,
} from '../../../common/repository/owned.repository';
import { CurrencyConverterService } from '../../currency/currency-converter.service';
import { SavingsAccount } from '../../savings/entities/savings-account.entity';
import {
  BatchDeleteDebtsDto,
  CreateDebtDto,
  ListDebtsQueryDto,
  UpdateDebtDto,
} from '../dto/debt.dto';
import { Debt } from '../entities/debt.entity';
import {
  DebtDisplay,
  DebtResponse,
  toDebtResponse,
} from '../mappers/debt-response.mapper';
import { DebtPaymentsService } from './debt-payments.service';

@Injectable()
export class DebtsService {
  constructor(
    @Inject(ownedRepositoryToken(Debt))
    private readonly debts: OwnedRepository<Debt>,
    @Inject(ownedRepositoryToken(SavingsAccount))
    private readonly accounts: OwnedRepository<SavingsAccount>,
    private readonly payments: DebtPaymentsService,
    private readonly displayCurrency: DisplayCurrencyService,
    private readonly converter: CurrencyConverterService,
    private readonly dataSource: DataSource,
  ) {}

  async list(
    userId: string,
    query: ListDebtsQueryDto,
  ): Promise<PaginatedResponse<DebtResponse>> {
    const where = {
      deletedAt: IsNull(),
      ...(query.is_paid === undefined ? {} : { isPaid: query.is_paid }),
      ...(query.is_active === undefined ? {} : { isActive: query.is_active }),
    };

    const total = await this.debts.count(userId, where);
    const rows = await this.debts.find(userId, {
      where,
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.page_size,
      take: query.page_size,
    });

    const display = await this.displayCurrency.forUser(userId);
    const items: DebtResponse[] = [];
    for (const row of rows) {
      items.push(toDebtResponse(row, await this.display(row, display)));
    }
    return paginated(items, total, query);
  }

  async get(userId: string, debtId: string): Promise<DebtResponse> {
    const debt = await this.requireDebt(userId, debtId);
    return toDebtResponse(debt, await this.display(debt));
  }

  async create(userId: string, dto: CreateDebtDto): Promise<DebtResponse> {
    await this.assertAccountOwned(userId, dto.deposit_account_id);

    const debt = await this.dataSource.transaction(async (manager) => {
      const row = await manager.save(
        manager.create(Debt, {
          userId,
          debtorName: dto.debtor_name,
          description: dto.description ?? null,
          amount: dto.amount,
          amountPaid: dto.amount_paid,
          currency: dto.currency,
          isActive: dto.is_active,
          isPaid: dto.is_paid,
          dueDate: dto.due_date ?? null,
          paidDate: dto.paid_date ?? null,
          depositAccountId: dto.deposit_account_id ?? null,
          autoDeposit: dto.auto_deposit,
          interestRate: dto.interest_rate ?? null,
          accruedInterest: '0',
          reminderDaysBefore: dto.reminder_days_before,
          lastReminderAt: null,
          nextPaymentDate: dto.next_payment_date ?? null,
          paymentFrequency: dto.payment_frequency ?? null,
          expectedPaymentAmount: dto.expected_payment_amount ?? null,
          notes: dto.notes ?? null,
          deletedAt: null,
        }),
      );

      if (
        dto.sync_historical &&
        row.depositAccountId &&
        Number(row.amountPaid) > 0
      ) {
        await this.payments.backfill(manager, row);
      }
      // Reloaded so numeric(12,2) re-scaling is visible: an amount posted as '500' answers '500.00'.
      return reload(manager, Debt, row.id);
    });

    return toDebtResponse(debt, await this.display(debt));
  }

  async update(
    userId: string,
    debtId: string,
    dto: UpdateDebtDto,
  ): Promise<DebtResponse> {
    await this.assertAccountOwned(userId, dto.deposit_account_id);

    const debt = await this.dataSource.transaction(async (manager) => {
      const row = await this.debts
        .withManager(manager)
        .findOne(userId, { id: debtId, deletedAt: IsNull() });
      if (!row) throw new DetailException(404, 'Debt not found');

      const previousAccountId = row.depositAccountId;
      assign(row, dto);
      row.updatedAt = naiveUtcNow();
      await manager.save(row);

      // Only a CHANGE of deposit account re-syncs, and only when one was supplied in this payload.
      const newAccountId = dto.deposit_account_id;
      if (
        dto.sync_historical &&
        newAccountId &&
        newAccountId !== previousAccountId
      ) {
        if (previousAccountId) {
          await this.payments.reverseAll(manager, userId, debtId);
        }
        if (Number(row.amountPaid) > 0) {
          await this.payments.backfill(manager, row);
        }
      }
      return reload(manager, Debt, row.id);
    });

    return toDebtResponse(debt, await this.display(debt));
  }

  async remove(userId: string, debtId: string): Promise<void> {
    if (!(await this.softDelete(userId, debtId))) {
      throw new DetailException(404, 'Debt not found');
    }
  }

  async batchDelete(
    userId: string,
    dto: BatchDeleteDebtsDto,
  ): Promise<{ deleted_count: number; failed_ids: string[] }> {
    let deleted_count = 0;
    const failed_ids: string[] = [];
    for (const id of dto.ids) {
      try {
        if (await this.softDelete(userId, id)) deleted_count += 1;
        else failed_ids.push(id);
      } catch {
        failed_ids.push(id);
      }
    }
    return { deleted_count, failed_ids };
  }

  /** Sets is_paid and pushes amount_paid up to the full amount. */
  async markPaid(userId: string, debtId: string): Promise<DebtResponse> {
    const debt = await this.dataSource.transaction(async (manager) => {
      const row = await this.debts
        .withManager(manager)
        .findOne(userId, { id: debtId, deletedAt: IsNull() });
      if (!row) throw new DetailException(404, 'Debt not found');
      row.isPaid = true;
      row.paidDate = naiveUtcNow();
      row.amountPaid = row.amount;
      row.updatedAt = naiveUtcNow();
      await manager.save(row);
      return reload(manager, Debt, row.id);
    });
    return toDebtResponse(debt, await this.display(debt));
  }

  /**
   * Forgiveness marks the debt paid and appends a note, but deliberately does NOT touch
   * amount_paid — so a forgiven debt keeps reporting a non-zero amount_remaining and a
   * progress_percentage below 100. FastAPI's behaviour, replicated rather than corrected.
   */
  async forgive(userId: string, debtId: string): Promise<DebtResponse> {
    const debt = await this.dataSource.transaction(async (manager) => {
      const row = await this.debts
        .withManager(manager)
        .findOne(userId, { id: debtId, deletedAt: IsNull() });
      if (!row) throw new DetailException(404, 'Debt not found');
      row.isPaid = true;
      row.paidDate = naiveUtcNow();
      row.notes = `${row.notes ?? ''}\n[Debt forgiven]`;
      row.updatedAt = naiveUtcNow();
      await manager.save(row);
      return reload(manager, Debt, row.id);
    });
    return toDebtResponse(debt, await this.display(debt));
  }

  async requireDebt(userId: string, debtId: string): Promise<Debt> {
    const debt = await this.debts.findOne(userId, {
      id: debtId,
      deletedAt: IsNull(),
    });
    if (!debt) throw new DetailException(404, 'Debt not found');
    return debt;
  }

  /**
   * convert_debt_to_display_currency. Both conversions must succeed or BOTH values fall back to the
   * originals — FastAPI checks them together, so a half-converted debt is impossible.
   */
  async display(debt: Debt, displayCurrency?: string): Promise<DebtDisplay> {
    const display =
      displayCurrency ?? (await this.displayCurrency.forUser(debt.userId));

    if (debt.currency === display) {
      return {
        displayAmount: debt.amount,
        displayAmountPaid: debt.amountPaid,
        displayCurrency: display,
      };
    }

    const amount = await this.converter.convert(
      debt.amount,
      debt.currency,
      display,
    );
    const paid = await this.converter.convert(
      debt.amountPaid,
      debt.currency,
      display,
    );

    if (amount !== null && paid !== null) {
      return {
        displayAmount: amount,
        displayAmountPaid: paid,
        displayCurrency: display,
      };
    }
    return {
      displayAmount: debt.amount,
      displayAmountPaid: debt.amountPaid,
      displayCurrency: debt.currency,
    };
  }

  private async softDelete(userId: string, debtId: string): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const row = await this.debts
        .withManager(manager)
        .findOne(userId, { id: debtId, deletedAt: IsNull() });
      if (!row) return false;
      row.deletedAt = naiveUtcNow();
      await manager.save(row);
      return true;
    });
  }

  /** FastAPI does not check that the account belongs to the caller; this port does. */
  private async assertAccountOwned(
    userId: string,
    accountId?: string | null,
  ): Promise<void> {
    if (!accountId) return;
    const account = await this.accounts.findOne(userId, { id: accountId });
    if (!account) throw new DetailException(404, 'Deposit account not found');
  }
}

/** exclude_unset semantics, plus the tz-stripping FastAPI applies to the three date fields. */
function assign(row: Debt, dto: UpdateDebtDto): void {
  if ('debtor_name' in dto) row.debtorName = dto.debtor_name!;
  if ('description' in dto) row.description = dto.description ?? null;
  if ('amount' in dto) row.amount = dto.amount!;
  if ('amount_paid' in dto) row.amountPaid = dto.amount_paid!;
  if ('currency' in dto) row.currency = dto.currency!;
  if ('is_active' in dto) row.isActive = dto.is_active!;
  if ('is_paid' in dto) row.isPaid = dto.is_paid!;
  if ('due_date' in dto) row.dueDate = dto.due_date ?? null;
  if ('paid_date' in dto) row.paidDate = dto.paid_date ?? null;
  if ('notes' in dto) row.notes = dto.notes ?? null;
  if ('deposit_account_id' in dto)
    row.depositAccountId = dto.deposit_account_id ?? null;
  if ('auto_deposit' in dto) row.autoDeposit = dto.auto_deposit!;
  if ('interest_rate' in dto) row.interestRate = dto.interest_rate ?? null;
  if ('reminder_days_before' in dto)
    row.reminderDaysBefore = dto.reminder_days_before!;
  if ('next_payment_date' in dto)
    row.nextPaymentDate = dto.next_payment_date ?? null;
  if ('payment_frequency' in dto)
    row.paymentFrequency = dto.payment_frequency ?? null;
  if ('expected_payment_amount' in dto)
    row.expectedPaymentAmount = dto.expected_payment_amount ?? null;
}

export type { EntityManager };
