import { Column, Entity } from 'typeorm';
import { NaiveTimestampModel } from '../../../common/entities/naive-timestamp.entity';
import type { ExpenseFrequencyName, ExpenseStatus } from '../enums';

/**
 * Every timestamp on this table is `timestamp WITHOUT time zone`, so it extends
 * NaiveTimestampModel rather than BaseModel, and the date columns are varchar-declared.
 *
 * `deletedAt` is a plain column, NOT @DeleteDateColumn: this module hard-deletes, and FastAPI
 * filters deleted_at on only 7 of its 15 endpoints. Automatic filtering would be wrong on the
 * other 8 (get/{id}, PUT, DELETE, cancel, pay, stats, history and the tier-limit counts all see
 * soft-deleted rows). The only writer of this column is the subscriptions/installments reversal
 * path, outside this module.
 */
@Entity('expenses')
export class Expense extends NaiveTimestampModel {
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

  // Native PG enum column, holding the member NAME ('MONTHLY'). Declared varchar so TypeORM binds
  // it as text and lets Postgres cast — which also means a wrong label fails loudly at the DB.
  @Column({ type: 'varchar' })
  frequency!: ExpenseFrequencyName;

  @Column({ type: 'varchar', nullable: true })
  date!: string | null;

  @Column({ type: 'varchar', nullable: true })
  startDate!: string | null;

  @Column({ type: 'varchar', nullable: true })
  endDate!: string | null;

  @Column({ type: 'boolean' })
  isActive!: boolean;

  @Column({ type: 'jsonb', nullable: true })
  tags!: string[] | null;

  // A stored column here, unlike income which computes its equivalent on every read.
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  monthlyEquivalent!: string | null;

  @Column({ type: 'uuid', nullable: true })
  paymentAccountId!: string | null;

  // Lowercase values, no name/value mapping — see the note in enums.ts.
  @Column({ type: 'varchar', length: 20 })
  status!: ExpenseStatus;

  @Column({ type: 'varchar', nullable: true })
  paidDate!: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  paidAmount!: string | null;

  @Column({ type: 'uuid', nullable: true })
  accountTransactionId!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  receiptUrl!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  paymentMethod!: string | null;

  @Column({ type: 'boolean' })
  autoPay!: boolean;

  @Column({ type: 'varchar', nullable: true })
  deletedAt!: string | null;
}
