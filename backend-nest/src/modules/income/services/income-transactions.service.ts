import { Inject, Injectable } from '@nestjs/common';
import {
  PaginatedResponse,
  paginated,
} from '../../../common/dto/page-query.dto';
import { NotFoundException } from '../../../common/exceptions/app.exception';
import {
  OwnedRepository,
  ownedRepositoryToken,
} from '../../../common/repository/owned.repository';
import { ListIncomeTransactionsQueryDto } from '../dto/income-query.dto';
import { CreateIncomeTransactionDto } from '../dto/income-transaction.dto';
import { IncomeSource } from '../entities/income-source.entity';
import { IncomeTransaction } from '../entities/income-transaction.entity';
import {
  IncomeTransactionResponse,
  toTransactionResponse,
} from '../mappers/income-response.mapper';

@Injectable()
export class IncomeTransactionsService {
  constructor(
    @Inject(ownedRepositoryToken(IncomeTransaction))
    private readonly transactions: OwnedRepository<IncomeTransaction>,
    @Inject(ownedRepositoryToken(IncomeSource))
    private readonly sources: OwnedRepository<IncomeSource>,
  ) {}

  async list(
    userId: string,
    query: ListIncomeTransactionsQueryDto,
  ): Promise<PaginatedResponse<IncomeTransactionResponse>> {
    const builder = this.transactions.qb(userId, 't');
    if (query.source_id) {
      builder.andWhere('t.source_id = :sourceId', {
        sourceId: query.source_id,
      });
    }
    if (query.start_date) {
      builder.andWhere('t.date >= :startDate', { startDate: query.start_date });
    }
    if (query.end_date) {
      builder.andWhere('t.date <= :endDate', { endDate: query.end_date });
    }

    // FastAPI counts over the filtered query before pagination is applied.
    const total = await builder.getCount();
    const rows = await builder
      .orderBy('t.date', 'DESC')
      .offset((query.page - 1) * query.page_size)
      .limit(query.page_size)
      .getMany();

    return paginated(rows.map(toTransactionResponse), total, query);
  }

  /**
   * FastAPI's version of this endpoint raises TypeError on every call and returns a 500, because
   * the router splats a schema carrying `deposit_to_account_id` — not a column — into the model
   * constructor. This implements what the endpoint was meant to do and ignores that field; see
   * Deviation 1 in the Phase 1 plan.
   */
  async create(
    userId: string,
    dto: CreateIncomeTransactionDto,
  ): Promise<IncomeTransactionResponse> {
    if (dto.source_id) {
      const source = await this.sources.findOne(userId, { id: dto.source_id });
      if (!source) throw new NotFoundException('Income source not found');
    }

    const transaction = this.transactions.raw.create({
      userId,
      sourceId: dto.source_id ?? null,
      description: dto.description ?? null,
      amount: dto.amount,
      currency: dto.currency,
      date: dto.date,
      category: dto.category ?? null,
      notes: dto.notes ?? null,
      depositedToAccountId: null,
      accountTransactionId: null,
      status: 'RECEIVED',
    });
    await this.transactions.raw.save(transaction);
    return toTransactionResponse(transaction);
  }
}
