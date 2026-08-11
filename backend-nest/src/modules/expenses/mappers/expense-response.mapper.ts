import type { DisplayValues } from '../../../common/currency/display-currency.service';
import { decDiv, decIsZero, decMul } from '../../../common/money/money';
import { toNaiveIso } from '../../../common/time/naive-timestamp';
import { Expense } from '../entities/expense.entity';
import { EXPENSE_FREQUENCY_TO_WIRE, STORED_MULTIPLIER } from '../enums';

/**
 * calculate_monthly_equivalent — fills the STORED monthly_equivalent column. Uses table 1 of the
 * three multiplier sets: quarterly and annually are divisions, weekly and biweekly multiply by
 * float-derived constants. The result is written to a numeric(12,2) column, so the float noise is
 * quantized away before anyone sees it — which is why /stats, which does the same arithmetic in
 * memory, leaks digits that this does not.
 */
export function storedMonthlyEquivalent(
  amount: string,
  frequency: keyof typeof STORED_MULTIPLIER,
): string {
  const rule = STORED_MULTIPLIER[frequency];
  return rule.dividedBy
    ? decDiv(amount, rule.dividedBy)
    : decMul(amount, rule.times!);
}

/** A JSON number, for the two endpoints that have no response_model. */
function jsonNumber(value: string): number {
  return Number(value);
}

/**
 * The response_model shape: POST, GET /{id}, PUT, cancel, and the items of batch-create.
 * Decimals are strings with their stored scale; every timestamp is naive, with no Z and no offset,
 * because every timestamp column on this table is `timestamp WITHOUT time zone`.
 */
export function toExpenseModel(
  expense: Expense,
  display: DisplayValues = {
    displayAmount: null,
    displayCurrency: null,
    displayMonthlyEquivalent: null,
  },
  paymentAccountName: string | null = null,
) {
  return {
    name: expense.name,
    description: expense.description,
    category: expense.category,
    amount: expense.amount,
    currency: expense.currency,
    frequency: EXPENSE_FREQUENCY_TO_WIRE[expense.frequency],
    is_active: expense.isActive,
    tags: expense.tags,
    date: toNaiveIso(expense.date),
    start_date: toNaiveIso(expense.startDate),
    end_date: toNaiveIso(expense.endDate),
    payment_account_id: expense.paymentAccountId,
    payment_method: expense.paymentMethod,
    auto_pay: expense.autoPay,
    id: expense.id,
    user_id: expense.userId,
    monthly_equivalent: expense.monthlyEquivalent,
    created_at: toNaiveIso(expense.createdAt),
    updated_at: toNaiveIso(expense.updatedAt),
    display_amount: display.displayAmount,
    display_currency: display.displayCurrency,
    display_monthly_equivalent: display.displayMonthlyEquivalent,
    status: expense.status,
    paid_date: toNaiveIso(expense.paidDate),
    paid_amount: expense.paidAmount,
    account_transaction_id: expense.accountTransactionId,
    receipt_url: expense.receiptUrl,
    payment_account_name: paymentAccountName,
  };
}

/**
 * GET /expenses only. That handler declares no response_model, so FastAPI hand-builds a dict and
 * `jsonable_encoder` renders every Decimal as a JSON NUMBER rather than a string. The falsy guards
 * below are FastAPI's, and they are inconsistent on purpose:
 *   "amount": float(x) if x else 0                    → a zero amount becomes the integer 0
 *   "monthly_equivalent": float(m) if m else None     → a zero equivalent becomes null
 *   "display_amount": float(d) if d is not None       → a zero display amount stays 0
 * so a one-time expense (stored equivalent 0.00) reports null here and "0.00" on the detail
 * endpoint.
 */
export function toExpenseListItem(
  expense: Expense,
  display: DisplayValues,
  paymentAccountName: string | null,
) {
  return {
    id: expense.id,
    user_id: expense.userId,
    name: expense.name,
    description: expense.description,
    category: expense.category,
    amount: decIsZero(expense.amount) ? 0 : jsonNumber(expense.amount),
    currency: expense.currency,
    frequency: EXPENSE_FREQUENCY_TO_WIRE[expense.frequency],
    date: toNaiveIso(expense.date),
    start_date: toNaiveIso(expense.startDate),
    end_date: toNaiveIso(expense.endDate),
    is_active: expense.isActive,
    tags: expense.tags,
    monthly_equivalent:
      expense.monthlyEquivalent === null || decIsZero(expense.monthlyEquivalent)
        ? null
        : jsonNumber(expense.monthlyEquivalent),
    created_at: toNaiveIso(expense.createdAt),
    updated_at: toNaiveIso(expense.updatedAt),
    display_amount:
      display.displayAmount === null ? null : jsonNumber(display.displayAmount),
    display_currency: display.displayCurrency,
    display_monthly_equivalent:
      display.displayMonthlyEquivalent === null
        ? null
        : jsonNumber(display.displayMonthlyEquivalent),
    payment_account_id: expense.paymentAccountId,
    payment_method: expense.paymentMethod,
    status: expense.status,
    paid_date: toNaiveIso(expense.paidDate),
    paid_amount:
      expense.paidAmount === null || decIsZero(expense.paidAmount)
        ? null
        : jsonNumber(expense.paidAmount),
    account_transaction_id: expense.accountTransactionId,
    receipt_url: expense.receiptUrl,
    // The ONLY endpoint that populates this. Detail, create, update and cancel all answer null,
    // because the router never calls the enriching service function.
    payment_account_name: paymentAccountName,
    auto_pay: expense.autoPay,
  };
}

export type ExpenseModelResponse = ReturnType<typeof toExpenseModel>;
export type ExpenseListItem = ReturnType<typeof toExpenseListItem>;
