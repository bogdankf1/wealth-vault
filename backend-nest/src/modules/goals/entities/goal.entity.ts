import { BeforeInsert, Column, Entity, PrimaryColumn } from 'typeorm';
import { randomUUID } from 'node:crypto';

/**
 * PARTIAL entity — Phase 3 owns it. Like savings_accounts: naive created_at/updated_at, no
 * deleted_at, so no BaseModel.
 */
@Entity('goals')
export class Goal {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  targetAmount!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  currentAmount!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'varchar' })
  startDate!: string;

  @Column({ type: 'varchar', nullable: true })
  targetDate!: string | null;

  @Column({ type: 'boolean' })
  isActive!: boolean;

  @Column({ type: 'boolean' })
  isCompleted!: boolean;

  @Column({ type: 'varchar', nullable: true })
  completedAt!: string | null;

  @Column({ type: 'boolean' })
  autoTrackProgress!: boolean;

  // numeric(5,2) — anything at or above 1000 overflows the column, which is why the distribution
  // path caps progress at 100 (FastAPI's inline update does not, and can 500 mid-distribution).
  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  progressPercentage!: string | null;

  @Column({ type: 'varchar' })
  createdAt!: string;

  @Column({ type: 'varchar' })
  updatedAt!: string;

  @BeforeInsert()
  generateId(): void {
    if (!this.id) this.id = randomUUID();
  }
}
