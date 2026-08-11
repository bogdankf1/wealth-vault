import { BeforeInsert, Column, Entity, PrimaryColumn } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { naiveUtcNow } from '../../../common/entities/naive-timestamp.entity';

/** created_at only, no updated_at — same as subscription_payments, so no NaiveTimestampModel. */
@Entity('installment_payments')
export class InstallmentPayment {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  installmentId!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  // No unique constraint on (installment_id, payment_number) — duplicates are possible, and only
  // the backfill de-dupes, in application code.
  @Column({ type: 'int' })
  paymentNumber!: number;

  @Column({ type: 'varchar' })
  scheduledDate!: string;

  @Column({ type: 'varchar', nullable: true })
  actualPaymentDate!: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  scheduledAmount!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  actualAmount!: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  principalAmount!: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  interestAmount!: string | null;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'uuid', nullable: true })
  expenseId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  accountTransactionId!: string | null;

  /** Always 'completed' in practice. */
  @Column({ type: 'varchar', length: 20 })
  status!: string;

  @Column({ type: 'boolean' })
  isLate!: boolean;

  @Column({ type: 'int', nullable: true })
  daysLate!: number | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'varchar' })
  createdAt!: string;

  @BeforeInsert()
  initialise(): void {
    if (!this.id) this.id = randomUUID();
    if (!this.createdAt) this.createdAt = naiveUtcNow();
  }
}
