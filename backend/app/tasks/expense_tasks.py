"""
Expense-related Celery tasks.

Tasks:
- Process recurring expenses and create records
- Check for overdue expenses
- Auto-pay expenses from linked accounts
"""
import logging
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, Any
from uuid import UUID

from app.core.celery_app import celery_app
from app.tasks.base import BaseTask, get_async_db_session

logger = logging.getLogger(__name__)


def is_expense_due_today(frequency: str, start_date: datetime) -> bool:
    """
    Check if an expense is due today based on its frequency and start date.

    Args:
        frequency: Expense frequency (daily, weekly, biweekly, monthly, quarterly, annually)
        start_date: The start date of the recurring expense

    Returns:
        True if expense is due today, False otherwise
    """
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    start = start_date.replace(hour=0, minute=0, second=0, microsecond=0)

    if start > today:
        return False

    days_since_start = (today - start).days

    if frequency == 'daily':
        return True
    elif frequency == 'weekly':
        return days_since_start % 7 == 0
    elif frequency == 'biweekly':
        return days_since_start % 14 == 0
    elif frequency == 'monthly':
        # Check if today is the same day of month as start date
        return today.day == start.day
    elif frequency == 'quarterly':
        # Check if same day and quarter boundary (3 month intervals)
        months_diff = (today.year - start.year) * 12 + (today.month - start.month)
        return months_diff % 3 == 0 and today.day == start.day
    elif frequency == 'annually':
        return today.month == start.month and today.day == start.day

    return False


@celery_app.task(base=BaseTask, bind=True, name="tasks.expense.process_recurring_expenses")
def process_recurring_expenses(self) -> Dict[str, Any]:
    """
    Daily task to process recurring expenses.

    For each active recurring expense:
    1. Check if payment is due today (based on frequency and start_date)
    2. If auto_pay is enabled and account is linked, deduct from account
    3. Mark expense as paid with today's date

    Returns:
        Dict with processing results
    """
    import asyncio
    from sqlalchemy import select, and_

    async def _process():
        async with get_async_db_session() as db:
            from app.modules.expenses.models import Expense, ExpenseFrequency, ExpenseStatus
            from app.modules.expenses.service import pay_expense
            from app.modules.expenses.schemas import PayExpenseRequest

            # Get all active recurring expenses with auto_pay enabled and linked accounts
            result = await db.execute(
                select(Expense).where(
                    and_(
                        Expense.is_active == True,
                        Expense.deleted_at.is_(None),
                        Expense.auto_pay == True,  # Only process expenses with auto_pay enabled
                        Expense.payment_account_id.isnot(None),
                        Expense.frequency != ExpenseFrequency.ONE_TIME.value,
                        Expense.start_date.isnot(None)
                    )
                )
            )
            expenses = result.scalars().all()

            processed = 0
            auto_paid = 0
            errors = 0

            for expense in expenses:
                try:
                    # Skip if not due today
                    if not is_expense_due_today(expense.frequency.value, expense.start_date):
                        continue

                    # Skip if already paid today
                    if expense.paid_date and expense.paid_date.date() == datetime.utcnow().date():
                        continue

                    # Reset status to pending if this is a new payment period
                    expense.status = ExpenseStatus.PENDING.value

                    # Try to pay from linked account
                    try:
                        pay_request = PayExpenseRequest(
                            account_id=expense.payment_account_id,
                            description=f"Auto-payment for recurring expense: {expense.name}"
                        )
                        await pay_expense(db, expense.user_id, expense.id, pay_request)
                        auto_paid += 1
                        logger.info(f"Auto-paid expense {expense.id} from account {expense.payment_account_id}")
                    except Exception as pay_error:
                        logger.warning(f"Failed to auto-pay expense {expense.id}: {pay_error}")
                        # Keep expense as pending if payment fails

                    processed += 1

                except Exception as e:
                    errors += 1
                    logger.error(f"Error processing expense {expense.id}: {e}")

            await db.commit()

            logger.info(f"Processed {processed} recurring expenses, auto-paid {auto_paid}, errors {errors}")

            return {
                "processed": processed,
                "auto_paid": auto_paid,
                "errors": errors,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_process())


@celery_app.task(base=BaseTask, bind=True, name="tasks.expense.check_overdue_expenses")
def check_overdue_expenses(self) -> Dict[str, Any]:
    """
    Daily task to check for overdue expenses.

    1. Find pending expenses past their due date
    2. Mark as overdue

    Returns:
        Dict with results
    """
    import asyncio

    async def _check():
        async with get_async_db_session() as db:
            from app.modules.expenses.service import mark_expenses_overdue

            overdue_count = await mark_expenses_overdue(db)

            logger.info(f"Marked {overdue_count} expenses as overdue")

            return {
                "overdue_count": overdue_count,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_check())


@celery_app.task(base=BaseTask, bind=True, name="tasks.expense.pay_expense_from_account")
def pay_expense_from_account(
    self,
    expense_id: str,
    account_id: str,
    user_id: str,
    amount: float = None,
    payment_method: str = None,
    description: str = None
) -> Dict[str, Any]:
    """
    Pay an expense from a savings account.

    Args:
        expense_id: UUID of the expense
        account_id: UUID of the savings account
        user_id: UUID of the user
        amount: Amount to pay (optional, defaults to expense amount)
        payment_method: Payment method (optional)
        description: Payment description (optional)

    Returns:
        Dict with payment result
    """
    import asyncio

    async def _pay():
        async with get_async_db_session() as db:
            from app.modules.expenses.service import pay_expense
            from app.modules.expenses.schemas import PayExpenseRequest

            pay_request = PayExpenseRequest(
                account_id=UUID(account_id),
                amount=Decimal(str(amount)) if amount else None,
                payment_method=payment_method,
                description=description
            )

            try:
                response = await pay_expense(
                    db,
                    UUID(user_id),
                    UUID(expense_id),
                    pay_request
                )

                logger.info(f"Successfully paid expense {expense_id} from account {account_id}")

                return {
                    "success": True,
                    "expense_id": expense_id,
                    "account_id": account_id,
                    "account_transaction_id": str(response.account_transaction_id) if response.account_transaction_id else None,
                    "paid_amount": float(response.paid_amount),
                    "status": response.status,
                    "message": response.message,
                    "timestamp": datetime.utcnow().isoformat()
                }
            except Exception as e:
                logger.error(f"Failed to pay expense {expense_id}: {e}")
                return {
                    "success": False,
                    "expense_id": expense_id,
                    "account_id": account_id,
                    "error": str(e),
                    "timestamp": datetime.utcnow().isoformat()
                }

    return asyncio.get_event_loop().run_until_complete(_pay())
