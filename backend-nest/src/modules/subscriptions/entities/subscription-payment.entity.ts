import { BeforeInsert, Column, Entity, PrimaryColumn } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { naiveUtcNow } from '../../../common/entities/naive-timestamp.entity';

/**
 * Does NOT extend NaiveTimestampModel: this table has created_at but no updated_at, so the base
 * class would try to write a column that does not exist.
 */
@Entity('subscription_payments')
export class SubscriptionPayment {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  subscriptionId!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'varchar' })
  paymentDate!: string;

  @Column({ type: 'varchar', nullable: true })
  periodStart!: string | null;

  /** payment_date + one period - 1 day, at the same time of day. */
  @Column({ type: 'varchar', nullable: true })
  periodEnd!: string | null;

  /** The mirror expense. ON DELETE SET NULL. */
  @Column({ type: 'uuid', nullable: true })
  expenseId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  accountTransactionId!: string | null;

  /** Always written as 'completed'; no other value is produced by any code path. */
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
