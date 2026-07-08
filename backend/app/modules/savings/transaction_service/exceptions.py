"""
Exceptions raised by the transaction service.
"""


class InsufficientFundsError(Exception):
    """Raised when account has insufficient funds for withdrawal/transfer."""
    pass


class AccountNotFoundError(Exception):
    """Raised when account is not found."""
    pass


class InvalidTransactionError(Exception):
    """Raised when transaction parameters are invalid."""
    pass
