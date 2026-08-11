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
import {
  BatchCreateExpensesDto,
  BatchDeleteExpensesDto,
  CreateExpenseDto,
  ListExpensesQueryDto,
  UpdateExpenseDto,
} from './dto/expense.dto';
import {
  ExpenseListItem,
  ExpenseModelResponse,
} from './mappers/expense-response.mapper';
import {
  BatchCreateResult,
  ExpensesCrudService,
} from './services/expenses-crud.service';
import {
  ExpensePaymentsService,
  PayExpenseResponse,
  PaymentSummary,
} from './services/expense-payments.service';
import { PageQueryDto } from '../../common/dto/page-query.dto';
import { PayExpenseDto } from './dto/expense.dto';
import { DetailException } from '../../common/exceptions/app.exception';

/**
 * Route order is load-bearing. FastAPI declares GET /{expense_id} before /pending, /overdue and
 * /payment-summary, so all three are shadowed and 422 with uuid_parsing — they have never run in
 * production. Here every literal path is declared first, which is both Nest's convention and a
 * deliberate divergence recorded in the Phase 2 plan.
 */
@Controller('expenses')
@RequireFeature('expense_tracking')
export class ExpensesController {
  constructor(
    private readonly crud: ExpensesCrudService,
    private readonly payments: ExpensePaymentsService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: User,
    @Query() query: ListExpensesQueryDto,
  ): Promise<PaginatedResponse<ExpenseListItem>> {
    return this.crud.list(user.id, query);
  }

  @Post()
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateExpenseDto,
  ): Promise<ExpenseModelResponse> {
    const { response } = await this.crud.create(user, dto);
    return response;
  }

  // The batch-create gate is `batch_operations`, while its usage limit still counts against
  // expense_tracking — FastAPI's split, preserved.
  @Post('batch-create')
  @RequireFeature('batch_operations')
  batchCreate(
    @CurrentUser() user: User,
    @Body() dto: BatchCreateExpensesDto,
  ): Promise<BatchCreateResult> {
    return this.crud.batchCreate(user, dto);
  }

  @Post('batch-delete')
  @HttpCode(200)
  batchDelete(
    @CurrentUser() user: User,
    @Body() dto: BatchDeleteExpensesDto,
  ): Promise<{ deleted_count: number; failed_ids: string[] }> {
    return this.crud.batchDelete(user.id, dto.expense_ids);
  }

  // These three are the routes FastAPI shadows behind :expense_id. Declared first here so they
  // are reachable — the deliberate divergence approved for this slice.
  @Get('pending')
  pending(
    @CurrentUser() user: User,
    @Query() query: PageQueryDto,
  ): Promise<PaginatedResponse<ExpenseModelResponse>> {
    return this.payments.listByStatus(user.id, 'pending', query);
  }

  @Get('overdue')
  overdue(
    @CurrentUser() user: User,
    @Query() query: PageQueryDto,
  ): Promise<PaginatedResponse<ExpenseModelResponse>> {
    return this.payments.listByStatus(user.id, 'overdue', query);
  }

  @Get('payment-summary')
  paymentSummary(@CurrentUser() user: User): Promise<PaymentSummary> {
    return this.payments.paymentSummary(user.id);
  }

  @Post(':expenseId/pay')
  @HttpCode(200)
  async pay(
    @CurrentUser() user: User,
    @Param('expenseId', uuidParam('expense_id')) expenseId: string,
    @Body() dto: PayExpenseDto,
  ): Promise<PayExpenseResponse> {
    try {
      return await this.payments.pay(user.id, expenseId, dto);
    } catch (error) {
      // Insufficient funds gets its own structured body, with float money fields — the one place
      // in the module where amounts are numbers inside an error.
      if (ExpensePaymentsService.isInsufficientFunds(error)) {
        throw new DetailException(
          400,
          (await this.payments.insufficientFundsBody(
            user.id,
            expenseId,
            dto,
          )) as never,
        );
      }
      throw error;
    }
  }

  @Post(':expenseId/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: User,
    @Param('expenseId', uuidParam('expense_id')) expenseId: string,
  ): Promise<ExpenseModelResponse> {
    return this.payments.cancel(user.id, expenseId);
  }

  @Get(':expenseId')
  get(
    @CurrentUser() user: User,
    @Param('expenseId', uuidParam('expense_id')) expenseId: string,
  ): Promise<ExpenseModelResponse> {
    return this.crud.get(user.id, expenseId);
  }

  @Put(':expenseId')
  async update(
    @CurrentUser() user: User,
    @Param('expenseId', uuidParam('expense_id')) expenseId: string,
    @Body() dto: UpdateExpenseDto,
  ): Promise<ExpenseModelResponse> {
    const { response } = await this.crud.update(user.id, expenseId, dto);
    return response;
  }

  @Delete(':expenseId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: User,
    @Param('expenseId', uuidParam('expense_id')) expenseId: string,
  ): Promise<void> {
    return this.crud.remove(user.id, expenseId);
  }
}
