import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Mirrors backend/app/models/base.py: id, created_at, updated_at, deleted_at (soft delete). */
export abstract class BaseModel {
  @PrimaryColumn('uuid')
  id!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt!: Date | null;

  @BeforeInsert()
  generateId(): void {
    if (!this.id) this.id = randomUUID();
  }
}
