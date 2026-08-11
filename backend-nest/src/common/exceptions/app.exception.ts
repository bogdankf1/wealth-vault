/** Mirrors backend/app/core/exceptions.py — rendered as {error, details, status_code}. */
export class AppException extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export class NotFoundException extends AppException {
  constructor(
    message = 'Resource not found',
    details: Record<string, unknown> = {},
  ) {
    super(message, 404, details);
  }
}

export class UnauthorizedException extends AppException {
  constructor(message = 'Unauthorized', details: Record<string, unknown> = {}) {
    super(message, 401, details);
  }
}

export class ForbiddenException extends AppException {
  constructor(message = 'Forbidden', details: Record<string, unknown> = {}) {
    super(message, 403, details);
  }
}

export class BadRequestException extends AppException {
  constructor(message = 'Bad request', details: Record<string, unknown> = {}) {
    super(message, 400, details);
  }
}

export class ConflictException extends AppException {
  constructor(message = 'Conflict', details: Record<string, unknown> = {}) {
    super(message, 409, details);
  }
}

export class TierLimitException extends AppException {
  constructor(
    message = 'Tier limit exceeded',
    currentTier = '',
    requiredTier = '',
    details: Record<string, unknown> = {},
  ) {
    super(message, 403, {
      ...details,
      current_tier: currentTier,
      required_tier: requiredTier,
    });
  }
}

/**
 * Mirrors FastAPI's HTTPException — rendered as {detail}.
 *
 * `detail` is whatever was handed to HTTPException: a string for most errors, an array for the 422
 * validation shape, or a plain object — which POST /taxes/{id}/pay uses to return a structured
 * INSUFFICIENT_FUNDS body.
 */
export class DetailException extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly detail:
      string | Array<Record<string, unknown>> | Record<string, unknown>,
  ) {
    super(typeof detail === 'string' ? detail : 'Validation error');
  }
}
