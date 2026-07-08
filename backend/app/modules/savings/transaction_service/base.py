"""
Base helpers for the transaction service: session handle, account lookup,
and balance-history recording shared across the transaction mixins.
"""
import logging
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.savings.models import SavingsAccount, BalanceHistory
from app.modules.savings.transaction_service.exceptions import AccountNotFoundError

logger = logging.getLogger("app.modules.savings.transaction_service")


class BaseTransactionService:
    """Shared state and helpers for :class:`TransactionService`."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_account(self, account_id: UUID, user_id: UUID) -> SavingsAccount:
        """Get account by ID, ensuring it belongs to the user."""
        result = await self.db.execute(
            select(SavingsAccount).where(
                and_(
                    SavingsAccount.id == account_id,
                    SavingsAccount.user_id == user_id,
                    SavingsAccount.is_active == True
                )
            )
        )
        account = result.scalar_one_or_none()
        if not account:
            raise AccountNotFoundError(f"Account {account_id} not found")
        return account

    async def _record_balance_history(
        self,
        account: SavingsAccount,
        change_amount: Decimal,
        reason: str,
    ) -> BalanceHistory:
        """Record a balance history entry."""
        history = BalanceHistory(
            account_id=account.id,
            balance=account.current_balance,
            date=datetime.utcnow(),
            change_amount=change_amount,
            change_reason=reason,
        )
        self.db.add(history)
        return history
