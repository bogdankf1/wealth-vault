import { BeforeInsert, Column, Entity, PrimaryColumn } from 'typeorm';
import { randomUUID } from 'node:crypto';

/** PARTIAL entity — Phase 3 owns it. */
@Entity('goal_progress_history')
export class GoalProgressHistory {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  goalId!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar' })
  recordedDate!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  currentAmount!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  targetAmount!: string;

  @Column({ type: 'numeric', precision: 5, scale: 2 })
  progressPercentage!: string;

  @Column({ type: 'jsonb', nullable: true })
  linkedAccountsSnapshot!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 30 })
  triggerType!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes!: string | null;

  @Column({ type: 'varchar' })
  createdAt!: string;

  @BeforeInsert()
  generateId(): void {
    if (!this.id) this.id = randomUUID();
  }
}
