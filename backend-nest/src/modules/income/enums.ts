// SQLAlchemy's Enum(native_enum=False) stores the member NAME; pydantic serialises the VALUE.
// The DB says 'MONTHLY', the wire says 'monthly'. Both directions are explicit — never toLowerCase().
// (ONE_TIME → one_time would survive that, but relying on it breaks the first time an enum isn't a
// clean snake-case pair, and the failure would be a silently wrong enum on the wire.)

export const INCOME_FREQUENCY_TO_WIRE = {
  ONE_TIME: 'one_time',
  WEEKLY: 'weekly',
  BIWEEKLY: 'biweekly',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  ANNUALLY: 'annually',
} as const;

export type IncomeFrequencyName = keyof typeof INCOME_FREQUENCY_TO_WIRE;
export type IncomeFrequencyWire =
  (typeof INCOME_FREQUENCY_TO_WIRE)[IncomeFrequencyName];

export const INCOME_FREQUENCY_TO_NAME = Object.fromEntries(
  Object.entries(INCOME_FREQUENCY_TO_WIRE).map(([name, wire]) => [wire, name]),
) as Record<IncomeFrequencyWire, IncomeFrequencyName>;

export const INCOME_FREQUENCY_WIRE_VALUES = Object.values(
  INCOME_FREQUENCY_TO_WIRE,
) as IncomeFrequencyWire[];

export const INCOME_STATUS_TO_WIRE = {
  EXPECTED: 'expected',
  RECEIVED: 'received',
  DEPOSITED: 'deposited',
} as const;

export type IncomeStatusName = keyof typeof INCOME_STATUS_TO_WIRE;
export type IncomeStatusWire = (typeof INCOME_STATUS_TO_WIRE)[IncomeStatusName];

export const INCOME_STATUS_TO_NAME = Object.fromEntries(
  Object.entries(INCOME_STATUS_TO_WIRE).map(([name, wire]) => [wire, name]),
) as Record<IncomeStatusWire, IncomeStatusName>;

export const DISTRIBUTION_TYPE_TO_WIRE = {
  PERCENTAGE: 'percentage',
  FIXED_AMOUNT: 'fixed_amount',
  REMAINDER: 'remainder',
} as const;

export type DistributionTypeName = keyof typeof DISTRIBUTION_TYPE_TO_WIRE;
export type DistributionTypeWire =
  (typeof DISTRIBUTION_TYPE_TO_WIRE)[DistributionTypeName];

export const DISTRIBUTION_TYPE_TO_NAME = Object.fromEntries(
  Object.entries(DISTRIBUTION_TYPE_TO_WIRE).map(([name, wire]) => [wire, name]),
) as Record<DistributionTypeWire, DistributionTypeName>;

export const DISTRIBUTION_TYPE_WIRE_VALUES = Object.values(
  DISTRIBUTION_TYPE_TO_WIRE,
) as DistributionTypeWire[];

/**
 * IncomeSource.calculate_monthly_amount() — drives `monthly_equivalent` and every stats figure.
 * Multiplied with Python Decimal scale rules, so 100.50 × 0.083 is 8.34150, not 8.3415.
 */
export const MONTHLY_MULTIPLIER: Record<IncomeFrequencyName, string> = {
  ONE_TIME: '0',
  WEEKLY: '4.33',
  BIWEEKLY: '2.17',
  MONTHLY: '1',
  QUARTERLY: '0.33',
  ANNUALLY: '0.083',
};

/**
 * get_income_history() carries its own, more precise table. The difference from MONTHLY_MULTIPLIER
 * is real and observable — /stats and /history disagree about what a weekly income is worth per
 * month. Not a typo, do not unify them.
 */
export const HISTORY_MULTIPLIER: Record<IncomeFrequencyName, string> = {
  ONE_TIME: '0',
  WEEKLY: '4.33333',
  BIWEEKLY: '2.16667',
  MONTHLY: '1',
  QUARTERLY: '0.333333',
  ANNUALLY: '0.083333',
};
