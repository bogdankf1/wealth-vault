"""
Debt-related Celery tasks.

Tasks:
- Calculate monthly interest
- Check payment reminders
- Update debt balances
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, Any

from app.core.celery_app import celery_app
from app.tasks.base import BaseTask, get_async_db_session

logger = logging.getLogger(__name__)


@celery_app.task(base=BaseTask, bind=True, name="tasks.debt.calculate_monthly_interest")
def calculate_monthly_interest(self) -> Dict[str, Any]:
    """
    Monthly task to calculate and apply debt interest.

    For each active debt with interest_rate > 0:
    1. Calculate monthly interest based on APR
    2. Add to accrued_interest
    3. If compound interest, add to principal
    4. Update last_interest_calculation date
    5. Send notification for high interest amounts

    Returns:
        Dict with results
    """
    import asyncio

    async def _calculate():
        async with get_async_db_session() as db:
            # TODO: Implement in Phase 7
            logger.info("Calculating debt interest - placeholder")
            return {
                "debts_processed": 0,
                "total_interest_accrued": 0,
                "notifications_sent": 0,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_calculate())


@celery_app.task(base=BaseTask, bind=True, name="tasks.debt.send_payment_reminders")
def send_payment_reminders(self) -> Dict[str, Any]:
    """
    Daily task to send debt payment reminders.

    For each active debt with minimum_payment set:
    1. Check if payment reminder is due
    2. Calculate recommended payment amount
    3. Send notification to user

    Returns:
        Dict with results
    """
    import asyncio

    async def _send():
        async with get_async_db_session() as db:
            # TODO: Implement in Phase 7
            logger.info("Sending debt payment reminders - placeholder")
            return {
                "debts_checked": 0,
                "reminders_sent": 0,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_send())


@celery_app.task(base=BaseTask, bind=True, name="tasks.debt.check_overdue_debts")
def check_overdue_debts(self) -> Dict[str, Any]:
    """
    Daily task to check for overdue debts.

    For each active debt with due_date:
    1. Check if debt is past due
    2. Calculate days overdue
    3. Mark as overdue
    4. Send urgent notification

    Returns:
        Dict with results
    """
    import asyncio

    async def _check():
        async with get_async_db_session() as db:
            # TODO: Implement in Phase 7
            logger.info("Checking overdue debts - placeholder")
            return {
                "debts_checked": 0,
                "overdue_count": 0,
                "notifications_sent": 0,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_check())
