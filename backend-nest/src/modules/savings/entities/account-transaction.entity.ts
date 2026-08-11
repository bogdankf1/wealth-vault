import { BeforeInsert, Column, Entity, PrimaryColumn } from 'typeorm';
import { randomUUID } from 'node:crypto';

/**
 * PARTIAL entity — Phase 3 owns it. Unlike savings_accounts, every timestamp on this table IS
 * timezone-aware, so these stay Date. Check the column type before assuming either way; this schema
 * mixes the two within one module.
 */
@Entity('account_transactions')
export class AccountTransaction {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  accountId!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  /** 'deposit' | 'withdrawal' | … — stored lowercase here (TransactionType.DEPOSIT.value). */
  @Column({ type: 'varchar', length: 20 })
  transactionType!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  balanceBefore!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  balanceAfter!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  sourceType!: string | null;

  @Column({ type: 'uuid', nullable: true })
  sourceId!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  category!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  referenceNumber!: string | null;

  @Column({ type: 'timestamptz' })
  transactionDate!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  postedDate!: Date | null;

  @Column({ type: 'varchar', length: 20 })
  status!: string;

  @Column({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'timestamptz' })
  updatedAt!: Date;

  @BeforeInsert()
  generateId(): void {
    if (!this.id) this.id = randomUUID();
  }
}
