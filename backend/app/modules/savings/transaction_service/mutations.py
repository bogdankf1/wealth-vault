"""
Money-movement transactions: deposits, withdrawals, transfers, and reversals.
"""
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import select, and_

from app.modules.savings.models import (
    AccountTransaction,
    AccountTransfer,
    TransactionType,
    TransactionStatus,
)
from app.core.events import event_dispatcher, SavingsEvents

from app.modules.savings.transaction_service.base import logger
from app.modules.savings.transaction_service.exceptions import (
    InsufficientFundsError,
    InvalidTransactionError,
)


class MutationsMixin:
    """Deposit/withdrawal/transfer/reversal methods for :class:`TransactionService`."""

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
        source_currency: Optional[str] = None,
        exchange_rate: Optional[Decimal] = None,
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
            source_currency: Currency of the input amount (if different from account)
            exchange_rate: Exchange rate to convert source_currency to account currency

        Returns:
            Created AccountTransaction

        Raises:
            AccountNotFoundError: If account not found
            InvalidTransactionError: If amount is invalid
        """
        if amount <= 0:
            raise InvalidTransactionError("Deposit amount must be positive")

        account = await self.get_account(account_id, user_id)

        # Handle currency conversion if source currency differs from account currency
        original_amount = amount
        original_currency = source_currency
        if source_currency and source_currency != account.currency:
            if not exchange_rate:
                raise InvalidTransactionError(
                    f"Exchange rate required to convert {source_currency} to {account.currency}"
                )
            amount = amount * exchange_rate
            # Add conversion info to description
            conversion_note = f"(Converted from {original_currency} {original_amount} @ {exchange_rate})"
            if description:
                description = f"{description} {conversion_note}"
            else:
                description = conversion_note

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
        source_currency: Optional[str] = None,
        exchange_rate: Optional[Decimal] = None,
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
            source_currency: Currency of the input amount (if different from account)
            exchange_rate: Exchange rate to convert source_currency to account currency

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

        # Handle currency conversion if source currency differs from account currency
        original_amount = amount
        original_currency = source_currency
        if source_currency and source_currency != account.currency:
            if not exchange_rate:
                raise InvalidTransactionError(
                    f"Exchange rate required to convert {source_currency} to {account.currency}"
                )
            amount = amount * exchange_rate
            # Add conversion info to description
            conversion_note = f"(Converted from {original_currency} {original_amount} @ {exchange_rate})"
            if description:
                description = f"{description} {conversion_note}"
            else:
                description = conversion_note

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
