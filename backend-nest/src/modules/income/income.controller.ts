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
import { IncomeSourceResponse } from './mappers/income-response.mapper';
import { IncomeSourcesService } from './services/income-sources.service';

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
  constructor(private readonly sources: IncomeSourcesService) {}

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

  @Delete('sources/:sourceId')
  @HttpCode(204)
  deleteSource(
    @CurrentUser() user: User,
    @Param('sourceId', uuidParam('source_id')) sourceId: string,
  ): Promise<void> {
    return this.sources.remove(user.id, sourceId);
  }
}
