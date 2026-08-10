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

  // The user row uses withDeleted for the same reason; the tier_features/features relations keep
  // TypeORM's automatic filtering because FastAPI filters those explicitly.
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
