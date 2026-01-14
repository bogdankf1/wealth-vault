"""
Tax-related Celery tasks.

Tasks:
- Process auto-pay taxes
- Send tax payment reminders
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any

from app.core.celery_app import celery_app
from app.tasks.base import BaseTask, get_async_db_session
from app.modules.taxes.service import (
    get_taxes_due_for_auto_pay,
    pay_tax,
    calculate_next_payment_date,
)
from app.tasks.notification_tasks import create_notification

logger = logging.getLogger(__name__)


@celery_app.task(base=BaseTask, bind=True, name="tasks.tax.process_auto_pay")
def process_auto_pay_taxes(self) -> Dict[str, Any]:
    """
    Daily task to process auto-pay taxes.

    For each active tax with auto_pay enabled:
    1. Check if next_payment_date is due (today or past)
    2. Deduct from linked payment account
    3. Create tax payment record
    4. Update next_payment_date

    Returns:
        Dict with processing results
    """
    import asyncio

    async def _process():
        async with get_async_db_session() as db:
            now = datetime.now(timezone.utc)

            # Get all taxes due for auto-payment
            due_taxes = await get_taxes_due_for_auto_pay(db, now)

            paid = 0
            errors = 0
            error_details = []

            for tax in due_taxes:
                try:
                    # Process the payment
                    payment, transaction_id = await pay_tax(
                        db=db,
                        user_id=tax.user_id,
                        tax_id=tax.id,
                        request=None,  # Use default settings
                        is_auto_pay=True
                    )

                    if payment:
                        paid += 1

                        # Create notification for user
                        try:
                            create_notification.delay(
                                str(tax.user_id),
                                "tax_auto_paid",
                                f"Tax auto-payment processed: {tax.name}",
                                {
                                    "tax_id": str(tax.id),
                                    "tax_name": tax.name,
                                    "amount": str(payment.amount),
                                    "currency": payment.currency,
                                    "next_payment_date": tax.next_payment_date.isoformat() if tax.next_payment_date else None
                                }
                            )
                        except Exception as notify_err:
                            logger.warning(f"Failed to send notification for tax {tax.id}: {notify_err}")

                        logger.info(f"Processed auto-pay for tax: {tax.name} (user: {tax.user_id})")

                except ValueError as e:
                    errors += 1
                    error_details.append({
                        "tax_id": str(tax.id),
                        "tax_name": tax.name,
                        "user_id": str(tax.user_id),
                        "error": str(e)
                    })

                    # Notify user of payment failure
                    try:
                        create_notification.delay(
                            str(tax.user_id),
                            "tax_auto_pay_failed",
                            f"Tax auto-payment failed: {tax.name}",
                            {
                                "tax_id": str(tax.id),
                                "tax_name": tax.name,
                                "error": str(e)
                            }
                        )
                    except Exception:
                        pass

                    logger.error(f"Failed to process auto-pay for tax {tax.id}: {e}")

                except Exception as e:
                    errors += 1
                    error_details.append({
                        "tax_id": str(tax.id),
                        "tax_name": tax.name,
                        "user_id": str(tax.user_id),
                        "error": str(e)
                    })
                    logger.error(f"Unexpected error processing tax {tax.id}: {e}")

            logger.info(f"Tax auto-pay complete: {paid} paid, {errors} errors")

            return {
                "paid": paid,
                "errors": errors,
                "error_details": error_details,
                "timestamp": now.isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_process())


@celery_app.task(base=BaseTask, bind=True, name="tasks.tax.send_payment_reminders")
def send_tax_payment_reminders(self) -> Dict[str, Any]:
    """
    Daily task to send tax payment reminders.

    1. Find taxes with next_payment_date within reminder window (3 days)
    2. For taxes without auto_pay, send reminder notification

    Returns:
        Dict with results
    """
    import asyncio
    from sqlalchemy import select, and_
    from sqlalchemy.orm import selectinload
    from app.modules.taxes.models import Tax

    async def _send():
        async with get_async_db_session() as db:
            now = datetime.now(timezone.utc)
            reminder_window = now + timedelta(days=3)

            # Get taxes due within 3 days that don't have auto-pay
            query = (
                select(Tax)
                .options(
                    selectinload(Tax.income_source),
                    selectinload(Tax.payment_account)
                )
                .where(
                    and_(
                        Tax.is_active == True,
                        Tax.deleted_at.is_(None),
                        Tax.auto_pay == False,
                        Tax.next_payment_date.isnot(None),
                        Tax.next_payment_date <= reminder_window.replace(tzinfo=None),
                        Tax.next_payment_date > now.replace(tzinfo=None)
                    )
                )
            )
            result = await db.execute(query)
            taxes = list(result.scalars().all())

            reminders_sent = 0

            for tax in taxes:
                try:
                    days_until = 0
                    if tax.next_payment_date:
                        next_payment = tax.next_payment_date.replace(tzinfo=None) if tax.next_payment_date.tzinfo else tax.next_payment_date
                        days_until = (next_payment - now.replace(tzinfo=None)).days

                    # Create notification for user
                    create_notification.delay(
                        str(tax.user_id),
                        "tax_payment_reminder",
                        f"Tax payment due soon: {tax.name}",
                        {
                            "tax_id": str(tax.id),
                            "tax_name": tax.name,
                            "days_until": days_until,
                            "next_payment_date": tax.next_payment_date.isoformat() if tax.next_payment_date else None
                        }
                    )

                    reminders_sent += 1
                    logger.info(f"Sent payment reminder for tax: {tax.name} ({days_until} days)")

                except Exception as e:
                    logger.error(f"Error sending reminder for tax {tax.id}: {e}")
                    continue

            logger.info(f"Tax payment reminders complete: {reminders_sent} sent")

            return {
                "reminders_sent": reminders_sent,
                "timestamp": now.isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_send())


@celery_app.task(base=BaseTask, bind=True, name="tasks.tax.initialize_payment_dates")
def initialize_tax_payment_dates(self) -> Dict[str, Any]:
    """
    One-time task to initialize next_payment_date for existing taxes.
    Run this after migration to populate payment dates.

    Returns:
        Dict with results
    """
    import asyncio
    from sqlalchemy import select, and_
    from app.modules.taxes.models import Tax

    async def _initialize():
        async with get_async_db_session() as db:
            now = datetime.now(timezone.utc)

            # Get all active taxes with auto_pay enabled but without next_payment_date
            result = await db.execute(
                select(Tax).where(
                    and_(
                        Tax.is_active == True,
                        Tax.deleted_at.is_(None),
                        Tax.auto_pay == True,
                        Tax.next_payment_date.is_(None)
                    )
                )
            )
            taxes = list(result.scalars().all())

            updated_count = 0

            for tax in taxes:
                try:
                    tax.next_payment_date = calculate_next_payment_date(
                        tax.frequency,
                        now.replace(tzinfo=None)
                    )
                    updated_count += 1
                except Exception as e:
                    logger.error(f"Error initializing payment date for tax {tax.id}: {e}")

            await db.commit()

            logger.info(f"Initialized payment dates for {updated_count} taxes")

            return {
                "updated_count": updated_count,
                "timestamp": now.isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_initialize())
