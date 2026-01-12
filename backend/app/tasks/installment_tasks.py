"""
Installment-related Celery tasks.

Tasks:
- Process installment payments
- Check for late payments
- Mark completed installments
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, Any

from app.core.celery_app import celery_app
from app.tasks.base import BaseTask, get_async_db_session

logger = logging.getLogger(__name__)


@celery_app.task(base=BaseTask, bind=True, name="tasks.installment.process_payments")
def process_installment_payments(self) -> Dict[str, Any]:
    """
    Daily task to process installment payments.

    For each active installment:
    1. Check if payment is due today (based on next_payment_date)
    2. Create an expense record for the payment
    3. If auto_pay is enabled, deduct from linked account
    4. Record payment in installment_payments table
    5. Update remaining_balance and payments_made
    6. Update next_payment_date

    Returns:
        Dict with processing results
    """
    import asyncio

    async def _process():
        async with get_async_db_session() as db:
            # TODO: Implement in Phase 6
            logger.info("Processing installment payments - placeholder")
            return {
                "payments_processed": 0,
                "expenses_created": 0,
                "auto_paid": 0,
                "completed": 0,
                "errors": 0,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_process())


@celery_app.task(base=BaseTask, bind=True, name="tasks.installment.check_late_payments")
def check_late_payments(self) -> Dict[str, Any]:
    """
    Daily task to check for late installment payments.

    1. Find scheduled payments past due date that aren't paid
    2. Mark as late
    3. Calculate days late
    4. Send notification to user

    Returns:
        Dict with results
    """
    import asyncio

    async def _check():
        async with get_async_db_session() as db:
            # TODO: Implement in Phase 6
            logger.info("Checking late installment payments - placeholder")
            return {
                "late_count": 0,
                "notifications_sent": 0,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_check())


@celery_app.task(base=BaseTask, bind=True, name="tasks.installment.mark_completed")
def mark_completed_installments(self) -> Dict[str, Any]:
    """
    Daily task to mark completed installments.

    1. Find installments where payments_made >= number_of_payments
    2. Mark as completed
    3. Set status to 'completed'
    4. Send notification to user

    Returns:
        Dict with results
    """
    import asyncio

    async def _check():
        async with get_async_db_session() as db:
            # TODO: Implement in Phase 6
            logger.info("Marking completed installments - placeholder")
            return {
                "completed_count": 0,
                "notifications_sent": 0,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_check())
