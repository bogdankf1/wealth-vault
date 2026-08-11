import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  IsDecimalString,
  IsPercentageString,
} from '../../../common/money/is-money-string.decorator';
import { DISTRIBUTION_TYPE_WIRE_VALUES } from '../enums';
import type { DistributionTypeWire } from '../enums';

/** Mirrors IncomeDistributionRuleCreate. */
export class CreateDistributionRuleDto {
  /** null = a global rule that applies to every income source. */
  @IsOptional()
  @IsUUID()
  income_source_id?: string | null;

  @IsOptional()
  @IsUUID()
  target_account_id?: string | null;

  @IsOptional()
  @IsUUID()
  target_goal_id?: string | null;

  @IsIn(DISTRIBUTION_TYPE_WIRE_VALUES)
  distribution_type!: DistributionTypeWire;

  // ge=0 with no decimal_places constraint on this one, unlike every other money field.
  @IsOptional()
  @IsDecimalString()
  amount?: string | null;

  @IsOptional()
  @IsPercentageString()
  percentage?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority: number = 0;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active: boolean = true;
}

/** Mirrors IncomeDistributionRuleUpdate — all optional, no defaults (exclude_unset semantics). */
export class UpdateDistributionRuleDto {
  @IsOptional()
  @IsUUID()
  income_source_id?: string | null;

  @IsOptional()
  @IsUUID()
  target_account_id?: string | null;

  @IsOptional()
  @IsUUID()
  target_goal_id?: string | null;

  @IsOptional()
  @IsIn(DISTRIBUTION_TYPE_WIRE_VALUES)
  distribution_type?: DistributionTypeWire;

  @IsOptional()
  @IsDecimalString()
  amount?: string | null;

  @IsOptional()
  @IsPercentageString()
  percentage?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

/**
 * POST /distribution-preview takes all of its input as query params and has no body.
 * `currency` carries no length constraint in FastAPI and is echoed back verbatim — do not add one
 * and do not upper-case it.
 */
export class DistributionPreviewQueryDto {
  @IsDecimalString()
  income_amount!: string;

  @IsOptional()
  @IsString()
  currency: string = 'USD';

  @IsOptional()
  @IsUUID()
  income_source_id?: string;
}
