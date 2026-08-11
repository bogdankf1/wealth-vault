import { Column, Entity } from 'typeorm';
import { NaiveTimestampModel } from '../../../common/entities/naive-timestamp.entity';

/**
 * Note what this module does NOT have: a deleted_at column. Deletes are hard, cascading to
 * subscription_payments. And unlike expenses, `frequency` and `status` are plain varchars holding
 * the LOWERCASE VALUE — the enum classes in models.py are declared but never bound to a column, so
 * the stored form and the wire form are the same string. Mapping them would corrupt rows.
 */
@Entity('subscriptions')
export class Subscription extends NaiveTimestampModel {
  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  category!: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  /** monthly | quarterly | annually | biannually — biannually means every SIX months. */
  @Column({ type: 'varchar', length: 20 })
  frequency!: string;

  @Column({ type: 'varchar' })
  startDate!: string;

  @Column({ type: 'varchar', nullable: true })
  endDate!: string | null;

  @Column({ type: 'boolean' })
  isActive!: boolean;

  /** active | paused | cancelled | expired | payment_failed */
  @Column({ type: 'varchar', length: 20 })
  status!: string;

  @Column({ type: 'uuid', nullable: true })
  paymentAccountId!: string | null;

  @Column({ type: 'boolean' })
  autoPay!: boolean;

  // Stored, not computed — unlike expenses, which derives its due date on every read.
  @Column({ type: 'varchar', nullable: true })
  nextPaymentDate!: string | null;

  @Column({ type: 'varchar', nullable: true })
  lastPaymentDate!: string | null;

  @Column({ type: 'int' })
  reminderDaysBefore!: number;

  @Column({ type: 'varchar', nullable: true })
  lastReminderAt!: string | null;

  @Column({ type: 'varchar', nullable: true })
  pausedAt!: string | null;

  /** Stored by /pause but never acted on — nothing auto-resumes. */
  @Column({ type: 'varchar', nullable: true })
  resumeDate!: string | null;
}
