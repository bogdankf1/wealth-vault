import { BeforeInsert, Column, Entity, PrimaryColumn } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { naiveUtcNow } from '../../../common/entities/naive-timestamp.entity';

/** created_at only, no updated_at — same shape as installment_payments, so no NaiveTimestampModel. */
@Entity('debt_payments')
export class DebtPayment {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  debtId!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'varchar' })
  paymentDate!: string;

  // The whole payment is booked as principal and interest is always zero — FastAPI never splits
  // them, even when the debt carries an interest_rate.
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  principalAmount!: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  interestAmount!: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  balanceBefore!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  balanceAfter!: string;

  /** NULL when the deposit failed — the payment is still recorded. */
  @Column({ type: 'uuid', nullable: true })
  accountTransactionId!: string | null;

  @Column({ type: 'varchar', length: 20 })
  status!: string;

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
