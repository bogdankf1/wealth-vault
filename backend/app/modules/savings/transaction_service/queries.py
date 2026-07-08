"""
Read-only transaction and transfer listing queries.
"""
from datetime import datetime
from typing import Optional, List, Tuple
from uuid import UUID

from sqlalchemy import select, func

from app.modules.savings.models import AccountTransaction, AccountTransfer


class QueriesMixin:
    """Transaction/transfer listing methods for :class:`TransactionService`."""

    async def get_transactions(
        self,
        account_id: UUID,
        user_id: UUID,
        page: int = 1,
        page_size: int = 50,
        transaction_type: Optional[str] = None,
        source_type: Optional[str] = None,
        search: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> Tuple[List[AccountTransaction], int]:
        """
        Get transactions for an account with filtering and pagination.

        Returns:
            Tuple of (transactions list, total count)
        """
        # Verify account belongs to user
        await self.get_account(account_id, user_id)

        # Build query
        query = select(AccountTransaction).where(
            AccountTransaction.account_id == account_id
        )

        if transaction_type:
            query = query.where(AccountTransaction.transaction_type == transaction_type)

        if source_type:
            query = query.where(AccountTransaction.source_type == source_type)

        if search:
            query = query.where(AccountTransaction.description.ilike(f"%{search}%"))

        if start_date:
            query = query.where(AccountTransaction.transaction_date >= start_date)

        if end_date:
            query = query.where(AccountTransaction.transaction_date <= end_date)

        # Get total count
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        # Apply pagination and ordering
        # Sort by transaction_date first, then by created_at to ensure newest transactions
        # appear first when dates are the same (e.g., backdated or same-day transactions)
        query = query.order_by(
            AccountTransaction.transaction_date.desc(),
            AccountTransaction.created_at.desc()
        )
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(query)
        transactions = list(result.scalars().all())

        return transactions, total

    async def get_transfers(
        self,
        user_id: UUID,
        account_id: Optional[UUID] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> Tuple[List[AccountTransfer], int]:
        """
        Get transfers for a user, optionally filtered by account.

        Returns:
            Tuple of (transfers list, total count)
        """
        query = select(AccountTransfer).where(AccountTransfer.user_id == user_id)

        if account_id:
            query = query.where(
                (AccountTransfer.from_account_id == account_id) |
                (AccountTransfer.to_account_id == account_id)
            )

        # Get total count
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        # Apply pagination and ordering
        query = query.order_by(
            AccountTransfer.transfer_date.desc(),
            AccountTransfer.created_at.desc()
        )
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(query)
        transfers = list(result.scalars().all())

        return transfers, total
