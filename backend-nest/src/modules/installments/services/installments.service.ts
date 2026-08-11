import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  PaginatedResponse,
  paginated,
} from '../../../common/dto/page-query.dto';
import { naiveUtcNow } from '../../../common/entities/naive-timestamp.entity';
import { DetailException } from '../../../common/exceptions/app.exception';
import { decCmp, decDiv, decMul, decSub } from '../../../common/money/money';
import {
  OwnedRepository,
  ownedRepositoryToken,
} from '../../../common/repository/owned.repository';
import { toNaiveIso } from '../../../common/time/naive-timestamp';
import { MirrorExpenseService } from '../../expenses/services/mirror-expense.service';
import { AccountTransactionService } from '../../savings/account-transaction.service';
import { SavingsAccount } from '../../savings/entities/savings-account.entity';
import { InsufficientFundsError } from '../../savings/errors';
import { User } from '../../users/entities/user.entity';
import {
  CreateInstallmentDto,
  ListInstallmentsQueryDto,
  PayInstallmentDto,
  UpdateInstallmentDto,
} from '../dto/installment.dto';
import { Installment } from '../entities/installment.entity';
import { InstallmentPayment } from '../entities/installment-payment.entity';
import {
  calculateEndDate,
  calculateNextPaymentDate,
  calculatePaymentsMade,
  calculateRemainingBalance,
  scheduledDateFor,
} from '../installment-schedule';
import {
  InstallmentPaymentResponse,
  InstallmentResponse,
  toInstallmentFloat,
  toInstallmentOrm,
  toInstallmentPaymentResponse,
} from '../mappers/installment-response.mapper';

/** Hardcoded in FastAPI's handler, not driven by tier_features. wealth is unlimited. */
const TIER_LIMITS: Record<string, number | null> = {
  starter: 2,
  growth: 10,
  wealth: null,
};

@Injectable()
export class InstallmentsService {
  constructor(
    @Inject(ownedRepositoryToken(Installment))
    private readonly installments: OwnedRepository<Installment>,
    @Inject(ownedRepositoryToken(InstallmentPayment))
    private readonly payments: OwnedRepository<InstallmentPayment>,
    private readonly accountTransactions: AccountTransactionService,
    private readonly mirrorExpense: MirrorExpenseService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async findOwnedOrFail(userId: string, id: string): Promise<Installment> {
    const row = await this.installments.findOne(userId, { id });
    if (!row) throw new DetailException(404, 'Installment not found');
    return row;
  }

  async list(
    userId: string,
    query: ListInstallmentsQueryDto,
  ): Promise<PaginatedResponse<ReturnType<typeof toInstallmentFloat>>> {
    const build = () => {
      const builder = this.installments.qb(userId, 'i');
      if (query.category) {
        builder.andWhere('i.category = :category', {
          category: query.category,
        });
      }
      if (query.frequency) {
        builder.andWhere('i.frequency = :frequency', {
          frequency: query.frequency,
        });
      }
      if (query.is_active !== undefined) {
        builder.andWhere('i.is_active = :isActive', {
          isActive: query.is_active,
        });
      }
      return builder;
    };
    const total = await build().getCount();
    const rows = await build()
      .orderBy('i.created_at', 'DESC')
      .offset((query.page - 1) * query.page_size)
      .limit(query.page_size)
      .getMany();
    return paginated(
      rows.map((row) => toInstallmentFloat(row, this.displayFor(row))),
      total,
      query,
    );
  }

  async get(userId: string, id: string) {
    const row = await this.findOwnedOrFail(userId, id);
    return toInstallmentFloat(row, this.displayFor(row));
  }

  async create(
    user: User,
    dto: CreateInstallmentDto,
  ): Promise<InstallmentResponse> {
    // The cap is enforced in the handler with a hardcoded table and a {"detail"} 403 — not the
    // TierLimitException envelope the rest of the codebase uses.
    const tierName = user.tier?.name?.toLowerCase() ?? 'starter';
    // `?? 2` would be wrong here: wealth maps to an explicit null meaning UNLIMITED, and ?? treats
    // null as absent, so it would silently cap the top tier at the starter limit.
    const limit = tierName in TIER_LIMITS ? TIER_LIMITS[tierName] : 2;
    if (limit !== null) {
      const existing = await this.installments.count(user.id);
      if (existing >= limit) {
        throw new DetailException(
          403,
          `Installment limit reached for ${tierName} tier. Upgrade to add more.`,
        );
      }
    }
    await this.assertAccountOwned(user.id, dto.payment_account_id);

    const paymentsMade = calculatePaymentsMade(
      dto.first_payment_date,
      dto.frequency,
      dto.number_of_payments,
    );
    const row = this.installments.raw.create({
      userId: user.id,
      name: dto.name,
      description: dto.description ?? null,
      category: dto.category ?? null,
      totalAmount: dto.total_amount,
      amountPerPayment: dto.amount_per_payment,
      currency: dto.currency,
      interestRate: dto.interest_rate ?? null,
      frequency: dto.frequency,
      numberOfPayments: dto.number_of_payments,
      // The client's payments_made is discarded; the calendar decides.
      paymentsMade,
      startDate: dto.start_date,
      firstPaymentDate: dto.first_payment_date,
      endDate:
        dto.end_date ??
        calculateEndDate(
          dto.first_payment_date,
          dto.frequency,
          dto.number_of_payments,
        ),
      isActive: dto.is_active,
      status: 'active',
      remainingBalance: calculateRemainingBalance(
        dto.total_amount,
        dto.amount_per_payment,
        paymentsMade,
      ),
      paymentAccountId: dto.payment_account_id ?? null,
      autoPay: dto.auto_pay,
      nextPaymentDate: calculateNextPaymentDate(
        dto.first_payment_date,
        dto.frequency,
        dto.number_of_payments,
      ),
      lastPaymentDate: null,
      reminderDaysBefore: dto.reminder_days_before,
      lastReminderAt: null,
    });
    await this.installments.raw.save(row);
    return toInstallmentOrm(row);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateInstallmentDto,
  ): Promise<InstallmentResponse> {
    const row = await this.findOwnedOrFail(userId, id);
    if ('payment_account_id' in dto) {
      await this.assertAccountOwned(userId, dto.payment_account_id);
    }

    if (dto.name !== undefined) row.name = dto.name;
    if ('description' in dto) row.description = dto.description ?? null;
    if ('category' in dto) row.category = dto.category ?? null;
    if (dto.total_amount !== undefined) row.totalAmount = dto.total_amount;
    if (dto.amount_per_payment !== undefined) {
      row.amountPerPayment = dto.amount_per_payment;
    }
    if (dto.currency !== undefined) row.currency = dto.currency;
    if ('interest_rate' in dto) row.interestRate = dto.interest_rate ?? null;
    if (dto.frequency !== undefined) row.frequency = dto.frequency;
    if (dto.number_of_payments !== undefined) {
      row.numberOfPayments = dto.number_of_payments;
    }
    if (dto.start_date !== undefined) row.startDate = dto.start_date;
    if (dto.first_payment_date !== undefined) {
      row.firstPaymentDate = dto.first_payment_date;
    }
    if (dto.is_active !== undefined) row.isActive = dto.is_active;
    if ('payment_account_id' in dto) {
      row.paymentAccountId = dto.payment_account_id ?? null;
    }
    if (dto.auto_pay !== undefined) row.autoPay = dto.auto_pay;
    if (dto.reminder_days_before !== undefined) {
      row.reminderDaysBefore = dto.reminder_days_before;
    }

    // Recomputed unconditionally on every update, which OVERWRITES whatever the payment path
    // recorded and DISCARDS any client-supplied end_date. FastAPI's behaviour, replicated.
    row.paymentsMade = calculatePaymentsMade(
      row.firstPaymentDate,
      row.frequency,
      row.numberOfPayments,
    );
    row.endDate = calculateEndDate(
      row.firstPaymentDate,
      row.frequency,
      row.numberOfPayments,
    );
    row.remainingBalance = calculateRemainingBalance(
      row.totalAmount,
      row.amountPerPayment,
      row.paymentsMade,
    );
    row.nextPaymentDate = calculateNextPaymentDate(
      row.firstPaymentDate,
      row.frequency,
      row.numberOfPayments,
    );
    row.updatedAt = naiveUtcNow();
    await this.installments.raw.save(row);
    return toInstallmentOrm(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const row = await this.findOwnedOrFail(userId, id);
    await this.installments.raw.remove(row);
  }

  async batchDelete(
    userId: string,
    ids: string[],
  ): Promise<{ deleted_count: number; failed_ids: string[] }> {
    const failed: string[] = [];
    let deleted = 0;
    await this.dataSource.transaction(async (manager) => {
      const scoped = this.installments.withManager(manager);
      for (const id of ids) {
        const row = await scoped.findOne(userId, { id });
        if (!row) {
          failed.push(id);
          continue;
        }
        await manager.remove(row);
        deleted += 1;
      }
    });
    return { deleted_count: deleted, failed_ids: failed };
  }

  async complete(userId: string, id: string): Promise<InstallmentResponse> {
    const row = await this.findOwnedOrFail(userId, id);
    if (row.status === 'completed') {
      throw new DetailException(400, 'Installment is already completed');
    }
    row.status = 'completed';
    row.isActive = false;
    row.remainingBalance = '0';
    row.updatedAt = naiveUtcNow();
    await this.installments.raw.save(row);
    return toInstallmentOrm(row);
  }

  async markDefaulted(
    userId: string,
    id: string,
  ): Promise<InstallmentResponse> {
    const row = await this.findOwnedOrFail(userId, id);
    if (row.status === 'defaulted') {
      throw new DetailException(400, 'Installment is already defaulted');
    }
    row.status = 'defaulted';
    row.isActive = false;
    row.updatedAt = naiveUtcNow();
    await this.installments.raw.save(row);
    return toInstallmentOrm(row);
  }

  async reactivate(userId: string, id: string): Promise<InstallmentResponse> {
    const row = await this.findOwnedOrFail(userId, id);
    if (row.status === 'active') {
      throw new DetailException(400, 'Installment is already active');
    }
    row.status = 'active';
    row.isActive = true;
    row.updatedAt = naiveUtcNow();
    await this.installments.raw.save(row);
    return toInstallmentOrm(row);
  }

  async listPayments(
    userId: string,
    id: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: InstallmentPaymentResponse[]; total: number }> {
    await this.findOwnedOrFail(userId, id);
    const build = () =>
      this.payments.qb(userId, 'p').andWhere('p.installment_id = :id', { id });
    const total = await build().getCount();
    const rows = await build()
      .orderBy('p.payment_number', 'DESC')
      .offset((page - 1) * pageSize)
      .limit(pageSize)
      .getMany();
    return { items: rows.map(toInstallmentPaymentResponse), total };
  }

  /** One transaction for the whole payment, unlike FastAPI's split commit. */
  async pay(
    userId: string,
    id: string,
    dto: PayInstallmentDto,
  ): Promise<InstallmentPaymentResponse> {
    return this.dataSource.transaction(async (manager) => {
      const installment = await this.installments
        .withManager(manager)
        .findOne(userId, { id });
      if (!installment) throw new DetailException(404, 'Installment not found');

      const paymentDate = dto.payment_date ?? naiveUtcNow();
      // Truthiness, not nullishness: a 0 falls back to the default, as FastAPI's
      // `x if payment_data and payment_data.x else None` does.
      const amount = dto.amount ? dto.amount : installment.amountPerPayment;
      const paymentNumber = dto.payment_number
        ? dto.payment_number
        : installment.paymentsMade + 1;

      const scheduledDate = scheduledDateFor(
        installment.firstPaymentDate,
        installment.frequency,
        paymentNumber,
      );
      const isLate = paymentDate.slice(0, 10) > scheduledDate.slice(0, 10);
      const daysLate = isLate
        ? Math.round(
            (Date.parse(`${paymentDate.slice(0, 10)}T00:00:00Z`) -
              Date.parse(`${scheduledDate.slice(0, 10)}T00:00:00Z`)) /
              86_400_000,
          )
        : null;

      // Simple interest on the remaining balance: rate / 100 / 12, ALWAYS /12 even for weekly and
      // biweekly schedules. Unrounded here; the numeric(12,2) column does the rounding.
      let interestAmount = '0';
      let principalAmount = amount;
      if (
        installment.interestRate &&
        decCmp(installment.interestRate, '0') > 0
      ) {
        const remaining =
          installment.remainingBalance ?? installment.totalAmount;
        const monthlyRate = decDiv(
          decDiv(installment.interestRate, '100'),
          '12',
        );
        interestAmount = decMul(remaining, monthlyRate);
        principalAmount =
          decCmp(amount, interestAmount) > 0
            ? decSub(amount, interestAmount)
            : '0';
      }

      const expense = await this.mirrorExpense.create(manager, {
        userId,
        name: `${installment.name} - Payment #${paymentNumber}`,
        description: `Auto-generated from installment: ${installment.name}`,
        category: installment.category ?? 'Installments',
        amount,
        currency: installment.currency,
        paymentDate,
        paymentAccountId: installment.paymentAccountId,
      });

      let accountTransactionId: string | null = null;
      if (installment.autoPay && installment.paymentAccountId) {
        try {
          const transaction = await this.accountTransactions.createWithdrawal(
            manager,
            {
              accountId: installment.paymentAccountId,
              userId,
              amount,
              description: `Installment payment: ${installment.name} #${paymentNumber}`,
              sourceType: 'installment',
              sourceId: installment.id,
              category: installment.category ?? 'Installments',
              transactionDate: new Date(`${paymentDate}Z`),
            },
          );
          accountTransactionId = transaction.id;
          expense.accountTransactionId = transaction.id;
          await manager.save(expense);
        } catch (error) {
          if (error instanceof InsufficientFundsError) throw error;
        }
      }

      const payment = manager.create(InstallmentPayment, {
        installmentId: installment.id,
        userId,
        paymentNumber,
        scheduledDate,
        actualPaymentDate: paymentDate,
        // Every payment is scheduled at the flat per-payment amount — the last one absorbs no
        // remainder, even when total_amount does not divide evenly.
        scheduledAmount: installment.amountPerPayment,
        actualAmount: amount,
        principalAmount,
        interestAmount,
        currency: installment.currency,
        expenseId: expense.id,
        accountTransactionId,
        status: 'completed',
        isLate,
        daysLate,
        notes: dto.notes ?? null,
      });
      await manager.save(payment);

      // An ASSIGNMENT, not an increment: recording payment #3 on a fresh installment jumps the
      // counter straight to 3.
      installment.paymentsMade = paymentNumber;
      installment.lastPaymentDate = paymentDate;
      installment.remainingBalance = calculateRemainingBalance(
        installment.totalAmount,
        installment.amountPerPayment,
        installment.paymentsMade,
      );
      installment.nextPaymentDate = calculateNextPaymentDate(
        installment.firstPaymentDate,
        installment.frequency,
        installment.numberOfPayments,
        paymentDate,
      );
      if (installment.paymentsMade >= installment.numberOfPayments) {
        installment.status = 'completed';
        installment.isActive = false;
        installment.remainingBalance = '0';
      }
      installment.updatedAt = naiveUtcNow();
      await manager.save(installment);

      return toInstallmentPaymentResponse(payment);
    });
  }

  /**
   * POST /process-due-payments. Hand-built dict, JSON-number amounts, tz-aware timestamp, and one
   * extra counter over the subscriptions version: `completed`.
   */
  async processDuePayments(userId: string): Promise<{
    status: string;
    due_count: number;
    processed: number;
    auto_paid: number;
    completed: number;
    failed_payments: Array<{
      installment_id: string;
      installment_name: string;
      reason: string;
      amount: number;
      currency: string;
    }>;
    errors: Array<{ installment_id: string; error: string }>;
    timestamp: string;
  }> {
    const now = new Date();
    const due = await this.installments
      .qb(userId, 'i')
      .andWhere('i.is_active = true')
      .andWhere("i.status = 'active'")
      .andWhere('i.next_payment_date IS NOT NULL')
      .andWhere('i.next_payment_date <= :now', { now: naiveUtcNow(now) })
      .getMany();

    const failed: Array<{
      installment_id: string;
      installment_name: string;
      reason: string;
      amount: number;
      currency: string;
    }> = [];
    const errors: Array<{ installment_id: string; error: string }> = [];
    let processed = 0;
    let autoPaid = 0;
    let completed = 0;

    for (const row of due) {
      try {
        const payment = await this.pay(userId, row.id, {});
        processed += 1;
        if (payment.account_transaction_id) autoPaid += 1;
        const after = await this.installments.findOne(userId, { id: row.id });
        if (after?.status === 'completed') completed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.startsWith('Insufficient funds')) {
          failed.push({
            installment_id: row.id,
            installment_name: row.name,
            reason: 'insufficient_funds',
            amount: Number(row.amountPerPayment),
            currency: row.currency,
          });
        } else {
          errors.push({ installment_id: row.id, error: message });
        }
      }
    }

    return {
      status: 'success',
      due_count: due.length,
      processed,
      auto_paid: autoPaid,
      completed,
      failed_payments: failed,
      errors,
      timestamp: `${now.toISOString().replace('Z', '')}+00:00`,
    };
  }

  /** display_* is only ever populated on the float-cast endpoints. */
  private displayFor(row: Installment) {
    return {
      displayTotalAmount: row.totalAmount,
      displayAmountPerPayment: row.amountPerPayment,
      displayRemainingBalance: row.remainingBalance,
      displayCurrency: row.currency,
    };
  }

  private async assertAccountOwned(
    userId: string,
    accountId: string | null | undefined,
  ): Promise<void> {
    if (!accountId) return;
    const account = await this.dataSource
      .getRepository(SavingsAccount)
      .findOne({ where: { id: accountId, userId } });
    if (!account) throw new DetailException(400, 'Invalid payment account');
  }

  /** Exposed for the stats service, which needs the same naive-string handling. */
  static isoOf(value: string | null): string | null {
    return toNaiveIso(value);
  }
}
