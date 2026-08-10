import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tier } from '../tiers/entities/tier.entity';
import { User, UserRole } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
  ) {}

  // withDeleted: true mirrors FastAPI's get_current_user, which does not filter deleted_at.
  // Without it @DeleteDateColumn would auto-append `deleted_at IS NULL` and 401 a soft-deleted
  // user that FastAPI still authenticates. See the soft-delete parity rule at the top of this plan.
  //
  // Correction: withDeleted is a single flag on the query's expressionMap, not a per-entity
  // setting — TypeORM applies it identically to the root WHERE and to every joined relation.
  // So `withDeleted: true` here also disables `deleted_at IS NULL` on the joined `tier`, not
  // just on the user row. There is no way to withDeleted the root and still auto-filter a join
  // in the same find(). For findByIdWithTier/findByGoogleId this is harmless in practice (a
  // soft-deleted tier is not a case FastAPI's own query guards against either), but it is not
  // "the relation keeps normal filtering" as an earlier version of this comment claimed.
  findByIdWithTier(id: string): Promise<User | null> {
    return this.usersRepo.findOne({
      where: { id },
      relations: { tier: true },
      withDeleted: true,
    });
  }

  findByGoogleId(googleId: string): Promise<User | null> {
    return this.usersRepo.findOne({
      where: { googleId },
      relations: { tier: true },
      withDeleted: true,
    });
  }

  // The user row uses withDeleted for the same reason as above. IMPORTANT: withDeleted is a
  // single flag on the query's expressionMap, applied identically to the root WHERE and to
  // every join — it does NOT stop at the user row. It also disables `deleted_at IS NULL` on
  // the joined `tier`, `tierFeatures`, and `feature` rows, so this query can return
  // soft-deleted tier-feature grants and soft-deleted features, which FastAPI's
  // check_feature_access (permissions.py) filters out explicitly. TypeORM does NOT do this
  // filtering for you here, despite what an earlier version of this comment said.
  //
  // Mitigation lives at the call site, not this query: whoever consumes this result (Task 7's
  // getFeatures) must re-filter in code — `if (tf.feature && tf.enabled && !tf.deletedAt &&
  // !tf.feature.deletedAt)` — to restore FastAPI parity. Do not remove those checks under the
  // assumption the ORM already handled it.
  findByIdWithFeatures(id: string): Promise<User | null> {
    return this.usersRepo.findOne({
      where: { id },
      relations: { tier: { tierFeatures: { feature: true } } },
      withDeleted: true,
    });
  }

  // Takes the Tier entity, not a tierId string: TypeORM merges the scalar @Column and the
  // @JoinColumn into one ColumnMetadata object, and the relation always wins over the scalar
  // when both are set on a save() — so the relation is the only reliable write path
  // (see the FK write-path rule at the top of this plan).
  async createFromGoogle(input: {
    email: string;
    name: string | null;
    avatarUrl: string | null;
    googleId: string;
    tier: Tier;
  }): Promise<User> {
    const user = this.usersRepo.create({
      ...input,
      role: UserRole.USER,
      isDemo: false,
    });
    return this.usersRepo.save(user);
  }
}
