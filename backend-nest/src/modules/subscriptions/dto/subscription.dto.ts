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
import { IsDecimalString } from '../../../common/money/is-money-string.decorator';
import { toNaiveTimestamp } from '../../../common/time/naive-timestamp';
import {
  IsUuidLike,
  UUID_LIKE_PATTERN,
} from '../../../common/validation/is-uuid-like.decorator';

/** biannually means every SIX months, everywhere in this module. */
export const SUBSCRIPTION_FREQUENCIES = [
  'monthly',
  'quarterly',
  'annually',
  'biannually',
] as const;
export type SubscriptionFrequency = (typeof SUBSCRIPTION_FREQUENCIES)[number];

const naive = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? toNaiveTimestamp(value) : value;

const boolish = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class CreateSubscriptionDto {
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string | null;

  // ge=0 — zero is allowed here, unlike expenses which demands gt=0.
  @IsDecimalString()
  amount!: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency: string = 'USD';

  @IsIn(SUBSCRIPTION_FREQUENCIES)
  frequency!: SubscriptionFrequency;

  @IsString()
  @Transform(naive)
  start_date!: string;

  @IsOptional()
  @IsString()
  @Transform(naive)
  end_date?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active: boolean = true;

  @IsOptional()
  @IsUuidLike()
  payment_account_id?: string | null;

  @IsOptional()
  @IsBoolean()
  auto_pay: boolean = false;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  reminder_days_before: number = 3;

  @IsOptional()
  @IsBoolean()
  sync_historical: boolean = false;
}

/** All optional, no defaults — exclude_unset semantics on a PUT verb. */
export class UpdateSubscriptionDto {
  @IsOptional() @IsString() @Length(1, 100) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string | null;
  @IsOptional() @IsString() @MaxLength(50) category?: string | null;
  @IsOptional() @IsDecimalString() amount?: string;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional()
  @IsIn(SUBSCRIPTION_FREQUENCIES)
  frequency?: SubscriptionFrequency;
  @IsOptional() @IsString() @Transform(naive) start_date?: string;
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

export class ListSubscriptionsQueryDto extends PageQueryDto {
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() frequency?: string;
  @IsOptional() @Transform(boolish) @IsBoolean() is_active?: boolean;
}

export class SubscriptionDateRangeQueryDto {
  @IsOptional() @IsString() start_date?: string;
  @IsOptional() @IsString() end_date?: string;
}

export class BatchDeleteSubscriptionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @Matches(UUID_LIKE_PATTERN, {
    each: true,
    message: 'each value must be a valid UUID',
  })
  ids!: string[];
}

export class PauseSubscriptionDto {
  /** Stored, but nothing in this module ever acts on it — there is no auto-resume. */
  @IsOptional()
  @IsString()
  @Transform(naive)
  resume_date?: string | null;
}

export class PaySubscriptionDto {
  /**
   * Accepted and IGNORED — the payment always uses the subscription's own amount. Kept in the DTO
   * so clients that send it are unaffected, exactly as FastAPI accepts and drops it.
   */
  @IsOptional()
  @IsDecimalString()
  amount?: string | null;

  @IsOptional()
  @IsString()
  @Transform(naive)
  payment_date?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
