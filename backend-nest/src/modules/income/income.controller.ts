import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { PaginatedResponse } from '../../common/dto/page-query.dto';
import { uuidParam } from '../../common/pipes/uuid-param.pipe';
import { User } from '../users/entities/user.entity';
import { ListIncomeSourcesQueryDto } from './dto/income-query.dto';
import {
  CreateIncomeSourceDto,
  UpdateIncomeSourceDto,
} from './dto/income-source.dto';
import { BatchDeleteIncomeSourcesDto } from './dto/income-transaction.dto';
import {
  IncomeSourceResponse,
  IncomeTransactionResponse,
} from './mappers/income-response.mapper';
import {
  DateRangeQueryDto,
  ListIncomeTransactionsQueryDto,
} from './dto/income-query.dto';
import {
  CreateIncomeTransactionDto,
  DepositIncomeDto,
} from './dto/income-transaction.dto';
import {
  IncomeDepositResponse,
  IncomeDepositService,
} from './services/income-deposit.service';
import {
  IncomeHistoryResponse,
  IncomeHistoryService,
} from './services/income-history.service';
import { IncomeSourcesService } from './services/income-sources.service';
import {
  IncomeStatsResponse,
  IncomeStatsService,
} from './services/income-stats.service';
import { IncomeTransactionsService } from './services/income-transactions.service';

/**
 * Route order matters: Nest matches in declaration order, so any static path that could be read as
 * an :id (sources/batch-delete) must come before the parameterised route.
 *
 * Every endpoint in the module is feature-gated on income_tracking, exactly as FastAPI's
 * @require_feature decorator does. There is no forbid_demo_users anywhere in this module.
 */
@Controller('income')
@RequireFeature('income_tracking')
export class IncomeController {
  constructor(
    private readonly sources: IncomeSourcesService,
    private readonly transactions: IncomeTransactionsService,
    private readonly statsService: IncomeStatsService,
    private readonly historyService: IncomeHistoryService,
    private readonly depositService: IncomeDepositService,
  ) {}

  @Get('sources')
  listSources(
    @CurrentUser() user: User,
    @Query() query: ListIncomeSourcesQueryDto,
  ): Promise<PaginatedResponse<IncomeSourceResponse>> {
    return this.sources.list(user.id, query);
  }

  @Post('sources')
  createSource(
    @CurrentUser() user: User,
    @Body() dto: CreateIncomeSourceDto,
  ): Promise<IncomeSourceResponse> {
    return this.sources.create(user, dto);
  }

  // Declared before sources/:sourceId so the literal path cannot be swallowed by the param route.
  @Post('sources/batch-delete')
  @HttpCode(200)
  batchDeleteSources(
    @CurrentUser() user: User,
    @Body() dto: BatchDeleteIncomeSourcesDto,
  ): Promise<{ deleted_count: number; failed_ids: string[] }> {
    return this.sources.batchDelete(user.id, dto.source_ids);
  }

  @Get('sources/:sourceId')
  getSource(
    @CurrentUser() user: User,
    @Param('sourceId', uuidParam('source_id')) sourceId: string,
  ): Promise<IncomeSourceResponse> {
    return this.sources.get(user.id, sourceId);
  }

  @Put('sources/:sourceId')
  updateSource(
    @CurrentUser() user: User,
    @Param('sourceId', uuidParam('source_id')) sourceId: string,
    @Body() dto: UpdateIncomeSourceDto,
  ): Promise<IncomeSourceResponse> {
    return this.sources.update(user.id, sourceId, dto);
  }

  @Get('transactions')
  listTransactions(
    @CurrentUser() user: User,
    @Query() query: ListIncomeTransactionsQueryDto,
  ): Promise<PaginatedResponse<IncomeTransactionResponse>> {
    return this.transactions.list(user.id, query);
  }

  @Post('transactions')
  createTransaction(
    @CurrentUser() user: User,
    @Body() dto: CreateIncomeTransactionDto,
  ): Promise<IncomeTransactionResponse> {
    return this.transactions.create(user.id, dto);
  }

  @Post('transactions/:transactionId/deposit')
  @HttpCode(200)
  depositTransaction(
    @CurrentUser() user: User,
    @Param('transactionId', uuidParam('transaction_id')) transactionId: string,
    @Body() dto: DepositIncomeDto,
  ): Promise<IncomeDepositResponse> {
    return this.depositService.deposit(user.id, transactionId, dto);
  }

  @Get('stats')
  stats(
    @CurrentUser() user: User,
    @Query() query: DateRangeQueryDto,
  ): Promise<IncomeStatsResponse> {
    return this.statsService.stats(user.id, query);
  }

  @Get('history')
  history(
    @CurrentUser() user: User,
    @Query() query: DateRangeQueryDto,
  ): Promise<IncomeHistoryResponse> {
    return this.historyService.history(user.id, query);
  }

  @Delete('sources/:sourceId')
  @HttpCode(204)
  deleteSource(
    @CurrentUser() user: User,
    @Param('sourceId', uuidParam('source_id')) sourceId: string,
  ): Promise<void> {
    return this.sources.remove(user.id, sourceId);
  }
}
