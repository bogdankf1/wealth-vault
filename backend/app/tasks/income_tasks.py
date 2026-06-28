"""
Income-related Celery tasks.

Tasks:
- Process recurring income sources and create transactions
- Deposit income to linked accounts
- Apply distribution rules
"""
import logging
from datetime import datetime, date
from decimal import Decimal
from typing import Dict, Any, Optional

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.celery_app import celery_app
from app.tasks.base import BaseTask, get_async_db_session
from app.modules.income.models import (
    IncomeSource,
    IncomeTransaction,
    IncomeFrequency,
    IncomeTransactionStatus,
)
from app.modules.savings.transaction_service import TransactionService

logger = logging.getLogger(__name__)


def is_income_due_today(source: IncomeSource, today: date) -> bool:
    """
    Check if recurring income is due today based on frequency and start date.

    Args:
        source: Income source to check
        today: Today's date

    Returns:
        True if income is due today
    """
    if source.frequency == IncomeFrequency.ONE_TIME:
        # One-time income uses the date field
        if source.date:
            return source.date.date() == today
        return False

    # For recurring income, use start_date
    start_date = source.start_date
    if not start_date:
        return False

    start = start_date.date()

    # Check if before start date
    if today < start:
        return False

    # Check end date if set
    if source.end_date and today > source.end_date.date():
        return False

    # Check based on frequency
    if source.frequency == IncomeFrequency.WEEKLY:
        # Due every 7 days from start
        days_diff = (today - start).days
        return days_diff % 7 == 0

    elif source.frequency == IncomeFrequency.BIWEEKLY:
        # Due every 14 days from start
        days_diff = (today - start).days
        return days_diff % 14 == 0

    elif source.frequency == IncomeFrequency.MONTHLY:
        # Due on same day each month
        if start.day == today.day:
            return True
        # Handle month-end cases (e.g., start on 31st, but month has only 30 days)
        import calendar
        last_day_of_month = calendar.monthrange(today.year, today.month)[1]
        if start.day > last_day_of_month and today.day == last_day_of_month:
            return True
        return False

    elif source.frequency == IncomeFrequency.QUARTERLY:
        # Due every 3 months on same day
        month_diff = (today.year - start.year) * 12 + (today.month - start.month)
        if month_diff % 3 == 0 and today.day == start.day:
            return True
        # Handle month-end cases
        import calendar
        last_day_of_month = calendar.monthrange(today.year, today.month)[1]
        if start.day > last_day_of_month and today.day == last_day_of_month and month_diff % 3 == 0:
            return True
        return False

    elif source.frequency == IncomeFrequency.ANNUALLY:
        # Due once per year on same month and day
        if today.month == start.month and today.day == start.day:
            return True
        # Handle Feb 29 case
        if start.month == 2 and start.day == 29:
            import calendar
            if not calendar.isleap(today.year) and today.month == 2 and today.day == 28:
                return True
        return False

    return False


async def check_already_processed_today(
    db: AsyncSession,
    source_id,
    today: date
) -> bool:
    """
    Check if income transaction already exists for today.

    Args:
        db: Database session
        source_id: Income source ID
        today: Today's date

    Returns:
        True if already processed today
    """
    start_of_day = datetime.combine(today, datetime.min.time())
    end_of_day = datetime.combine(today, datetime.max.time())

    result = await db.execute(
        select(IncomeTransaction).where(
            and_(
                IncomeTransaction.source_id == source_id,
                IncomeTransaction.date >= start_of_day,
                IncomeTransaction.date <= end_of_day,
            )
        )
    )
    return result.scalar_one_or_none() is not None


@celery_app.task(base=BaseTask, bind=True, name="tasks.income.process_recurring_income")
def process_recurring_income(self) -> Dict[str, Any]:
    """
    Daily task to process recurring income sources.

    For each active recurring income source:
    1. Check if payment is due today (based on frequency and start_date)
    2. Create an IncomeTransaction record
    3. If auto_deposit is enabled, deposit to linked account

    Returns:
        Dict with processing results
    """
    import asyncio

    async def _process():
        processed = 0
        deposited = 0
        errors = 0
        today = date.today()

        async with get_async_db_session() as db:
            try:
                # Query all active income sources with auto_deposit enabled
                result = await db.execute(
                    select(IncomeSource).where(
                        and_(
                            IncomeSource.is_active == True,
                            IncomeSource.auto_deposit == True,
                            IncomeSource.target_account_id.isnot(None),
                            IncomeSource.deleted_at.is_(None),
                        )
                    )
                )
                sources = result.scalars().all()

                logger.info(f"Found {len(sources)} income sources with auto-deposit enabled")

                for source in sources:
                    try:
                        # Check if income is due today
                        if not is_income_due_today(source, today):
                            continue

                        # Check if already processed today
                        if await check_already_processed_today(db, source.id, today):
                            logger.info(f"Income source {source.id} already processed today, skipping")
                            continue

                        logger.info(f"Processing income source {source.id}: {source.name}")

                        # Create income transaction
                        income_txn = IncomeTransaction(
                            user_id=source.user_id,
                            source_id=source.id,
                            description=f"Auto-deposit: {source.name}",
                            amount=source.amount,
                            currency=source.currency,
                            date=datetime.utcnow(),
                            category=source.category,
                            status=IncomeTransactionStatus.RECEIVED,
                        )
                        db.add(income_txn)
                        await db.flush()

                        processed += 1

                        # Create deposit to savings account
                        try:
                            transaction_service = TransactionService(db)
                            account_txn = await transaction_service.create_deposit(
                                account_id=source.target_account_id,
                                user_id=source.user_id,
                                amount=Decimal(str(source.amount)),
                                description=f"Income: {source.name}",
                                source_type="income",
                                source_id=income_txn.id,
                                transaction_date=datetime.utcnow(),
                                category="income",
                            )

                            # Update income transaction with deposit info
                            income_txn.status = IncomeTransactionStatus.DEPOSITED
                            income_txn.deposited_to_account_id = source.target_account_id
                            income_txn.account_transaction_id = account_txn.id

                            deposited += 1
                            logger.info(f"Deposited {source.amount} {source.currency} to account {source.target_account_id}")

                        except Exception as e:
                            logger.error(f"Failed to deposit income source {source.id}: {e}")
                            errors += 1
                            # Income transaction is still created with 'received' status

                        await db.commit()

                    except Exception as e:
                        logger.error(f"Error processing income source {source.id}: {e}")
                        errors += 1
                        await db.rollback()

            except Exception as e:
                logger.error(f"Error in process_recurring_income: {e}")
                errors += 1

        logger.info(f"Recurring income processing complete: {processed} processed, {deposited} deposited, {errors} errors")
        return {
            "processed": processed,
            "deposited": deposited,
            "errors": errors,
            "timestamp": datetime.utcnow().isoformat()
        }

    return asyncio.get_event_loop().run_until_complete(_process())


@celery_app.task(base=BaseTask, bind=True, name="tasks.income.deposit_income_to_account")
def deposit_income_to_account(
    self,
    income_transaction_id: str,
    account_id: str,
    user_id: str,
    amount: float,
    currency: str,
    description: Optional[str] = None
) -> Dict[str, Any]:
    """
    Deposit a specific income transaction to a savings account.

    Args:
        income_transaction_id: UUID of the income transaction
        account_id: UUID of the target savings account
        user_id: UUID of the user
        amount: Amount to deposit
        currency: Currency code
        description: Optional description for the deposit

    Returns:
        Dict with deposit result
    """
    import asyncio
    from uuid import UUID

    async def _deposit():
        async with get_async_db_session() as db:
            try:
                # Get income transaction
                result = await db.execute(
                    select(IncomeTransaction).where(
                        IncomeTransaction.id == UUID(income_transaction_id)
                    )
                )
                income_txn = result.scalar_one_or_none()

                if not income_txn:
                    return {
                        "success": False,
                        "error": "Income transaction not found",
                        "income_transaction_id": income_transaction_id,
                        "timestamp": datetime.utcnow().isoformat()
                    }

                if income_txn.status == IncomeTransactionStatus.DEPOSITED:
                    return {
                        "success": False,
                        "error": "Income already deposited",
                        "income_transaction_id": income_transaction_id,
                        "timestamp": datetime.utcnow().isoformat()
                    }

                # Create deposit
                transaction_service = TransactionService(db)
                account_txn = await transaction_service.create_deposit(
                    account_id=UUID(account_id),
                    user_id=UUID(user_id),
                    amount=Decimal(str(amount)),
                    description=description or "Income deposit",
                    source_type="income",
                    source_id=UUID(income_transaction_id),
                    transaction_date=datetime.utcnow(),
                    category="income",
                )

                # Update income transaction
                income_txn.status = IncomeTransactionStatus.DEPOSITED
                income_txn.deposited_to_account_id = UUID(account_id)
                income_txn.account_transaction_id = account_txn.id

                await db.commit()

                logger.info(f"Deposited {amount} {currency} to account {account_id}")
                return {
                    "success": True,
                    "income_transaction_id": income_transaction_id,
                    "account_id": account_id,
                    "account_transaction_id": str(account_txn.id),
                    "amount": amount,
                    "timestamp": datetime.utcnow().isoformat()
                }

            except Exception as e:
                logger.error(f"Failed to deposit income {income_transaction_id}: {e}")
                await db.rollback()
                return {
                    "success": False,
                    "error": str(e),
                    "income_transaction_id": income_transaction_id,
                    "timestamp": datetime.utcnow().isoformat()
                }

    return asyncio.get_event_loop().run_until_complete(_deposit())


@celery_app.task(base=BaseTask, bind=True, name="tasks.income.apply_distribution_rules")
def apply_distribution_rules(
    self,
    user_id: str,
    income_transaction_id: str,
    amount: float,
    currency: str
) -> Dict[str, Any]:
    """
    Apply income distribution rules to distribute income across accounts/goals.

    Args:
        user_id: UUID of the user
        income_transaction_id: UUID of the income transaction
        amount: Total amount to distribute
        currency: Currency code

    Returns:
        Dict with distribution results
    """
    import asyncio
    from uuid import UUID
    from app.modules.income.distribution_service import DistributionService

    async def _distribute():
        async with get_async_db_session() as db:
            try:
                distribution_service = DistributionService(db)

                # Apply distribution rules
                deposits = await distribution_service.apply_distribution(
                    user_id=UUID(user_id),
                    income_transaction_id=UUID(income_transaction_id),
                )

                logger.info(f"Applied distribution rules for user {user_id}: {len(deposits)} deposits created")
                return {
                    "success": True,
                    "distributions": [
                        {"account_transaction_id": str(txn_id), "amount": float(amt)}
                        for txn_id, amt in deposits
                    ],
                    "total_distributed": sum(float(amt) for _, amt in deposits),
                    "timestamp": datetime.utcnow().isoformat()
                }

            except Exception as e:
                logger.error(f"Failed to apply distribution rules for user {user_id}: {e}")
                await db.rollback()
                return {
                    "success": False,
                    "error": str(e),
                    "distributions": [],
                    "remaining": amount,
                    "timestamp": datetime.utcnow().isoformat()
                }

    return asyncio.get_event_loop().run_until_complete(_distribute())
