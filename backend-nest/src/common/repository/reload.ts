import { EntityManager, ObjectLiteral } from 'typeorm';
import { EntityTarget } from 'typeorm/common/EntityTarget';

/**
 * Re-reads a row after writing it, which is what `await db.refresh(obj)` does in FastAPI — and it
 * is not cosmetic. Numeric columns are declared `numeric(12,2)`, so Postgres re-scales whatever was
 * inserted: a Decimal('0') written by the code comes back as '0.00', and an amount posted as '5'
 * comes back as '5.00'. Returning the in-memory value instead would answer '0' and '5', which is a
 * byte difference on every response built from a freshly written row.
 *
 * Every FastAPI create/update path in taxes and debts either refreshes or re-selects before
 * serializing, so every equivalent path here has to reload too.
 */
export async function reload<T extends ObjectLiteral>(
  manager: EntityManager,
  entity: EntityTarget<T>,
  id: string,
): Promise<T> {
  return manager.findOneOrFail(entity, {
    where: { id } as never,
  });
}
