import { Column, Entity } from 'typeorm';
import { NaiveTimestampModel } from '../../../common/entities/naive-timestamp.entity';

/** Same storage conventions as subscriptions: no deleted_at, lowercase-value varchar enums. */
@Entity('installments')
export class Installment extends NaiveTimestampModel {
  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  category!: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  totalAmount!: string;

  // Supplied by the client independently of totalAmount; the two are never cross-checked, and the
  // final instalment does not absorb any remainder.
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amountPerPayment!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  interestRate!: string | null;

  /** weekly | biweekly | monthly */
  @Column({ type: 'varchar', length: 20 })
  frequency!: string;

  @Column({ type: 'int' })
  numberOfPayments!: number;

  // Recomputed from the CALENDAR on every create and update, which overwrites whatever the payment
  // path recorded. FastAPI's behaviour, and observable: creating a 12x100 backdated two months
  // answers payments_made 3 immediately.
  @Column({ type: 'int' })
  paymentsMade!: number;

  @Column({ type: 'varchar' })
  startDate!: string;

  @Column({ type: 'varchar' })
  firstPaymentDate!: string;

  @Column({ type: 'varchar', nullable: true })
  endDate!: string | null;

  @Column({ type: 'boolean' })
  isActive!: boolean;

  /** active | completed | defaulted */
  @Column({ type: 'varchar', length: 20 })
  status!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  remainingBalance!: string | null;

  @Column({ type: 'uuid', nullable: true })
  paymentAccountId!: string | null;

  @Column({ type: 'boolean' })
  autoPay!: boolean;

  @Column({ type: 'varchar', nullable: true })
  nextPaymentDate!: string | null;

  @Column({ type: 'varchar', nullable: true })
  lastPaymentDate!: string | null;

  @Column({ type: 'int' })
  reminderDaysBefore!: number;

  @Column({ type: 'varchar', nullable: true })
  lastReminderAt!: string | null;
}
