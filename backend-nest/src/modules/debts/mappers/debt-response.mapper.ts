import { naiveUtcNow } from '../../../common/entities/naive-timestamp.entity';
import { toNaiveIso } from '../../../common/time/naive-timestamp';
import {
  amountRemaining,
  isOverdue,
  progressPercentage,
  totalWithInterest,
} from '../debt-computed';
import { Debt } from '../entities/debt.entity';
import { DebtPayment } from '../entities/debt-payment.entity';

export interface DebtDisplay {
  displayAmount: string | null;
  displayAmountPaid: string | null;
  displayCurrency: string | null;
}

/**
 * Key order matches pydantic's: DebtBase fields, then DebtResponse's own, then the four
 * @computed_field properties — which pydantic always serializes last, after every declared field.
 */
export function toDebtResponse(
  row: Debt,
  display: DebtDisplay,
  now = naiveUtcNow(),
) {
  return {
    debtor_name: row.debtorName,
    description: row.description,
    amount: row.amount,
    amount_paid: row.amountPaid,
    currency: row.currency,
    is_active: row.isActive,
    is_paid: row.isPaid,
    due_date: toNaiveIso(row.dueDate),
    paid_date: toNaiveIso(row.paidDate),
    notes: row.notes,
    deposit_account_id: row.depositAccountId,
    auto_deposit: row.autoDeposit,
    interest_rate: row.interestRate,
    reminder_days_before: row.reminderDaysBefore,
    next_payment_date: toNaiveIso(row.nextPaymentDate),
    payment_frequency: row.paymentFrequency,
    expected_payment_amount: row.expectedPaymentAmount,
    id: row.id,
    user_id: row.userId,
    created_at: toNaiveIso(row.createdAt),
    updated_at: toNaiveIso(row.updatedAt),
    accrued_interest: row.accruedInterest,
    display_amount: display.displayAmount,
    display_amount_paid: display.displayAmountPaid,
    display_currency: display.displayCurrency,
    is_overdue: isOverdue(row.isPaid, row.dueDate, now),
    progress_percentage: progressPercentage(row.amount, row.amountPaid),
    amount_remaining: amountRemaining(row.amount, row.amountPaid),
    total_with_interest: totalWithInterest(row.amount, row.accruedInterest),
  };
}

export function toDebtPaymentResponse(payment: DebtPayment) {
  return {
    amount: payment.amount,
    payment_date: toNaiveIso(payment.paymentDate),
    principal_amount: payment.principalAmount,
    interest_amount: payment.interestAmount,
    notes: payment.notes,
    id: payment.id,
    debt_id: payment.debtId,
    user_id: payment.userId,
    currency: payment.currency,
    balance_before: payment.balanceBefore,
    balance_after: payment.balanceAfter,
    account_transaction_id: payment.accountTransactionId,
    status: payment.status,
    created_at: toNaiveIso(payment.createdAt),
  };
}

export type DebtResponse = ReturnType<typeof toDebtResponse>;
export type DebtPaymentResponse = ReturnType<typeof toDebtPaymentResponse>;
