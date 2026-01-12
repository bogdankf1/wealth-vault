"""
Expense-related Celery tasks.

Tasks:
- Process recurring expenses and create records
- Check for overdue expenses
- Auto-pay expenses from linked accounts
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, Any

from app.core.celery_app import celery_app
from app.tasks.base import BaseTask, get_async_db_session

logger = logging.getLogger(__name__)


@celery_app.task(base=BaseTask, bind=True, name="tasks.expense.process_recurring_expenses")
def process_recurring_expenses(self) -> Dict[str, Any]:
    """
    Daily task to process recurring expenses.

    For each active recurring expense:
    1. Check if payment is due today (based on frequency and start_date)
    2. Create an expense record with 'pending' status
    3. If auto_pay is enabled, deduct from linked account
    4. Update next_payment_date

    Returns:
        Dict with processing results
    """
    import asyncio

    async def _process():
        async with get_async_db_session() as db:
            # TODO: Implement in Phase 3
            logger.info("Processing recurring expenses - placeholder")
            return {
                "processed": 0,
                "auto_paid": 0,
                "errors": 0,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_process())


@celery_app.task(base=BaseTask, bind=True, name="tasks.expense.check_overdue_expenses")
def check_overdue_expenses(self) -> Dict[str, Any]:
    """
    Daily task to check for overdue expenses.

    1. Find pending expenses past their due date
    2. Mark as overdue
    3. Create notifications for users

    Returns:
        Dict with results
    """
    import asyncio

    async def _check():
        async with get_async_db_session() as db:
            # TODO: Implement in Phase 3
            logger.info("Checking for overdue expenses - placeholder")
            return {
                "overdue_count": 0,
                "notifications_sent": 0,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_check())


@celery_app.task(base=BaseTask, bind=True, name="tasks.expense.pay_expense_from_account")
def pay_expense_from_account(
    self,
    expense_id: str,
    account_id: str,
    amount: float,
    currency: str
) -> Dict[str, Any]:
    """
    Pay an expense from a savings account.

    Args:
        expense_id: UUID of the expense
        account_id: UUID of the savings account
        amount: Amount to pay
        currency: Currency code

    Returns:
        Dict with payment result
    """
    import asyncio

    async def _pay():
        async with get_async_db_session() as db:
            # TODO: Implement in Phase 3
            logger.info(f"Paying expense {expense_id} from account {account_id}")
            return {
                "success": True,
                "expense_id": expense_id,
                "account_id": account_id,
                "amount": amount,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_pay())
