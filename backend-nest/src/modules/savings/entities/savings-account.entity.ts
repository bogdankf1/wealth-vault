import { BeforeInsert, Column, Entity, PrimaryColumn } from 'typeorm';
import { randomUUID } from 'node:crypto';

/**
 * PARTIAL entity — Phase 1 maps only what income's deposit path touches; Phase 3 owns this module
 * and will extend it.
 *
 * It deliberately does NOT extend BaseModel: this table's created_at/updated_at are `timestamp
 * WITHOUT time zone` and there is no deleted_at column at all, so BaseModel's timestamptz columns
 * would be wrong and its @DeleteDateColumn would append `deleted_at IS NULL` to every query against
 * a column that does not exist — every read would throw.
 */
@Entity('savings_accounts')
export class SavingsAccount {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 20 })
  accountType!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  currentBalance!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'varchar', length: 20 })
  interestFrequency!: string;

  @Column({ type: 'varchar', length: 20 })
  interestAccrualMethod!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  accruedInterest!: string;

  @Column({ type: 'boolean' })
  isActive!: boolean;

  @Column({ type: 'varchar' })
  createdAt!: string;

  @Column({ type: 'varchar' })
  updatedAt!: string;

  @BeforeInsert()
  generateId(): void {
    if (!this.id) this.id = randomUUID();
  }
}
