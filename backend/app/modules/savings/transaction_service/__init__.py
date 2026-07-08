"""
Transaction service for savings accounts.
Handles deposits, withdrawals, transfers, and interest calculations.

Composed from cohesive mixins (see the sibling modules in this package):
- BaseTransactionService: session handle + shared helpers
- MutationsMixin:         deposits, withdrawals, transfers, reversals
- QueriesMixin:           transaction/transfer listings
- InterestMixin:          interest calculation, accrual, posting
"""
from app.modules.savings.transaction_service.exceptions import (
    InsufficientFundsError,
    AccountNotFoundError,
    InvalidTransactionError,
)
from app.modules.savings.transaction_service.base import BaseTransactionService, logger
from app.modules.savings.transaction_service.mutations import MutationsMixin
from app.modules.savings.transaction_service.queries import QueriesMixin
from app.modules.savings.transaction_service.interest import InterestMixin


class TransactionService(MutationsMixin, QueriesMixin, InterestMixin, BaseTransactionService):
    """Service for handling account transactions."""


__all__ = [
    "TransactionService",
    "InsufficientFundsError",
    "AccountNotFoundError",
    "InvalidTransactionError",
]
