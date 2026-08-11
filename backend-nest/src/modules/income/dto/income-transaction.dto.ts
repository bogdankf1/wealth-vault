import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  IsUuidLike,
  UUID_LIKE_PATTERN,
} from '../../../common/validation/is-uuid-like.decorator';
import { IsMoneyString } from '../../../common/money/is-money-string.decorator';
import { toNaiveTimestamp } from '../../../common/time/naive-timestamp';

const upperCase = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.toUpperCase() : value;

const naive = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? toNaiveTimestamp(value) : value;

/** Mirrors IncomeTransactionCreate. */
export class CreateIncomeTransactionDto {
  @IsOptional()
  @IsUuidLike()
  source_id?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsMoneyString()
  amount!: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Transform(upperCase)
  currency: string = 'USD';

  @IsString()
  @Transform(naive)
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;

  /**
   * Accepted and ignored. This field is what breaks FastAPI's endpoint: it is not a column on
   * IncomeTransaction, and the router splats the whole model into the constructor, so every call
   * raises TypeError and returns a 500 with no row written. Keeping the field in the request
   * contract means clients that send it are unaffected; acting on it would be inventing behaviour
   * the API never had.
   */
  @IsOptional()
  @IsUuidLike()
  deposit_to_account_id?: string | null;
}

/** Mirrors IncomeSourceBatchDelete — min_length=1, so an empty array is a 422. */
export class BatchDeleteIncomeSourcesDto {
  @IsArray()
  @ArrayMinSize(1)
  @Matches(UUID_LIKE_PATTERN, {
    each: true,
    message: 'each value must be a valid UUID',
  })
  source_ids!: string[];
}

/** Mirrors IncomeDepositRequest. */
export class DepositIncomeDto {
  @IsUuidLike()
  account_id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;
}
