import { Provider } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  EntityManager,
  EntityTarget,
  FindOptionsOrder,
  FindOptionsWhere,
  ObjectLiteral,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';

/**
 * The only DB handle a feature service is given. Every method takes the owner's id first and folds
 * `user_id = :userId` into the query, so "forgot to scope by user" stops being something a handler
 * can do by omission. FastAPI writes that predicate by hand ~40 times in the income module alone
 * and misses it in three places, one of which is a live cross-tenant read.
 *
 * Soft deletes need no handling here: entities carrying @DeleteDateColumn get `deleted_at IS NULL`
 * from TypeORM automatically, which is what every income query wants.
 */
export class OwnedRepository<T extends ObjectLiteral> {
  constructor(private readonly repo: Repository<T>) {}

  /** Rebind onto a transaction's EntityManager. Returns a new instance; this one is unchanged. */
  withManager(manager: EntityManager): OwnedRepository<T> {
    return new OwnedRepository<T>(manager.getRepository<T>(this.repo.target));
  }

  /** For inserts and saves, which have no owner-scoped form. Callers set userId explicitly. */
  get raw(): Repository<T> {
    return this.repo;
  }

  // userId goes last so a caller-supplied user_id in `where` cannot override the real owner.
  private scope(
    userId: string,
    where?: FindOptionsWhere<T>,
  ): FindOptionsWhere<T> {
    return { ...(where ?? {}), userId } as FindOptionsWhere<T>;
  }

  findOne(userId: string, where?: FindOptionsWhere<T>): Promise<T | null> {
    return this.repo.findOne({ where: this.scope(userId, where) });
  }

  find(
    userId: string,
    options: {
      where?: FindOptionsWhere<T>;
      order?: FindOptionsOrder<T>;
      skip?: number;
      take?: number;
    } = {},
  ): Promise<T[]> {
    const { where, ...rest } = options;
    return this.repo.find({ where: this.scope(userId, where), ...rest });
  }

  count(userId: string, where?: FindOptionsWhere<T>): Promise<number> {
    return this.repo.count({ where: this.scope(userId, where) });
  }

  /** Pre-scoped builder for the aggregate queries stats and history need. */
  qb(userId: string, alias: string): SelectQueryBuilder<T> {
    return this.repo
      .createQueryBuilder(alias)
      .andWhere(`${alias}.user_id = :ownerId`, { ownerId: userId });
  }
}

export function ownedRepositoryToken(
  entity: EntityTarget<ObjectLiteral>,
): string {
  return `OwnedRepository<${getRepositoryToken(entity).toString()}>`;
}

/** Module sugar: `providers: [provideOwnedRepository(IncomeSource), ...]`. */
export function provideOwnedRepository(
  entity: EntityTarget<ObjectLiteral>,
): Provider {
  return {
    provide: ownedRepositoryToken(entity),
    inject: [getRepositoryToken(entity)],
    useFactory: (repo: Repository<ObjectLiteral>) => new OwnedRepository(repo),
  };
}
