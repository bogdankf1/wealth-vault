"""
Budget-related Celery tasks.

Tasks:
- Check budget alerts
- Process budget period resets
- Calculate rollover amounts
"""
import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Dict, Any

from sqlalchemy import select, and_

from app.core.celery_app import celery_app
from app.tasks.base import BaseTask, get_async_db_session
from app.modules.budgets.models import Budget
from app.modules.expenses.models import Expense
from app.core.events import event_dispatcher, BudgetEvents
from app.services.currency_service import CurrencyService

logger = logging.getLogger(__name__)


async def _get_expenses_for_budget_task(db, budget, user_id) -> list:
    """Get expenses matching budget category and period."""
    from sqlalchemy import or_

    conditions = [
        Expense.user_id == user_id,
        Expense.category == budget.category,
        Expense.is_active == True,
        Expense.deleted_at.is_(None)
    ]

    # Date conditions for one-time (date) or recurring (start_date)
    date_conditions = []
    effective_start = budget.start_date
    effective_end = budget.end_date

    if effective_end:
        date_conditions.append(
            and_(
                Expense.date.isnot(None),
                Expense.date >= effective_start,
                Expense.date <= effective_end
            )
        )
        date_conditions.append(
            and_(
                Expense.start_date.isnot(None),
                Expense.start_date >= effective_start,
                Expense.start_date <= effective_end
            )
        )
    else:
        date_conditions.append(
            and_(
                Expense.date.isnot(None),
                Expense.date >= effective_start
            )
        )
        date_conditions.append(
            and_(
                Expense.start_date.isnot(None),
                Expense.start_date >= effective_start
            )
        )

    conditions.append(or_(*date_conditions))

    query = select(Expense).where(and_(*conditions))
    result = await db.execute(query)
    return list(result.scalars().all())


async def _calculate_spent_amount(db, budget, expenses) -> Decimal:
    """Calculate total spent amount, converting currencies if needed."""
    currency_service = CurrencyService(db)
    total = Decimal("0")

    for expense in expenses:
        expense_date = expense.date or expense.start_date
        if expense_date and expense_date >= budget.start_date:
            if budget.end_date is None or expense_date <= budget.end_date:
                expense_amount = expense.amount

                if expense.currency != budget.currency:
                    converted = await currency_service.convert_amount(
                        expense.amount,
                        expense.currency,
                        budget.currency
                    )
                    if converted is not None:
                        expense_amount = converted

                total += expense_amount

    return total


@celery_app.task(base=BaseTask, bind=True, name="tasks.budget.check_alerts")
def check_budget_alerts(self) -> Dict[str, Any]:
    """
    Periodic task to check budget alerts.

    For each active budget:
    1. Calculate current spending
    2. Check if spending exceeds alert_threshold (80% by default)
    3. Check if budget is overspent (100%+)
    4. Dispatch events to create notifications
    5. Track alert state to avoid duplicate notifications

    Returns:
        Dict with results
    """
    import asyncio

    async def _check():
        async with get_async_db_session() as db:
            now = datetime.now(timezone.utc)

            # Get all active budgets
            result = await db.execute(
                select(Budget).where(
                    and_(
                        Budget.is_active == True,
                        Budget.deleted_at.is_(None)
                    )
                )
            )
            budgets = list(result.scalars().all())

            budgets_checked = 0
            warnings_triggered = 0
            exceeded_triggered = 0

            for budget in budgets:
                try:
                    # Get expenses for this budget
                    expenses = await _get_expenses_for_budget_task(db, budget, budget.user_id)

                    # Calculate spent amount
                    spent = await _calculate_spent_amount(db, budget, expenses)

                    # Calculate percentage
                    if budget.amount > 0:
                        percentage_used = float((spent / budget.amount) * 100)
                    else:
                        percentage_used = 0

                    percentage_int = int(percentage_used)
                    last_alert_pct = budget.last_alert_percentage or 0

                    # Check if we should trigger an alert
                    # We trigger if:
                    # 1. Percentage crossed the threshold since last alert
                    # 2. Percentage crossed 100% since last alert

                    should_warn = (
                        percentage_int >= budget.alert_threshold and
                        percentage_int < 100 and
                        last_alert_pct < budget.alert_threshold
                    )

                    should_exceed = (
                        percentage_int >= 100 and
                        last_alert_pct < 100
                    )

                    if should_exceed:
                        # Budget exceeded - high priority alert
                        overspent_amount = float(spent - budget.amount)
                        await event_dispatcher.dispatch(
                            BudgetEvents.THRESHOLD_EXCEEDED,
                            user_id=budget.user_id,
                            budget_id=str(budget.id),
                            budget_name=budget.name,
                            category=budget.category,
                            spent_amount=float(spent),
                            budget_amount=float(budget.amount),
                            overspent=overspent_amount,  # Key expected by handler
                            spent_percent=percentage_int,  # Key expected by handler
                            currency=budget.currency,
                        )

                        # Update alert tracking
                        budget.last_alert_at = now.replace(tzinfo=None)
                        budget.last_alert_percentage = percentage_int
                        exceeded_triggered += 1

                        logger.info(f"Budget exceeded alert: {budget.name} at {percentage_int}%")

                    elif should_warn:
                        # Approaching threshold - warning
                        remaining_amount = float(budget.amount - spent)
                        await event_dispatcher.dispatch(
                            BudgetEvents.THRESHOLD_WARNING,
                            user_id=budget.user_id,
                            budget_id=str(budget.id),
                            budget_name=budget.name,
                            category=budget.category,
                            spent_amount=float(spent),
                            budget_amount=float(budget.amount),
                            remaining=remaining_amount,  # Key expected by handler
                            spent_percent=percentage_int,  # Key expected by handler
                            threshold=budget.alert_threshold,
                            currency=budget.currency,
                        )

                        # Update alert tracking
                        budget.last_alert_at = now.replace(tzinfo=None)
                        budget.last_alert_percentage = percentage_int
                        warnings_triggered += 1

                        logger.info(f"Budget warning alert: {budget.name} at {percentage_int}%")

                    budgets_checked += 1

                except Exception as e:
                    logger.error(f"Error checking budget {budget.id}: {e}")
                    continue

            await db.commit()

            logger.info(f"Budget alert check complete: {budgets_checked} checked, {warnings_triggered} warnings, {exceeded_triggered} exceeded")

            return {
                "budgets_checked": budgets_checked,
                "warnings_triggered": warnings_triggered,
                "exceeded_triggered": exceeded_triggered,
                "total_alerts": warnings_triggered + exceeded_triggered,
                "timestamp": now.isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_check())


@celery_app.task(base=BaseTask, bind=True, name="tasks.budget.check_budget_for_category")
def check_budget_for_category(self, user_id: str, category: str) -> Dict[str, Any]:
    """
    Check budgets for a specific user and category.
    Called in real-time when expenses are created/updated.

    Args:
        user_id: The user's UUID as string
        category: The expense category to check

    Returns:
        Dict with results
    """
    import asyncio
    from uuid import UUID as UUIDType

    async def _check_category():
        async with get_async_db_session() as db:
            now = datetime.now(timezone.utc)
            user_uuid = UUIDType(user_id)

            # Get active budgets for this user and category
            result = await db.execute(
                select(Budget).where(
                    and_(
                        Budget.user_id == user_uuid,
                        Budget.category == category,
                        Budget.is_active == True,
                        Budget.deleted_at.is_(None)
                    )
                )
            )
            budgets = list(result.scalars().all())

            alerts_triggered = 0

            for budget in budgets:
                try:
                    # Get expenses for this budget
                    expenses = await _get_expenses_for_budget_task(db, budget, user_uuid)

                    # Calculate spent amount
                    spent = await _calculate_spent_amount(db, budget, expenses)

                    # Calculate percentage
                    if budget.amount > 0:
                        percentage_used = float((spent / budget.amount) * 100)
                    else:
                        percentage_used = 0

                    percentage_int = int(percentage_used)
                    last_alert_pct = budget.last_alert_percentage or 0

                    # Check if we should trigger an alert
                    should_warn = (
                        percentage_int >= budget.alert_threshold and
                        percentage_int < 100 and
                        last_alert_pct < budget.alert_threshold
                    )

                    should_exceed = (
                        percentage_int >= 100 and
                        last_alert_pct < 100
                    )

                    if should_exceed:
                        overspent_amount = float(spent - budget.amount)
                        await event_dispatcher.dispatch(
                            BudgetEvents.THRESHOLD_EXCEEDED,
                            user_id=budget.user_id,
                            budget_id=str(budget.id),
                            budget_name=budget.name,
                            category=budget.category,
                            spent_amount=float(spent),
                            budget_amount=float(budget.amount),
                            overspent=overspent_amount,
                            spent_percent=percentage_int,
                            currency=budget.currency,
                        )
                        budget.last_alert_at = now.replace(tzinfo=None)
                        budget.last_alert_percentage = percentage_int
                        alerts_triggered += 1
                        logger.info(f"Real-time budget exceeded: {budget.name} at {percentage_int}%")

                    elif should_warn:
                        remaining_amount = float(budget.amount - spent)
                        await event_dispatcher.dispatch(
                            BudgetEvents.THRESHOLD_WARNING,
                            user_id=budget.user_id,
                            budget_id=str(budget.id),
                            budget_name=budget.name,
                            category=budget.category,
                            spent_amount=float(spent),
                            budget_amount=float(budget.amount),
                            remaining=remaining_amount,
                            spent_percent=percentage_int,
                            threshold=budget.alert_threshold,
                            currency=budget.currency,
                        )
                        budget.last_alert_at = now.replace(tzinfo=None)
                        budget.last_alert_percentage = percentage_int
                        alerts_triggered += 1
                        logger.info(f"Real-time budget warning: {budget.name} at {percentage_int}%")

                except Exception as e:
                    logger.error(f"Error checking budget {budget.id}: {e}")
                    continue

            await db.commit()

            return {
                "user_id": user_id,
                "category": category,
                "budgets_checked": len(budgets),
                "alerts_triggered": alerts_triggered,
                "timestamp": now.isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_check_category())


@celery_app.task(base=BaseTask, bind=True, name="tasks.budget.process_period_resets")
def process_period_resets(self) -> Dict[str, Any]:
    """
    Monthly task to process budget period resets.

    For each recurring budget where period has ended:
    1. Calculate spent amount for the period
    2. Calculate rollover amount if enabled (unused budget)
    3. Reset period dates for next cycle
    4. Reset alert tracking for new period
    5. Send notification to user about period reset

    Returns:
        Dict with results
    """
    import asyncio

    async def _process():
        async with get_async_db_session() as db:
            now = datetime.now(timezone.utc)

            # Get all active recurring budgets (end_date is NULL means recurring)
            result = await db.execute(
                select(Budget).where(
                    and_(
                        Budget.is_active == True,
                        Budget.deleted_at.is_(None),
                        Budget.end_date.is_(None)  # Recurring budgets only
                    )
                )
            )
            budgets = list(result.scalars().all())

            budgets_reset = 0
            rollovers_applied = 0
            notifications_sent = 0

            for budget in budgets:
                try:
                    # Calculate period end based on budget period type
                    period_end = _calculate_period_end(budget.start_date, budget.period)

                    # Check if current period has ended
                    if now.replace(tzinfo=None) < period_end:
                        continue  # Period hasn't ended yet

                    # Get expenses for this budget's current period
                    expenses = await _get_expenses_for_budget_task(db, budget, budget.user_id)

                    # Calculate spent amount
                    spent = await _calculate_spent_amount(db, budget, expenses)

                    # Calculate rollover if enabled
                    rollover_to_add = Decimal("0")
                    if budget.rollover_unused:
                        # Unused amount = effective_amount - spent
                        effective = budget.amount + (budget.rollover_amount or Decimal("0"))
                        unused = effective - spent
                        if unused > 0:
                            rollover_to_add = unused
                            rollovers_applied += 1
                            logger.info(f"Budget {budget.name}: Rolling over {rollover_to_add} {budget.currency}")

                    # Calculate new period start date
                    new_start = _calculate_next_period_start(budget.start_date, budget.period)

                    # Update budget for new period
                    budget.start_date = new_start
                    budget.rollover_amount = rollover_to_add  # Reset rollover to just the new rollover
                    budget.last_alert_at = None  # Reset alert tracking
                    budget.last_alert_percentage = None
                    budget.current_period_start = new_start

                    budgets_reset += 1

                    # Send notification about period reset
                    await event_dispatcher.dispatch(
                        BudgetEvents.PERIOD_RESET,
                        user_id=budget.user_id,
                        budget_id=str(budget.id),
                        budget_name=budget.name,
                        category=budget.category,
                        spent_amount=float(spent),
                        budget_amount=float(budget.amount),
                        rollover_amount=float(rollover_to_add),
                        new_period_start=new_start.isoformat(),
                        currency=budget.currency,
                    )
                    notifications_sent += 1

                    logger.info(f"Budget period reset: {budget.name}, new start: {new_start}")

                except Exception as e:
                    logger.error(f"Error processing budget {budget.id}: {e}")
                    continue

            await db.commit()

            logger.info(f"Budget period resets complete: {budgets_reset} reset, {rollovers_applied} rollovers")

            return {
                "budgets_reset": budgets_reset,
                "rollovers_applied": rollovers_applied,
                "notifications_sent": notifications_sent,
                "timestamp": now.isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_process())


def _calculate_period_end(start_date: datetime, period) -> datetime:
    """Calculate when the current budget period ends."""
    from dateutil.relativedelta import relativedelta
    from app.modules.budgets.models import BudgetPeriod

    if period == BudgetPeriod.MONTHLY:
        return start_date + relativedelta(months=1)
    elif period == BudgetPeriod.QUARTERLY:
        return start_date + relativedelta(months=3)
    elif period == BudgetPeriod.YEARLY:
        return start_date + relativedelta(years=1)
    else:
        return start_date + relativedelta(months=1)  # Default to monthly


def _calculate_next_period_start(current_start: datetime, period) -> datetime:
    """Calculate the start date of the next budget period."""
    from dateutil.relativedelta import relativedelta
    from app.modules.budgets.models import BudgetPeriod

    if period == BudgetPeriod.MONTHLY:
        return current_start + relativedelta(months=1)
    elif period == BudgetPeriod.QUARTERLY:
        return current_start + relativedelta(months=3)
    elif period == BudgetPeriod.YEARLY:
        return current_start + relativedelta(years=1)
    else:
        return current_start + relativedelta(months=1)  # Default to monthly


@celery_app.task(base=BaseTask, bind=True, name="tasks.budget.calculate_weekly_summary")
def calculate_weekly_summary(self) -> Dict[str, Any]:
    """
    Weekly task to calculate budget summaries.

    For each user:
    1. Calculate spending across all budgets
    2. Compare to same week last month
    3. Generate summary
    4. Optionally send email digest

    Returns:
        Dict with results
    """
    import asyncio

    async def _calculate():
        async with get_async_db_session() as _:
            # TODO: Implement in Phase 4
            logger.info("Calculating weekly budget summaries - placeholder")
            return {
                "users_processed": 0,
                "summaries_generated": 0,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_calculate())
