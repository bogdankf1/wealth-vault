import { toNaiveIso } from '../../../common/time/naive-timestamp';
import { Tax } from '../entities/tax.entity';
import { TaxPayment } from '../entities/tax-payment.entity';

/** The per-request enrichment convert_tax_to_display_currency hangs off the ORM object. */
export interface TaxEnrichment {
  displayFixedAmount: string | null;
  displayCurrency: string | null;
  calculatedAmount: string | null;
  incomeSource: LinkedIncomeSource | null;
  paymentAccount: LinkedPaymentAccount | null;
  isPaidCurrentPeriod: boolean | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  lastPaymentDate: string | null;
  lastPaymentAmount: string | null;
}

export interface LinkedIncomeSource {
  id: string;
  name: string;
  amount: string;
  currency: string;
  frequency: string;
}

export interface LinkedPaymentAccount {
  id: string;
  name: string;
  current_balance: string;
  currency: string;
}

/**
 * Key order is load-bearing: pydantic emits base-class fields before subclass fields, so every
 * TaxBase field comes first and the enrichment block last. Reordering this file changes the bytes
 * on the wire even though the JSON is equivalent.
 */
export function toTaxResponse(row: Tax, enrichment: TaxEnrichment) {
  return {
    name: row.name,
    description: row.description,
    tax_type: row.taxType,
    frequency: row.frequency,
    fixed_amount: row.fixedAmount,
    currency: row.currency,
    percentage: row.percentage,
    income_source_id: row.incomeSourceId,
    payment_account_id: row.paymentAccountId,
    auto_pay: row.autoPay,
    next_payment_date: toNaiveIso(row.nextPaymentDate),
    is_active: row.isActive,
    notes: row.notes,
    id: row.id,
    user_id: row.userId,
    created_at: toNaiveIso(row.createdAt),
    updated_at: toNaiveIso(row.updatedAt),
    display_fixed_amount: enrichment.displayFixedAmount,
    display_currency: enrichment.displayCurrency,
    calculated_amount: enrichment.calculatedAmount,
    income_source: enrichment.incomeSource,
    payment_account: enrichment.paymentAccount,
    is_paid_current_period: enrichment.isPaidCurrentPeriod,
    current_period_start: toNaiveIso(enrichment.currentPeriodStart),
    current_period_end: toNaiveIso(enrichment.currentPeriodEnd),
    last_payment_date: toNaiveIso(enrichment.lastPaymentDate),
    last_payment_amount: enrichment.lastPaymentAmount,
  };
}

export function toTaxPaymentResponse(payment: TaxPayment) {
  return {
    id: payment.id,
    tax_id: payment.taxId,
    user_id: payment.userId,
    amount: payment.amount,
    currency: payment.currency,
    payment_date: toNaiveIso(payment.paymentDate),
    period_start: toNaiveIso(payment.periodStart),
    period_end: toNaiveIso(payment.periodEnd),
    account_transaction_id: payment.accountTransactionId,
    status: payment.status,
    notes: payment.notes,
    created_at: toNaiveIso(payment.createdAt),
    updated_at: toNaiveIso(payment.updatedAt),
  };
}

export type TaxResponse = ReturnType<typeof toTaxResponse>;
export type TaxPaymentResponse = ReturnType<typeof toTaxPaymentResponse>;
