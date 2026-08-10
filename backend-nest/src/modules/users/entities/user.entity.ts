import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../../../common/entities/base.entity';
import { Tier } from '../../tiers/entities/tier.entity';

/** Stored as varchar(20) — SQLAlchemy uses native_enum=False. */
export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
}

@Entity('users')
export class User extends BaseModel {
  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  avatarUrl!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  googleId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  appleId!: string | null;

  @Column({ type: 'varchar', length: 20 })
  role!: UserRole;

  @Column({ type: 'uuid', nullable: true })
  tierId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  stripeCustomerId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  stripeSubscriptionId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  paypalSubscriptionId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  paddleSubscriptionId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  paddleCustomerId!: string | null;

  @Column({ type: 'boolean' })
  isDemo!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  demoExpiresAt!: Date | null;

  // persistence: false — tierId is the write path; setting .tier on save() would silently
  // override tierId with a different value if the two ever disagreed (see tier-feature.entity.ts).
  @ManyToOne(() => Tier, { nullable: true, persistence: false })
  @JoinColumn({ name: 'tier_id' })
  tier!: Tier | null;

  isAdmin(): boolean {
    return this.role === UserRole.ADMIN;
  }
}
