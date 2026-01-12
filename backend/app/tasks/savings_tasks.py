"""
Savings-related Celery tasks.

Tasks:
- Calculate daily interest
- Accrue monthly interest
- Update balance history
"""
import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Dict, Any

from sqlalchemy import select, and_

from app.core.celery_app import celery_app
from app.tasks.base import BaseTask, get_async_db_session
from app.modules.savings.models import SavingsAccount, AccountTransaction, BalanceHistory, TransactionType, TransactionStatus
from app.core.events import event_dispatcher, SavingsEvents

logger = logging.getLogger(__name__)


@celery_app.task(base=BaseTask, bind=True, name="tasks.savings.calculate_daily_interest")
def calculate_daily_interest(self) -> Dict[str, Any]:
    """
    Daily task to calculate accrued interest for all accounts.

    For each savings account with interest_rate > 0:
    1. Calculate daily interest based on APY
    2. Add to accrued_interest field
    3. Update last_interest_accrual date

    Note: Interest is calculated but not posted until monthly accrual.

    Returns:
        Dict with results
    """
    import asyncio

    async def _calculate():
        async with get_async_db_session() as db:
            now = datetime.now(timezone.utc)

            # Get all active accounts with interest rate
            result = await db.execute(
                select(SavingsAccount).where(
                    and_(
                        SavingsAccount.is_active == True,
                        SavingsAccount.interest_rate.isnot(None),
                        SavingsAccount.interest_rate > 0,
                        SavingsAccount.current_balance > 0
                    )
                )
            )
            accounts = list(result.scalars().all())

            accounts_processed = 0
            total_interest_accrued = Decimal("0")

            for account in accounts:
                try:
                    # Calculate days since last accrual
                    last_accrual = account.last_interest_accrual
                    if last_accrual is None:
                        # Use created_at if never accrued
                        last_accrual = account.created_at.replace(tzinfo=timezone.utc) if account.created_at.tzinfo is None else account.created_at

                    # Ensure timezone awareness
                    if last_accrual.tzinfo is None:
                        last_accrual = last_accrual.replace(tzinfo=timezone.utc)

                    days_elapsed = (now - last_accrual).days

                    if days_elapsed <= 0:
                        continue

                    # Calculate interest
                    balance = Decimal(str(account.current_balance))
                    rate = Decimal(str(account.interest_rate))
                    accrued = Decimal(str(account.accrued_interest or 0))

                    # Determine principal based on accrual method
                    if account.interest_accrual_method == "compound":
                        principal = balance + accrued
                    else:
                        principal = balance

                    # Daily interest rate (APY / 365)
                    daily_rate = rate / Decimal("365")
                    interest = principal * daily_rate * days_elapsed

                    # Round to 2 decimal places
                    interest = interest.quantize(Decimal("0.01"))

                    if interest > 0:
                        # Update account
                        account.accrued_interest = accrued + interest
                        account.last_interest_accrual = now
                        account.updated_at = now

                        accounts_processed += 1
                        total_interest_accrued += interest

                        logger.debug(f"Account {account.id}: accrued {interest} interest")

                except Exception as e:
                    logger.error(f"Error calculating interest for account {account.id}: {e}")
                    continue

            await db.commit()

            logger.info(f"Daily interest calculation complete: {accounts_processed} accounts, {total_interest_accrued} total interest")

            return {
                "accounts_processed": accounts_processed,
                "total_interest_accrued": float(total_interest_accrued),
                "timestamp": now.isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_calculate())


@celery_app.task(base=BaseTask, bind=True, name="tasks.savings.accrue_monthly_interest")
def accrue_monthly_interest(self) -> Dict[str, Any]:
    """
    Monthly task to post accrued interest to accounts.

    For each savings account with accrued_interest > 0:
    1. Add accrued_interest to current_balance
    2. Create account transaction for interest
    3. Reset accrued_interest to 0
    4. Create balance history entry
    5. Dispatch notification event

    Returns:
        Dict with results
    """
    import asyncio

    async def _accrue():
        async with get_async_db_session() as db:
            now = datetime.now(timezone.utc)

            # Get all accounts with accrued interest
            result = await db.execute(
                select(SavingsAccount).where(
                    and_(
                        SavingsAccount.is_active == True,
                        SavingsAccount.accrued_interest > 0
                    )
                )
            )
            accounts = list(result.scalars().all())

            accounts_processed = 0
            total_interest_posted = Decimal("0")
            transactions_created = 0

            for account in accounts:
                try:
                    accrued = Decimal(str(account.accrued_interest))
                    if accrued <= 0:
                        continue

                    balance_before = Decimal(str(account.current_balance))
                    balance_after = balance_before + accrued

                    # Create interest transaction
                    transaction = AccountTransaction(
                        account_id=account.id,
                        user_id=account.user_id,
                        transaction_type=TransactionType.INTEREST.value,
                        amount=accrued,
                        currency=account.currency,
                        balance_before=balance_before,
                        balance_after=balance_after,
                        source_type="interest",
                        description=f"Monthly interest ({float(account.interest_rate) * 100:.2f}% APY)",
                        transaction_date=now,
                        posted_date=now,
                        status=TransactionStatus.COMPLETED.value,
                    )
                    db.add(transaction)

                    # Create balance history entry
                    history = BalanceHistory(
                        account_id=account.id,
                        balance=balance_after,
                        date=now,
                        change_amount=accrued,
                        change_reason="Monthly interest"
                    )
                    db.add(history)

                    # Update account
                    account.current_balance = balance_after
                    account.accrued_interest = Decimal("0")
                    account.updated_at = now

                    accounts_processed += 1
                    total_interest_posted += accrued
                    transactions_created += 1

                    # Dispatch event for notification
                    await event_dispatcher.dispatch(
                        SavingsEvents.INTEREST_ACCRUED,
                        user_id=account.user_id,
                        account_id=str(account.id),
                        account_name=account.name,
                        interest_amount=float(accrued),
                        currency=account.currency,
                        new_balance=float(balance_after),
                    )

                    logger.debug(f"Account {account.id}: posted {accrued} interest")

                except Exception as e:
                    logger.error(f"Error posting interest for account {account.id}: {e}")
                    continue

            await db.commit()

            logger.info(f"Monthly interest posting complete: {accounts_processed} accounts, {total_interest_posted} total posted")

            return {
                "accounts_processed": accounts_processed,
                "total_interest_posted": float(total_interest_posted),
                "transactions_created": transactions_created,
                "timestamp": now.isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_accrue())


@celery_app.task(base=BaseTask, bind=True, name="tasks.savings.create_balance_snapshot")
def create_balance_snapshot(self) -> Dict[str, Any]:
    """
    Daily task to create balance history snapshots.

    For each active savings account:
    1. Record current balance in balance_history
    2. Calculate change from previous day

    Returns:
        Dict with results
    """
    import asyncio

    async def _snapshot():
        async with get_async_db_session() as db:
            now = datetime.now(timezone.utc)

            # Get all active accounts
            result = await db.execute(
                select(SavingsAccount).where(SavingsAccount.is_active == True)
            )
            accounts = list(result.scalars().all())

            accounts_processed = 0
            snapshots_created = 0

            for account in accounts:
                try:
                    # Get the most recent balance history entry
                    history_result = await db.execute(
                        select(BalanceHistory)
                        .where(BalanceHistory.account_id == account.id)
                        .order_by(BalanceHistory.date.desc())
                        .limit(1)
                    )
                    last_history = history_result.scalar_one_or_none()

                    current_balance = Decimal(str(account.current_balance))

                    # Calculate change from previous
                    if last_history:
                        previous_balance = Decimal(str(last_history.balance))
                        change_amount = current_balance - previous_balance

                        # Skip if no change
                        if change_amount == 0:
                            accounts_processed += 1
                            continue
                    else:
                        change_amount = current_balance

                    # Create snapshot
                    history = BalanceHistory(
                        account_id=account.id,
                        balance=current_balance,
                        date=now,
                        change_amount=change_amount,
                        change_reason="Daily snapshot"
                    )
                    db.add(history)

                    accounts_processed += 1
                    snapshots_created += 1

                except Exception as e:
                    logger.error(f"Error creating snapshot for account {account.id}: {e}")
                    continue

            await db.commit()

            logger.info(f"Balance snapshots complete: {snapshots_created} snapshots for {accounts_processed} accounts")

            return {
                "accounts_processed": accounts_processed,
                "snapshots_created": snapshots_created,
                "timestamp": now.isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_snapshot())
