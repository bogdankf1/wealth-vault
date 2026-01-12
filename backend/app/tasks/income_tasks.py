"""
Income-related Celery tasks.

Tasks:
- Process recurring income sources and create transactions
- Deposit income to linked accounts
- Apply distribution rules
"""
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any

from app.core.celery_app import celery_app
from app.tasks.base import BaseTask, get_async_db_session

logger = logging.getLogger(__name__)


@celery_app.task(base=BaseTask, bind=True, name="tasks.income.process_recurring_income")
def process_recurring_income(self) -> Dict[str, Any]:
    """
    Daily task to process recurring income sources.

    For each active recurring income source:
    1. Check if payment is due today (based on frequency and start_date)
    2. Create an IncomeTransaction record
    3. If auto_deposit is enabled, deposit to linked account
    4. Apply distribution rules if configured

    Returns:
        Dict with processing results
    """
    import asyncio

    async def _process():
        async with get_async_db_session() as db:
            # TODO: Implement in Phase 2
            # - Query income sources where next_payment_date <= today
            # - Create income transactions
            # - Apply distribution rules
            # - Update next_payment_date
            logger.info("Processing recurring income - placeholder")
            return {
                "processed": 0,
                "deposited": 0,
                "errors": 0,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_process())


@celery_app.task(base=BaseTask, bind=True, name="tasks.income.deposit_income_to_account")
def deposit_income_to_account(
    self,
    income_transaction_id: str,
    account_id: str,
    amount: float,
    currency: str
) -> Dict[str, Any]:
    """
    Deposit a specific income transaction to a savings account.

    Args:
        income_transaction_id: UUID of the income transaction
        account_id: UUID of the target savings account
        amount: Amount to deposit
        currency: Currency code

    Returns:
        Dict with deposit result
    """
    import asyncio

    async def _deposit():
        async with get_async_db_session() as db:
            # TODO: Implement in Phase 2
            logger.info(f"Depositing {amount} {currency} to account {account_id}")
            return {
                "success": True,
                "income_transaction_id": income_transaction_id,
                "account_id": account_id,
                "amount": amount,
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

    async def _distribute():
        async with get_async_db_session() as db:
            # TODO: Implement in Phase 2
            logger.info(f"Applying distribution rules for user {user_id}")
            return {
                "success": True,
                "distributions": [],
                "remaining": amount,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_distribute())
