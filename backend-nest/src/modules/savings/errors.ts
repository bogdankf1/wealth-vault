export class AccountNotFoundError extends Error {}
export class InvalidTransactionError extends Error {}

/**
 * Extends Error rather than a validation error on purpose: FastAPI's InsufficientFundsError
 * subclasses Exception, not ValueError, which is why its router catches it in a separate arm and
 * renders a structured 400 body instead of the generic one.
 */
export class InsufficientFundsError extends Error {}
