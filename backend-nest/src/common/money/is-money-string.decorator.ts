import { applyDecorators } from '@nestjs/common';
import {
  Matches,
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';

// Mirrors pydantic's `Decimal = Field(ge=0, decimal_places=2)`: non-negative, at most two decimal
// places. Deliberately NOT @IsNumber + @Type(() => Number) — money never becomes a JS number here,
// and portfolio_assets.quantity is numeric(18,8), more digits than a double holds exactly.
const MONEY = /^\d+(\.\d{1,2})?$/;

export function IsMoneyString(): PropertyDecorator {
  return applyDecorators(
    Matches(MONEY, {
      message: 'must be a non-negative number with at most 2 decimal places',
    }),
  );
}

/** For fields FastAPI declares as `ge=0` with no `decimal_places` (distribution rule amounts). */
const DECIMAL = /^\d+(\.\d+)?$/;

export function IsDecimalString(): PropertyDecorator {
  return applyDecorators(
    Matches(DECIMAL, { message: 'must be a non-negative number' }),
  );
}

/**
 * Range check for a numeric *string*. class-validator's @Min/@Max only accept numbers — handed a
 * string they fail outright, which would reject every valid percentage — so the bound is checked
 * here after an explicit parse. The property keeps its string value; only the comparison is numeric,
 * which is exact for the 0–100, two-decimal range this guards.
 */
export function IsNumericStringInRange(
  min: number,
  max: number,
  options?: ValidationOptions,
): PropertyDecorator {
  return function (target: object, propertyName: string | symbol): void {
    registerDecorator({
      name: 'isNumericStringInRange',
      target: target.constructor,
      propertyName: propertyName as string,
      constraints: [min, max],
      options,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          if (typeof value !== 'string' || !DECIMAL.test(value)) return false;
          const [low, high] = args.constraints as [number, number];
          const parsed = Number(value);
          return Number.isFinite(parsed) && parsed >= low && parsed <= high;
        },
        defaultMessage(args: ValidationArguments): string {
          const [low, high] = args.constraints as [number, number];
          return `must be a number between ${low} and ${high}`;
        },
      },
    });
  };
}

/** `percentage: Decimal = Field(None, ge=0, le=100)`. */
export function IsPercentageString(): PropertyDecorator {
  return IsNumericStringInRange(0, 100);
}
