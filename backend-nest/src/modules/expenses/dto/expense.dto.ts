import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { IsDecimalString } from '../../../common/money/is-money-string.decorator';
import { PageQueryDto } from '../../../common/dto/page-query.dto';
import { toNaiveTimestamp } from '../../../common/time/naive-timestamp';
import {
  IsUuidLike,
  UUID_LIKE_PATTERN,
} from '../../../common/validation/is-uuid-like.decorator';
import { EXPENSE_FREQUENCY_WIRE_VALUES } from '../enums';
import type { ExpenseFrequencyWire } from '../enums';

const upperCase = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.toUpperCase() : value;

const naive = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? toNaiveTimestamp(value) : value;

const boolish = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

/**
 * Expenses declares `amount: Decimal = Field(..., gt=0)` — strictly positive, unlike income's
 * `ge=0`. A zero amount is a 422 here and merely unusual there.
 */
const POSITIVE_MONEY = /^(?!0+(\.0+)?$)\d+(\.\d{1,2})?$/;

function IsPositiveMoneyString(): PropertyDecorator {
  return Matches(POSITIVE_MONEY, {
    message: 'must be a number greater than 0 with at most 2 decimal places',
  });
}

export class CreateExpenseDto {
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

  @IsPositiveMoneyString()
  amount!: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Transform(upperCase)
  currency: string = 'USD';

  // Required here — income defaults its frequency, expenses does not.
  @IsIn(EXPENSE_FREQUENCY_WIRE_VALUES)
  frequency!: ExpenseFrequencyWire;

  @IsOptional()
  @IsBoolean()
  is_active: boolean = true;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[] | null;

  @IsOptional()
  @IsString()
  @Transform(naive)
  date?: string | null;

  @IsOptional()
  @IsString()
  @Transform(naive)
  start_date?: string | null;

  @IsOptional()
  @IsString()
  @Transform(naive)
  end_date?: string | null;

  @IsOptional()
  @IsUuidLike()
  payment_account_id?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  payment_method?: string | null;

  @IsOptional()
  @IsBoolean()
  auto_pay: boolean = false;

  /** Not a column — asks for historical payments to be backfilled from start_date. */
  @IsOptional()
  @IsBoolean()
  sync_historical?: boolean;
}

/**
 * Standalone, not a partial of the create DTO: no defaults, so the service can apply only the keys
 * actually present (pydantic's exclude_unset). An explicit null DOES write NULL.
 */
export class UpdateExpenseDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string | null;

  @IsOptional()
  @IsPositiveMoneyString()
  amount?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Transform(upperCase)
  currency?: string;

  @IsOptional()
  @IsIn(EXPENSE_FREQUENCY_WIRE_VALUES)
  frequency?: ExpenseFrequencyWire;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[] | null;

  @IsOptional()
  @IsString()
  @Transform(naive)
  date?: string | null;

  @IsOptional()
  @IsString()
  @Transform(naive)
  start_date?: string | null;

  @IsOptional()
  @IsString()
  @Transform(naive)
  end_date?: string | null;

  @IsOptional()
  @IsUuidLike()
  payment_account_id?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  payment_method?: string | null;

  @IsOptional()
  @IsBoolean()
  auto_pay?: boolean;

  @IsOptional()
  @IsBoolean()
  sync_historical?: boolean;
}

export class ListExpensesQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Transform(boolish)
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsString()
  status?: string;
}

export class ExpenseDateRangeQueryDto {
  @IsOptional()
  @IsString()
  start_date?: string;

  @IsOptional()
  @IsString()
  end_date?: string;
}

export class BatchCreateExpensesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateExpenseDto)
  expenses!: CreateExpenseDto[];
}

export class BatchDeleteExpensesDto {
  @IsArray()
  @ArrayMinSize(1)
  @Matches(UUID_LIKE_PATTERN, {
    each: true,
    message: 'each value must be a valid UUID',
  })
  expense_ids!: string[];
}

/**
 * Every field is optional, so `{}` is a valid body — it pays the expense's own amount from its own
 * account. `amount` deliberately carries NO positivity constraint: PayExpenseRequest declares a
 * bare Optional[Decimal], so FastAPI accepts a zero or negative here and only the withdrawal
 * engine rejects it.
 */
export class PayExpenseDto {
  @IsOptional()
  @IsUuidLike()
  account_id?: string | null;

  @IsOptional()
  @IsDecimalString()
  amount?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  payment_method?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;
}
