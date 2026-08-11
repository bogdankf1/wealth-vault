import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { DisplayCurrencyService } from '../../../common/currency/display-currency.service';
import {
  PaginatedResponse,
  paginated,
} from '../../../common/dto/page-query.dto';
import { naiveUtcNow } from '../../../common/entities/naive-timestamp.entity';
import { DetailException } from '../../../common/exceptions/app.exception';
import { decAdd } from '../../../common/money/money';
import {
  OwnedRepository,
  ownedRepositoryToken,
} from '../../../common/repository/owned.repository';
import { toNaiveIso } from '../../../common/time/naive-timestamp';
import { CurrencyConverterService } from '../../currency/currency-converter.service';
import { AccountTransactionService } from '../../savings/account-transaction.service';
import { SavingsAccount } from '../../savings/entities/savings-account.entity';
import { InsufficientFundsError } from '../../savings/errors';
import { PageQueryDto } from '../../../common/dto/page-query.dto';
import { PayExpenseDto } from '../dto/expense.dto';
import { Expense } from '../entities/expense.entity';
import { EXPENSE_STATUS } from '../enums';
import {
  ExpenseModelResponse,
  toExpenseModel,
} from '../mappers/expense-response.mapper';

export interface PayExpenseResponse {
  expense_id: string;
  account_transaction_id: string | null;
  paid_amount: string;
  paid_date: string;
  status: string;
  message: string;
}

export interface PaymentSummary {
  total_pending: number;
  total_paid: number;
  total_overdue: number;
  pending_amount: string;
  paid_amount: string;
  overdue_amount: string;
  currency: string;
}

@Injectable()
export class ExpensePaymentsService {
  constructor(
    @Inject(ownedRepositoryToken(Expense))
    private readonly expenses: OwnedRepository<Expense>,
    private readonly accountTransactions: AccountTransactionService,
    private readonly converter: CurrencyConverterService,
    private readonly display: DisplayCurrencyService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * One transaction for the whole use case. FastAPI commits inside create_withdrawal and again for
   * the expense row, so a failure between the two takes money out of the account with nothing
   * marked paid.
   */
  async pay(
    userId: string,
    expenseId: string,
    dto: PayExpenseDto,
  ): Promise<PayExpenseResponse> {
    return this.dataSource.transaction(async (manager) => {
      const scoped = this.expenses.withManager(manager);
      const expense = await scoped.findOne(userId, { id: expenseId });
      if (!expense) throw new DetailException(400, 'Expense not found');
      if (expense.status === EXPENSE_STATUS.PAID) {
        throw new DetailException(400, 'Expense is already paid');
      }

      const accountId = dto.account_id ?? expense.paymentAccountId;
      // The request literal wins verbatim when present — `{"amount":"100"}` answers "100", not
      // "100.00" — because FastAPI echoes the parsed Decimal straight back.
      const amount = dto.amount ?? expense.amount;
      const paymentMethod = dto.payment_method ?? expense.paymentMethod;
      const now = new Date();

      let accountTransactionId: string | null = null;
      if (accountId) {
        accountTransactionId = await this.withdraw(manager, {
          userId,
          expense,
          accountId,
          amount,
          description: dto.description,
        });
      }

      expense.status = EXPENSE_STATUS.PAID;
      expense.paidDate = naiveUtcNow(now);
      // The PRE-FX amount, in the expense's own currency — the account transaction holds the
      // converted one. payment-summary depends on this asymmetry.
      expense.paidAmount = amount;
      expense.accountTransactionId = accountTransactionId;
      expense.paymentMethod = paymentMethod;
      expense.updatedAt = naiveUtcNow(now);
      await manager.save(expense);

      return {
        expense_id: expenseId,
        account_transaction_id: accountTransactionId,
        paid_amount: amount,
        paid_date: toNaiveIso(naiveUtcNow(now))!,
        status: EXPENSE_STATUS.PAID,
        message: accountTransactionId
          ? 'Expense paid successfully and deducted from account'
          : 'Expense paid successfully',
      };
    });
  }

  private async withdraw(
    manager: EntityManager,
    input: {
      userId: string;
      expense: Expense;
      accountId: string;
      amount: string;
      description?: string | null;
    },
  ): Promise<string> {
    const account = await manager.findOne(SavingsAccount, {
      where: { id: input.accountId, userId: input.userId },
    });
    // FastAPI reads this account with NO user filter and lets a missing one surface as a 500 out of
    // create_withdrawal. Scoped and answered as a 400 here.
    if (!account) throw new DetailException(400, 'Invalid payment account');

    let exchangeRate: string | null = null;
    if (input.expense.currency !== account.currency) {
      exchangeRate =
        (await this.converter.rateFor(
          input.expense.currency,
          account.currency,
        )) ?? '1';
    }

    const transaction = await this.accountTransactions.createWithdrawal(
      manager,
      {
        accountId: input.accountId,
        userId: input.userId,
        amount: input.amount,
        description:
          input.description ?? `Payment for expense: ${input.expense.name}`,
        sourceType: 'expense',
        // The EXPENSE id — income used its transaction id in the same field.
        sourceId: input.expense.id,
        category: input.expense.category,
        sourceCurrency: exchangeRate ? input.expense.currency : null,
        exchangeRate,
      },
    );
    return transaction.id;
  }

  /** Rendered by the router as a structured 400 — see the controller. */
  async insufficientFundsBody(
    userId: string,
    expenseId: string,
    dto: PayExpenseDto,
  ): Promise<Record<string, unknown>> {
    const expense = await this.expenses.findOne(userId, { id: expenseId });
    const accountId = dto.account_id ?? expense?.paymentAccountId ?? null;
    const account = accountId
      ? await this.dataSource
          .getRepository(SavingsAccount)
          .findOne({ where: { id: accountId, userId } })
      : null;
    return {
      message: 'Insufficient funds',
      error_code: 'INSUFFICIENT_FUNDS',
      account_name: account?.name ?? 'Unknown',
      // Floats here, unlike every other money field in the module.
      current_balance: account ? Number(account.currentBalance) : null,
      required_amount: Number(dto.amount ?? expense?.amount ?? 0),
      currency: account?.currency ?? 'USD',
    };
  }

  async cancel(
    userId: string,
    expenseId: string,
  ): Promise<ExpenseModelResponse> {
    const expense = await this.expenses.findOne(userId, { id: expenseId });
    if (!expense) throw new DetailException(404, 'Expense not found');

    // Status only. The withdrawal is NOT reversed and paid_amount / paid_date /
    // account_transaction_id are left in place — cancelling a paid expense does not return the
    // money. FastAPI's behaviour, replicated.
    expense.status = EXPENSE_STATUS.CANCELLED;
    expense.updatedAt = naiveUtcNow();
    await this.expenses.raw.save(expense);
    return toExpenseModel(expense);
  }

  listByStatus(
    userId: string,
    status: string,
    query: PageQueryDto,
  ): Promise<PaginatedResponse<ExpenseModelResponse>> {
    return this.listWhere(userId, query, (builder) =>
      builder.andWhere('e.status = :status', { status }),
    );
  }

  private async listWhere(
    userId: string,
    query: PageQueryDto,
    narrow: (
      builder: ReturnType<OwnedRepository<Expense>['qb']>,
    ) => ReturnType<OwnedRepository<Expense>['qb']>,
  ): Promise<PaginatedResponse<ExpenseModelResponse>> {
    const build = () =>
      narrow(
        this.expenses
          .qb(userId, 'e')
          .andWhere('e.is_active = true')
          .andWhere('e.deleted_at IS NULL'),
      );

    const total = await build().getCount();
    const rows = await build()
      .orderBy('COALESCE(e.date, e.start_date)', 'DESC')
      .offset((query.page - 1) * query.page_size)
      .limit(query.page_size)
      .getMany();

    const displayCurrency = await this.display.forUser(userId);
    const items = await Promise.all(
      rows.map(async (row) =>
        toExpenseModel(
          row,
          await this.display.forRow(
            userId,
            {
              amount: row.amount,
              currency: row.currency,
              monthlyEquivalent: row.monthlyEquivalent,
            },
            displayCurrency,
          ),
        ),
      ),
    );
    return paginated(items, total, query);
  }

  /**
   * The only read in the module that filters BOTH is_active and deleted_at. Cancelled and
   * payment_failed expenses are counted nowhere — they vanish from the summary entirely.
   */
  async paymentSummary(userId: string): Promise<PaymentSummary> {
    const rows = await this.expenses
      .qb(userId, 'e')
      .andWhere('e.is_active = true')
      .andWhere('e.deleted_at IS NULL')
      .getMany();

    const displayCurrency = await this.display.forUser(userId);
    const totals = {
      pending: { count: 0, amount: '0' },
      paid: { count: 0, amount: '0' },
      overdue: { count: 0, amount: '0' },
    };

    for (const row of rows) {
      const bucket =
        row.status === EXPENSE_STATUS.PENDING
          ? totals.pending
          : row.status === EXPENSE_STATUS.PAID
            ? totals.paid
            : row.status === EXPENSE_STATUS.OVERDUE
              ? totals.overdue
              : null;
      if (!bucket) continue;

      // paid rows accumulate paid_amount, which is stored pre-FX in the expense's own currency —
      // which is why converting from row.currency is correct for all three buckets.
      const raw =
        row.status === EXPENSE_STATUS.PAID
          ? (row.paidAmount ?? '0')
          : row.amount;
      const converted =
        row.currency === displayCurrency
          ? raw
          : ((await this.converter.convert(
              raw,
              row.currency,
              displayCurrency,
            )) ?? raw);
      bucket.count += 1;
      bucket.amount = decAdd(bucket.amount, converted);
    }

    return {
      total_pending: totals.pending.count,
      total_paid: totals.paid.count,
      total_overdue: totals.overdue.count,
      pending_amount: totals.pending.amount,
      paid_amount: totals.paid.amount,
      overdue_amount: totals.overdue.amount,
      currency: displayCurrency,
    };
  }

  /** Exposed for the InsufficientFundsError branch in the controller. */
  static isInsufficientFunds(error: unknown): boolean {
    return error instanceof InsufficientFundsError;
  }
}
