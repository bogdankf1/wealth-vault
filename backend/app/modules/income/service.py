"""
Income service layer with currency conversion and account integration.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from typing import Optional, Tuple, List
from uuid import UUID
from decimal import Decimal
from datetime import datetime
import logging

from app.modules.income.models import IncomeSource, IncomeTransaction, IncomeTransactionStatus
from app.modules.income.schemas import (
    MonthlyIncomeHistory,
    IncomeHistoryResponse,
    IncomeDepositResponse,
    IncomeTransactionCreate,
)
from app.services.currency_service import CurrencyService
from app.modules.savings.models import SavingsAccount
from app.modules.savings.transaction_service import TransactionService

logger = logging.getLogger(__name__)


async def get_user_display_currency(db: AsyncSession, user_id: UUID) -> str:
    """Get user's preferred display currency"""
    from app.models.user_preferences import UserPreferences
    prefs_result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user_id)
    )
    user_prefs = prefs_result.scalar_one_or_none()
    return user_prefs.display_currency if user_prefs and user_prefs.display_currency else "USD"


async def convert_income_to_display_currency(db: AsyncSession, user_id: UUID, income: IncomeSource) -> None:
    """
    Convert income amount to user's display currency.
    Modifies the income object in-place, adding display_amount and display_currency attributes.
    """
    display_currency = await get_user_display_currency(db, user_id)

    # If income is already in display currency, no conversion needed
    if income.currency == display_currency:
        income.display_amount = income.amount
        income.display_currency = display_currency
        # Calculate and set display_monthly_equivalent
        income.display_monthly_equivalent = income.calculate_monthly_amount()
        return

    # Convert using currency service
    currency_service = CurrencyService(db)
    converted_amount = await currency_service.convert_amount(
        income.amount,
        income.currency,
        display_currency
    )

    # Set converted values as display values
    if converted_amount is not None:
        income.display_amount = converted_amount
        income.display_currency = display_currency

        # Also convert monthly equivalent
        monthly_amount = income.calculate_monthly_amount()
        if monthly_amount:
            converted_monthly = await currency_service.convert_amount(
                monthly_amount,
                income.currency,
                display_currency
            )
            income.display_monthly_equivalent = converted_monthly if converted_monthly else monthly_amount
        else:
            income.display_monthly_equivalent = None
    else:
        # Fallback to original values if conversion fails
        income.display_amount = income.amount
        income.display_currency = income.currency
        income.display_monthly_equivalent = income.calculate_monthly_amount()


async def get_income_history(
    db: AsyncSession,
    user_id: UUID,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
) -> IncomeHistoryResponse:
    """
    Get income history grouped by month.

    Returns monthly totals and counts of income sources, along with overall average.
    Only includes active income sources.
    """
    from collections import defaultdict
    from dateutil.relativedelta import relativedelta

    # Get user preferences for display currency
    display_currency = await get_user_display_currency(db, user_id)

    # Frequency multipliers for calculating monthly equivalents
    frequency_to_monthly = {
        'one_time': Decimal('0'),
        'weekly': Decimal('4.33333'),
        'biweekly': Decimal('2.16667'),
        'monthly': Decimal('1'),
        'quarterly': Decimal('0.333333'),
        'annually': Decimal('0.083333'),
    }

    # Remove timezone info to match database datetimes
    if start_date:
        start_date = start_date.replace(tzinfo=None)
    if end_date:
        end_date = end_date.replace(tzinfo=None)

    # Get all active income sources (excluding soft-deleted)
    result = await db.execute(
        select(IncomeSource).where(
            IncomeSource.user_id == user_id,
            IncomeSource.is_active == True,
            IncomeSource.deleted_at.is_(None)
        )
    )
    income_sources = result.scalars().all()

    currency_service = CurrencyService(db)

    # Dictionary to store monthly data: {month: {"total": Decimal, "count": int}}
    monthly_data = defaultdict(lambda: {"total": Decimal(0), "count": 0})

    for income in income_sources:
        # Check if income is within date range (if dates provided)
        if start_date and end_date:
            income_in_range = False

            if income.frequency == 'one_time':
                # One-time income: check if date is within range
                if income.date:
                    income_date = income.date.replace(tzinfo=None) if income.date.tzinfo else income.date
                    if start_date <= income_date <= end_date:
                        income_in_range = True
            else:
                # Recurring income: check if start_date/end_date overlaps with range
                income_start = income.start_date.replace(tzinfo=None) if income.start_date and income.start_date.tzinfo else income.start_date
                income_end = income.end_date.replace(tzinfo=None) if income.end_date and income.end_date.tzinfo else income.end_date

                if income_start:
                    # Income starts before or during the range
                    if income_end:
                        # Has end date: check overlap
                        if income_start <= end_date and income_end >= start_date:
                            income_in_range = True
                    else:
                        # No end date: ongoing, check if it started before range ends
                        if income_start <= end_date:
                            income_in_range = True

            if not income_in_range:
                continue

        # Convert amount to display currency
        if income.currency == display_currency:
            converted_amount = income.amount
        else:
            converted_amount = await currency_service.convert_amount(
                income.amount,
                income.currency,
                display_currency
            )
            if converted_amount is None:
                converted_amount = income.amount

        amount = Decimal(str(converted_amount))

        if income.frequency == 'one_time':
            # One-time income: add to the month it occurred
            if income.date:
                income_date = income.date.replace(tzinfo=None) if income.date.tzinfo else income.date

                # Filter by date range if provided
                if start_date and end_date:
                    if not (start_date <= income_date <= end_date):
                        continue

                month_key = income_date.strftime('%Y-%m')
                monthly_data[month_key]["total"] += amount
                monthly_data[month_key]["count"] += 1
        else:
            # Recurring income: add monthly equivalent to each month in range
            if not income.start_date:
                continue

            income_start = income.start_date.replace(tzinfo=None) if income.start_date.tzinfo else income.start_date
            income_end = income.end_date.replace(tzinfo=None) if income.end_date and income.end_date.tzinfo else income.end_date

            # Calculate monthly equivalent
            multiplier = frequency_to_monthly.get(income.frequency, Decimal('1'))
            monthly_equiv = amount * multiplier

            # Determine date range for this income
            range_start = max(income_start, start_date) if start_date else income_start
            range_end = min(income_end, end_date) if income_end and end_date else (income_end or end_date)

            # If no end date for income and no filter end date, use current date + 12 months
            if not range_end:
                range_end = datetime.now() + relativedelta(months=12)

            # Generate months for this recurring income
            current_month = range_start.replace(day=1)
            end_month = range_end.replace(day=1)

            while current_month <= end_month:
                month_key = current_month.strftime('%Y-%m')
                monthly_data[month_key]["total"] += monthly_equiv
                monthly_data[month_key]["count"] += 1
                current_month += relativedelta(months=1)

    # Convert to list and sort by month
    history = [
        MonthlyIncomeHistory(
            month=month,
            total=data["total"],
            count=data["count"],
            currency=display_currency
        )
        for month, data in sorted(monthly_data.items())
    ]

    # Calculate overall average
    total_months = len(history)
    overall_average = Decimal(0)
    if total_months > 0:
        total_sum = sum(item.total for item in history)
        overall_average = total_sum / Decimal(total_months)

    return IncomeHistoryResponse(
        history=history,
        total_months=total_months,
        overall_average=overall_average,
        currency=display_currency
    )


async def create_income_transaction(
    db: AsyncSession,
    user_id: UUID,
    data: IncomeTransactionCreate,
    commit: bool = True,
) -> IncomeTransaction:
    """Thin create for a single income transaction (no auto-deposit). Mirrors the field-setting
    of create_income_with_auto_deposit. commit=False -> flush only, for atomic callers."""
    txn = IncomeTransaction(
        user_id=user_id,
        source_id=data.source_id,
        amount=data.amount,
        currency=data.currency,
        date=data.date,
        description=data.description,
        category=data.category,
        notes=data.notes,
        status=IncomeTransactionStatus.RECEIVED,
    )
    db.add(txn)
    if commit:
        await db.commit()
    else:
        await db.flush()
    await db.refresh(txn)
    return txn


class IncomeDepositError(Exception):
    """Raised when income deposit fails."""
    pass


class IncomeService:
    """Service for income operations including account deposits."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def deposit_income_to_account(
        self,
        income_transaction_id: UUID,
        user_id: UUID,
        account_id: UUID,
        description: Optional[str] = None,
    ) -> IncomeDepositResponse:
        """
        Deposit an income transaction to a savings account.

        Args:
            income_transaction_id: Income transaction to deposit
            user_id: User UUID
            account_id: Target savings account UUID
            description: Optional deposit description

        Returns:
            IncomeDepositResponse with deposit details

        Raises:
            IncomeDepositError: If deposit fails
        """
        # Get the income transaction
        result = await self.db.execute(
            select(IncomeTransaction).where(
                and_(
                    IncomeTransaction.id == income_transaction_id,
                    IncomeTransaction.user_id == user_id,
                )
            )
        )
        income_txn = result.scalar_one_or_none()
        if not income_txn:
            raise IncomeDepositError("Income transaction not found")

        # Check if already deposited
        if income_txn.status == IncomeTransactionStatus.DEPOSITED:
            raise IncomeDepositError("Income has already been deposited")

        # Verify the target account exists and belongs to user
        account = await self.db.get(SavingsAccount, account_id)
        if not account or account.user_id != user_id:
            raise IncomeDepositError("Invalid target account")

        # Create deposit to savings account
        transaction_service = TransactionService(self.db)
        try:
            account_txn = await transaction_service.create_deposit(
                account_id=account_id,
                user_id=user_id,
                amount=income_txn.amount,
                source_type="income",
                source_id=income_transaction_id,
                description=description or f"Income deposit: {income_txn.description or 'Income'}",
                category=income_txn.category,
            )
        except Exception as e:
            logger.error(f"Failed to create deposit for income {income_transaction_id}: {e}")
            raise IncomeDepositError(f"Failed to create deposit: {str(e)}")

        # Update income transaction status
        income_txn.status = IncomeTransactionStatus.DEPOSITED
        income_txn.deposited_to_account_id = account_id
        income_txn.account_transaction_id = account_txn.id
        income_txn.updated_at = datetime.utcnow()

        await self.db.commit()

        logger.info(f"Deposited income {income_transaction_id} to account {account_id}")

        return IncomeDepositResponse(
            income_transaction_id=income_transaction_id,
            account_transaction_id=account_txn.id,
            deposited_to_account_id=account_id,
            amount=income_txn.amount,
            currency=income_txn.currency,
            message=f"Successfully deposited {income_txn.amount} {income_txn.currency} to account",
        )

    async def create_income_with_auto_deposit(
        self,
        user_id: UUID,
        source_id: Optional[UUID],
        amount: Decimal,
        currency: str,
        date: datetime,
        description: Optional[str] = None,
        category: Optional[str] = None,
        notes: Optional[str] = None,
        deposit_to_account_id: Optional[UUID] = None,
    ) -> Tuple[IncomeTransaction, Optional[IncomeDepositResponse]]:
        """
        Create an income transaction and optionally auto-deposit to account.

        If deposit_to_account_id is provided, deposits immediately.
        If source has auto_deposit enabled, uses the source's target account.

        Args:
            user_id: User UUID
            source_id: Optional income source ID
            amount: Income amount
            currency: Currency code
            date: Transaction date
            description: Optional description
            category: Optional category
            notes: Optional notes
            deposit_to_account_id: Optional account to deposit to

        Returns:
            Tuple of (IncomeTransaction, Optional IncomeDepositResponse)
        """
        # Determine target account for auto-deposit
        target_account_id = deposit_to_account_id

        if not target_account_id and source_id:
            # Check if source has auto_deposit enabled
            source = await self.db.get(IncomeSource, source_id)
            if source and source.auto_deposit and source.target_account_id:
                target_account_id = source.target_account_id

        # Create the income transaction
        income_txn = IncomeTransaction(
            user_id=user_id,
            source_id=source_id,
            amount=amount,
            currency=currency,
            date=date,
            description=description,
            category=category,
            notes=notes,
            status=IncomeTransactionStatus.RECEIVED,
        )

        self.db.add(income_txn)
        await self.db.flush()  # Get the ID

        deposit_response = None

        # Auto-deposit if target account specified
        if target_account_id:
            try:
                deposit_response = await self.deposit_income_to_account(
                    income_transaction_id=income_txn.id,
                    user_id=user_id,
                    account_id=target_account_id,
                    description=description,
                )
            except IncomeDepositError as e:
                logger.warning(f"Auto-deposit failed for income {income_txn.id}: {e}")
                # Transaction is still created, just not deposited

        await self.db.commit()
        await self.db.refresh(income_txn)

        return income_txn, deposit_response

    async def get_income_transaction(
        self,
        transaction_id: UUID,
        user_id: UUID,
    ) -> Optional[IncomeTransaction]:
        """Get an income transaction by ID."""
        result = await self.db.execute(
            select(IncomeTransaction).where(
                and_(
                    IncomeTransaction.id == transaction_id,
                    IncomeTransaction.user_id == user_id,
                )
            )
        )
        return result.scalar_one_or_none()

    async def get_undepositied_income(
        self,
        user_id: UUID,
    ) -> List[IncomeTransaction]:
        """Get all income transactions that haven't been deposited yet."""
        result = await self.db.execute(
            select(IncomeTransaction).where(
                and_(
                    IncomeTransaction.user_id == user_id,
                    IncomeTransaction.status == IncomeTransactionStatus.RECEIVED,
                )
            ).order_by(IncomeTransaction.date.desc())
        )
        return list(result.scalars().all())
