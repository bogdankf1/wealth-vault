import { pyFloatMoney } from '../../../common/money/money';
import { toNaiveIso } from '../../../common/time/naive-timestamp';
import { Installment } from '../entities/installment.entity';
import { InstallmentPayment } from '../entities/installment-payment.entity';

export interface InstallmentDisplay {
  displayTotalAmount: string | null;
  displayAmountPerPayment: string | null;
  displayRemainingBalance: string | null;
  displayCurrency: string | null;
}

const NO_DISPLAY: InstallmentDisplay = {
  displayTotalAmount: null,
  displayAmountPerPayment: null,
  displayRemainingBalance: null,
  displayCurrency: null,
};

function common(row: Installment) {
  return {
    id: row.id,
    user_id: row.userId,
    name: row.name,
    description: row.description,
    category: row.category,
    currency: row.currency,
    frequency: row.frequency,
    number_of_payments: row.numberOfPayments,
    payments_made: row.paymentsMade,
    // Declared `str` on the response schema and filled by isoformat().
    start_date: toNaiveIso(row.startDate),
    first_payment_date: toNaiveIso(row.firstPaymentDate),
    end_date: toNaiveIso(row.endDate),
    is_active: row.isActive,
    status: row.status,
    created_at: toNaiveIso(row.createdAt),
    updated_at: toNaiveIso(row.updatedAt),
    payment_account_id: row.paymentAccountId,
    auto_pay: row.autoPay,
    next_payment_date: toNaiveIso(row.nextPaymentDate),
    last_payment_date: toNaiveIso(row.lastPaymentDate),
    reminder_days_before: row.reminderDaysBefore,
  };
}

/** create / update / complete / default / reactivate — the ORM object, DB scale, display_* null. */
export function toInstallmentOrm(row: Installment) {
  return {
    ...common(row),
    total_amount: row.totalAmount,
    amount_per_payment: row.amountPerPayment,
    interest_rate: row.interestRate,
    remaining_balance: row.remainingBalance,
    display_total_amount: NO_DISPLAY.displayTotalAmount,
    display_amount_per_payment: NO_DISPLAY.displayAmountPerPayment,
    display_remaining_balance: NO_DISPLAY.displayRemainingBalance,
    display_currency: NO_DISPLAY.displayCurrency,
  };
}

/**
 * list and get-by-id — hand-built through float(), so "1200.00" answers "1200.0" and an interest
 * rate of "5.50" answers "5.5". Verified live against both endpoints on the same row.
 */
export function toInstallmentFloat(
  row: Installment,
  display: InstallmentDisplay,
) {
  return {
    ...common(row),
    total_amount: pyFloatMoney(row.totalAmount),
    amount_per_payment: pyFloatMoney(row.amountPerPayment),
    interest_rate:
      row.interestRate === null ? null : pyFloatMoney(row.interestRate),
    remaining_balance:
      row.remainingBalance === null ? null : pyFloatMoney(row.remainingBalance),
    display_total_amount:
      display.displayTotalAmount === null
        ? null
        : pyFloatMoney(display.displayTotalAmount),
    display_amount_per_payment:
      display.displayAmountPerPayment === null
        ? null
        : pyFloatMoney(display.displayAmountPerPayment),
    display_remaining_balance:
      display.displayRemainingBalance === null
        ? null
        : pyFloatMoney(display.displayRemainingBalance),
    display_currency: display.displayCurrency,
  };
}

export function toInstallmentPaymentResponse(payment: InstallmentPayment) {
  return {
    id: payment.id,
    installment_id: payment.installmentId,
    user_id: payment.userId,
    payment_number: payment.paymentNumber,
    scheduled_date: toNaiveIso(payment.scheduledDate),
    actual_payment_date: toNaiveIso(payment.actualPaymentDate),
    scheduled_amount: payment.scheduledAmount,
    actual_amount: payment.actualAmount,
    principal_amount: payment.principalAmount,
    interest_amount: payment.interestAmount,
    currency: payment.currency,
    expense_id: payment.expenseId,
    account_transaction_id: payment.accountTransactionId,
    status: payment.status,
    is_late: payment.isLate,
    days_late: payment.daysLate,
    notes: payment.notes,
    created_at: toNaiveIso(payment.createdAt),
  };
}

export type InstallmentResponse = ReturnType<typeof toInstallmentOrm>;
export type InstallmentPaymentResponse = ReturnType<
  typeof toInstallmentPaymentResponse
>;
