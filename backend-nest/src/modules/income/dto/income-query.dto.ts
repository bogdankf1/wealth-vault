import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto';

/** Query params arrive as strings; 'true'/'false' are the only spellings FastAPI accepts too. */
const boolish = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class ListIncomeSourcesQueryDto extends PageQueryDto {
  @IsOptional()
  @Transform(boolish)
  @IsBoolean()
  is_active?: boolean;
}

export class ListIncomeTransactionsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  source_id?: string;

  @IsOptional()
  @IsString()
  start_date?: string;

  @IsOptional()
  @IsString()
  end_date?: string;
}

/** /stats and /history. FastAPI strips tzinfo from these rather than converting it. */
export class DateRangeQueryDto {
  @IsOptional()
  @IsString()
  start_date?: string;

  @IsOptional()
  @IsString()
  end_date?: string;
}

export class ListDistributionRulesQueryDto {
  @IsOptional()
  @IsUUID()
  income_source_id?: string;

  @IsOptional()
  @Transform(boolish)
  @IsBoolean()
  is_active?: boolean;
}
