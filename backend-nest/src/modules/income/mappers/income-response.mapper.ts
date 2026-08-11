import { decIsZero, decMul, pyFloatMoney } from '../../../common/money/money';
import { toNaiveIso } from '../../../common/time/naive-timestamp';
import { IncomeDistributionRule } from '../entities/income-distribution-rule.entity';
import { IncomeSource } from '../entities/income-source.entity';
import type {
  ConvertibleRow,
  DisplayValues,
} from '../../../common/currency/display-currency.service';
import { IncomeTransaction } from '../entities/income-transaction.entity';
import {
  DISTRIBUTION_TYPE_TO_WIRE,
  INCOME_FREQUENCY_TO_WIRE,
  INCOME_STATUS_TO_WIRE,
  MONTHLY_MULTIPLIER,
} from '../enums';

/** IncomeSource.calculate_monthly_amount(): amount × multiplier, with Python's Decimal scale rules. */
export function monthlyEquivalent(source: IncomeSource): string {
  return decMul(source.amount, MONTHLY_MULTIPLIER[source.frequency]);
}

/** Adapts a source row for the shared display-currency service, which is module-agnostic. */
export function toConvertible(source: IncomeSource): ConvertibleRow {
  return {
    amount: source.amount,
    currency: source.currency,
    monthlyEquivalent: monthlyEquivalent(source),
  };
}

/** The verb-independent half of IncomeSourceResponse. */
function sourceCommon(source: IncomeSource) {
  return {
    name: source.name,
    description: source.description,
    category: source.category,
    currency: source.currency,
    frequency: INCOME_FREQUENCY_TO_WIRE[source.frequency],
    is_active: source.isActive,
    date: toNaiveIso(source.date),
    start_date: toNaiveIso(source.startDate),
    end_date: toNaiveIso(source.endDate),
    target_account_id: source.targetAccountId,
    auto_deposit: source.autoDeposit,
    id: source.id,
    user_id: source.userId,
    created_at: source.createdAt.toISOString(),
    updated_at: source.updatedAt.toISOString(),
    // Declared on the response schema but never populated by any FastAPI code path. A dead field
    // that must still be present and null.
    target_account_name: null as string | null,
  };
}

/**
 * POST /sources and PUT /sources/{id}. FastAPI builds these with model_validate on the ORM object,
 * so decimals keep their DB precision and the display_* trio is never computed.
 */
export function toSourceResponseRaw(
  source: IncomeSource,
): IncomeSourceResponse {
  return {
    ...sourceCommon(source),
    amount: source.amount,
    monthly_equivalent: monthlyEquivalent(source),
    display_amount: null as string | null,
    display_currency: null as string | null,
    display_monthly_equivalent: null as string | null,
  };
}

/**
 * GET /sources and GET /sources/{id}. FastAPI hand-builds a dict here, casting every decimal through
 * float() — hence pyFloatMoney — and populates display_* from convert_income_to_display_currency.
 * The two zero cases below are its truthiness checks, not ours:
 *   "amount": float(source.amount) if source.amount else 0            → "0", not "0.0"
 *   "monthly_equivalent": float(calc()) if calc() else None           → null
 */
export function toSourceResponseFloat(
  source: IncomeSource,
  display: DisplayValues,
): IncomeSourceResponse {
  const monthly = monthlyEquivalent(source);
  return {
    ...sourceCommon(source),
    amount: decIsZero(source.amount) ? '0' : pyFloatMoney(source.amount),
    monthly_equivalent: decIsZero(monthly) ? null : pyFloatMoney(monthly),
    display_amount:
      display.displayAmount === null
        ? null
        : pyFloatMoney(display.displayAmount),
    display_currency: display.displayCurrency,
    display_monthly_equivalent:
      display.displayMonthlyEquivalent === null
        ? null
        : pyFloatMoney(display.displayMonthlyEquivalent),
  };
}

/** IncomeTransactionResponse — always raw decimals, on every verb. */
export function toTransactionResponse(txn: IncomeTransaction) {
  return {
    source_id: txn.sourceId,
    description: txn.description,
    amount: txn.amount,
    currency: txn.currency,
    date: toNaiveIso(txn.date),
    category: txn.category,
    notes: txn.notes,
    id: txn.id,
    user_id: txn.userId,
    created_at: txn.createdAt.toISOString(),
    updated_at: txn.updatedAt.toISOString(),
    deposited_to_account_id: txn.depositedToAccountId,
    account_transaction_id: txn.accountTransactionId,
    status: INCOME_STATUS_TO_WIRE[txn.status],
    // Another declared-but-never-populated field.
    deposited_to_account_name: null as string | null,
  };
}

export interface RuleNames {
  incomeSourceName: string | null;
  targetAccountName: string | null;
  targetGoalName: string | null;
}

/** IncomeDistributionRuleResponse, as returned by enrich_rule_response. */
export function toRuleResponse(rule: IncomeDistributionRule, names: RuleNames) {
  return {
    income_source_id: rule.incomeSourceId,
    target_account_id: rule.targetAccountId,
    target_goal_id: rule.targetGoalId,
    distribution_type: DISTRIBUTION_TYPE_TO_WIRE[rule.distributionType],
    amount: rule.amount,
    percentage: rule.percentage,
    priority: rule.priority,
    name: rule.name,
    is_active: rule.isActive,
    id: rule.id,
    user_id: rule.userId,
    created_at: rule.createdAt.toISOString(),
    updated_at: rule.updatedAt.toISOString(),
    income_source_name: names.incomeSourceName,
    target_account_name: names.targetAccountName,
    target_goal_name: names.targetGoalName,
  };
}

/**
 * One response type for both serializations. `monthly_equivalent` is nullable because the
 * list/detail path emits null for a zero (a one-time source), while create/update always emit a
 * string — the union is the honest shape of what this endpoint family returns.
 */
export type IncomeSourceResponse = ReturnType<typeof sourceCommon> & {
  amount: string;
  monthly_equivalent: string | null;
  display_amount: string | null;
  display_currency: string | null;
  display_monthly_equivalent: string | null;
};
export type IncomeTransactionResponse = ReturnType<
  typeof toTransactionResponse
>;
export type IncomeDistributionRuleResponse = ReturnType<typeof toRuleResponse>;
