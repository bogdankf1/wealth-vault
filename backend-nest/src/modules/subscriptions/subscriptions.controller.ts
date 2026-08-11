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
  BatchDeleteSubscriptionsDto,
  CreateSubscriptionDto,
  ListSubscriptionsQueryDto,
  PauseSubscriptionDto,
  PaySubscriptionDto,
  SubscriptionDateRangeQueryDto,
  UpdateSubscriptionDto,
} from './dto/subscription.dto';
import {
  SubscriptionPaymentResponse,
  SubscriptionResponse,
  toSubscriptionFloat,
} from './mappers/subscription-response.mapper';
import {
  SubscriptionHistoryResponse,
  SubscriptionStatsResponse,
  SubscriptionStatsService,
} from './services/subscription-stats.service';
import { SubscriptionsService } from './services/subscriptions.service';

/**
 * Route order: every literal path before `:subscriptionId`. FastAPI happens to get this right here
 * (unlike expenses), but Nest matches in declaration order too, so the ordering is load-bearing.
 */
@Controller('subscriptions')
@RequireFeature('subscription_tracking')
export class SubscriptionsController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly statsService: SubscriptionStatsService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: User,
    @Query() query: ListSubscriptionsQueryDto,
  ): Promise<PaginatedResponse<ReturnType<typeof toSubscriptionFloat>>> {
    return this.subscriptions.list(user.id, query);
  }

  @Post()
  create(
    @CurrentUser() user: User,
    @Body() dto: CreateSubscriptionDto,
  ): Promise<SubscriptionResponse> {
    return this.subscriptions.create(user.id, dto);
  }

  @Get('stats')
  stats(
    @CurrentUser() user: User,
    @Query() query: SubscriptionDateRangeQueryDto,
  ): Promise<SubscriptionStatsResponse> {
    return this.statsService.stats(user.id, query);
  }

  @Get('history')
  history(
    @CurrentUser() user: User,
    @Query() query: SubscriptionDateRangeQueryDto,
  ): Promise<SubscriptionHistoryResponse> {
    return this.statsService.history(user.id, query);
  }

  // FastAPI omits the feature gate on this one endpoint — the only one in the module without it.
  // Added here deliberately; recorded as a divergence in the slice 2 plan.
  @Post('batch-delete')
  @HttpCode(200)
  batchDelete(
    @CurrentUser() user: User,
    @Body() dto: BatchDeleteSubscriptionsDto,
  ): Promise<{ deleted_count: number; failed_ids: string[] }> {
    return this.subscriptions.batchDelete(user.id, dto.ids);
  }

  @Post('process-due-payments')
  @HttpCode(200)
  processDuePayments(@CurrentUser() user: User) {
    return this.subscriptions.processDuePayments(user.id);
  }

  @Get(':subscriptionId')
  get(
    @CurrentUser() user: User,
    @Param('subscriptionId', uuidParam('subscription_id')) id: string,
  ) {
    return this.subscriptions.get(user.id, id);
  }

  @Put(':subscriptionId')
  update(
    @CurrentUser() user: User,
    @Param('subscriptionId', uuidParam('subscription_id')) id: string,
    @Body() dto: UpdateSubscriptionDto,
  ): Promise<SubscriptionResponse> {
    return this.subscriptions.update(user.id, id, dto);
  }

  @Delete(':subscriptionId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: User,
    @Param('subscriptionId', uuidParam('subscription_id')) id: string,
  ): Promise<void> {
    return this.subscriptions.remove(user.id, id);
  }

  @Post(':subscriptionId/pause')
  @HttpCode(200)
  pause(
    @CurrentUser() user: User,
    @Param('subscriptionId', uuidParam('subscription_id')) id: string,
    @Body() dto: PauseSubscriptionDto,
  ): Promise<SubscriptionResponse> {
    return this.subscriptions.pause(user.id, id, dto);
  }

  @Post(':subscriptionId/resume')
  @HttpCode(200)
  resume(
    @CurrentUser() user: User,
    @Param('subscriptionId', uuidParam('subscription_id')) id: string,
  ): Promise<SubscriptionResponse> {
    return this.subscriptions.resume(user.id, id);
  }

  @Post(':subscriptionId/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: User,
    @Param('subscriptionId', uuidParam('subscription_id')) id: string,
  ): Promise<SubscriptionResponse> {
    return this.subscriptions.cancel(user.id, id);
  }

  @Get(':subscriptionId/payments')
  payments(
    @CurrentUser() user: User,
    @Param('subscriptionId', uuidParam('subscription_id')) id: string,
    @Query() query: PageQueryDto,
  ): Promise<{ items: SubscriptionPaymentResponse[]; total: number }> {
    return this.subscriptions.listPayments(
      user.id,
      id,
      query.page,
      query.page_size,
    );
  }

  // 200, not 201, even though it creates rows.
  @Post(':subscriptionId/pay')
  @HttpCode(200)
  pay(
    @CurrentUser() user: User,
    @Param('subscriptionId', uuidParam('subscription_id')) id: string,
    @Body() dto: PaySubscriptionDto,
  ): Promise<SubscriptionPaymentResponse> {
    return this.subscriptions.pay(user.id, id, dto);
  }
}
