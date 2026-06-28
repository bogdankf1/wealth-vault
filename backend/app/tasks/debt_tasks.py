"""
Debt-related Celery tasks.

Tasks:
- Send payment reminders for debts owed to user
- Check overdue debts
- Calculate interest accrual
"""
import logging
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, Any

from sqlalchemy import select, and_

from app.core.celery_app import celery_app
from app.tasks.base import BaseTask, get_async_db_session

logger = logging.getLogger(__name__)


@celery_app.task(base=BaseTask, bind=True, name="tasks.debt.send_payment_reminders")
def send_payment_reminders(self) -> Dict[str, Any]:
    """
    Daily task to send reminders for upcoming debt payments.

    For each active debt with due_date or next_payment_date:
    1. Check if reminder should be sent (based on reminder_days_before)
    2. Avoid duplicate reminders (check last_reminder_at)
    3. Send notification to user
    4. Update last_reminder_at

    Returns:
        Dict with results
    """
    import asyncio

    async def _send():
        from app.modules.debts.models import Debt
        from app.modules.notifications.service import NotificationService

        async with get_async_db_session() as db:
            now = datetime.utcnow()
            reminders_sent = 0
            debts_checked = 0

            # Get all active debts that are not fully paid
            result = await db.execute(
                select(Debt).where(
                    and_(
                        Debt.is_active == True,
                        Debt.is_paid == False,
                        Debt.deleted_at.is_(None)
                    )
                )
            )
            debts = list(result.scalars().all())
            debts_checked = len(debts)

            notification_service = NotificationService(db)

            for debt in debts:
                try:
                    # Determine the target date (due_date or next_payment_date)
                    target_date = debt.next_payment_date or debt.due_date
                    if not target_date:
                        continue

                    target_date = target_date.replace(tzinfo=None) if target_date.tzinfo else target_date
                    reminder_days = debt.reminder_days_before or 3

                    # Check if we should send a reminder
                    reminder_threshold = target_date - timedelta(days=reminder_days)

                    if now >= reminder_threshold and now < target_date:
                        # Check if we already sent a reminder recently (within 24 hours)
                        if debt.last_reminder_at:
                            last_reminder = debt.last_reminder_at.replace(tzinfo=None) if debt.last_reminder_at.tzinfo else debt.last_reminder_at
                            if (now - last_reminder).total_seconds() < 86400:  # 24 hours
                                continue

                        # Calculate days until due
                        days_until_due = (target_date - now).days

                        # Send notification
                        await notification_service.create_notification(
                            user_id=debt.user_id,
                            type="reminder",
                            category="debt",
                            title="Debt Payment Due Soon",
                            message=f"Payment from {debt.debtor_name} is due in {days_until_due} day(s). Amount: {debt.currency} {debt.amount_remaining}",
                            priority=3,
                            action_url=f"/dashboard/debts/{debt.id}",
                            metadata={
                                "debt_id": str(debt.id),
                                "debtor_name": debt.debtor_name,
                                "amount_remaining": str(debt.amount_remaining),
                                "currency": debt.currency,
                                "days_until_due": days_until_due
                            }
                        )

                        # Update last_reminder_at
                        debt.last_reminder_at = now
                        reminders_sent += 1

                except Exception as e:
                    logger.error(f"Error processing reminder for debt {debt.id}: {e}")

            await db.commit()

            logger.info(f"Debt reminders: checked {debts_checked}, sent {reminders_sent}")
            return {
                "debts_checked": debts_checked,
                "reminders_sent": reminders_sent,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_send())


@celery_app.task(base=BaseTask, bind=True, name="tasks.debt.check_overdue_debts")
def check_overdue_debts(self) -> Dict[str, Any]:
    """
    Daily task to check for overdue debts (money not received on time).

    For each active debt with due_date:
    1. Check if debt is past due
    2. Calculate days overdue
    3. Send urgent notification

    Returns:
        Dict with results
    """
    import asyncio

    async def _check():
        from app.modules.debts.models import Debt
        from app.modules.notifications.service import NotificationService

        async with get_async_db_session() as db:
            now = datetime.utcnow()
            overdue_count = 0
            notifications_sent = 0

            # Get all active debts with due_date in the past that are not paid
            result = await db.execute(
                select(Debt).where(
                    and_(
                        Debt.is_active == True,
                        Debt.is_paid == False,
                        Debt.deleted_at.is_(None),
                        Debt.due_date.isnot(None),
                        Debt.due_date < now
                    )
                )
            )
            debts = list(result.scalars().all())

            notification_service = NotificationService(db)

            for debt in debts:
                try:
                    due_date = debt.due_date.replace(tzinfo=None) if debt.due_date.tzinfo else debt.due_date
                    days_overdue = (now - due_date).days
                    overdue_count += 1

                    # Send notification for newly overdue debts (within first 24 hours of being overdue)
                    # or weekly reminders for long-overdue debts
                    should_notify = (
                        days_overdue <= 1 or  # First day overdue
                        (days_overdue % 7 == 0)  # Weekly reminder
                    )

                    if should_notify:
                        # Check if we already sent an overdue notification today
                        if debt.last_reminder_at:
                            last_reminder = debt.last_reminder_at.replace(tzinfo=None) if debt.last_reminder_at.tzinfo else debt.last_reminder_at
                            if (now - last_reminder).total_seconds() < 86400:
                                continue

                        await notification_service.create_notification(
                            user_id=debt.user_id,
                            type="warning",
                            category="debt",
                            title="Debt Payment Overdue",
                            message=f"Payment from {debt.debtor_name} is {days_overdue} day(s) overdue. Outstanding: {debt.currency} {debt.amount_remaining}",
                            priority=4,
                            action_url=f"/dashboard/debts/{debt.id}",
                            metadata={
                                "debt_id": str(debt.id),
                                "debtor_name": debt.debtor_name,
                                "amount_remaining": str(debt.amount_remaining),
                                "currency": debt.currency,
                                "days_overdue": days_overdue
                            }
                        )

                        debt.last_reminder_at = now
                        notifications_sent += 1

                except Exception as e:
                    logger.error(f"Error checking overdue debt {debt.id}: {e}")

            await db.commit()

            logger.info(f"Overdue debts: found {overdue_count}, notifications sent {notifications_sent}")
            return {
                "debts_checked": len(debts),
                "overdue_count": overdue_count,
                "notifications_sent": notifications_sent,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_check())


@celery_app.task(base=BaseTask, bind=True, name="tasks.debt.calculate_monthly_interest")
def calculate_monthly_interest(self) -> Dict[str, Any]:
    """
    Monthly task to calculate and apply interest on debts owed to user.

    For each active debt with interest_rate > 0:
    1. Calculate monthly interest based on APR
    2. Add to accrued_interest field
    3. Send notification for significant interest amounts

    Returns:
        Dict with results
    """
    import asyncio

    async def _calculate():
        from app.modules.debts.models import Debt
        from app.modules.notifications.service import NotificationService

        async with get_async_db_session() as db:
            debts_processed = 0
            total_interest_accrued = Decimal('0')
            notifications_sent = 0

            # Get all active debts with interest rate
            result = await db.execute(
                select(Debt).where(
                    and_(
                        Debt.is_active == True,
                        Debt.is_paid == False,
                        Debt.deleted_at.is_(None),
                        Debt.interest_rate.isnot(None),
                        Debt.interest_rate > 0
                    )
                )
            )
            debts = list(result.scalars().all())

            notification_service = NotificationService(db)

            for debt in debts:
                try:
                    # Calculate remaining balance (what's still owed to us)
                    remaining = Decimal(str(debt.amount)) - Decimal(str(debt.amount_paid))
                    if remaining <= 0:
                        continue

                    # Calculate monthly interest (APR / 12)
                    annual_rate = Decimal(str(debt.interest_rate)) / 100
                    monthly_rate = annual_rate / 12
                    monthly_interest = remaining * monthly_rate

                    # Add to accrued interest
                    current_accrued = Decimal(str(debt.accrued_interest or 0))
                    debt.accrued_interest = current_accrued + monthly_interest

                    debts_processed += 1
                    total_interest_accrued += monthly_interest

                    # Send notification for significant interest accrual (> 10 in user currency)
                    if monthly_interest > 10:
                        await notification_service.create_notification(
                            user_id=debt.user_id,
                            type="info",
                            category="debt",
                            title="Interest Accrued on Debt",
                            message=f"Interest of {debt.currency} {monthly_interest:.2f} has accrued on debt from {debt.debtor_name}",
                            priority=2,
                            action_url=f"/dashboard/debts/{debt.id}",
                            metadata={
                                "debt_id": str(debt.id),
                                "debtor_name": debt.debtor_name,
                                "interest_amount": str(monthly_interest),
                                "currency": debt.currency
                            }
                        )
                        notifications_sent += 1

                except Exception as e:
                    logger.error(f"Error calculating interest for debt {debt.id}: {e}")

            await db.commit()

            logger.info(f"Interest calculation: processed {debts_processed} debts, accrued {total_interest_accrued}")
            return {
                "debts_processed": debts_processed,
                "total_interest_accrued": str(total_interest_accrued),
                "notifications_sent": notifications_sent,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_calculate())
