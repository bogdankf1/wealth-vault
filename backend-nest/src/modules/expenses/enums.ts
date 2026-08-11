// The DB column is the native Postgres enum `expensefrequency`, whose labels are the member NAMES.
// The wire carries the lowercase values. Unlike income's varchar column, Postgres will reject a
// wrong label outright ("invalid input value for enum expensefrequency"), so the mapping is not
// optional. Note DAILY, which income has no equivalent of — the two enums are NOT shareable.

export const EXPENSE_FREQUENCY_TO_WIRE = {
  ONE_TIME: 'one_time',
  DAILY: 'daily',
  WEEKLY: 'weekly',
  BIWEEKLY: 'biweekly',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  ANNUALLY: 'annually',
} as const;

export type ExpenseFrequencyName = keyof typeof EXPENSE_FREQUENCY_TO_WIRE;
export type ExpenseFrequencyWire =
  (typeof EXPENSE_FREQUENCY_TO_WIRE)[ExpenseFrequencyName];

export const EXPENSE_FREQUENCY_TO_NAME = Object.fromEntries(
  Object.entries(EXPENSE_FREQUENCY_TO_WIRE).map(([name, wire]) => [wire, name]),
) as Record<ExpenseFrequencyWire, ExpenseFrequencyName>;

export const EXPENSE_FREQUENCY_WIRE_VALUES = Object.values(
  EXPENSE_FREQUENCY_TO_WIRE,
) as ExpenseFrequencyWire[];

/**
 * status is a plain varchar(20) holding the lowercase values — no name/value split here, unlike
 * frequency. Keep the two straight: mapping status would corrupt every row.
 */
export const EXPENSE_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled',
  PAYMENT_FAILED: 'payment_failed',
} as const;

export type ExpenseStatus =
  (typeof EXPENSE_STATUS)[keyof typeof EXPENSE_STATUS];

/**
 * Python's `Decimal(4.33)` is built FROM A FLOAT, so it is not 4.33 — it is the exact binary
 * expansion of the double. decimal.js's `new Decimal(4.33)` yields plain 4.33 and will not
 * reproduce the values FastAPI actually returns, so the expansions are spelled out. They leak into
 * /stats: one weekly expense of 100.00 gives total_monthly_expense
 * "433.0000000000000071054273576". Verified against CPython.
 */
export const DECIMAL_FROM_FLOAT_4_33 =
  '4.3300000000000000710542735760100185871124267578125';
export const DECIMAL_FROM_FLOAT_2_17 =
  '2.1699999999999999289457264239899814128875732421875';

/**
 * Table 1 of 3 — calculate_monthly_equivalent, which fills the STORED monthly_equivalent column.
 * Quarterly and annually are divisions, not multiplications; one_time is zero. The float noise
 * from 4.33/2.17 does not escape here because the column is numeric(12,2) and the handler returns
 * the row after a refresh.
 */
export const STORED_MULTIPLIER: Record<
  ExpenseFrequencyName,
  { times?: string; dividedBy?: string }
> = {
  ONE_TIME: { times: '0' },
  DAILY: { times: '30' },
  WEEKLY: { times: DECIMAL_FROM_FLOAT_4_33 },
  BIWEEKLY: { times: DECIMAL_FROM_FLOAT_2_17 },
  MONTHLY: { times: '1' },
  QUARTERLY: { dividedBy: '3' },
  ANNUALLY: { dividedBy: '12' },
};

/**
 * Table 2 of 3 — the in-memory map used by /stats and /history. Exact string constants, and
 * deliberately DIFFERENT numbers from table 1 (4.33333 vs 4.33). Both are live behaviour.
 */
export const STATS_MULTIPLIER: Record<ExpenseFrequencyName, string> = {
  ONE_TIME: '0',
  DAILY: '30',
  WEEKLY: '4.33333',
  BIWEEKLY: '2.16667',
  MONTHLY: '1',
  QUARTERLY: '0.333333',
  ANNUALLY: '0.083333',
};
