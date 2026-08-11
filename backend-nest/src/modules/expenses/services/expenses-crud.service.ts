import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DisplayCurrencyService } from '../../../common/currency/display-currency.service';
import {
  PaginatedResponse,
  paginated,
} from '../../../common/dto/page-query.dto';
import {
  DetailException,
  TierLimitException,
} from '../../../common/exceptions/app.exception';
import {
  OwnedRepository,
  ownedRepositoryToken,
} from '../../../common/repository/owned.repository';
import { naiveUtcNow } from '../../../common/entities/naive-timestamp.entity';
import { SavingsAccount } from '../../savings/entities/savings-account.entity';
import { User } from '../../users/entities/user.entity';
import { UsageLimitService } from '../../income/services/usage-limit.service';
import { ExpenseDueService } from './expense-due.service';
import {
  BatchCreateExpensesDto,
  CreateExpenseDto,
  ListExpensesQueryDto,
  UpdateExpenseDto,
} from '../dto/expense.dto';
import { Expense } from '../entities/expense.entity';
import { EXPENSE_FREQUENCY_TO_NAME } from '../enums';
import {
  ExpenseListItem,
  ExpenseModelResponse,
  storedMonthlyEquivalent,
  toExpenseListItem,
  toExpenseModel,
} from '../mappers/expense-response.mapper';

export interface BatchCreateResult {
  created_count: number;
  created_expenses: ExpenseModelResponse[];
  failed_count: number;
  errors: Array<{ index: number; error: string }>;
}

@Injectable()
export class ExpensesCrudService {
  constructor(
    @Inject(ownedRepositoryToken(Expense))
    private readonly expenses: OwnedRepository<Expense>,
    private readonly display: DisplayCurrencyService,
    private readonly usageLimits: UsageLimitService,
    private readonly due: ExpenseDueService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * Owned-or-404. Note it deliberately does NOT filter deleted_at: FastAPI's get_expense doesn't,
   * so GET/PUT/DELETE/cancel/pay all still see rows soft-deleted by the subscriptions and
   * installments reversal paths. The list endpoint does filter — see `list`.
   */
  async findOwnedOrFail(userId: string, expenseId: string): Promise<Expense> {
    const expense = await this.expenses.findOne(userId, { id: expenseId });
    if (!expense) throw new DetailException(404, 'Expense not found');
    return expense;
  }

  async list(
    userId: string,
    query: ListExpensesQueryDto,
  ): Promise<PaginatedResponse<ExpenseListItem>> {
    // FastAPI's count query mirrors only `category` — the is_active and status filters narrow the
    // page but not the total, so a filtered list reports a total larger than its own contents.
    // Faithfully wrong: the frontend paginates on this number today.
    const countBuilder = this.expenses
      .qb(userId, 'e')
      .andWhere('e.deleted_at IS NULL');
    if (query.category) {
      countBuilder.andWhere('e.category = :category', {
        category: query.category,
      });
    }
    const total = await countBuilder.getCount();

    const builder = this.expenses
      .qb(userId, 'e')
      .andWhere('e.deleted_at IS NULL');
    if (query.category) {
      builder.andWhere('e.category = :category', { category: query.category });
    }
    if (query.is_active !== undefined) {
      builder.andWhere('e.is_active = :isActive', {
        isActive: query.is_active,
      });
    }
    if (query.status) {
      builder.andWhere('e.status = :status', { status: query.status });
    }

    const rows = await builder
      .orderBy('COALESCE(e.date, e.start_date)', 'DESC')
      .addOrderBy('e.created_at', 'DESC')
      .offset((query.page - 1) * query.page_size)
      .limit(query.page_size)
      .getMany();

    const displayCurrency = await this.display.forUser(userId);
    const accountNames = await this.accountNamesFor(userId, rows);
    const items = await Promise.all(
      rows.map(async (row) =>
        toExpenseListItem(
          row,
          await this.display.forRow(
            userId,
            this.convertible(row),
            displayCurrency,
          ),
          row.paymentAccountId
            ? (accountNames.get(row.paymentAccountId) ?? null)
            : null,
        ),
      ),
    );
    return paginated(items, total, query);
  }

  async get(userId: string, expenseId: string): Promise<ExpenseModelResponse> {
    const expense = await this.findOwnedOrFail(userId, expenseId);
    // payment_account_name stays null here: the router calls the un-enriched service function, so
    // the detail endpoint has never populated it.
    return toExpenseModel(
      expense,
      await this.display.forRow(userId, this.convertible(expense)),
    );
  }

  async create(
    user: User,
    dto: CreateExpenseDto,
  ): Promise<{ expense: Expense; response: ExpenseModelResponse }> {
    // No deleted_at filter on this count — FastAPI's tier check counts soft-deleted rows too.
    const currentCount = await this.expenses.count(user.id);
    await this.assertCapacity(user, currentCount, 1);
    await this.assertAccountOwned(user.id, dto.payment_account_id);

    const expense = await this.insert(user.id, dto);
    if (dto.sync_historical) await this.due.backfill(expense);
    // display_* are never computed on create — the 201 answers null for all three.
    return { expense, response: toExpenseModel(expense) };
  }

  async batchCreate(
    user: User,
    dto: BatchCreateExpensesDto,
  ): Promise<BatchCreateResult> {
    const currentCount = await this.expenses.count(user.id);
    await this.assertCapacity(user, currentCount, dto.expenses.length);

    const created: ExpenseModelResponse[] = [];
    const errors: Array<{ index: number; error: string }> = [];

    // Per-item failures are collected rather than raised, and each item is independent — matching
    // FastAPI, which commits per item and reports partial success.
    for (const [index, item] of dto.expenses.entries()) {
      try {
        await this.assertAccountOwned(user.id, item.payment_account_id);
        const expense = await this.insert(user.id, item);
        created.push(toExpenseModel(expense));
      } catch (error) {
        errors.push({
          index,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      created_count: created.length,
      created_expenses: created,
      failed_count: errors.length,
      errors,
    };
  }

  async update(
    userId: string,
    expenseId: string,
    dto: UpdateExpenseDto,
  ): Promise<{ expense: Expense; response: ExpenseModelResponse }> {
    const expense = await this.findOwnedOrFail(userId, expenseId);

    // FastAPI reads the display values BEFORE applying the patch and never recomputes them, so the
    // response carries pre-update figures. Reproduced deliberately.
    const staleDisplay = await this.display.forRow(
      userId,
      this.convertible(expense),
    );

    if ('payment_account_id' in dto) {
      await this.assertAccountOwned(userId, dto.payment_account_id);
    }

    const patch: Partial<Expense> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if ('description' in dto) patch.description = dto.description ?? null;
    if ('category' in dto) patch.category = dto.category ?? null;
    if (dto.amount !== undefined) patch.amount = dto.amount;
    if (dto.currency !== undefined) patch.currency = dto.currency;
    if (dto.frequency !== undefined) {
      patch.frequency = EXPENSE_FREQUENCY_TO_NAME[dto.frequency];
    }
    if (dto.is_active !== undefined) patch.isActive = dto.is_active;
    if ('tags' in dto) patch.tags = dto.tags ?? null;
    if ('date' in dto) patch.date = dto.date ?? null;
    if ('start_date' in dto) patch.startDate = dto.start_date ?? null;
    if ('end_date' in dto) patch.endDate = dto.end_date ?? null;
    if ('payment_account_id' in dto) {
      patch.paymentAccountId = dto.payment_account_id ?? null;
    }
    if ('payment_method' in dto) {
      patch.paymentMethod = dto.payment_method ?? null;
    }
    if (dto.auto_pay !== undefined) patch.autoPay = dto.auto_pay;

    Object.assign(expense, patch);

    // Recomputed only when amount or frequency was in the payload — a currency-only edit leaves
    // the stored equivalent alone.
    if (dto.amount !== undefined || dto.frequency !== undefined) {
      expense.monthlyEquivalent = storedMonthlyEquivalent(
        expense.amount,
        expense.frequency,
      );
    }
    expense.updatedAt = naiveUtcNow();
    await this.expenses.raw.save(expense);
    if (dto.sync_historical) await this.due.backfill(expense);

    return { expense, response: toExpenseModel(expense, staleDisplay) };
  }

  /** A hard delete. The deleted_at column exists but this module never writes it. */
  async remove(userId: string, expenseId: string): Promise<void> {
    const expense = await this.findOwnedOrFail(userId, expenseId);
    await this.expenses.raw.remove(expense);
  }

  async batchDelete(
    userId: string,
    expenseIds: string[],
  ): Promise<{ deleted_count: number; failed_ids: string[] }> {
    const failed: string[] = [];
    let deleted = 0;
    await this.dataSource.transaction(async (manager) => {
      const scoped = this.expenses.withManager(manager);
      for (const expenseId of expenseIds) {
        const expense = await scoped.findOne(userId, { id: expenseId });
        if (!expense) {
          failed.push(expenseId);
          continue;
        }
        await manager.remove(expense);
        deleted += 1;
      }
    });
    return { deleted_count: deleted, failed_ids: failed };
  }

  private async insert(
    userId: string,
    dto: CreateExpenseDto,
  ): Promise<Expense> {
    const frequency = EXPENSE_FREQUENCY_TO_NAME[dto.frequency];
    const expense = this.expenses.raw.create({
      userId,
      name: dto.name,
      description: dto.description ?? null,
      category: dto.category ?? null,
      amount: dto.amount,
      currency: dto.currency,
      frequency,
      isActive: dto.is_active,
      tags: dto.tags ?? null,
      date: dto.date ?? null,
      startDate: dto.start_date ?? null,
      endDate: dto.end_date ?? null,
      monthlyEquivalent: storedMonthlyEquivalent(dto.amount, frequency),
      paymentAccountId: dto.payment_account_id ?? null,
      status: 'pending' as const,
      paidDate: null,
      paidAmount: null,
      accountTransactionId: null,
      receiptUrl: null,
      paymentMethod: dto.payment_method ?? null,
      autoPay: dto.auto_pay,
      deletedAt: null,
    });
    return this.expenses.raw.save(expense);
  }

  private convertible(expense: Expense) {
    return {
      amount: expense.amount,
      currency: expense.currency,
      monthlyEquivalent: expense.monthlyEquivalent,
    };
  }

  /**
   * FastAPI never validates that payment_account_id belongs to the caller, and its list endpoint
   * then joins savings_accounts with no owner predicate — so a foreign account's NAME comes back in
   * payment_account_name. Validating on write closes it; the join below is scoped as well.
   */
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

  private async accountNamesFor(
    userId: string,
    rows: Expense[],
  ): Promise<Map<string, string>> {
    const ids = [
      ...new Set(
        rows
          .map((row) => row.paymentAccountId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (ids.length === 0) return new Map();
    const accounts = await this.dataSource
      .getRepository(SavingsAccount)
      .createQueryBuilder('a')
      .where('a.id IN (:...ids)', { ids })
      .andWhere('a.user_id = :userId', { userId })
      .getMany();
    return new Map(accounts.map((a) => [a.id, a.name]));
  }

  private async assertCapacity(
    user: User,
    currentCount: number,
    adding: number,
  ): Promise<void> {
    // Batch-create checks capacity for the whole batch at once, and FastAPI's off-by-one
    // (`total_needed - 1`) is reproduced by passing currentCount + adding - 1.
    const probe = adding === 1 ? currentCount : currentCount + adding - 1;
    const { hasCapacity, limit } = await this.usageLimits.check(
      user,
      'expense_tracking',
      probe,
    );
    if (hasCapacity) return;

    const tierName = user.tier?.name ?? 'free';
    const requiredTier = tierName === 'starter' ? 'growth' : 'wealth';
    throw new TierLimitException(
      adding === 1
        ? `Expense limit reached. Your ${tierName} tier allows ${limit} expenses.`
        : `Cannot create ${adding} expenses. Your ${tierName} tier allows ${limit} expenses and you currently have ${currentCount}.`,
      tierName,
      requiredTier,
    );
  }
}
