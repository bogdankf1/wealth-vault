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
import {
  PageQueryDto,
  PaginatedResponse,
} from '../../common/dto/page-query.dto';
import { uuidParam } from '../../common/pipes/uuid-param.pipe';
import { User } from '../users/entities/user.entity';
import {
  BatchDeleteInstallmentsDto,
  CreateInstallmentDto,
  InstallmentDateRangeQueryDto,
  ListInstallmentsQueryDto,
  MarkDefaultedDto,
  PayInstallmentDto,
  UpdateInstallmentDto,
} from './dto/installment.dto';
import {
  InstallmentPaymentResponse,
  InstallmentResponse,
  toInstallmentFloat,
} from './mappers/installment-response.mapper';
import {
  InstallmentHistoryResponse,
  InstallmentStatsResponse,
  InstallmentStatsService,
} from './services/installment-stats.service';
import { InstallmentsService } from './services/installments.service';

/** Literals before :installmentId — Nest matches in declaration order. */
@Controller('installments')
@RequireFeature('installment_tracking')
export class InstallmentsController {
  constructor(
    private readonly installments: InstallmentsService,
    private readonly statsService: InstallmentStatsService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: User,
    @Query() query: ListInstallmentsQueryDto,
  ): Promise<PaginatedResponse<ReturnType<typeof toInstallmentFloat>>> {
    return this.installments.list(user.id, query);
  }

  @Post()
  create(
    @CurrentUser() user: User,
    @Body() dto: CreateInstallmentDto,
  ): Promise<InstallmentResponse> {
    return this.installments.create(user, dto);
  }

  @Get('stats')
  stats(
    @CurrentUser() user: User,
    @Query() query: InstallmentDateRangeQueryDto,
  ): Promise<InstallmentStatsResponse> {
    return this.statsService.stats(user.id, query);
  }

  @Get('history')
  history(
    @CurrentUser() user: User,
    @Query() query: InstallmentDateRangeQueryDto,
  ): Promise<InstallmentHistoryResponse> {
    return this.statsService.history(user.id, query);
  }

  // FastAPI omits the feature gate here — the only endpoint in the module without it. Added
  // deliberately; recorded as a divergence.
  @Post('batch-delete')
  @HttpCode(200)
  batchDelete(
    @CurrentUser() user: User,
    @Body() dto: BatchDeleteInstallmentsDto,
  ): Promise<{ deleted_count: number; failed_ids: string[] }> {
    return this.installments.batchDelete(user.id, dto.ids);
  }

  @Get(':installmentId')
  get(
    @CurrentUser() user: User,
    @Param('installmentId', uuidParam('installment_id')) id: string,
  ) {
    return this.installments.get(user.id, id);
  }

  @Put(':installmentId')
  update(
    @CurrentUser() user: User,
    @Param('installmentId', uuidParam('installment_id')) id: string,
    @Body() dto: UpdateInstallmentDto,
  ): Promise<InstallmentResponse> {
    return this.installments.update(user.id, id, dto);
  }

  @Delete(':installmentId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: User,
    @Param('installmentId', uuidParam('installment_id')) id: string,
  ): Promise<void> {
    return this.installments.remove(user.id, id);
  }

  @Post(':installmentId/complete')
  @HttpCode(200)
  complete(
    @CurrentUser() user: User,
    @Param('installmentId', uuidParam('installment_id')) id: string,
  ): Promise<InstallmentResponse> {
    return this.installments.complete(user.id, id);
  }

  @Post(':installmentId/default')
  @HttpCode(200)
  markDefaulted(
    @CurrentUser() user: User,
    @Param('installmentId', uuidParam('installment_id')) id: string,
    @Body() dto: MarkDefaultedDto,
  ): Promise<InstallmentResponse> {
    // The reason is accepted and never stored — there is no column for it, and FastAPI drops it
    // too. Read here only so the parameter is not dead.
    void dto.reason;
    return this.installments.markDefaulted(user.id, id);
  }

  @Post(':installmentId/reactivate')
  @HttpCode(200)
  reactivate(
    @CurrentUser() user: User,
    @Param('installmentId', uuidParam('installment_id')) id: string,
  ): Promise<InstallmentResponse> {
    return this.installments.reactivate(user.id, id);
  }

  @Get(':installmentId/payments')
  payments(
    @CurrentUser() user: User,
    @Param('installmentId', uuidParam('installment_id')) id: string,
    @Query() query: PageQueryDto,
  ): Promise<{ items: InstallmentPaymentResponse[]; total: number }> {
    return this.installments.listPayments(
      user.id,
      id,
      query.page,
      query.page_size,
    );
  }

  @Post(':installmentId/pay')
  @HttpCode(200)
  pay(
    @CurrentUser() user: User,
    @Param('installmentId', uuidParam('installment_id')) id: string,
    @Body() dto: PayInstallmentDto,
  ): Promise<InstallmentPaymentResponse> {
    return this.installments.pay(user.id, id, dto);
  }
}
