"""
Savings-related Celery tasks.

Tasks:
- Calculate daily interest
- Accrue monthly interest
- Update balance history
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, Any

from app.core.celery_app import celery_app
from app.tasks.base import BaseTask, get_async_db_session

logger = logging.getLogger(__name__)


@celery_app.task(base=BaseTask, bind=True, name="tasks.savings.calculate_daily_interest")
def calculate_daily_interest(self) -> Dict[str, Any]:
    """
    Daily task to calculate accrued interest.

    For each savings account with interest_rate > 0:
    1. Calculate daily interest based on APY
    2. Add to accrued_interest field
    3. Update last_interest_calculation date

    Note: Interest is calculated but not posted until monthly accrual.

    Returns:
        Dict with results
    """
    import asyncio

    async def _calculate():
        async with get_async_db_session() as db:
            # TODO: Implement in Phase 1
            logger.info("Calculating daily interest - placeholder")
            return {
                "accounts_processed": 0,
                "total_interest_accrued": 0,
                "timestamp": datetime.utcnow().isoformat()
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
    5. Optionally send notification

    Returns:
        Dict with results
    """
    import asyncio

    async def _accrue():
        async with get_async_db_session() as db:
            # TODO: Implement in Phase 1
            logger.info("Accruing monthly interest - placeholder")
            return {
                "accounts_processed": 0,
                "total_interest_posted": 0,
                "transactions_created": 0,
                "timestamp": datetime.utcnow().isoformat()
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
            # TODO: Implement in Phase 1
            logger.info("Creating balance snapshots - placeholder")
            return {
                "accounts_processed": 0,
                "snapshots_created": 0,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_snapshot())
