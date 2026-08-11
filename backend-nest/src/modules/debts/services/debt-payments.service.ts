import { Inject, Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { naiveUtcNow } from '../../../common/entities/naive-timestamp.entity';
import { reload } from '../../../common/repository/reload';
import { decAdd, decCmp, decMax, decSub } from '../../../common/money/money';
import {
  OwnedRepository,
  ownedRepositoryToken,
} from '../../../common/repository/owned.repository';
import { ListResponse, listed } from '../../../common/dto/page-query.dto';
import { CurrencyConverterService } from '../../currency/currency-converter.service';
import { AccountTransactionService } from '../../savings/account-transaction.service';
import { SavingsAccount } from '../../savings/entities/savings-account.entity';
import { Debt } from '../entities/debt.entity';
import { DebtPayment } from '../entities/debt-payment.entity';
import { RecordDebtPaymentDto } from '../dto/debt.dto';
import {
  DebtPaymentResponse,
  toDebtPaymentResponse,
} from '../mappers/debt-response.mapper';

@Injectable()
export class DebtPaymentsService {
  private readonly logger = new Logger(DebtPaymentsService.name);

  constructor(
    @Inject(ownedRepositoryToken(DebtPayment))
    private readonly payments: OwnedRepository<DebtPayment>,
    @Inject(ownedRepositoryToken(SavingsAccount))
    private readonly accounts: OwnedRepository<SavingsAccount>,
    private readonly transactions: AccountTransactionService,
    private readonly converter: CurrencyConverterService,
  ) {}

  /** `{items, total}` with total = len(items) — no pagination on this endpoint. */
  async list(
    userId: string,
    debtId: string,
  ): Promise<ListResponse<DebtPaymentResponse>> {
    const rows = await this.payments.find(userId, {
      where: { debtId },
      order: { paymentDate: 'DESC' },
    });
    return listed(rows.map(toDebtPaymentResponse));
  }

  /**
   * record_debt_payment. A debt is a receivable, so the money moves INTO a savings account — the
   * only slice-3 path that touches the savings engine the normal way.
   *
   * The deposit is best-effort: FastAPI catches every exception from it, logs a warning and still
   * records the payment with account_transaction_id NULL. Replicated, because a failed deposit
   * silently dropping the payment record too would be a worse divergence.
   */
  async record(
    manager: EntityManager,
    debt: Debt,
    dto: RecordDebtPaymentDto,
  ): Promise<DebtPayment> {
    const paymentDate = dto.payment_date ?? naiveUtcNow();
    const amount = dto.amount;

    const balanceBefore = decSub(debt.amount, debt.amountPaid);
    const balanceAfter = decMax(decSub(balanceBefore, amount), '0');

    let accountTransactionId: string | null = null;
    if ((debt.autoDeposit || dto.deposit_to_account) && debt.depositAccountId) {
      accountTransactionId = await this.deposit(
        manager,
        debt,
        amount,
        paymentDate,
        `Debt payment from: ${debt.debtorName}`,
      );
    }

    const saved = await manager.save(
      manager.create(DebtPayment, {
        debtId: debt.id,
        userId: debt.userId,
        amount,
        currency: debt.currency,
        paymentDate,
        // The whole payment counts as principal; interest is always booked at zero.
        principalAmount: amount,
        interestAmount: '0',
        balanceBefore,
        balanceAfter,
        accountTransactionId,
        status: 'completed',
        notes: dto.notes ?? null,
      }),
    );
    // The router refreshes before serializing, so interest_amount answers '0.00' not '0'.
    const payment = await reload(manager, DebtPayment, saved.id);

    debt.amountPaid = decAdd(debt.amountPaid, amount);
    if (decCmp(debt.amountPaid, debt.amount) >= 0) {
      debt.isPaid = true;
      debt.paidDate = paymentDate;
    }
    debt.updatedAt = naiveUtcNow();
    await manager.save(debt);

    return payment;
  }

  /**
   * backfill_debt_payments: ONE historical payment covering everything already paid, created when a
   * deposit account is linked with sync_historical. Skipped entirely if the debt already has any
   * payment rows, so it cannot double-count.
   */
  async backfill(manager: EntityManager, debt: Debt): Promise<number> {
    if (!debt.depositAccountId || Number(debt.amountPaid) <= 0) return 0;

    const existing = await manager.count(DebtPayment, {
      where: { debtId: debt.id },
    });
    if (existing > 0) {
      this.logger.log(
        `Debt ${debt.id} already has ${existing} payments, skipping backfill`,
      );
      return 0;
    }

    // Dated at the debt's creation, not now — the payment is historical by definition.
    const paymentDate = debt.createdAt || naiveUtcNow();
    const amount = debt.amountPaid;

    const accountTransactionId = await this.deposit(
      manager,
      debt,
      amount,
      paymentDate,
      `Historical debt payment from: ${debt.debtorName}`,
    );

    await manager.save(
      manager.create(DebtPayment, {
        debtId: debt.id,
        userId: debt.userId,
        amount,
        currency: debt.currency,
        paymentDate,
        principalAmount: amount,
        interestAmount: '0',
        balanceBefore: debt.amount,
        // Not floored at zero here, unlike record() — an overpaid debt backfills a negative.
        balanceAfter: decSub(debt.amount, amount),
        accountTransactionId,
        status: 'completed',
        notes: 'Historical payment (backfilled)',
      }),
    );
    return 1;
  }

  /**
   * reverse_debt_payments: undo the account transactions and delete the payment rows. Used when the
   * deposit account changes with sync_historical set.
   */
  async reverseAll(
    manager: EntityManager,
    userId: string,
    debtId: string,
  ): Promise<number> {
    const rows = await this.payments
      .withManager(manager)
      .find(userId, { where: { debtId } });

    let reversed = 0;
    for (const payment of rows) {
      try {
        if (payment.accountTransactionId) {
          await this.transactions.reverse(
            manager,
            payment.accountTransactionId,
            userId,
          );
        }
        await manager.remove(payment);
        reversed += 1;
      } catch (error) {
        this.logger.error(
          `Error reversing payment ${payment.id}: ${String(error)}`,
        );
      }
    }
    return reversed;
  }

  /** Best-effort deposit; a failure yields null and the caller still records the payment. */
  private async deposit(
    manager: EntityManager,
    debt: Debt,
    amount: string,
    paymentDate: string,
    description: string,
  ): Promise<string | null> {
    try {
      const account = await this.accounts
        .withManager(manager)
        .findOne(debt.userId, { id: debt.depositAccountId! });

      let sourceCurrency: string | null = null;
      let exchangeRate: string | null = null;
      if (account && debt.currency && debt.currency !== account.currency) {
        sourceCurrency = debt.currency;
        exchangeRate = await this.converter.rateFor(
          debt.currency,
          account.currency,
        );
        if (!exchangeRate) {
          this.logger.warn(
            `Could not get exchange rate from ${debt.currency} to ${account.currency} for debt ${debt.id}, using 1:1`,
          );
          exchangeRate = '1';
        }
      }

      const transaction = await this.transactions.createDeposit(manager, {
        accountId: debt.depositAccountId!,
        userId: debt.userId,
        amount,
        description,
        sourceType: 'debt',
        sourceId: debt.id,
        category: 'Debt Collection',
        transactionDate: new Date(`${paymentDate.replace(' ', 'T')}Z`),
        sourceCurrency,
        exchangeRate,
      });
      return transaction.id;
    } catch (error) {
      this.logger.warn(
        `Failed to create deposit for debt ${debt.id}: ${String(error)}`,
      );
      return null;
    }
  }
}
