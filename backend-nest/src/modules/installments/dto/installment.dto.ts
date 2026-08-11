import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto';
import {
  IsDecimalString,
  IsNumericStringInRange,
} from '../../../common/money/is-money-string.decorator';
import { toNaiveTimestamp } from '../../../common/time/naive-timestamp';
import {
  IsUuidLike,
  UUID_LIKE_PATTERN,
} from '../../../common/validation/is-uuid-like.decorator';

export const INSTALLMENT_FREQUENCIES = [
  'weekly',
  'biweekly',
  'monthly',
] as const;
export type InstallmentFrequency = (typeof INSTALLMENT_FREQUENCIES)[number];

const naive = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? toNaiveTimestamp(value) : value;

const boolish = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class CreateInstallmentDto {
  @IsString() @Length(1, 100) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string | null;
  @IsOptional() @IsString() @MaxLength(50) category?: string | null;

  // total_amount and amount_per_payment are supplied independently and never cross-checked —
  // nothing derives one from the other, and the final instalment absorbs no remainder.
  @IsDecimalString() total_amount!: string;
  @IsDecimalString() amount_per_payment!: string;

  @IsOptional() @IsString() @Length(3, 3) currency: string = 'USD';
  @IsOptional() @IsNumericStringInRange(0, 100) interest_rate?: string | null;
  @IsIn(INSTALLMENT_FREQUENCIES) frequency!: InstallmentFrequency;
  @Type(() => Number) @IsInt() @Min(1) number_of_payments!: number;

  /** Accepted but ignored — always recomputed from the calendar. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) payments_made?: number;

  @IsString() @Transform(naive) start_date!: string;
  @IsString() @Transform(naive) first_payment_date!: string;
  @IsOptional() @IsString() @Transform(naive) end_date?: string | null;
  @IsOptional() @IsBoolean() is_active: boolean = true;
  @IsOptional() @IsUuidLike() payment_account_id?: string | null;
  @IsOptional() @IsBoolean() auto_pay: boolean = false;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  reminder_days_before: number = 3;
  @IsOptional() @IsBoolean() sync_historical: boolean = false;
}

export class UpdateInstallmentDto {
  @IsOptional() @IsString() @Length(1, 100) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string | null;
  @IsOptional() @IsString() @MaxLength(50) category?: string | null;
  @IsOptional() @IsDecimalString() total_amount?: string;
  @IsOptional() @IsDecimalString() amount_per_payment?: string;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional() @IsNumericStringInRange(0, 100) interest_rate?: string | null;
  @IsOptional() @IsIn(INSTALLMENT_FREQUENCIES) frequency?: InstallmentFrequency;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  number_of_payments?: number;
  @IsOptional() @IsString() @Transform(naive) start_date?: string;
  @IsOptional() @IsString() @Transform(naive) first_payment_date?: string;
  @IsOptional() @IsString() @Transform(naive) end_date?: string | null;
  @IsOptional() @IsBoolean() is_active?: boolean;
  @IsOptional() @IsUuidLike() payment_account_id?: string | null;
  @IsOptional() @IsBoolean() auto_pay?: boolean;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  reminder_days_before?: number;
  @IsOptional() @IsBoolean() sync_historical?: boolean;
}

export class ListInstallmentsQueryDto extends PageQueryDto {
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() frequency?: string;
  @IsOptional() @Transform(boolish) @IsBoolean() is_active?: boolean;
}

export class InstallmentDateRangeQueryDto {
  @IsOptional() @IsString() start_date?: string;
  @IsOptional() @IsString() end_date?: string;
}

export class BatchDeleteInstallmentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @Matches(UUID_LIKE_PATTERN, {
    each: true,
    message: 'each value must be a valid UUID',
  })
  ids!: string[];
}

export class MarkDefaultedDto {
  @IsOptional() @IsString() reason?: string | null;
}

/**
 * Every field optional. FastAPI reads them by TRUTHINESS, so `amount: 0` and `payment_number: 0`
 * fall back to the defaults rather than being honoured; `principal_amount` and `interest_amount`
 * are accepted and never read — the service recomputes both.
 */
export class PayInstallmentDto {
  @IsOptional() @IsDecimalString() amount?: string | null;
  @IsOptional() @IsString() @Transform(naive) payment_date?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() payment_number?: number | null;
  @IsOptional() @IsDecimalString() principal_amount?: string | null;
  @IsOptional() @IsDecimalString() interest_amount?: string | null;
  @IsOptional() @IsString() notes?: string | null;
}
