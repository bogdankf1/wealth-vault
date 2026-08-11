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
import { DetailException } from '../../common/exceptions/app.exception';
import {
  NoFeatureRequired,
  RequireFeature,
} from '../../common/decorators/require-feature.decorator';
import { PaginatedResponse } from '../../common/dto/page-query.dto';
import { uuidParam } from '../../common/pipes/uuid-param.pipe';
import { User } from '../users/entities/user.entity';
import {
  BatchDeleteTaxesDto,
  CreateTaxDto,
  CreateTaxPaymentDto,
  ListTaxesQueryDto,
  ListTaxPaymentsQueryDto,
  PayTaxDto,
  UpdateTaxDto,
} from './dto/tax.dto';
import { TaxPaymentResponse, TaxResponse } from './mappers/tax-response.mapper';
import { TaxDuePaymentsService } from './services/tax-due-payments.service';
import {
  InsufficientTaxFundsError,
  TaxPaymentsService,
  insufficientFundsDetail,
} from './services/tax-payments.service';
import {
  IncomeTaxSummaryRow,
  TaxStatsResponse,
  TaxStatsService,
} from './services/tax-stats.service';
import { TaxesService } from './services/taxes.service';

/**
 * Route order is deliberate and load-bearing.
 *
 * FastAPI declares GET /{tax_id} at router.py:93, ahead of GET /income-summary (265) and
 * GET /payments (297), and matches in declaration order — so in production those two answer 422
 * uuid_parsing and have never once run. Both are declared BEFORE the parameterised route here, so
 * they work. That is the same Option B taken for the three shadowed expenses endpoints in slice 1,
 * and it is the reason their parity rows are marked KNOWN rather than PASS.
 */
@Controller('taxes')
@RequireFeature('tax_tracking')
export class TaxesController {
  constructor(
    private readonly taxes: TaxesService,
    private readonly payments: TaxPaymentsService,
    private readonly statsService: TaxStatsService,
    private readonly duePayments: TaxDuePaymentsService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: User,
    @Query() query: ListTaxesQueryDto,
  ): Promise<PaginatedResponse<TaxResponse>> {
    return this.taxes.list(user.id, query);
  }

  @Post()
  create(
    @CurrentUser() user: User,
    @Body() dto: CreateTaxDto,
  ): Promise<TaxResponse> {
    return this.taxes.create(user.id, dto);
  }

  @Get('stats')
  stats(@CurrentUser() user: User): Promise<TaxStatsResponse> {
    return this.statsService.stats(user.id);
  }

  /** Shadowed in FastAPI — see the class comment. */
  @Get('income-summary')
  incomeSummary(@CurrentUser() user: User): Promise<IncomeTaxSummaryRow[]> {
    return this.statsService.incomeSummary(user.id);
  }

  /** Shadowed in FastAPI — see the class comment. */
  @Get('payments')
  listPayments(
    @CurrentUser() user: User,
    @Query() query: ListTaxPaymentsQueryDto,
  ): Promise<PaginatedResponse<TaxPaymentResponse>> {
    return this.payments.listPayments(user.id, query);
  }

  @Post('payments')
  createPayment(
    @CurrentUser() user: User,
    @Body() dto: CreateTaxPaymentDto,
  ): Promise<TaxPaymentResponse> {
    return this.payments.createPayment(user.id, dto);
  }

  @Get('payments/:paymentId')
  getPayment(
    @CurrentUser() user: User,
    @Param('paymentId', uuidParam('payment_id')) paymentId: string,
  ): Promise<TaxPaymentResponse> {
    return this.payments.getPayment(user.id, paymentId);
  }

  @Delete('payments/:paymentId')
  @HttpCode(204)
  deletePayment(
    @CurrentUser() user: User,
    @Param('paymentId', uuidParam('payment_id')) paymentId: string,
  ): Promise<void> {
    return this.payments.deletePayment(user.id, paymentId);
  }

  /**
   * No @RequireFeature — FastAPI leaves this one handler ungated while every other route in the
   * module requires tax_tracking, so on a non-Wealth tier batch delete works and nothing else does.
   * Verified against router.py:144; not an oversight in the port.
   */
  @Post('batch-delete')
  @NoFeatureRequired()
  batchDelete(
    @CurrentUser() user: User,
    @Body() dto: BatchDeleteTaxesDto,
  ): Promise<{ deleted_count: number; failed_ids: string[] }> {
    return this.taxes.batchDelete(user.id, dto);
  }

  @Post('process-due-payments')
  processDuePayments(@CurrentUser() user: User) {
    return this.duePayments.process(user.id);
  }

  @Get(':taxId')
  get(
    @CurrentUser() user: User,
    @Param('taxId', uuidParam('tax_id')) taxId: string,
  ): Promise<TaxResponse> {
    return this.taxes.get(user.id, taxId);
  }

  @Put(':taxId')
  update(
    @CurrentUser() user: User,
    @Param('taxId', uuidParam('tax_id')) taxId: string,
    @Body() dto: UpdateTaxDto,
  ): Promise<TaxResponse> {
    return this.taxes.update(user.id, taxId, dto);
  }

  @Delete(':taxId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: User,
    @Param('taxId', uuidParam('tax_id')) taxId: string,
  ): Promise<void> {
    return this.taxes.remove(user.id, taxId);
  }

  @Get(':taxId/payments')
  paymentsForTax(
    @CurrentUser() user: User,
    @Param('taxId', uuidParam('tax_id')) taxId: string,
    @Query() query: ListTaxPaymentsQueryDto,
  ): Promise<PaginatedResponse<TaxPaymentResponse>> {
    // The tax must exist and be owned before its payments are listed — a 404 here, not an empty page.
    return this.taxes
      .requireTax(user.id, taxId)
      .then(() =>
        this.payments.listPayments(user.id, { ...query, tax_id: taxId }),
      );
  }

  /**
   * Insufficient funds answers 400 with a structured detail object rather than a string. FastAPI
   * recovers the required amount by regex from the exception message; the typed error carries it
   * directly, and the message text is preserved so the two stay interchangeable.
   */
  @Post(':taxId/pay')
  async pay(
    @CurrentUser() user: User,
    @Param('taxId', uuidParam('tax_id')) taxId: string,
    @Body() dto: PayTaxDto,
  ) {
    try {
      return await this.payments.pay(user.id, taxId, dto);
    } catch (error) {
      if (error instanceof InsufficientTaxFundsError) {
        throw new DetailException(400, insufficientFundsDetail(error));
      }
      throw error;
    }
  }
}
