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

  // tierId and .tier (below) both write the same tier_id column, and there is no way to
  // make only one of them the write path — see .tier's comment for what was tried and why
  // it doesn't work.
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

  // DUAL-MAPPED COLUMN — READ THIS BEFORE SETTING tierId OR tier IN THE SAME save().
  // If both tierId and tier are set to conflicting values in one save(), tier silently
  // wins and the tierId assignment is discarded with no error (verified live: set
  // tierId=<growth id> and tier=<starter entity>, save(), and the persisted tier_id is
  // starter's — never growth's).
  //
  // insert:false/update:false on tierId does NOT fix this. TypeORM merges an explicit
  // @Column that shares a JoinColumn's database name into ONE physical ColumnMetadata
  // object — dataSource.getMetadata(User).columns confirms exactly one entry for
  // databaseName 'tier_id', and relations[].joinColumns[0] for `tier` points at that same
  // object. Marking it insert:false/update:false disables writes for BOTH the scalar and
  // the relation at once: verified live, an insert with only `tier` set (tierId untouched)
  // dropped tier_id from the generated INSERT column list entirely and persisted NULL.
  // There is no `persistence`/`insert`/`update` flag combination that makes one of the pair
  // the sole write path — they are the same underlying column.
  //
  // Practical rule until/unless this needs a custom subscriber: callers must only ever set
  // ONE of tierId or tier per save(), and must not mutate tierId after loading tier via
  // `relations: { tier: true }` (the stale tier object still wins and the tierId write is a
  // silent no-op, not an error — verified live).
  @ManyToOne(() => Tier, { nullable: true })
  @JoinColumn({ name: 'tier_id' })
  tier!: Tier | null;

  isAdmin(): boolean {
    return this.role === UserRole.ADMIN;
  }
}
