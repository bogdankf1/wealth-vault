import { Column, Entity } from 'typeorm';
import { NaiveTimestampModel } from '../../../common/entities/naive-timestamp.entity';

/**
 * Has created_at AND updated_at (unlike subscription/installment/debt payments), so the base class
 * fits. No deleted_at — DELETE /taxes/payments/{id} is a hard delete.
 */
@Entity('tax_payments')
export class TaxPayment extends NaiveTimestampModel {
  @Column({ type: 'uuid' })
  taxId!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'varchar' })
  paymentDate!: string;

  // Left NULL by /pay even though the period is known at that point — only the explicit
  // POST /payments endpoint ever fills these in.
  @Column({ type: 'varchar', nullable: true })
  periodStart!: string | null;

  @Column({ type: 'varchar', nullable: true })
  periodEnd!: string | null;

  @Column({ type: 'uuid', nullable: true })
  accountTransactionId!: string | null;

  /** pending | completed | failed — always 'completed' in practice. */
  @Column({ type: 'varchar', length: 20 })
  status!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}
