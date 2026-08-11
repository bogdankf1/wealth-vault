import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto';
import {
  IsDecimalString,
  IsPercentageString,
  IsPositiveDecimalString,
} from '../../../common/money/is-money-string.decorator';
import { toNaiveTimestamp } from '../../../common/time/naive-timestamp';
import {
  IsUuidLike,
  UUID_LIKE_PATTERN,
} from '../../../common/validation/is-uuid-like.decorator';

export const TAX_TYPES = ['fixed', 'percentage'] as const;
export const TAX_FREQUENCIES = ['monthly', 'quarterly', 'annually'] as const;

const naive = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? toNaiveTimestamp(value) : value;

const boolish = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class CreateTaxDto {
  @IsString() @Length(1, 100) name!: string;
  @IsOptional() @IsString() description?: string | null;

  @IsIn(TAX_TYPES) tax_type!: string;

  @IsOptional() @IsIn(TAX_FREQUENCIES) frequency: string = 'annually';

  @IsOptional() @IsDecimalString() fixed_amount?: string | null;

  @IsOptional() @IsString() @Length(3, 3) currency: string = 'USD';

  /** A percent, 0-100 — not a fraction. */
  @IsOptional() @IsPercentageString() percentage?: string | null;

  /** null means "applies to every income source", which is why it has no default of its own. */
  @IsOptional() @IsUuidLike() income_source_id?: string | null;

  @IsOptional() @IsUuidLike() payment_account_id?: string | null;

  @IsOptional() @IsBoolean() auto_pay: boolean = false;

  @IsOptional() @Transform(naive) @IsString() next_payment_date?: string | null;

  @IsOptional() @IsBoolean() is_active: boolean = true;

  @IsOptional() @IsString() notes?: string | null;
}

/**
 * Every field optional, and — as with the other modules — "absent" and "explicitly null" differ:
 * PUT only writes the keys actually present in the body (`model_dump(exclude_unset=True)`).
 */
export class UpdateTaxDto {
  @IsOptional() @IsString() @Length(1, 100) name?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsIn(TAX_TYPES) tax_type?: string;
  @IsOptional() @IsIn(TAX_FREQUENCIES) frequency?: string;
  @IsOptional() @IsDecimalString() fixed_amount?: string | null;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional() @IsPercentageString() percentage?: string | null;
  @IsOptional() @IsUuidLike() income_source_id?: string | null;
  @IsOptional() @IsUuidLike() payment_account_id?: string | null;
  @IsOptional() @IsBoolean() auto_pay?: boolean;
  @IsOptional() @Transform(naive) @IsString() next_payment_date?: string | null;
  @IsOptional() @IsBoolean() is_active?: boolean;
  @IsOptional() @IsString() notes?: string | null;
}

export class ListTaxesQueryDto extends PageQueryDto {
  @IsOptional() @Transform(boolish) @IsBoolean() is_active?: boolean;
  @IsOptional() @IsUuidLike() income_source_id?: string;
}

export class ListTaxPaymentsQueryDto extends PageQueryDto {
  @IsOptional() @IsUuidLike() tax_id?: string;
}

export class BatchDeleteTaxesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @Type(() => String)
  ids!: string[];
}

export class CreateTaxPaymentDto {
  @IsUuidLike() tax_id!: string;

  /** gt=0, so a zero payment is a 422 rather than a no-op. */
  @IsPositiveDecimalString() amount!: string;

  @IsOptional() @IsString() @Length(3, 3) currency: string = 'USD';

  @Transform(naive) @IsString() payment_date!: string;

  @IsOptional() @Transform(naive) @IsString() period_start?: string | null;
  @IsOptional() @Transform(naive) @IsString() period_end?: string | null;
  @IsOptional() @IsString() notes?: string | null;
}

/** The whole body is optional — `request: PayTaxRequest = None`. */
export class PayTaxDto {
  @IsOptional() @IsUuidLike() account_id?: string | null;
  @IsOptional() @IsPositiveDecimalString() amount?: string | null;
  @IsOptional() @IsString() notes?: string | null;
}

export { UUID_LIKE_PATTERN };
