import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto';
import {
  IsDecimalString,
  IsPercentageString,
  IsPositiveDecimalString,
} from '../../../common/money/is-money-string.decorator';
import { toNaiveTimestamp } from '../../../common/time/naive-timestamp';
import { IsUuidLike } from '../../../common/validation/is-uuid-like.decorator';

const naive = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? toNaiveTimestamp(value) : value;

const boolish = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class CreateDebtDto {
  @IsString() @Length(1, 100) debtor_name!: string;
  @IsOptional() @IsString() description?: string | null;

  @IsPositiveDecimalString() amount!: string;

  @IsOptional() @IsDecimalString() amount_paid: string = '0';

  @IsOptional() @IsString() @Length(3, 3) currency: string = 'USD';
  @IsOptional() @IsBoolean() is_active: boolean = true;
  @IsOptional() @IsBoolean() is_paid: boolean = false;

  @IsOptional() @Transform(naive) @IsString() due_date?: string | null;
  @IsOptional() @Transform(naive) @IsString() paid_date?: string | null;
  @IsOptional() @IsString() notes?: string | null;

  @IsOptional() @IsUuidLike() deposit_account_id?: string | null;
  @IsOptional() @IsBoolean() auto_deposit: boolean = false;

  /** A percent, 0-100. */
  @IsOptional() @IsPercentageString() interest_rate?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reminder_days_before: number = 3;

  @IsOptional() @Transform(naive) @IsString() next_payment_date?: string | null;

  /** Unvalidated in FastAPI — any string is stored, including nonsense. */
  @IsOptional() @IsString() payment_frequency?: string | null;

  @IsOptional() @IsDecimalString() expected_payment_amount?: string | null;

  /** Not a column: triggers the historical-payment backfill when an account is linked. */
  @IsOptional() @IsBoolean() sync_historical: boolean = false;
}

export class UpdateDebtDto {
  @IsOptional() @IsString() @Length(1, 100) debtor_name?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsPositiveDecimalString() amount?: string;
  @IsOptional() @IsDecimalString() amount_paid?: string;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional() @IsBoolean() is_active?: boolean;
  @IsOptional() @IsBoolean() is_paid?: boolean;
  @IsOptional() @Transform(naive) @IsString() due_date?: string | null;
  @IsOptional() @Transform(naive) @IsString() paid_date?: string | null;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsUuidLike() deposit_account_id?: string | null;
  @IsOptional() @IsBoolean() auto_deposit?: boolean;
  @IsOptional() @IsPercentageString() interest_rate?: string | null;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reminder_days_before?: number;
  @IsOptional() @Transform(naive) @IsString() next_payment_date?: string | null;
  @IsOptional() @IsString() payment_frequency?: string | null;
  @IsOptional() @IsDecimalString() expected_payment_amount?: string | null;
  @IsOptional() @IsBoolean() sync_historical: boolean = false;
}

export class ListDebtsQueryDto extends PageQueryDto {
  @IsOptional() @Transform(boolish) @IsBoolean() is_paid?: boolean;
  @IsOptional() @Transform(boolish) @IsBoolean() is_active?: boolean;
}

export class BatchDeleteDebtsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @Type(() => String)
  ids!: string[];
}

export class RecordDebtPaymentDto {
  @IsPositiveDecimalString() amount!: string;

  @IsOptional() @Transform(naive) @IsString() payment_date?: string | null;
  @IsOptional() @IsString() notes?: string | null;

  /** Defaults to TRUE, so a linked account receives a deposit unless the caller opts out. */
  @IsOptional() @IsBoolean() deposit_to_account: boolean = true;
}
