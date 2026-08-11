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
import { ListResponse } from '../../common/dto/page-query.dto';
import { uuidParam } from '../../common/pipes/uuid-param.pipe';
import { User } from '../users/entities/user.entity';
import {
  CreateDistributionRuleDto,
  DistributionPreviewQueryDto,
  UpdateDistributionRuleDto,
} from './dto/distribution.dto';
import { ListDistributionRulesQueryDto } from './dto/income-query.dto';
import { IncomeDistributionRuleResponse } from './mappers/income-response.mapper';
import {
  DistributionPreviewResponse,
  DistributionService,
} from './services/distribution.service';

/**
 * The distribution half of the income module: rules CRUD, preview, and applying rules to a
 * transaction. Split from IncomeController because it has its own service and error vocabulary
 * (400 {detail} for rule problems, 404 {error,...} for a missing rule).
 *
 * distribution-preview is declared before distribution-rules/:ruleId so the literal path cannot be
 * captured by the parameterised route.
 */
@Controller('income')
@RequireFeature('income_tracking')
export class DistributionController {
  constructor(private readonly distribution: DistributionService) {}

  @Get('distribution-rules')
  listRules(
    @CurrentUser() user: User,
    @Query() query: ListDistributionRulesQueryDto,
  ): Promise<ListResponse<IncomeDistributionRuleResponse>> {
    return this.distribution.list(user.id, query);
  }

  @Post('distribution-rules')
  createRule(
    @CurrentUser() user: User,
    @Body() dto: CreateDistributionRuleDto,
  ): Promise<IncomeDistributionRuleResponse> {
    return this.distribution.create(user.id, dto);
  }

  @Post('distribution-preview')
  @HttpCode(200)
  previewDistribution(
    @CurrentUser() user: User,
    @Query() query: DistributionPreviewQueryDto,
  ): Promise<DistributionPreviewResponse> {
    return this.distribution.preview(user.id, query);
  }

  @Get('distribution-rules/:ruleId')
  getRule(
    @CurrentUser() user: User,
    @Param('ruleId', uuidParam('rule_id')) ruleId: string,
  ): Promise<IncomeDistributionRuleResponse> {
    return this.distribution.get(user.id, ruleId);
  }

  @Put('distribution-rules/:ruleId')
  updateRule(
    @CurrentUser() user: User,
    @Param('ruleId', uuidParam('rule_id')) ruleId: string,
    @Body() dto: UpdateDistributionRuleDto,
  ): Promise<IncomeDistributionRuleResponse> {
    return this.distribution.update(user.id, ruleId, dto);
  }

  @Delete('distribution-rules/:ruleId')
  @HttpCode(204)
  deleteRule(
    @CurrentUser() user: User,
    @Param('ruleId', uuidParam('rule_id')) ruleId: string,
  ): Promise<void> {
    return this.distribution.remove(user.id, ruleId);
  }

  @Post('transactions/:transactionId/distribute')
  @HttpCode(200)
  applyDistribution(
    @CurrentUser() user: User,
    @Param('transactionId', uuidParam('transaction_id')) transactionId: string,
  ): Promise<{
    message: string;
    deposits: Array<{ account_transaction_id: string; amount: number }>;
  }> {
    return this.distribution.apply(user.id, transactionId);
  }
}
