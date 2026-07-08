"""
Income service layer with currency conversion and account integration.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func, or_, case
from typing import Optional, Tuple, List
from uuid import UUID
from decimal import Decimal
from datetime import datetime
import logging

from app.modules.income.models import IncomeSource, IncomeTransaction, IncomeTransactionStatus, IncomeFrequency
from app.modules.income.schemas import (
    MonthlyIncomeHistory,
    IncomeHistoryResponse,
    IncomeDepositResponse,
    IncomeTransactionCreate,
    IncomeSourceCreate,
    IncomeSourceUpdate,
    IncomeSourceResponse,
    IncomeSourceBatchDelete,
    IncomeSourceBatchDeleteResponse,
    IncomeStatsResponse,
    IncomeTransactionResponse,
    IncomeTransactionListResponse,
)
from app.services.currency_service import CurrencyService
from app.modules.savings.models import SavingsAccount
from app.modules.savings.transaction_service import TransactionService
from app.core.exceptions import TierLimitException, NotFoundException
from app.core.permissions import check_usage_limit
from app.models.user import User

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


# ===========================================================================
# Income source / transaction / stats operations
# (moved verbatim out of the income router handlers)
# ===========================================================================


async def list_income_sources(db: AsyncSession, current_user: User, page: int, page_size: int, is_active: Optional[bool]):
    # Build query
    query = select(IncomeSource).where(
        IncomeSource.user_id == current_user.id,
        IncomeSource.deleted_at.is_(None)
    )

    # Apply filters
    if is_active is not None:
        query = query.where(IncomeSource.is_active == is_active)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    # Apply pagination and ordering
    # Sort by the actual income date (date for one-time, start_date for recurring)
    query = query.order_by(
        func.coalesce(IncomeSource.date, IncomeSource.start_date).desc(),
        IncomeSource.created_at.desc()
    )
    query = query.offset((page - 1) * page_size).limit(page_size)

    # Execute query
    result = await db.execute(query)
    sources = result.scalars().all()

    # Convert all income sources to display currency and add monthly equivalent
    response_items = []
    for source in sources:
        # Convert to display currency
        await convert_income_to_display_currency(db, current_user.id, source)

        # Build response dict with all fields
        source_dict = {
            "id": str(source.id),
            "user_id": str(source.user_id),
            "name": source.name,
            "description": source.description,
            "category": source.category,
            "amount": float(source.amount) if source.amount else 0,
            "currency": source.currency,
            "frequency": source.frequency,
            "is_active": source.is_active,
            "date": source.date.isoformat() if source.date else None,
            "start_date": source.start_date.isoformat() if source.start_date else None,
            "end_date": source.end_date.isoformat() if source.end_date else None,
            "created_at": source.created_at.isoformat(),
            "updated_at": source.updated_at.isoformat(),
            # Account integration fields
            "target_account_id": str(source.target_account_id) if source.target_account_id else None,
            "auto_deposit": source.auto_deposit,
            "monthly_equivalent": float(source.calculate_monthly_amount()) if source.calculate_monthly_amount() else None,
            "display_amount": float(source.display_amount) if hasattr(source, 'display_amount') and source.display_amount is not None else None,
            "display_currency": source.display_currency if hasattr(source, 'display_currency') and source.display_currency is not None else None,
            "display_monthly_equivalent": float(source.display_monthly_equivalent) if hasattr(source, 'display_monthly_equivalent') and source.display_monthly_equivalent is not None else None,
        }
        response_items.append(source_dict)

    return {
        "items": response_items,
        "total": total,
        "page": page,
        "page_size": page_size
    }


async def create_income_source(db: AsyncSession, current_user: User, source_data: IncomeSourceCreate):
    # Check current count
    count_query = select(func.count()).select_from(IncomeSource).where(
        IncomeSource.user_id == current_user.id,
        IncomeSource.deleted_at.is_(None)
    )
    count_result = await db.execute(count_query)
    current_count = count_result.scalar_one()

    # Check tier limits
    has_capacity, limit = await check_usage_limit(
        current_user,
        "income_tracking",
        current_count,
        db
    )

    if not has_capacity:
        tier_name = current_user.tier.name if current_user.tier else "free"
        raise TierLimitException(
            message=f"Income source limit reached. Your {tier_name} tier allows {limit} sources.",
            current_tier=tier_name,
            required_tier="growth" if tier_name == "starter" else "wealth"
        )

    # Create income source
    income_source = IncomeSource(
        user_id=current_user.id,
        **source_data.model_dump()
    )

    db.add(income_source)
    await db.commit()
    await db.refresh(income_source)

    # Auto-deposit: If auto_deposit is enabled and target account is set, create deposits
    # For recurring income, backfill all historical deposits from start_date to today
    if income_source.auto_deposit and income_source.target_account_id:
        try:
            from dateutil.relativedelta import relativedelta

            today = datetime.utcnow().date()
            transaction_service = TransactionService(db)
            deposits_created = 0

            if income_source.frequency == IncomeFrequency.ONE_TIME:
                # One-time income: create single deposit if date is today or in the past
                income_date = income_source.date or datetime.utcnow()
                if income_date.date() <= today:
                    income_txn = IncomeTransaction(
                        user_id=current_user.id,
                        source_id=income_source.id,
                        amount=income_source.amount,
                        currency=income_source.currency,
                        date=income_date,
                        description=f"Income: {income_source.name}",
                        category=income_source.category,
                        status=IncomeTransactionStatus.RECEIVED,
                    )
                    db.add(income_txn)
                    await db.flush()

                    account_txn = await transaction_service.create_deposit(
                        account_id=income_source.target_account_id,
                        user_id=current_user.id,
                        amount=income_source.amount,
                        source_type="income",
                        source_id=income_txn.id,
                        description=f"Income: {income_source.name}",
                        transaction_date=income_date,
                        category=income_source.category or "income",
                    )

                    income_txn.status = IncomeTransactionStatus.DEPOSITED
                    income_txn.deposited_to_account_id = income_source.target_account_id
                    income_txn.account_transaction_id = account_txn.id
                    deposits_created = 1
            else:
                # Recurring income: backfill all past deposits
                start_date = income_source.start_date
                if start_date and start_date.date() <= today:
                    # Calculate all due dates from start_date to today
                    current_date = start_date
                    end_date = income_source.end_date.date() if income_source.end_date else None

                    # Determine the interval based on frequency
                    if income_source.frequency == IncomeFrequency.WEEKLY:
                        interval = relativedelta(weeks=1)
                    elif income_source.frequency == IncomeFrequency.BIWEEKLY:
                        interval = relativedelta(weeks=2)
                    elif income_source.frequency == IncomeFrequency.MONTHLY:
                        interval = relativedelta(months=1)
                    elif income_source.frequency == IncomeFrequency.QUARTERLY:
                        interval = relativedelta(months=3)
                    elif income_source.frequency == IncomeFrequency.ANNUALLY:
                        interval = relativedelta(years=1)
                    else:
                        interval = relativedelta(months=1)  # Default to monthly

                    # Create deposits for each due date
                    while current_date.date() <= today:
                        # Check end_date if set
                        if end_date and current_date.date() > end_date:
                            break

                        # Create income transaction for this date
                        income_txn = IncomeTransaction(
                            user_id=current_user.id,
                            source_id=income_source.id,
                            amount=income_source.amount,
                            currency=income_source.currency,
                            date=current_date,
                            description=f"Income: {income_source.name}",
                            category=income_source.category,
                            status=IncomeTransactionStatus.RECEIVED,
                        )
                        db.add(income_txn)
                        await db.flush()

                        # Create deposit to savings account with the historical date
                        account_txn = await transaction_service.create_deposit(
                            account_id=income_source.target_account_id,
                            user_id=current_user.id,
                            amount=income_source.amount,
                            source_type="income",
                            source_id=income_txn.id,
                            description=f"Income: {income_source.name}",
                            transaction_date=current_date,
                            category=income_source.category or "income",
                        )

                        # Update income transaction with deposit info
                        income_txn.status = IncomeTransactionStatus.DEPOSITED
                        income_txn.deposited_to_account_id = income_source.target_account_id
                        income_txn.account_transaction_id = account_txn.id

                        deposits_created += 1
                        current_date = current_date + interval

            if deposits_created > 0:
                await db.commit()
                logger.info(f"Auto-deposited {deposits_created} transactions for income source {income_source.id} to account {income_source.target_account_id}")
        except Exception as e:
            logger.error(f"Failed to auto-deposit income source {income_source.id}: {e}")
            await db.rollback()
            # Don't fail the income source creation, just log the error

    # Prepare response with monthly equivalent
    response_dict = IncomeSourceResponse.model_validate(income_source).model_dump()
    response_dict["monthly_equivalent"] = income_source.calculate_monthly_amount()

    return IncomeSourceResponse(**response_dict)


async def get_income_source(db: AsyncSession, current_user: User, source_id: UUID):
    query = select(IncomeSource).where(
        IncomeSource.id == source_id,
        IncomeSource.user_id == current_user.id,
        IncomeSource.deleted_at.is_(None)
    )

    result = await db.execute(query)
    source = result.scalar_one_or_none()

    if not source:
        raise NotFoundException(message="Income source not found")

    # Convert to display currency
    await convert_income_to_display_currency(db, current_user.id, source)

    # Prepare response with monthly equivalent and display fields
    response_dict = {
        "id": str(source.id),
        "user_id": str(source.user_id),
        "name": source.name,
        "description": source.description,
        "category": source.category,
        "amount": float(source.amount) if source.amount else 0,
        "currency": source.currency,
        "frequency": source.frequency,
        "is_active": source.is_active,
        "date": source.date.isoformat() if source.date else None,
        "start_date": source.start_date.isoformat() if source.start_date else None,
        "end_date": source.end_date.isoformat() if source.end_date else None,
        "created_at": source.created_at.isoformat(),
        "updated_at": source.updated_at.isoformat(),
        # Account integration fields
        "target_account_id": str(source.target_account_id) if source.target_account_id else None,
        "auto_deposit": source.auto_deposit,
        "monthly_equivalent": float(source.calculate_monthly_amount()) if source.calculate_monthly_amount() else None,
        "display_amount": float(source.display_amount) if hasattr(source, 'display_amount') and source.display_amount is not None else None,
        "display_currency": source.display_currency if hasattr(source, 'display_currency') and source.display_currency is not None else None,
        "display_monthly_equivalent": float(source.display_monthly_equivalent) if hasattr(source, 'display_monthly_equivalent') and source.display_monthly_equivalent is not None else None,
    }

    return response_dict


async def update_income_source(db: AsyncSession, current_user: User, source_id: UUID, source_data: IncomeSourceUpdate):
    from dateutil.relativedelta import relativedelta

    query = select(IncomeSource).where(
        IncomeSource.id == source_id,
        IncomeSource.user_id == current_user.id,
        IncomeSource.deleted_at.is_(None)
    )

    result = await db.execute(query)
    source = result.scalar_one_or_none()

    if not source:
        raise NotFoundException(message="Income source not found")

    # Track previous auto_deposit state to detect if it's being enabled
    was_auto_deposit_enabled = source.auto_deposit and source.target_account_id

    # Extract sync_historical before updating fields
    sync_historical = source_data.sync_historical

    # Update fields (excluding sync_historical which is not a model field)
    update_data = source_data.model_dump(exclude_unset=True, exclude={'sync_historical'})
    for field, value in update_data.items():
        setattr(source, field, value)

    await db.commit()
    await db.refresh(source)

    # Check if auto_deposit is now enabled
    is_auto_deposit_enabled = source.auto_deposit and source.target_account_id

    # Helper function to get frequency interval
    def get_frequency_interval(frequency: IncomeFrequency):
        if frequency == IncomeFrequency.WEEKLY:
            return relativedelta(weeks=1)
        elif frequency == IncomeFrequency.BIWEEKLY:
            return relativedelta(weeks=2)
        elif frequency == IncomeFrequency.MONTHLY:
            return relativedelta(months=1)
        elif frequency == IncomeFrequency.QUARTERLY:
            return relativedelta(months=3)
        elif frequency == IncomeFrequency.ANNUALLY:
            return relativedelta(years=1)
        return relativedelta(months=1)

    # Helper function to create deposits for date range
    async def create_historical_deposits(transaction_service, start_dt, end_dt, interval, existing_dates=None):
        deposits_created = 0
        today = datetime.utcnow().date()
        current_date = start_dt

        while current_date.date() <= today:
            if end_dt and current_date.date() > end_dt:
                break

            # Skip if transaction already exists for this date (when not syncing)
            if existing_dates and current_date.date() in existing_dates:
                current_date = current_date + interval
                continue

            income_txn = IncomeTransaction(
                user_id=current_user.id,
                source_id=source.id,
                amount=source.amount,
                currency=source.currency,
                date=current_date,
                description=f"Income: {source.name}",
                category=source.category,
                status=IncomeTransactionStatus.RECEIVED,
            )
            db.add(income_txn)
            await db.flush()

            account_txn = await transaction_service.create_deposit(
                account_id=source.target_account_id,
                user_id=current_user.id,
                amount=source.amount,
                source_type="income",
                source_id=income_txn.id,
                description=f"Income: {source.name}",
                transaction_date=current_date,
                category=source.category or "income",
            )

            income_txn.status = IncomeTransactionStatus.DEPOSITED
            income_txn.deposited_to_account_id = source.target_account_id
            income_txn.account_transaction_id = account_txn.id

            deposits_created += 1
            current_date = current_date + interval

        return deposits_created

    # Handle sync_historical - delete existing and recreate
    if sync_historical and is_auto_deposit_enabled:
        try:
            transaction_service = TransactionService(db)

            # Get all existing income transactions for this source
            existing_txns_query = select(IncomeTransaction).where(
                IncomeTransaction.source_id == source.id,
                IncomeTransaction.deleted_at.is_(None)
            )
            existing_result = await db.execute(existing_txns_query)
            existing_txns = existing_result.scalars().all()

            # Reverse the account deposits and delete income transactions
            reversed_count = 0
            for income_txn in existing_txns:
                # Reverse the account transaction if it exists
                if income_txn.account_transaction_id and income_txn.deposited_to_account_id:
                    try:
                        await transaction_service.reverse_transaction(
                            transaction_id=income_txn.account_transaction_id,
                            user_id=current_user.id,
                            reason="Sync historical: Income source updated",
                        )
                        reversed_count += 1
                    except Exception as e:
                        logger.warning(f"Could not reverse transaction {income_txn.account_transaction_id}: {e}")

                # Soft delete the income transaction
                income_txn.deleted_at = datetime.utcnow()

            await db.commit()
            logger.info(f"Reversed {reversed_count} account transactions for income source {source.id}")

            # Recreate all transactions with new values
            deposits_created = 0
            today = datetime.utcnow().date()

            if source.frequency == IncomeFrequency.ONE_TIME:
                income_date = source.date or datetime.utcnow()
                if income_date.date() <= today:
                    income_txn = IncomeTransaction(
                        user_id=current_user.id,
                        source_id=source.id,
                        amount=source.amount,
                        currency=source.currency,
                        date=income_date,
                        description=f"Income: {source.name}",
                        category=source.category,
                        status=IncomeTransactionStatus.RECEIVED,
                    )
                    db.add(income_txn)
                    await db.flush()

                    account_txn = await transaction_service.create_deposit(
                        account_id=source.target_account_id,
                        user_id=current_user.id,
                        amount=source.amount,
                        source_type="income",
                        source_id=income_txn.id,
                        description=f"Income: {source.name}",
                        transaction_date=income_date,
                        category=source.category or "income",
                    )

                    income_txn.status = IncomeTransactionStatus.DEPOSITED
                    income_txn.deposited_to_account_id = source.target_account_id
                    income_txn.account_transaction_id = account_txn.id
                    deposits_created = 1
            else:
                start_date = source.start_date
                if start_date and start_date.date() <= today:
                    end_date = source.end_date.date() if source.end_date else None
                    interval = get_frequency_interval(source.frequency)
                    deposits_created = await create_historical_deposits(
                        transaction_service, start_date, end_date, interval
                    )

            if deposits_created > 0:
                await db.commit()
                logger.info(f"Recreated {deposits_created} deposits for income source {source.id}")

        except Exception as e:
            logger.error(f"Failed to sync historical deposits for income source {source.id}: {e}")
            await db.rollback()

    # Backfill historical deposits if auto_deposit was just enabled (without sync)
    elif is_auto_deposit_enabled and not was_auto_deposit_enabled:
        try:
            today = datetime.utcnow().date()
            transaction_service = TransactionService(db)

            # Get existing income transactions for this source to avoid duplicates
            existing_txns_query = select(IncomeTransaction.date).where(
                IncomeTransaction.source_id == source.id,
                IncomeTransaction.deleted_at.is_(None)
            )
            existing_result = await db.execute(existing_txns_query)
            existing_dates = {txn_date.date() for txn_date in existing_result.scalars().all()}

            deposits_created = 0

            if source.frequency == IncomeFrequency.ONE_TIME:
                income_date = source.date or datetime.utcnow()
                if income_date.date() <= today and income_date.date() not in existing_dates:
                    income_txn = IncomeTransaction(
                        user_id=current_user.id,
                        source_id=source.id,
                        amount=source.amount,
                        currency=source.currency,
                        date=income_date,
                        description=f"Income: {source.name}",
                        category=source.category,
                        status=IncomeTransactionStatus.RECEIVED,
                    )
                    db.add(income_txn)
                    await db.flush()

                    account_txn = await transaction_service.create_deposit(
                        account_id=source.target_account_id,
                        user_id=current_user.id,
                        amount=source.amount,
                        source_type="income",
                        source_id=income_txn.id,
                        description=f"Income: {source.name}",
                        transaction_date=income_date,
                        category=source.category or "income",
                    )

                    income_txn.status = IncomeTransactionStatus.DEPOSITED
                    income_txn.deposited_to_account_id = source.target_account_id
                    income_txn.account_transaction_id = account_txn.id
                    deposits_created = 1
            else:
                start_date = source.start_date
                if start_date and start_date.date() <= today:
                    end_date = source.end_date.date() if source.end_date else None
                    interval = get_frequency_interval(source.frequency)
                    deposits_created = await create_historical_deposits(
                        transaction_service, start_date, end_date, interval, existing_dates
                    )

            if deposits_created > 0:
                await db.commit()
                logger.info(f"Backfilled {deposits_created} deposits for income source {source.id}")

        except Exception as e:
            logger.error(f"Failed to backfill deposits for income source {source.id}: {e}")
            await db.rollback()

    # Prepare response with monthly equivalent
    response_dict = IncomeSourceResponse.model_validate(source).model_dump()
    response_dict["monthly_equivalent"] = source.calculate_monthly_amount()

    return IncomeSourceResponse(**response_dict)


async def delete_income_source(db: AsyncSession, current_user: User, source_id: UUID):
    query = select(IncomeSource).where(
        IncomeSource.id == source_id,
        IncomeSource.user_id == current_user.id,
        IncomeSource.deleted_at.is_(None)
    )

    result = await db.execute(query)
    source = result.scalar_one_or_none()

    if not source:
        raise NotFoundException(message="Income source not found")

    # Soft delete
    source.soft_delete()
    await db.commit()

    return None


async def batch_delete_income_sources(db: AsyncSession, current_user: User, batch_data: IncomeSourceBatchDelete):
    deleted_count = 0
    failed_ids = []

    for source_id in batch_data.source_ids:
        try:
            query = select(IncomeSource).where(
                IncomeSource.id == source_id,
                IncomeSource.user_id == current_user.id,
                IncomeSource.deleted_at.is_(None)
            )

            result = await db.execute(query)
            source = result.scalar_one_or_none()

            if source:
                source.soft_delete()
                deleted_count += 1
            else:
                failed_ids.append(source_id)
        except Exception:
            failed_ids.append(source_id)

    await db.commit()

    return IncomeSourceBatchDeleteResponse(
        deleted_count=deleted_count,
        failed_ids=failed_ids
    )


async def list_income_transactions(db: AsyncSession, current_user: User, page: int, page_size: int, source_id: Optional[UUID], start_date: Optional[datetime], end_date: Optional[datetime]):
    # Build query
    query = select(IncomeTransaction).where(
        IncomeTransaction.user_id == current_user.id,
        IncomeTransaction.deleted_at.is_(None)
    )

    # Apply filters
    if source_id:
        query = query.where(IncomeTransaction.source_id == source_id)
    if start_date:
        query = query.where(IncomeTransaction.date >= start_date)
    if end_date:
        query = query.where(IncomeTransaction.date <= end_date)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    # Apply pagination
    query = query.order_by(IncomeTransaction.date.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    # Execute query
    result = await db.execute(query)
    transactions = result.scalars().all()

    return IncomeTransactionListResponse(
        items=[IncomeTransactionResponse.model_validate(t) for t in transactions],
        total=total,
        page=page,
        page_size=page_size
    )


async def get_income_stats(db: AsyncSession, current_user: User, start_date: Optional[datetime], end_date: Optional[datetime]):
    # Get active sources for monthly/annual calculation
    # Apply date filtering if date range is provided
    if start_date and end_date:
        # Remove timezone info for comparison
        filter_start = start_date.replace(tzinfo=None)
        filter_end = end_date.replace(tzinfo=None)

        active_sources_query = select(IncomeSource).where(
            and_(
                IncomeSource.user_id == current_user.id,
                IncomeSource.is_active == True,
                IncomeSource.deleted_at.is_(None),
                or_(
                    # For one-time: date must fall within period
                    and_(
                        IncomeSource.frequency == IncomeFrequency.ONE_TIME,
                        IncomeSource.date.isnot(None),
                        IncomeSource.date >= filter_start,
                        IncomeSource.date <= filter_end
                    ),
                    # For recurring: start_date <= period_end AND (end_date is NULL OR end_date >= period_start)
                    and_(
                        IncomeSource.frequency != IncomeFrequency.ONE_TIME,
                        IncomeSource.start_date.isnot(None),
                        IncomeSource.start_date <= filter_end,
                        or_(
                            IncomeSource.end_date.is_(None),
                            IncomeSource.end_date >= filter_start
                        )
                    )
                )
            )
        )
    else:
        active_sources_query = select(IncomeSource).where(
            IncomeSource.user_id == current_user.id,
            IncomeSource.is_active == True,
            IncomeSource.deleted_at.is_(None)
        )

    active_sources_result = await db.execute(active_sources_query)
    active_sources = active_sources_result.scalars().all()

    # Calculate source counts based on whether date filtering is applied
    if start_date and end_date:
        # When date range is provided, count only active sources in range
        total_sources_count = len(active_sources)
        active_sources_count = len(active_sources)
    else:
        # When no date range, count all sources and active sources separately
        all_sources_query = select(
            func.count(IncomeSource.id).label("total"),
            func.sum(
                case((IncomeSource.is_active == True, 1), else_=0)
            ).label("active")
        ).where(
            IncomeSource.user_id == current_user.id,
            IncomeSource.deleted_at.is_(None)
        )
        all_sources_result = await db.execute(all_sources_query)
        all_sources_stats = all_sources_result.one()
        total_sources_count = all_sources_stats.total or 0
        active_sources_count = all_sources_stats.active or 0

    # Get user's display currency first
    display_currency = await get_user_display_currency(db, current_user.id)

    # Convert all sources to display currency and calculate total monthly income
    from app.services.currency_service import CurrencyService
    currency_service = CurrencyService(db)

    total_monthly = Decimal("0")
    for source in active_sources:
        monthly_amount = source.calculate_monthly_amount()
        if monthly_amount:
            # Convert to display currency if needed
            if source.currency != display_currency:
                converted_amount = await currency_service.convert_amount(
                    monthly_amount,
                    source.currency,
                    display_currency
                )
                if converted_amount:
                    total_monthly += converted_amount
                else:
                    # Fallback to original if conversion fails
                    total_monthly += monthly_amount
            else:
                total_monthly += monthly_amount

    total_annual = total_monthly * 12

    # Calculate all-time transaction stats from all active sources
    # Get all active sources (not just from the filtered period)
    all_active_sources_query = select(IncomeSource).where(
        IncomeSource.user_id == current_user.id,
        IncomeSource.is_active == True,
        IncomeSource.deleted_at.is_(None)
    )
    all_active_sources_result = await db.execute(all_active_sources_query)
    all_active_sources = all_active_sources_result.scalars().all()

    # Calculate total amount from all active sources
    total_transactions_amount = Decimal("0")
    for source in all_active_sources:
        if source.frequency == IncomeFrequency.ONE_TIME:
            # One-time: use full amount
            source_amount = source.amount
        else:
            # Recurring: calculate monthly amount
            source_amount = source.calculate_monthly_amount() or Decimal("0")

        # Convert to display currency if needed
        if source.currency != display_currency:
            converted_amount = await currency_service.convert_amount(
                source_amount,
                source.currency,
                display_currency
            )
            if converted_amount:
                total_transactions_amount += converted_amount
            else:
                total_transactions_amount += source_amount
        else:
            total_transactions_amount += source_amount

    # Get current month stats (including active sources)
    now = datetime.utcnow()
    current_month_start = datetime(now.year, now.month, 1)
    # Calculate next month start for end boundary
    if now.month == 12:
        current_month_end = datetime(now.year + 1, 1, 1)
    else:
        current_month_end = datetime(now.year, now.month + 1, 1)

    # Get active sources for current month
    current_month_sources_query = select(IncomeSource).where(
        and_(
            IncomeSource.user_id == current_user.id,
            IncomeSource.is_active == True,
            IncomeSource.deleted_at.is_(None),
            or_(
                # One-time sources that fall in current month
                and_(
                    IncomeSource.frequency == IncomeFrequency.ONE_TIME,
                    IncomeSource.date.isnot(None),
                    IncomeSource.date >= current_month_start,
                    IncomeSource.date < current_month_end
                ),
                # Recurring sources active during current month
                and_(
                    IncomeSource.frequency != IncomeFrequency.ONE_TIME,
                    IncomeSource.start_date.isnot(None),
                    IncomeSource.start_date < current_month_end,
                    or_(
                        IncomeSource.end_date.is_(None),
                        IncomeSource.end_date >= current_month_start
                    )
                )
            )
        )
    )

    current_month_sources_result = await db.execute(current_month_sources_query)
    current_month_sources = current_month_sources_result.scalars().all()

    # Calculate total for current month from sources
    current_month_amount = Decimal("0")
    for source in current_month_sources:
        amount = source.amount
        if source.frequency == IncomeFrequency.ONE_TIME:
            # One-time: use full amount
            source_amount = amount
        else:
            # Recurring: calculate monthly amount
            source_amount = source.calculate_monthly_amount() or Decimal("0")

        # Convert to display currency if needed
        if source.currency != display_currency:
            converted_amount = await currency_service.convert_amount(
                source_amount,
                source.currency,
                display_currency
            )
            if converted_amount:
                current_month_amount += converted_amount
            else:
                current_month_amount += source_amount
        else:
            current_month_amount += source_amount

    # Get last month stats
    if now.month == 1:
        last_month_start = datetime(now.year - 1, 12, 1)
        last_month_end = datetime(now.year, 1, 1)
    else:
        last_month_start = datetime(now.year, now.month - 1, 1)
        last_month_end = datetime(now.year, now.month, 1)

    # Get active sources for last month
    last_month_sources_query = select(IncomeSource).where(
        and_(
            IncomeSource.user_id == current_user.id,
            IncomeSource.is_active == True,
            IncomeSource.deleted_at.is_(None),
            or_(
                # One-time sources that fall in last month
                and_(
                    IncomeSource.frequency == IncomeFrequency.ONE_TIME,
                    IncomeSource.date.isnot(None),
                    IncomeSource.date >= last_month_start,
                    IncomeSource.date < last_month_end
                ),
                # Recurring sources active during last month
                and_(
                    IncomeSource.frequency != IncomeFrequency.ONE_TIME,
                    IncomeSource.start_date.isnot(None),
                    IncomeSource.start_date < last_month_end,
                    or_(
                        IncomeSource.end_date.is_(None),
                        IncomeSource.end_date >= last_month_start
                    )
                )
            )
        )
    )

    last_month_sources_result = await db.execute(last_month_sources_query)
    last_month_sources = last_month_sources_result.scalars().all()

    # Calculate total for last month from sources
    last_month_amount = Decimal("0")
    for source in last_month_sources:
        amount = source.amount
        if source.frequency == IncomeFrequency.ONE_TIME:
            # One-time: use full amount
            source_amount = amount
        else:
            # Recurring: calculate monthly amount
            source_amount = source.calculate_monthly_amount() or Decimal("0")

        # Convert to display currency if needed
        if source.currency != display_currency:
            converted_amount = await currency_service.convert_amount(
                source_amount,
                source.currency,
                display_currency
            )
            if converted_amount:
                last_month_amount += converted_amount
            else:
                last_month_amount += source_amount
        else:
            last_month_amount += source_amount

    return IncomeStatsResponse(
        total_sources=total_sources_count,
        active_sources=active_sources_count,
        total_monthly_income=total_monthly,
        total_annual_income=total_annual,
        total_transactions=len(all_active_sources),
        total_transactions_amount=total_transactions_amount,
        transactions_current_month=len(current_month_sources),
        transactions_current_month_amount=current_month_amount,
        transactions_last_month=len(last_month_sources),
        transactions_last_month_amount=last_month_amount,
        currency=display_currency
    )
