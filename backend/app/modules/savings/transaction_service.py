"""
Transaction service for savings accounts.
Handles deposits, withdrawals, transfers, and interest calculations.
"""
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional, List, Dict, Any, Tuple
from uuid import UUID
import logging

from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.savings.models import (
    SavingsAccount,
    AccountTransaction,
    AccountTransfer,
    BalanceHistory,
    TransactionType,
    TransactionStatus,
)
from app.core.events import event_dispatcher, SavingsEvents

logger = logging.getLogger(__name__)


class InsufficientFundsError(Exception):
    """Raised when account has insufficient funds for withdrawal/transfer."""
    pass


class AccountNotFoundError(Exception):
    """Raised when account is not found."""
    pass


class InvalidTransactionError(Exception):
    """Raised when transaction parameters are invalid."""
    pass


class TransactionService:
    """Service for handling account transactions."""

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

    async def create_deposit(
        self,
        account_id: UUID,
        user_id: UUID,
        amount: Decimal,
        description: Optional[str] = None,
        source_type: Optional[str] = "manual",
        source_id: Optional[UUID] = None,
        transaction_date: Optional[datetime] = None,
        category: Optional[str] = None,
        reference_number: Optional[str] = None,
    ) -> AccountTransaction:
        """
        Create a deposit transaction.

        Args:
            account_id: Target account UUID
            user_id: User UUID
            amount: Deposit amount (must be positive)
            description: Optional description
            source_type: Source of deposit (manual, income, transfer, etc.)
            source_id: ID of source record if applicable
            transaction_date: Date of transaction (defaults to now)
            category: Optional category
            reference_number: Optional reference number

        Returns:
            Created AccountTransaction

        Raises:
            AccountNotFoundError: If account not found
            InvalidTransactionError: If amount is invalid
        """
        if amount <= 0:
            raise InvalidTransactionError("Deposit amount must be positive")

        account = await self.get_account(account_id, user_id)

        balance_before = Decimal(str(account.current_balance))
        balance_after = balance_before + amount

        now = datetime.now(timezone.utc)
        # Ensure transaction_date is timezone-aware
        if transaction_date:
            txn_date = transaction_date.replace(tzinfo=timezone.utc) if transaction_date.tzinfo is None else transaction_date
        else:
            txn_date = now

        transaction = AccountTransaction(
            account_id=account_id,
            user_id=user_id,
            transaction_type=TransactionType.DEPOSIT.value,
            amount=amount,
            currency=account.currency,
            balance_before=balance_before,
            balance_after=balance_after,
            source_type=source_type,
            source_id=source_id,
            description=description,
            category=category,
            reference_number=reference_number,
            transaction_date=txn_date,
            posted_date=now,
            status=TransactionStatus.COMPLETED.value,
        )

        # Update account balance
        account.current_balance = balance_after
        account.updated_at = now.replace(tzinfo=None)

        self.db.add(transaction)

        # Record balance history
        await self._record_balance_history(account, amount, "Deposit")

        await self.db.commit()
        await self.db.refresh(transaction)

        # Dispatch event
        await event_dispatcher.dispatch(
            SavingsEvents.DEPOSIT,
            user_id=user_id,
            account_id=str(account_id),
            account_name=account.name,
            amount=float(amount),
            currency=account.currency,
            new_balance=float(balance_after),
        )

        logger.info(f"Deposit of {amount} to account {account_id} completed")
        return transaction

    async def create_withdrawal(
        self,
        account_id: UUID,
        user_id: UUID,
        amount: Decimal,
        description: Optional[str] = None,
        source_type: Optional[str] = "manual",
        source_id: Optional[UUID] = None,
        transaction_date: Optional[datetime] = None,
        category: Optional[str] = None,
        reference_number: Optional[str] = None,
        allow_negative: bool = False,
    ) -> AccountTransaction:
        """
        Create a withdrawal transaction.

        Args:
            account_id: Source account UUID
            user_id: User UUID
            amount: Withdrawal amount (must be positive)
            description: Optional description
            source_type: Reason for withdrawal (manual, expense, transfer, etc.)
            source_id: ID of source record if applicable
            transaction_date: Date of transaction (defaults to now)
            category: Optional category
            reference_number: Optional reference number
            allow_negative: Allow balance to go negative (default False)

        Returns:
            Created AccountTransaction

        Raises:
            AccountNotFoundError: If account not found
            InvalidTransactionError: If amount is invalid
            InsufficientFundsError: If insufficient balance
        """
        if amount <= 0:
            raise InvalidTransactionError("Withdrawal amount must be positive")

        account = await self.get_account(account_id, user_id)

        balance_before = Decimal(str(account.current_balance))
        balance_after = balance_before - amount

        if balance_after < 0 and not allow_negative:
            raise InsufficientFundsError(
                f"Insufficient funds. Available: {balance_before}, Requested: {amount}"
            )

        now = datetime.now(timezone.utc)
        # Ensure transaction_date is timezone-aware
        if transaction_date:
            txn_date = transaction_date.replace(tzinfo=timezone.utc) if transaction_date.tzinfo is None else transaction_date
        else:
            txn_date = now

        transaction = AccountTransaction(
            account_id=account_id,
            user_id=user_id,
            transaction_type=TransactionType.WITHDRAWAL.value,
            amount=amount,
            currency=account.currency,
            balance_before=balance_before,
            balance_after=balance_after,
            source_type=source_type,
            source_id=source_id,
            description=description,
            category=category,
            reference_number=reference_number,
            transaction_date=txn_date,
            posted_date=now,
            status=TransactionStatus.COMPLETED.value,
        )

        # Update account balance
        account.current_balance = balance_after
        account.updated_at = now.replace(tzinfo=None)

        self.db.add(transaction)

        # Record balance history
        await self._record_balance_history(account, -amount, "Withdrawal")

        await self.db.commit()
        await self.db.refresh(transaction)

        # Dispatch event
        await event_dispatcher.dispatch(
            SavingsEvents.WITHDRAWAL,
            user_id=user_id,
            account_id=str(account_id),
            account_name=account.name,
            amount=float(amount),
            currency=account.currency,
            new_balance=float(balance_after),
        )

        logger.info(f"Withdrawal of {amount} from account {account_id} completed")
        return transaction

    async def create_transfer(
        self,
        from_account_id: UUID,
        to_account_id: UUID,
        user_id: UUID,
        amount: Decimal,
        description: Optional[str] = None,
        exchange_rate: Optional[Decimal] = None,
        transfer_date: Optional[datetime] = None,
    ) -> AccountTransfer:
        """
        Transfer funds between two accounts.

        Args:
            from_account_id: Source account UUID
            to_account_id: Destination account UUID
            user_id: User UUID
            amount: Transfer amount (must be positive)
            description: Optional description
            exchange_rate: Exchange rate if cross-currency transfer
            transfer_date: Date of transfer (defaults to now)

        Returns:
            Created AccountTransfer

        Raises:
            AccountNotFoundError: If either account not found
            InvalidTransactionError: If amount is invalid or same account
            InsufficientFundsError: If insufficient balance in source account
        """
        if amount <= 0:
            raise InvalidTransactionError("Transfer amount must be positive")

        if from_account_id == to_account_id:
            raise InvalidTransactionError("Cannot transfer to the same account")

        from_account = await self.get_account(from_account_id, user_id)
        to_account = await self.get_account(to_account_id, user_id)

        from_balance_before = Decimal(str(from_account.current_balance))

        if from_balance_before < amount:
            raise InsufficientFundsError(
                f"Insufficient funds. Available: {from_balance_before}, Requested: {amount}"
            )

        now = datetime.now(timezone.utc)
        # Ensure transfer_date is timezone-aware
        if transfer_date:
            txn_date = transfer_date.replace(tzinfo=timezone.utc) if transfer_date.tzinfo is None else transfer_date
        else:
            txn_date = now

        # Calculate converted amount for cross-currency transfers
        is_cross_currency = from_account.currency != to_account.currency
        converted_amount = amount

        if is_cross_currency:
            if not exchange_rate:
                raise InvalidTransactionError(
                    "Exchange rate required for cross-currency transfer"
                )
            converted_amount = amount * exchange_rate

        # Create withdrawal transaction from source account
        from_balance_after = from_balance_before - amount
        from_txn = AccountTransaction(
            account_id=from_account_id,
            user_id=user_id,
            transaction_type=TransactionType.TRANSFER_OUT.value,
            amount=amount,
            currency=from_account.currency,
            balance_before=from_balance_before,
            balance_after=from_balance_after,
            source_type="transfer",
            description=description or f"Transfer to {to_account.name}",
            transaction_date=txn_date,
            posted_date=now,
            status=TransactionStatus.COMPLETED.value,
        )
        self.db.add(from_txn)

        # Create deposit transaction to destination account
        to_balance_before = Decimal(str(to_account.current_balance))
        to_balance_after = to_balance_before + converted_amount
        to_txn = AccountTransaction(
            account_id=to_account_id,
            user_id=user_id,
            transaction_type=TransactionType.TRANSFER_IN.value,
            amount=converted_amount,
            currency=to_account.currency,
            balance_before=to_balance_before,
            balance_after=to_balance_after,
            source_type="transfer",
            description=description or f"Transfer from {from_account.name}",
            transaction_date=txn_date,
            posted_date=now,
            status=TransactionStatus.COMPLETED.value,
        )
        self.db.add(to_txn)

        # Update account balances
        from_account.current_balance = from_balance_after
        from_account.updated_at = now.replace(tzinfo=None)
        to_account.current_balance = to_balance_after
        to_account.updated_at = now.replace(tzinfo=None)

        # Flush to get transaction IDs
        await self.db.flush()

        # Create transfer record
        transfer = AccountTransfer(
            user_id=user_id,
            from_account_id=from_account_id,
            to_account_id=to_account_id,
            amount=amount,
            from_currency=from_account.currency,
            to_currency=to_account.currency if is_cross_currency else None,
            exchange_rate=exchange_rate if is_cross_currency else None,
            converted_amount=converted_amount if is_cross_currency else None,
            from_transaction_id=from_txn.id,
            to_transaction_id=to_txn.id,
            description=description,
            transfer_date=txn_date,
            status=TransactionStatus.COMPLETED.value,
        )
        self.db.add(transfer)

        # Record balance history
        await self._record_balance_history(from_account, -amount, f"Transfer to {to_account.name}")
        await self._record_balance_history(to_account, converted_amount, f"Transfer from {from_account.name}")

        await self.db.commit()
        await self.db.refresh(transfer)

        # Dispatch events
        await event_dispatcher.dispatch(
            SavingsEvents.TRANSFER,
            user_id=user_id,
            from_account_id=str(from_account_id),
            to_account_id=str(to_account_id),
            amount=float(amount),
            currency=from_account.currency,
        )

        logger.info(f"Transfer of {amount} from {from_account_id} to {to_account_id} completed")
        return transfer

    async def get_transactions(
        self,
        account_id: UUID,
        user_id: UUID,
        page: int = 1,
        page_size: int = 50,
        transaction_type: Optional[str] = None,
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

        if start_date:
            query = query.where(AccountTransaction.transaction_date >= start_date)

        if end_date:
            query = query.where(AccountTransaction.transaction_date <= end_date)

        # Get total count
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        # Apply pagination and ordering
        query = query.order_by(AccountTransaction.transaction_date.desc())
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
        query = query.order_by(AccountTransfer.transfer_date.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(query)
        transfers = list(result.scalars().all())

        return transfers, total

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
            "days_elapsed": days_elapsed,
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

    async def reverse_transaction(
        self,
        transaction_id: UUID,
        user_id: UUID,
        reason: Optional[str] = None,
    ) -> AccountTransaction:
        """
        Reverse a completed transaction by creating an offsetting transaction.
        """
        # Get original transaction
        result = await self.db.execute(
            select(AccountTransaction).where(
                and_(
                    AccountTransaction.id == transaction_id,
                    AccountTransaction.user_id == user_id,
                    AccountTransaction.status == TransactionStatus.COMPLETED.value,
                )
            )
        )
        original = result.scalar_one_or_none()

        if not original:
            raise InvalidTransactionError("Transaction not found or cannot be reversed")

        # Determine reversal type
        if original.transaction_type == TransactionType.DEPOSIT.value:
            reversal_type = TransactionType.WITHDRAWAL.value
        elif original.transaction_type == TransactionType.WITHDRAWAL.value:
            reversal_type = TransactionType.DEPOSIT.value
        else:
            raise InvalidTransactionError(
                f"Cannot reverse transaction type: {original.transaction_type}"
            )

        # Get account
        account = await self.get_account(original.account_id, user_id)
        now = datetime.now(timezone.utc)

        balance_before = Decimal(str(account.current_balance))
        if reversal_type == TransactionType.WITHDRAWAL.value:
            balance_after = balance_before - Decimal(str(original.amount))
        else:
            balance_after = balance_before + Decimal(str(original.amount))

        # Create reversal transaction
        reversal = AccountTransaction(
            account_id=original.account_id,
            user_id=user_id,
            transaction_type=reversal_type,
            amount=original.amount,
            currency=original.currency,
            balance_before=balance_before,
            balance_after=balance_after,
            source_type="reversal",
            source_id=original.id,
            description=reason or f"Reversal of transaction {transaction_id}",
            transaction_date=now,
            posted_date=now,
            status=TransactionStatus.COMPLETED.value,
        )

        # Mark original as reversed
        original.status = TransactionStatus.REVERSED.value

        # Update account balance
        account.current_balance = balance_after
        account.updated_at = now.replace(tzinfo=None)

        self.db.add(reversal)

        # Record balance history
        change = Decimal(str(original.amount)) if reversal_type == TransactionType.DEPOSIT.value else -Decimal(str(original.amount))
        await self._record_balance_history(account, change, f"Reversal: {reason or 'No reason provided'}")

        await self.db.commit()
        await self.db.refresh(reversal)

        logger.info(f"Reversed transaction {transaction_id}")
        return reversal
