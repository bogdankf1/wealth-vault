"""
Installment-related Celery tasks.

Tasks:
- Process installment payments due
- Send payment reminders
- Check for late payments
- Mark completed installments
"""
import logging
from datetime import datetime, timezone
from typing import Dict, Any

from sqlalchemy import select, and_

from app.core.celery_app import celery_app
from app.tasks.base import BaseTask, get_async_db_session
from app.modules.installments.models import Installment
from app.modules.installments.service import (
    get_due_installments,
    get_installments_for_reminder,
    process_installment_payment,
    calculate_next_installment_payment_date,
)
from app.core.events import event_dispatcher, InstallmentEvents

logger = logging.getLogger(__name__)


@celery_app.task(base=BaseTask, bind=True, name="tasks.installment.process_payments")
def process_installment_payments(self) -> Dict[str, Any]:
    """
    Daily task to process installment payments.

    For each active installment with payment due:
    1. Check if payment is due today (based on next_payment_date)
    2. Create an expense record for the payment
    3. If auto_pay is enabled, deduct from linked account
    4. Record payment in installment_payments table
    5. Update next_payment_date and payments_made

    Returns:
        Dict with processing results
    """
    import asyncio

    async def _process():
        async with get_async_db_session() as db:
            now = datetime.now(timezone.utc)

            # Get all installments with payments due
            due_installments = await get_due_installments(db, now)

            processed = 0
            expenses_created = 0
            auto_paid = 0
            completed = 0
            errors = 0

            for installment in due_installments:
                try:
                    # Process the payment
                    payment = await process_installment_payment(
                        db=db,
                        installment=installment,
                        payment_date=now.replace(tzinfo=None),
                        notes="Auto-processed installment payment"
                    )

                    if payment:
                        processed += 1
                        expenses_created += 1

                        if payment.account_transaction_id:
                            auto_paid += 1

                        # Check if installment completed
                        if installment.status == "completed":
                            completed += 1
                            # Dispatch completion event
                            await event_dispatcher.dispatch(
                                InstallmentEvents.COMPLETED,
                                user_id=installment.user_id,
                                installment_id=str(installment.id),
                                installment_name=installment.name,
                                total_paid=float(installment.total_amount),
                                currency=installment.currency,
                            )
                        else:
                            # Dispatch payment processed event
                            await event_dispatcher.dispatch(
                                InstallmentEvents.PAYMENT_PROCESSED,
                                user_id=installment.user_id,
                                installment_id=str(installment.id),
                                installment_name=installment.name,
                                payment_number=payment.payment_number,
                                amount=float(payment.actual_amount or payment.scheduled_amount),
                                currency=installment.currency,
                                next_payment_date=installment.next_payment_date.isoformat() if installment.next_payment_date else None,
                                auto_paid=payment.account_transaction_id is not None,
                                payments_remaining=installment.number_of_payments - installment.payments_made,
                            )

                        logger.info(f"Processed payment #{payment.payment_number} for installment: {installment.name}")

                except Exception as e:
                    errors += 1
                    logger.error(f"Error processing installment {installment.id}: {e}")
                    continue

            await db.commit()

            logger.info(f"Installment payments complete: {processed} processed, {expenses_created} expenses, {auto_paid} auto-paid, {completed} completed, {errors} errors")

            return {
                "processed": processed,
                "expenses_created": expenses_created,
                "auto_paid": auto_paid,
                "completed": completed,
                "errors": errors,
                "timestamp": now.isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_process())


@celery_app.task(base=BaseTask, bind=True, name="tasks.installment.send_reminders")
def send_payment_reminders(self) -> Dict[str, Any]:
    """
    Daily task to send payment reminders.

    1. Find installments with next_payment_date within reminder window
    2. Check if reminder hasn't been sent recently
    3. Create notification for user

    Returns:
        Dict with results
    """
    import asyncio

    async def _send():
        async with get_async_db_session() as db:
            now = datetime.now(timezone.utc)

            # Get installments that need reminders
            installments = await get_installments_for_reminder(db, now)

            reminders_sent = 0

            for installment in installments:
                try:
                    days_until = 0
                    if installment.next_payment_date:
                        next_payment = installment.next_payment_date.replace(tzinfo=None) if installment.next_payment_date.tzinfo else installment.next_payment_date
                        days_until = (next_payment - now.replace(tzinfo=None)).days

                    # Dispatch reminder event
                    await event_dispatcher.dispatch(
                        InstallmentEvents.PAYMENT_REMINDER,
                        user_id=installment.user_id,
                        installment_id=str(installment.id),
                        installment_name=installment.name,
                        amount=float(installment.amount_per_payment),
                        currency=installment.currency,
                        next_payment_date=installment.next_payment_date.isoformat() if installment.next_payment_date else None,
                        days_until_payment=days_until,
                        payment_number=installment.payments_made + 1,
                        payments_remaining=installment.number_of_payments - installment.payments_made,
                        auto_pay_enabled=installment.auto_pay,
                    )

                    # Update last reminder timestamp
                    installment.last_reminder_at = now.replace(tzinfo=None)
                    reminders_sent += 1

                    logger.info(f"Sent payment reminder for installment: {installment.name} ({days_until} days)")

                except Exception as e:
                    logger.error(f"Error sending reminder for installment {installment.id}: {e}")
                    continue

            await db.commit()

            logger.info(f"Installment reminders complete: {reminders_sent} sent")

            return {
                "reminders_sent": reminders_sent,
                "timestamp": now.isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_send())


@celery_app.task(base=BaseTask, bind=True, name="tasks.installment.check_late_payments")
def check_late_payments(self) -> Dict[str, Any]:
    """
    Daily task to check for late installment payments.

    1. Find active installments where next_payment_date is in the past
    2. Send notification for late payments
    3. Consider marking severely late installments as defaulted

    Returns:
        Dict with results
    """
    import asyncio

    async def _check():
        async with get_async_db_session() as db:
            now = datetime.now(timezone.utc)
            now_naive = now.replace(tzinfo=None)

            # Get active installments with payments past due
            result = await db.execute(
                select(Installment).where(
                    and_(
                        Installment.is_active == True,
                        Installment.status == "active",
                        Installment.next_payment_date.isnot(None),
                        Installment.next_payment_date < now_naive
                    )
                )
            )
            late_installments = list(result.scalars().all())

            late_count = 0
            severely_late = 0

            for installment in late_installments:
                try:
                    next_payment = installment.next_payment_date.replace(tzinfo=None) if installment.next_payment_date.tzinfo else installment.next_payment_date
                    days_late = (now_naive - next_payment).days

                    # Dispatch late payment event
                    await event_dispatcher.dispatch(
                        InstallmentEvents.PAYMENT_LATE,
                        user_id=installment.user_id,
                        installment_id=str(installment.id),
                        installment_name=installment.name,
                        amount=float(installment.amount_per_payment),
                        currency=installment.currency,
                        days_late=days_late,
                        payment_number=installment.payments_made + 1,
                    )

                    late_count += 1

                    # If severely late (e.g., 30+ days), flag it
                    if days_late >= 30:
                        severely_late += 1
                        logger.warning(f"Severely late installment ({days_late} days): {installment.name}")

                    logger.info(f"Late payment detected for installment: {installment.name} ({days_late} days late)")

                except Exception as e:
                    logger.error(f"Error checking late payment for installment {installment.id}: {e}")
                    continue

            logger.info(f"Late payments check complete: {late_count} late, {severely_late} severely late")

            return {
                "late_count": late_count,
                "severely_late": severely_late,
                "timestamp": now.isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_check())


@celery_app.task(base=BaseTask, bind=True, name="tasks.installment.mark_completed")
def mark_completed_installments(self) -> Dict[str, Any]:
    """
    Daily task to check for installments that should be marked as completed.

    1. Find installments where payments_made >= number_of_payments
    2. Mark them as completed
    3. Send notification to user

    Returns:
        Dict with results
    """
    import asyncio

    async def _check():
        async with get_async_db_session() as db:
            now = datetime.now(timezone.utc)

            # Get installments that should be completed
            result = await db.execute(
                select(Installment).where(
                    and_(
                        Installment.is_active == True,
                        Installment.status == "active",
                    )
                )
            )
            installments = list(result.scalars().all())

            completed_count = 0
            notifications_sent = 0

            for installment in installments:
                try:
                    if installment.payments_made >= installment.number_of_payments:
                        # Mark as completed
                        installment.status = "completed"
                        installment.is_active = False
                        installment.remaining_balance = 0
                        completed_count += 1

                        # Dispatch completion event
                        await event_dispatcher.dispatch(
                            InstallmentEvents.COMPLETED,
                            user_id=installment.user_id,
                            installment_id=str(installment.id),
                            installment_name=installment.name,
                            total_paid=float(installment.total_amount),
                            currency=installment.currency,
                        )
                        notifications_sent += 1

                        logger.info(f"Marked installment as completed: {installment.name}")

                except Exception as e:
                    logger.error(f"Error completing installment {installment.id}: {e}")
                    continue

            await db.commit()

            logger.info(f"Completed installments check: {completed_count} completed, {notifications_sent} notifications")

            return {
                "completed_count": completed_count,
                "notifications_sent": notifications_sent,
                "timestamp": now.isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_check())


@celery_app.task(base=BaseTask, bind=True, name="tasks.installment.initialize_payment_dates")
def initialize_installment_payment_dates(self) -> Dict[str, Any]:
    """
    One-time task to initialize next_payment_date for existing installments.
    Run this after migration to populate payment dates.

    Returns:
        Dict with results
    """
    import asyncio

    async def _initialize():
        async with get_async_db_session() as db:
            now = datetime.now(timezone.utc)

            # Get all active installments without next_payment_date
            result = await db.execute(
                select(Installment).where(
                    and_(
                        Installment.is_active == True,
                        Installment.next_payment_date.is_(None)
                    )
                )
            )
            installments = list(result.scalars().all())

            updated_count = 0

            for installment in installments:
                try:
                    installment.next_payment_date = calculate_next_installment_payment_date(
                        installment.first_payment_date,
                        installment.frequency,
                        installment.number_of_payments
                    )
                    updated_count += 1
                except Exception as e:
                    logger.error(f"Error initializing payment date for {installment.id}: {e}")

            await db.commit()

            logger.info(f"Initialized payment dates for {updated_count} installments")

            return {
                "updated_count": updated_count,
                "timestamp": now.isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_initialize())
