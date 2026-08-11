import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  PaginatedResponse,
  paginated,
} from '../../../common/dto/page-query.dto';
import {
  NotFoundException,
  TierLimitException,
} from '../../../common/exceptions/app.exception';
import {
  OwnedRepository,
  ownedRepositoryToken,
} from '../../../common/repository/owned.repository';
import { ListIncomeSourcesQueryDto } from '../dto/income-query.dto';
import {
  CreateIncomeSourceDto,
  UpdateIncomeSourceDto,
} from '../dto/income-source.dto';
import { INCOME_FREQUENCY_TO_NAME } from '../enums';
import { User } from '../../users/entities/user.entity';
import { IncomeSource } from '../entities/income-source.entity';
import {
  IncomeSourceResponse,
  toSourceResponseFloat,
  toSourceResponseRaw,
} from '../mappers/income-response.mapper';
import { DisplayCurrencyService } from './display-currency.service';
import { UsageLimitService } from './usage-limit.service';

@Injectable()
export class IncomeSourcesService {
  constructor(
    @Inject(ownedRepositoryToken(IncomeSource))
    private readonly sources: OwnedRepository<IncomeSource>,
    private readonly display: DisplayCurrencyService,
    private readonly usageLimits: UsageLimitService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** Owned-or-404. Every handler that takes a :sourceId goes through this. */
  async findOwnedOrFail(
    userId: string,
    sourceId: string,
  ): Promise<IncomeSource> {
    const source = await this.sources.findOne(userId, { id: sourceId });
    if (!source) throw new NotFoundException('Income source not found');
    return source;
  }

  async list(
    userId: string,
    query: ListIncomeSourcesQueryDto,
  ): Promise<PaginatedResponse<IncomeSourceResponse>> {
    const where =
      query.is_active === undefined ? {} : { isActive: query.is_active };
    const total = await this.sources.count(userId, where);

    const builder = this.sources.qb(userId, 's');
    if (query.is_active !== undefined) {
      builder.andWhere('s.is_active = :isActive', {
        isActive: query.is_active,
      });
    }
    const rows = await builder
      // FastAPI: ORDER BY coalesce(date, start_date) DESC, created_at DESC — one-time income sorts
      // by its `date`, recurring income by `start_date`.
      .orderBy('COALESCE(s.date, s.start_date)', 'DESC')
      .addOrderBy('s.created_at', 'DESC')
      .offset((query.page - 1) * query.page_size)
      .limit(query.page_size)
      .getMany();

    const displayCurrency = await this.display.forUser(userId);
    const items = await Promise.all(
      rows.map(async (row) =>
        toSourceResponseFloat(
          row,
          await this.display.forSource(userId, row, displayCurrency),
        ),
      ),
    );
    return paginated(items, total, query);
  }

  async get(userId: string, sourceId: string): Promise<IncomeSourceResponse> {
    const source = await this.findOwnedOrFail(userId, sourceId);
    return toSourceResponseFloat(
      source,
      await this.display.forSource(userId, source),
    );
  }

  async create(
    user: User,
    dto: CreateIncomeSourceDto,
  ): Promise<IncomeSourceResponse> {
    const currentCount = await this.sources.count(user.id);
    const { hasCapacity, limit } = await this.usageLimits.check(
      user,
      'income_tracking',
      currentCount,
    );
    if (!hasCapacity) {
      // FastAPI falls back to the literal 'free' when the user has no tier at all.
      const tierName = user.tier?.name ?? 'free';
      throw new TierLimitException(
        `Income source limit reached. Your ${tierName} tier allows ${limit} sources.`,
        tierName,
        tierName === 'starter' ? 'growth' : 'wealth',
      );
    }

    const source = this.sources.raw.create({
      userId: user.id,
      name: dto.name,
      description: dto.description ?? null,
      category: dto.category ?? null,
      amount: dto.amount,
      currency: dto.currency,
      frequency: INCOME_FREQUENCY_TO_NAME[dto.frequency],
      isActive: dto.is_active,
      date: dto.date ?? null,
      startDate: dto.start_date ?? null,
      endDate: dto.end_date ?? null,
      targetAccountId: dto.target_account_id ?? null,
      autoDeposit: dto.auto_deposit,
    });
    await this.sources.raw.save(source);

    // Create and update answer with DB-precision decimals and no display_* enrichment.
    return toSourceResponseRaw(source);
  }

  async update(
    userId: string,
    sourceId: string,
    dto: UpdateIncomeSourceDto,
  ): Promise<IncomeSourceResponse> {
    const source = await this.findOwnedOrFail(userId, sourceId);

    // pydantic's exclude_unset=True: only keys actually present in the body are applied, which is
    // what makes this PUT behave like a PATCH. Spreading the DTO would write undefined over
    // columns the caller never mentioned.
    const patch: Partial<IncomeSource> = {};
    if ('name' in dto && dto.name !== undefined) patch.name = dto.name;
    if ('description' in dto) patch.description = dto.description ?? null;
    if ('category' in dto) patch.category = dto.category ?? null;
    if ('amount' in dto && dto.amount !== undefined) patch.amount = dto.amount;
    if ('currency' in dto && dto.currency !== undefined) {
      patch.currency = dto.currency;
    }
    if ('frequency' in dto && dto.frequency !== undefined) {
      patch.frequency = INCOME_FREQUENCY_TO_NAME[dto.frequency];
    }
    if ('is_active' in dto && dto.is_active !== undefined) {
      patch.isActive = dto.is_active;
    }
    if ('start_date' in dto) patch.startDate = dto.start_date ?? null;
    if ('end_date' in dto) patch.endDate = dto.end_date ?? null;
    if ('target_account_id' in dto) {
      patch.targetAccountId = dto.target_account_id ?? null;
    }
    if ('auto_deposit' in dto && dto.auto_deposit !== undefined) {
      patch.autoDeposit = dto.auto_deposit;
    }

    Object.assign(source, patch);
    await this.sources.raw.save(source);
    return toSourceResponseRaw(source);
  }

  async remove(userId: string, sourceId: string): Promise<void> {
    const source = await this.findOwnedOrFail(userId, sourceId);
    await this.sources.raw.softRemove(source);
  }

  /**
   * One transaction for the whole batch — FastAPI also commits once here, so this is parity and
   * correctness at the same time. Ids that are missing, already deleted, or owned by someone else
   * land in failed_ids rather than failing the request.
   */
  async batchDelete(
    userId: string,
    sourceIds: string[],
  ): Promise<{ deleted_count: number; failed_ids: string[] }> {
    const failed: string[] = [];
    let deleted = 0;

    await this.dataSource.transaction(async (manager) => {
      const scoped = this.sources.withManager(manager);
      for (const sourceId of sourceIds) {
        const source = await scoped.findOne(userId, { id: sourceId });
        if (!source) {
          failed.push(sourceId);
          continue;
        }
        await manager.softRemove(source);
        deleted += 1;
      }
    });

    return { deleted_count: deleted, failed_ids: failed };
  }
}
