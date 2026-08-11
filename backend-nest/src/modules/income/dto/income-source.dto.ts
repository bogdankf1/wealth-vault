import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';
import { IsMoneyString } from '../../../common/money/is-money-string.decorator';
import { toNaiveTimestamp } from '../../../common/time/naive-timestamp';
import { INCOME_FREQUENCY_WIRE_VALUES } from '../enums';
import type { IncomeFrequencyWire } from '../enums';

const upperCase = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.toUpperCase() : value;

const naive = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? toNaiveTimestamp(value) : value;

/** Mirrors IncomeSourceCreate (= IncomeSourceBase). */
export class CreateIncomeSourceDto {
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

  @IsMoneyString()
  amount!: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Transform(upperCase)
  currency: string = 'USD';

  @IsOptional()
  @IsIn(INCOME_FREQUENCY_WIRE_VALUES)
  frequency: IncomeFrequencyWire = 'monthly';

  @IsOptional()
  @IsBoolean()
  is_active: boolean = true;

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
  @IsUUID()
  target_account_id?: string | null;

  @IsOptional()
  @IsBoolean()
  auto_deposit: boolean = false;
}

/**
 * Mirrors IncomeSourceUpdate — a standalone schema, not a partial of the create one. Two
 * differences from CreateIncomeSourceDto are FastAPI's, not oversights:
 *   - there is no `date` field, so a one-time source's date cannot be changed through PUT;
 *   - there is no date validator, so offsets on start_date/end_date are NOT stripped on update
 *     the way they are on create.
 * No property carries a default: the service applies only the keys actually present in the body
 * (pydantic's exclude_unset=True), which is what makes this PUT behave like a PATCH.
 */
export class UpdateIncomeSourceDto {
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
  @IsMoneyString()
  amount?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Transform(upperCase)
  currency?: string;

  @IsOptional()
  @IsIn(INCOME_FREQUENCY_WIRE_VALUES)
  frequency?: IncomeFrequencyWire;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsString()
  start_date?: string;

  @IsOptional()
  @IsString()
  end_date?: string;

  @IsOptional()
  @IsUUID()
  target_account_id?: string;

  @IsOptional()
  @IsBoolean()
  auto_deposit?: boolean;

  /** Not a column — drives the reversal/recreate of generated transactions. */
  @IsOptional()
  @IsBoolean()
  sync_historical?: boolean;
}
