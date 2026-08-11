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
  decCmp,
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
import { AccountTransaction } from '../../savings/entities/account-transaction.entity';
import { SavingsAccount } from '../../savings/entities/savings-account.entity';
import {
  CreateTaxPaymentDto,
  ListTaxPaymentsQueryDto,
  PayTaxDto,
} from '../dto/tax.dto';
import { Tax } from '../entities/tax.entity';
import { TaxPayment } from '../entities/tax-payment.entity';
import {
  TaxPaymentResponse,
  toTaxPaymentResponse,
} from '../mappers/tax-response.mapper';
import { nextTaxPaymentDate } from '../tax-period';
import { TaxEnrichmentService } from './tax-enrichment.service';

export class InsufficientTaxFundsError extends Error {
  constructor(
    readonly requiredAmount: string,
    readonly accountName: string,
    readonly currentBalance: string,
    readonly currency: string,
  ) {
    super(
      `Insufficient balance. Required: ${requiredAmount} ${currency}, Available: ${currentBalance} ${currency}`,
    );
  }
}

@Injectable()
export class TaxPaymentsService {
  constructor(
    @Inject(ownedRepositoryToken(Tax))
    private readonly taxes: OwnedRepository<Tax>,
    @Inject(ownedRepositoryToken(TaxPayment))
    private readonly payments: OwnedRepository<TaxPayment>,
    @Inject(ownedRepositoryToken(SavingsAccount))
    private readonly accounts: OwnedRepository<SavingsAccount>,
    private readonly enrichment: TaxEnrichmentService,
    private readonly displayCurrency: DisplayCurrencyService,
    private readonly converter: CurrencyConverterService,
    private readonly dataSource: DataSource,
  ) {}

  async listPayments(
    userId: string,
    query: ListTaxPaymentsQueryDto,
  ): Promise<PaginatedResponse<TaxPaymentResponse>> {
    const where = query.tax_id ? { taxId: query.tax_id } : {};
    const total = await this.payments.count(userId, where);
    const rows = await this.payments.find(userId, {
      where,
      order: { paymentDate: 'DESC' },
      skip: (query.page - 1) * query.page_size,
      take: query.page_size,
    });
    return paginated(rows.map(toTaxPaymentResponse), total, query);
  }

  async getPayment(
    userId: string,
    paymentId: string,
  ): Promise<TaxPaymentResponse> {
    const payment = await this.payments.findOne(userId, { id: paymentId });
    if (!payment) throw new DetailException(404, 'Tax payment not found');
    return toTaxPaymentResponse(payment);
  }

  /** 404 with the tax's message, not the payment's — the tax lookup happens first. */
  async createPayment(
    userId: string,
    dto: CreateTaxPaymentDto,
  ): Promise<TaxPaymentResponse> {
    const payment = await this.dataSource.transaction(async (manager) => {
      const tax = await this.taxes
        .withManager(manager)
        .findOne(userId, { id: dto.tax_id, deletedAt: IsNull() });
      if (!tax) throw new DetailException(404, 'Tax not found');

      const saved = await manager.save(
        manager.create(TaxPayment, {
          userId,
          taxId: dto.tax_id,
          amount: dto.amount,
          currency: dto.currency,
          paymentDate: dto.payment_date,
          periodStart: dto.period_start ?? null,
          periodEnd: dto.period_end ?? null,
          accountTransactionId: null,
          status: 'completed',
          notes: dto.notes ?? null,
        }),
      );
      return reload(manager, TaxPayment, saved.id);
    });
    return toTaxPaymentResponse(payment);
  }

  async deletePayment(userId: string, paymentId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const scoped = this.payments.withManager(manager);
      const payment = await scoped.findOne(userId, { id: paymentId });
      if (!payment) throw new DetailException(404, 'Tax payment not found');
      await manager.remove(payment);
    });
  }

  /**
   * pay_tax. The withdrawal is built INLINE rather than through AccountTransactionService, exactly
   * as FastAPI does it, and the differences are all observable in the database:
   *   - no balance_history row is written;
   *   - source_type, source_id and posted_date stay NULL;
   *   - the account is not filtered by is_active;
   *   - the overdraft test is `balance < amount`, not `balance - amount < 0`.
   * Routing this through the savings engine would start writing history rows FastAPI never wrote.
   */
  async pay(
    userId: string,
    taxId: string,
    dto: PayTaxDto | undefined,
  ): Promise<{
    payment: TaxPaymentResponse;
    transaction_id: string | null;
    message: string;
  }> {
    const { payment, transactionId } = await this.dataSource.transaction(
      (manager) => this.payWithin(manager, userId, taxId, dto),
    );
    return {
      payment: toTaxPaymentResponse(payment),
      transaction_id: transactionId,
      message: 'Tax payment processed successfully',
    };
  }

  async payWithin(
    manager: EntityManager,
    userId: string,
    taxId: string,
    dto: PayTaxDto | undefined,
  ): Promise<{ payment: TaxPayment; transactionId: string }> {
    const tax = await this.taxes
      .withManager(manager)
      .findOne(userId, { id: taxId, deletedAt: IsNull() });
    if (!tax) throw new DetailException(400, 'Tax not found');

    const accountId = dto?.account_id ?? tax.paymentAccountId;
    if (!accountId)
      throw new DetailException(400, 'No payment account specified');

    const account = await this.accounts
      .withManager(manager)
      .findOne(userId, { id: accountId });
    if (!account) throw new DetailException(400, 'Payment account not found');

    const paymentAmount = await this.resolveAmount(userId, tax, account, dto);

    if (decCmp(account.currentBalance, paymentAmount) < 0) {
      throw new InsufficientTaxFundsError(
        paymentAmount,
        account.name,
        account.currentBalance,
        account.currency,
      );
    }

    const balanceBefore = account.currentBalance;
    const balanceAfter = decSub(balanceBefore, paymentAmount);
    const now = new Date();

    const transaction = await manager.save(
      manager.create(AccountTransaction, {
        accountId: account.id,
        userId,
        transactionType: 'withdrawal',
        amount: paymentAmount,
        currency: account.currency,
        balanceBefore,
        balanceAfter,
        category: 'tax',
        description: `Tax payment: ${tax.name}`,
        transactionDate: now,
        // Everything the savings engine would have filled in stays unset here.
        sourceType: null,
        sourceId: null,
        postedDate: null,
        referenceNumber: null,
        status: 'completed',
        createdAt: now,
        updatedAt: now,
      }),
    );

    account.currentBalance = balanceAfter;
    account.updatedAt = naiveUtcNow(now);
    await manager.save(account);

    const saved = await manager.save(
      manager.create(TaxPayment, {
        userId,
        taxId,
        amount: paymentAmount,
        // The ACCOUNT's currency, not the tax's.
        currency: account.currency,
        paymentDate: naiveUtcNow(now),
        // Left NULL even though the period is known — FastAPI never fills these on this path.
        periodStart: null,
        periodEnd: null,
        accountTransactionId: transaction.id,
        status: 'completed',
        notes: dto?.notes ?? null,
      }),
    );
    const payment = await reload(manager, TaxPayment, saved.id);

    if (tax.autoPay) {
      tax.nextPaymentDate = nextTaxPaymentDate(tax.frequency);
      tax.updatedAt = naiveUtcNow(now);
      await manager.save(tax);
    }

    return { payment, transactionId: transaction.id };
  }

  /** An explicit amount wins; otherwise fixed or percentage, converted into the account currency. */
  private async resolveAmount(
    userId: string,
    tax: Tax,
    account: SavingsAccount,
    dto: PayTaxDto | undefined,
  ): Promise<string> {
    if (dto?.amount) return dto.amount;

    if (
      tax.taxType === 'fixed' &&
      Number(tax.fixedAmount) !== 0 &&
      tax.fixedAmount
    ) {
      if (tax.currency === account.currency) return tax.fixedAmount;
      const converted = await this.converter.convert(
        tax.fixedAmount,
        tax.currency,
        account.currency,
      );
      return converted ?? tax.fixedAmount;
    }

    if (
      tax.taxType === 'percentage' &&
      Number(tax.percentage) !== 0 &&
      tax.percentage
    ) {
      const display = await this.displayCurrency.forUser(userId);
      const income = await this.enrichment.totalMonthlyIncome(
        userId,
        tax.incomeSourceId,
        display,
      );
      const amount = decDiv(decMul(income, tax.percentage), '100');
      if (display === account.currency) return amount;
      const converted = await this.converter.convert(
        amount,
        display,
        account.currency,
      );
      return converted ?? amount;
    }

    throw new DetailException(400, 'Unable to calculate tax amount');
  }
}

/** The 400 body FastAPI builds when the balance check fails — both numbers are JSON floats. */
export function insufficientFundsDetail(error: InsufficientTaxFundsError): {
  message: string;
  error_code: string;
  account_name: string;
  current_balance: number | null;
  required_amount: number | null;
  currency: string;
} {
  return {
    message: 'Insufficient funds',
    error_code: 'INSUFFICIENT_FUNDS',
    account_name: error.accountName,
    current_balance: Number(pyFloatMoney(error.currentBalance)),
    required_amount: Number(pyFloatMoney(error.requiredAmount)),
    currency: error.currency,
  };
}
