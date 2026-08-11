import type { DisplayValues } from '../../../common/currency/display-currency.service';
import { decMul, pyFloatMoney } from '../../../common/money/money';
import { toNaiveIso } from '../../../common/time/naive-timestamp';
import { Subscription } from '../entities/subscription.entity';
import { SubscriptionPayment } from '../entities/subscription-payment.entity';

/**
 * calculate_monthly_equivalent — the table used for display_monthly_equivalent. Note these are the
 * six-decimal string constants, NOT the float-derived ones /stats uses, and not the six-decimal
 * ones /history uses either. Three tables, three answers for the same subscription.
 */
export const DISPLAY_MONTHLY_MULTIPLIER: Record<string, string> = {
  monthly: '1',
  quarterly: '0.333333',
  biannually: '0.166667',
  annually: '0.083333',
};

export function monthlyEquivalent(amount: string, frequency: string): string {
  return decMul(amount, DISPLAY_MONTHLY_MULTIPLIER[frequency] ?? '1');
}

const noDisplay: DisplayValues = {
  displayAmount: null,
  displayCurrency: null,
  displayMonthlyEquivalent: null,
};

function common(subscription: Subscription) {
  return {
    id: subscription.id,
    user_id: subscription.userId,
    name: subscription.name,
    description: subscription.description,
    category: subscription.category,
    currency: subscription.currency,
    // Stored and emitted as the same lowercase value — no name/value split in this module.
    frequency: subscription.frequency,
    // Declared `str` on the response schema and filled by isoformat(), so these are strings while
    // created_at/updated_at are real datetimes. Both render naive.
    start_date: toNaiveIso(subscription.startDate),
    end_date: toNaiveIso(subscription.endDate),
    is_active: subscription.isActive,
    status: subscription.status,
    created_at: toNaiveIso(subscription.createdAt),
    updated_at: toNaiveIso(subscription.updatedAt),
    payment_account_id: subscription.paymentAccountId,
    auto_pay: subscription.autoPay,
    next_payment_date: toNaiveIso(subscription.nextPaymentDate),
    last_payment_date: toNaiveIso(subscription.lastPaymentDate),
    reminder_days_before: subscription.reminderDaysBefore,
    paused_at: toNaiveIso(subscription.pausedAt),
    resume_date: toNaiveIso(subscription.resumeDate),
  };
}

/**
 * create / update / pause / resume / cancel — these return the ORM object, so decimals keep their
 * DB scale and the display_* trio is never computed.
 */
export function toSubscriptionOrm(subscription: Subscription) {
  return {
    ...common(subscription),
    amount: subscription.amount,
    display_amount: noDisplay.displayAmount,
    display_currency: noDisplay.displayCurrency,
    display_monthly_equivalent: noDisplay.displayMonthlyEquivalent,
  };
}

/**
 * list and get-by-id — these hand-build a dict with float() casts which the response_model then
 * re-coerces to Decimal, so "20.00" in the database answers "20.0" on the wire.
 */
export function toSubscriptionFloat(
  subscription: Subscription,
  display: DisplayValues,
) {
  return {
    ...common(subscription),
    amount: pyFloatMoney(subscription.amount),
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

/** The payments list and the pay response both go through the float-cast path. */
export function toPaymentResponse(payment: SubscriptionPayment) {
  return {
    id: payment.id,
    subscription_id: payment.subscriptionId,
    user_id: payment.userId,
    amount: pyFloatMoney(payment.amount),
    currency: payment.currency,
    payment_date: toNaiveIso(payment.paymentDate),
    period_start: toNaiveIso(payment.periodStart),
    period_end: toNaiveIso(payment.periodEnd),
    expense_id: payment.expenseId,
    account_transaction_id: payment.accountTransactionId,
    status: payment.status,
    notes: payment.notes,
    created_at: toNaiveIso(payment.createdAt),
  };
}

export type SubscriptionResponse = ReturnType<typeof toSubscriptionOrm>;
export type SubscriptionPaymentResponse = ReturnType<typeof toPaymentResponse>;
