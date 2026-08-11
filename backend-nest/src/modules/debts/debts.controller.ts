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
import { DataSource } from 'typeorm';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  NoFeatureRequired,
  RequireFeature,
} from '../../common/decorators/require-feature.decorator';
import {
  ListResponse,
  PaginatedResponse,
} from '../../common/dto/page-query.dto';
import { uuidParam } from '../../common/pipes/uuid-param.pipe';
import { User } from '../users/entities/user.entity';
import {
  BatchDeleteDebtsDto,
  CreateDebtDto,
  ListDebtsQueryDto,
  RecordDebtPaymentDto,
  UpdateDebtDto,
} from './dto/debt.dto';
import {
  DebtPaymentResponse,
  DebtResponse,
  toDebtPaymentResponse,
} from './mappers/debt-response.mapper';
import { DebtPaymentsService } from './services/debt-payments.service';
import {
  DebtStatsResponse,
  DebtStatsService,
} from './services/debt-stats.service';
import { DebtsService } from './services/debts.service';

/**
 * Unlike taxes, nothing here is shadowed in FastAPI — /stats and /batch-delete are both declared
 * ahead of /{debt_id}. The literals still come first here, because Nest matches in declaration
 * order too.
 */
@Controller('debts')
@RequireFeature('debt_tracking')
export class DebtsController {
  constructor(
    private readonly debts: DebtsService,
    private readonly payments: DebtPaymentsService,
    private readonly statsService: DebtStatsService,
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  list(
    @CurrentUser() user: User,
    @Query() query: ListDebtsQueryDto,
  ): Promise<PaginatedResponse<DebtResponse>> {
    return this.debts.list(user.id, query);
  }

  @Post()
  create(
    @CurrentUser() user: User,
    @Body() dto: CreateDebtDto,
  ): Promise<DebtResponse> {
    return this.debts.create(user.id, dto);
  }

  @Get('stats')
  stats(@CurrentUser() user: User): Promise<DebtStatsResponse> {
    return this.statsService.stats(user.id);
  }

  /** Ungated, exactly as in taxes — FastAPI omits require_feature on this one handler. */
  @Post('batch-delete')
  @NoFeatureRequired()
  batchDelete(
    @CurrentUser() user: User,
    @Body() dto: BatchDeleteDebtsDto,
  ): Promise<{ deleted_count: number; failed_ids: string[] }> {
    return this.debts.batchDelete(user.id, dto);
  }

  @Get(':debtId')
  get(
    @CurrentUser() user: User,
    @Param('debtId', uuidParam('debt_id')) debtId: string,
  ): Promise<DebtResponse> {
    return this.debts.get(user.id, debtId);
  }

  @Put(':debtId')
  update(
    @CurrentUser() user: User,
    @Param('debtId', uuidParam('debt_id')) debtId: string,
    @Body() dto: UpdateDebtDto,
  ): Promise<DebtResponse> {
    return this.debts.update(user.id, debtId, dto);
  }

  @Delete(':debtId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: User,
    @Param('debtId', uuidParam('debt_id')) debtId: string,
  ): Promise<void> {
    return this.debts.remove(user.id, debtId);
  }

  @Post(':debtId/payments')
  @HttpCode(201)
  async recordPayment(
    @CurrentUser() user: User,
    @Param('debtId', uuidParam('debt_id')) debtId: string,
    @Body() dto: RecordDebtPaymentDto,
  ): Promise<DebtPaymentResponse> {
    const payment = await this.dataSource.transaction(async (manager) => {
      const debt = await this.debts.requireDebt(user.id, debtId);
      return this.payments.record(manager, debt, dto);
    });
    return toDebtPaymentResponse(payment);
  }

  @Get(':debtId/payments')
  async listPayments(
    @CurrentUser() user: User,
    @Param('debtId', uuidParam('debt_id')) debtId: string,
  ): Promise<ListResponse<DebtPaymentResponse>> {
    // 404s on an unknown debt rather than answering an empty list.
    await this.debts.requireDebt(user.id, debtId);
    return this.payments.list(user.id, debtId);
  }

  @Post(':debtId/mark-paid')
  markPaid(
    @CurrentUser() user: User,
    @Param('debtId', uuidParam('debt_id')) debtId: string,
  ): Promise<DebtResponse> {
    return this.debts.markPaid(user.id, debtId);
  }

  @Post(':debtId/forgive')
  forgive(
    @CurrentUser() user: User,
    @Param('debtId', uuidParam('debt_id')) debtId: string,
  ): Promise<DebtResponse> {
    return this.debts.forgive(user.id, debtId);
  }
}
