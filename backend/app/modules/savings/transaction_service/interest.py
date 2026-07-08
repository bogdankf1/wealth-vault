"""
Interest calculation, accrual, and posting.
"""
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, Dict, Any
from uuid import UUID

from app.modules.savings.models import (
    AccountTransaction,
    TransactionType,
    TransactionStatus,
)
from app.core.events import event_dispatcher, SavingsEvents

from app.modules.savings.transaction_service.base import logger


class InterestMixin:
    """Interest calculation/accrual/posting methods for :class:`TransactionService`."""

    async def calculate_interest(
        self,
        account_id: UUID,
        user_id: UUID,
    ) -> Dict[str, Any]:
        """
        Calculate pending interest for an account without posting it.

        Returns:
            Dict with interest calculation details
        """
        account = await self.get_account(account_id, user_id)

        if not account.interest_rate or account.interest_rate <= 0:
            return {
                "account_id": str(account_id),
                "has_interest": False,
                "accrued_interest": float(account.accrued_interest),
                "pending_interest": 0,
                "message": "Account has no interest rate configured"
            }

        now = datetime.now(timezone.utc)
        # Use timezone-aware datetimes for comparison
        last_accrual = account.last_interest_accrual or account.created_at

        # Ensure timezone awareness
        if last_accrual.tzinfo is None:
            last_accrual = last_accrual.replace(tzinfo=timezone.utc)

        # Calculate days since last accrual (use fractional days)
        time_elapsed = now - last_accrual
        days_elapsed = time_elapsed.total_seconds() / 86400
        if days_elapsed < 0.5:
            return {
                "account_id": str(account_id),
                "has_interest": True,
                "accrued_interest": float(account.accrued_interest),
                "pending_interest": 0,
                "days_elapsed": 0,
                "message": "Interest already calculated for today"
            }

        balance = Decimal(str(account.current_balance))
        rate = Decimal(str(account.interest_rate))
        accrued = Decimal(str(account.accrued_interest))

        # Calculate interest based on method
        if account.interest_accrual_method == "compound":
            # Compound interest: include accrued interest in calculation
            principal = balance + accrued
        else:
            # Simple interest: only on principal balance
            principal = balance

        # Daily interest rate (APY / 365)
        daily_rate = rate / Decimal("365")
        pending_interest = principal * daily_rate * Decimal(str(days_elapsed))

        return {
            "account_id": str(account_id),
            "has_interest": True,
            "balance": float(balance),
            "interest_rate": float(rate),
            "accrual_method": account.interest_accrual_method,
            "days_elapsed": int(days_elapsed),
            "accrued_interest": float(accrued),
            "pending_interest": float(pending_interest),
            "total_after_posting": float(accrued + pending_interest),
            "last_accrual_date": last_accrual.isoformat(),
        }

    async def accrue_interest(
        self,
        account_id: UUID,
        user_id: UUID,
    ) -> Dict[str, Any]:
        """
        Accrue (calculate and add to pending) interest for an account.
        Does not post to balance yet.
        """
        calculation = await self.calculate_interest(account_id, user_id)

        if not calculation.get("has_interest") or calculation.get("pending_interest", 0) <= 0:
            return calculation

        account = await self.get_account(account_id, user_id)
        now = datetime.now(timezone.utc)

        # Add pending interest to accrued
        pending = Decimal(str(calculation["pending_interest"]))
        account.accrued_interest = Decimal(str(account.accrued_interest)) + pending
        account.last_interest_accrual = now.replace(tzinfo=None)
        account.updated_at = now.replace(tzinfo=None)

        await self.db.commit()

        calculation["accrued_interest"] = float(account.accrued_interest)
        calculation["message"] = f"Accrued {float(pending):.2f} interest"

        logger.info(f"Accrued {pending} interest for account {account_id}")
        return calculation

    async def post_interest(
        self,
        account_id: UUID,
        user_id: UUID,
    ) -> Optional[AccountTransaction]:
        """
        Post accrued interest to account balance as a transaction.
        """
        account = await self.get_account(account_id, user_id)

        accrued = Decimal(str(account.accrued_interest))
        if accrued <= 0:
            return None

        now = datetime.now(timezone.utc)
        balance_before = Decimal(str(account.current_balance))
        balance_after = balance_before + accrued

        # Create interest transaction
        transaction = AccountTransaction(
            account_id=account_id,
            user_id=user_id,
            transaction_type=TransactionType.INTEREST.value,
            amount=accrued,
            currency=account.currency,
            balance_before=balance_before,
            balance_after=balance_after,
            source_type="interest",
            description=f"Interest payment ({account.interest_rate * 100:.2f}% APY)",
            transaction_date=now,
            posted_date=now,
            status=TransactionStatus.COMPLETED.value,
        )

        # Update account
        account.current_balance = balance_after
        account.accrued_interest = Decimal("0")
        account.updated_at = now.replace(tzinfo=None)

        self.db.add(transaction)

        # Record balance history
        await self._record_balance_history(account, accrued, "Interest")

        await self.db.commit()
        await self.db.refresh(transaction)

        # Dispatch event
        await event_dispatcher.dispatch(
            SavingsEvents.INTEREST_ACCRUED,
            user_id=user_id,
            account_id=str(account_id),
            account_name=account.name,
            interest_amount=float(accrued),
            currency=account.currency,
            new_balance=float(balance_after),
        )

        logger.info(f"Posted {accrued} interest to account {account_id}")
        return transaction
