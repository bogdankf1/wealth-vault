import { BeforeInsert, Column, Entity, PrimaryColumn } from 'typeorm';
import { randomUUID } from 'node:crypto';

/**
 * PARTIAL entity — Phase 3 owns it. No user_id column: rows are reached only through an account
 * that has already been ownership-checked, which is why this one is not an OwnedRepository.
 */
@Entity('balance_history')
export class BalanceHistory {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  accountId!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  balance!: string;

  @Column({ type: 'varchar' })
  date!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  changeAmount!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  changeReason!: string | null;

  @Column({ type: 'varchar' })
  createdAt!: string;

  @BeforeInsert()
  generateId(): void {
    if (!this.id) this.id = randomUUID();
  }
}
