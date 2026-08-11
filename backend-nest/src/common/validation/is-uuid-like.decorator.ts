import { applyDecorators } from '@nestjs/common';
import { Matches } from 'class-validator';

/**
 * Python's uuid.UUID — and therefore pydantic — accepts any 8-4-4-4-12 hex string. class-validator's
 * @IsUUID() defers to validator.js, whose 'all' pattern now demands a valid version nibble
 * ([1-8]) and variant ([89AB]), so it rejects ids this database actually contains: the seeded demo
 * users are 00000000-0000-0000-0000-0000000000d1 and ...d2, and the nil UUID is likewise refused.
 * Using @IsUUID() would 422 requests that FastAPI answers normally.
 *
 * Nest's own ParseUUIDPipe with version 'all' is already permissive, so path params need no
 * equivalent workaround — this is only for body and query fields.
 */
export const UUID_LIKE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function IsUuidLike(): PropertyDecorator {
  return applyDecorators(
    Matches(UUID_LIKE_PATTERN, { message: 'must be a valid UUID' }),
  );
}
