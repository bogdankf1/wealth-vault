import { Column, Entity } from 'typeorm';
import { NaiveTimestampModel } from '../../../common/entities/naive-timestamp.entity';

/**
 * A debt is money owed TO the user — a receivable. Payments therefore DEPOSIT into a savings
 * account, the mirror image of what subscriptions and installments do. `deposit_account_id`, not
 * `payment_account_id`.
 *
 * Soft-deleted via deleted_at. `payment_frequency` is a bare varchar with no enum backing it, so
 * any string the client sends is stored as-is.
 */
@Entity('debts')
export class Debt extends NaiveTimestampModel {
  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 100 })
  debtorName!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amountPaid!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'boolean' })
  isActive!: boolean;

  @Column({ type: 'boolean' })
  isPaid!: boolean;

  @Column({ type: 'varchar', nullable: true })
  dueDate!: string | null;

  @Column({ type: 'varchar', nullable: true })
  paidDate!: string | null;

  @Column({ type: 'uuid', nullable: true })
  depositAccountId!: string | null;

  @Column({ type: 'boolean' })
  autoDeposit!: boolean;

  /** Annual rate as a PERCENT (0-100) — not the fraction savings_accounts stores. */
  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  interestRate!: string | null;

  // Never written by any ported endpoint; the interest accrual job (Phase 5) owns it. Still
  // serialized, and feeds total_with_interest.
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  accruedInterest!: string;

  @Column({ type: 'int' })
  reminderDaysBefore!: number;

  @Column({ type: 'varchar', nullable: true })
  lastReminderAt!: string | null;

  @Column({ type: 'varchar', nullable: true })
  nextPaymentDate!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  paymentFrequency!: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  expectedPaymentAmount!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'varchar', nullable: true })
  deletedAt!: string | null;
}
