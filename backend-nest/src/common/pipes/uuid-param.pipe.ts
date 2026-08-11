import { ParseUUIDPipe } from '@nestjs/common';
import { DetailException } from '../exceptions/app.exception';

/**
 * Nest's ParseUUIDPipe throws a 400; FastAPI answers a malformed path UUID with a 422 carrying
 * pydantic's validation-error array. Shape matches, wording doesn't — the same accepted deviation
 * as every other 422 message in this port.
 */
export function uuidParam(name: string): ParseUUIDPipe {
  return new ParseUUIDPipe({
    exceptionFactory: () =>
      new DetailException(422, [
        {
          type: 'uuid_parsing',
          loc: ['path', name],
          msg: 'Input should be a valid UUID',
        },
      ]),
  });
}
