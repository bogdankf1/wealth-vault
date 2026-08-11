import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DisplayCurrencyService } from '../../../common/currency/display-currency.service';
import {
  PaginatedResponse,
  paginated,
} from '../../../common/dto/page-query.dto';
import { naiveUtcNow } from '../../../common/entities/naive-timestamp.entity';
import { DetailException } from '../../../common/exceptions/app.exception';
import {
  OwnedRepository,
  ownedRepositoryToken,
} from '../../../common/repository/owned.repository';
import { CurrencyConverterService } from '../../currency/currency-converter.service';
import { MirrorExpenseService } from '../../expenses/services/mirror-expense.service';
import { AccountTransactionService } from '../../savings/account-transaction.service';
import { SavingsAccount } from '../../savings/entities/savings-account.entity';
import { InsufficientFundsError } from '../../savings/errors';
import {
  CreateSubscriptionDto,
  ListSubscriptionsQueryDto,
  PauseSubscriptionDto,
  PaySubscriptionDto,
  UpdateSubscriptionDto,
} from '../dto/subscription.dto';
import { Subscription } from '../entities/subscription.entity';
import { SubscriptionPayment } from '../entities/subscription-payment.entity';
import {
  SubscriptionPaymentResponse,
  SubscriptionResponse,
  monthlyEquivalent,
  toPaymentResponse,
  toSubscriptionFloat,
  toSubscriptionOrm,
} from '../mappers/subscription-response.mapper';
import {
  calculateNextPaymentDate,
  calculatePeriodDates,
} from '../subscription-dates';

@Injectable()
export class SubscriptionsService {
  constructor(
    @Inject(ownedRepositoryToken(Subscription))
    private readonly subscriptions: OwnedRepository<Subscription>,
    @Inject(ownedRepositoryToken(SubscriptionPayment))
    private readonly payments: OwnedRepository<SubscriptionPayment>,
    private readonly display: DisplayCurrencyService,
    private readonly converter: CurrencyConverterService,
    private readonly accountTransactions: AccountTransactionService,
    private readonly mirrorExpense: MirrorExpenseService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async findOwnedOrFail(userId: string, id: string): Promise<Subscription> {
    const row = await this.subscriptions.findOne(userId, { id });
    if (!row) throw new DetailException(404, 'Subscription not found');
    return row;
  }

  async list(
    userId: string,
    query: ListSubscriptionsQueryDto,
  ): Promise<PaginatedResponse<ReturnType<typeof toSubscriptionFloat>>> {
    const build = () => {
      const builder = this.subscriptions.qb(userId, 's');
      if (query.category) {
        builder.andWhere('s.category = :category', {
          category: query.category,
        });
      }
      if (query.frequency) {
        builder.andWhere('s.frequency = :frequency', {
          frequency: query.frequency,
        });
      }
      if (query.is_active !== undefined) {
        builder.andWhere('s.is_active = :isActive', {
          isActive: query.is_active,
        });
      }
      return builder;
    };

    const total = await build().getCount();
    const rows = await build()
      .orderBy('s.created_at', 'DESC')
      .offset((query.page - 1) * query.page_size)
      .limit(query.page_size)
      .getMany();

    const displayCurrency = await this.display.forUser(userId);
    const items = await Promise.all(
      rows.map(async (row) =>
        toSubscriptionFloat(
          row,
          await this.displayFor(userId, row, displayCurrency),
        ),
      ),
    );
    return paginated(items, total, query);
  }

  async get(userId: string, id: string) {
    const row = await this.findOwnedOrFail(userId, id);
    return toSubscriptionFloat(row, await this.displayFor(userId, row));
  }

  async create(
    userId: string,
    dto: CreateSubscriptionDto,
  ): Promise<SubscriptionResponse> {
    await this.assertAccountOwned(userId, dto.payment_account_id);
    const row = this.subscriptions.raw.create({
      userId,
      name: dto.name,
      description: dto.description ?? null,
      category: dto.category ?? null,
      amount: dto.amount,
      currency: dto.currency,
      frequency: dto.frequency,
      startDate: dto.start_date,
      endDate: dto.end_date ?? null,
      isActive: dto.is_active,
      status: 'active',
      paymentAccountId: dto.payment_account_id ?? null,
      autoPay: dto.auto_pay,
      // Anchored at "now", so a subscription created with a past start date gets its first FUTURE
      // occurrence and no catch-up payments are generated.
      nextPaymentDate: calculateNextPaymentDate(dto.start_date, dto.frequency),
      lastPaymentDate: null,
      reminderDaysBefore: dto.reminder_days_before,
      lastReminderAt: null,
      pausedAt: null,
      resumeDate: null,
    });
    await this.subscriptions.raw.save(row);
    return toSubscriptionOrm(row);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateSubscriptionDto,
  ): Promise<SubscriptionResponse> {
    const row = await this.findOwnedOrFail(userId, id);
    if ('payment_account_id' in dto) {
      await this.assertAccountOwned(userId, dto.payment_account_id);
    }

    if (dto.name !== undefined) row.name = dto.name;
    if ('description' in dto) row.description = dto.description ?? null;
    if ('category' in dto) row.category = dto.category ?? null;
    if (dto.amount !== undefined) row.amount = dto.amount;
    if (dto.currency !== undefined) row.currency = dto.currency;
    if (dto.frequency !== undefined) row.frequency = dto.frequency;
    if (dto.start_date !== undefined) row.startDate = dto.start_date;
    if ('end_date' in dto) row.endDate = dto.end_date ?? null;
    if (dto.is_active !== undefined) row.isActive = dto.is_active;
    if ('payment_account_id' in dto) {
      row.paymentAccountId = dto.payment_account_id ?? null;
    }
    if (dto.auto_pay !== undefined) row.autoPay = dto.auto_pay;
    if (dto.reminder_days_before !== undefined) {
      row.reminderDaysBefore = dto.reminder_days_before;
    }

    // Recomputed ONLY when the schedule inputs changed, and re-anchored at now.
    if (dto.frequency !== undefined || dto.start_date !== undefined) {
      row.nextPaymentDate = calculateNextPaymentDate(
        row.startDate,
        row.frequency,
      );
    }
    row.updatedAt = naiveUtcNow();
    await this.subscriptions.raw.save(row);
    return toSubscriptionOrm(row);
  }

  /** Hard delete; subscription_payments cascade. The mirror expenses are deliberately left behind. */
  async remove(userId: string, id: string): Promise<void> {
    const row = await this.findOwnedOrFail(userId, id);
    await this.subscriptions.raw.remove(row);
  }

  async batchDelete(
    userId: string,
    ids: string[],
  ): Promise<{ deleted_count: number; failed_ids: string[] }> {
    const failed: string[] = [];
    let deleted = 0;
    await this.dataSource.transaction(async (manager) => {
      const scoped = this.subscriptions.withManager(manager);
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

  async pause(
    userId: string,
    id: string,
    dto: PauseSubscriptionDto,
  ): Promise<SubscriptionResponse> {
    const row = await this.findOwnedOrFail(userId, id);
    if (row.status === 'paused') {
      throw new DetailException(400, 'Subscription is already paused');
    }
    row.status = 'paused';
    row.isActive = false;
    row.pausedAt = naiveUtcNow();
    // Stored and never read again — nothing auto-resumes.
    row.resumeDate = dto.resume_date ?? null;
    row.updatedAt = naiveUtcNow();
    await this.subscriptions.raw.save(row);
    return toSubscriptionOrm(row);
  }

  async resume(userId: string, id: string): Promise<SubscriptionResponse> {
    const row = await this.findOwnedOrFail(userId, id);
    if (row.status !== 'paused') {
      throw new DetailException(400, 'Subscription is not paused');
    }
    row.status = 'active';
    row.isActive = true;
    row.pausedAt = null;
    row.resumeDate = null;
    // Re-anchored at now, so every period missed while paused is skipped — no catch-up.
    row.nextPaymentDate = calculateNextPaymentDate(
      row.startDate,
      row.frequency,
    );
    row.updatedAt = naiveUtcNow();
    await this.subscriptions.raw.save(row);
    return toSubscriptionOrm(row);
  }

  async cancel(userId: string, id: string): Promise<SubscriptionResponse> {
    const row = await this.findOwnedOrFail(userId, id);
    if (row.status === 'cancelled') {
      throw new DetailException(400, 'Subscription is already cancelled');
    }
    row.status = 'cancelled';
    row.isActive = false;
    // Overwrites any user-supplied end date. FastAPI's behaviour, replicated.
    row.endDate = naiveUtcNow();
    row.updatedAt = naiveUtcNow();
    await this.subscriptions.raw.save(row);
    return toSubscriptionOrm(row);
  }

  async listPayments(
    userId: string,
    id: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: SubscriptionPaymentResponse[]; total: number }> {
    await this.findOwnedOrFail(userId, id);
    const build = () =>
      this.payments.qb(userId, 'p').andWhere('p.subscription_id = :id', { id });
    const total = await build().getCount();
    const rows = await build()
      .orderBy('p.payment_date', 'DESC')
      .offset((page - 1) * pageSize)
      .limit(pageSize)
      .getMany();
    // This envelope carries only items and total — no page echo, unlike the subscription list.
    return { items: rows.map(toPaymentResponse), total };
  }

  /**
   * One transaction for the whole payment. FastAPI flushes the mirror expense BEFORE attempting the
   * withdrawal and, in its bulk path, keeps going after an insufficient-funds failure — which
   * commits an orphan expense with no payment row pointing at it. Wrapping removes that by
   * construction.
   */
  async pay(
    userId: string,
    id: string,
    dto: PaySubscriptionDto,
  ): Promise<SubscriptionPaymentResponse> {
    return this.dataSource.transaction(async (manager) => {
      const subscription = await this.subscriptions
        .withManager(manager)
        .findOne(userId, { id });
      if (!subscription)
        throw new DetailException(404, 'Subscription not found');

      const paymentDate = dto.payment_date ?? naiveUtcNow();
      const { periodStart, periodEnd } = calculatePeriodDates(
        paymentDate,
        subscription.frequency,
      );

      const expense = await this.mirrorExpense.create(manager, {
        userId,
        name: `${subscription.name} - Subscription`,
        description: `Auto-generated from subscription: ${subscription.name}`,
        category: subscription.category ?? 'Subscriptions',
        // dto.amount is accepted and ignored — the subscription's own amount is always used.
        amount: subscription.amount,
        currency: subscription.currency,
        paymentDate,
        paymentAccountId: subscription.paymentAccountId,
      });

      let accountTransactionId: string | null = null;
      if (subscription.autoPay && subscription.paymentAccountId) {
        const account = await manager.findOne(SavingsAccount, {
          where: { id: subscription.paymentAccountId, userId },
        });
        let exchangeRate: string | null = null;
        if (account && account.currency !== subscription.currency) {
          exchangeRate =
            (await this.converter.rateFor(
              subscription.currency,
              account.currency,
            )) ?? '1';
        }
        try {
          const transaction = await this.accountTransactions.createWithdrawal(
            manager,
            {
              accountId: subscription.paymentAccountId,
              userId,
              amount: subscription.amount,
              description: `Subscription payment: ${subscription.name}`,
              sourceType: 'subscription',
              sourceId: subscription.id,
              category: subscription.category ?? 'Subscriptions',
              transactionDate: new Date(`${paymentDate}Z`),
              sourceCurrency: exchangeRate ? subscription.currency : null,
              exchangeRate,
            },
          );
          accountTransactionId = transaction.id;
          expense.accountTransactionId = transaction.id;
          await manager.save(expense);
        } catch (error) {
          // Insufficient funds aborts the payment; anything else (a deactivated account, say) is
          // swallowed and the payment is still recorded — FastAPI's split, preserved.
          if (error instanceof InsufficientFundsError) throw error;
        }
      }

      const payment = manager.create(SubscriptionPayment, {
        subscriptionId: subscription.id,
        userId,
        // Always the subscription's amount in the subscription's currency, never the converted one.
        amount: subscription.amount,
        currency: subscription.currency,
        paymentDate,
        periodStart,
        periodEnd,
        expenseId: expense.id,
        accountTransactionId,
        status: 'completed',
        notes: dto.notes ?? null,
      });
      await manager.save(payment);

      subscription.lastPaymentDate = paymentDate;
      subscription.nextPaymentDate = calculateNextPaymentDate(
        subscription.startDate,
        subscription.frequency,
        paymentDate,
      );
      subscription.updatedAt = naiveUtcNow();
      await manager.save(subscription);

      return toPaymentResponse(payment);
    });
  }

  /**
   * POST /process-due-payments. A hand-built dict with no response_model, so its money fields are
   * JSON NUMBERS and its timestamp is the module's only tz-aware one.
   *
   * FastAPI selects every tenant's due rows and filters in Python; the predicate is pushed into
   * SQL here. Each payment is its own transaction, so one failure cannot strand another's rows.
   */
  async processDuePayments(userId: string): Promise<{
    status: string;
    due_count: number;
    processed: number;
    auto_paid: number;
    failed_payments: Array<{
      subscription_id: string;
      subscription_name: string;
      reason: string;
      amount: number;
      currency: string;
    }>;
    errors: Array<{ subscription_id: string; error: string }>;
    timestamp: string;
  }> {
    const now = new Date();
    const due = await this.subscriptions
      .qb(userId, 's')
      .andWhere('s.is_active = true')
      .andWhere("s.status = 'active'")
      .andWhere('s.next_payment_date IS NOT NULL')
      .andWhere('s.next_payment_date <= :now', { now: naiveUtcNow(now) })
      .getMany();

    const failed: Array<{
      subscription_id: string;
      subscription_name: string;
      reason: string;
      amount: number;
      currency: string;
    }> = [];
    const errors: Array<{ subscription_id: string; error: string }> = [];
    let processed = 0;
    let autoPaid = 0;

    for (const row of due) {
      try {
        const payment = await this.pay(userId, row.id, {});
        processed += 1;
        if (payment.account_transaction_id) autoPaid += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.startsWith('Insufficient funds')) {
          failed.push({
            subscription_id: row.id,
            subscription_name: row.name,
            reason: 'insufficient_funds',
            amount: Number(row.amount),
            currency: row.currency,
          });
        } else {
          errors.push({ subscription_id: row.id, error: message });
        }
      }
    }

    return {
      status: 'success',
      due_count: due.length,
      processed,
      auto_paid: autoPaid,
      failed_payments: failed,
      errors,
      timestamp: `${now.toISOString().replace('Z', '')}+00:00`,
    };
  }

  private async displayFor(
    userId: string,
    row: Subscription,
    displayCurrency?: string,
  ) {
    return this.display.forRow(
      userId,
      {
        amount: row.amount,
        currency: row.currency,
        monthlyEquivalent: monthlyEquivalent(row.amount, row.frequency),
      },
      displayCurrency,
    );
  }

  /** FastAPI never checks this; a foreign account id could be stored and its currency read. */
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
}
