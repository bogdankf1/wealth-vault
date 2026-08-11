import { BeforeInsert, Column, PrimaryColumn } from 'typeorm';
import { randomUUID } from 'node:crypto';

/** Postgres-style UTC-naive text: '2026-08-11 10:00:00.123456'. */
export function naiveUtcNow(now: Date = new Date()): string {
  return now.toISOString().replace('T', ' ').replace('Z', '');
}

/**
 * Base for tables whose created_at/updated_at are `timestamp WITHOUT time zone` — expenses,
 * savings_accounts, goals and friends. BaseModel cannot serve them: its columns are timestamptz,
 * and its @DeleteDateColumn would hand TypeORM a Date, which node-postgres serializes with a local
 * offset that Postgres then truncates to local wall clock — three hours off FastAPI's
 * datetime.utcnow() on this machine.
 *
 * The columns are `varchar` for the reason established in Phase 1: TypeORM re-hydrates anything it
 * considers a date column through `new Date(value)` regardless of what the driver returned, which
 * reinterprets naive text in the process timezone.
 */
export abstract class NaiveTimestampModel {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  createdAt!: string;

  @Column({ type: 'varchar' })
  updatedAt!: string;

  @BeforeInsert()
  initialise(): void {
    if (!this.id) this.id = randomUUID();
    const now = naiveUtcNow();
    if (!this.createdAt) this.createdAt = now;
    if (!this.updatedAt) this.updatedAt = now;
  }
}
