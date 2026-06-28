"""
Subscription-related Celery tasks.

Tasks:
- Process subscription renewals
- Create expense records for subscription payments
- Send renewal reminders
"""
import logging
from datetime import datetime, timezone
from typing import Dict, Any

from sqlalchemy import select, and_

from app.core.celery_app import celery_app
from app.tasks.base import BaseTask, get_async_db_session
from app.modules.subscriptions.models import Subscription
from app.modules.subscriptions.service import (
    get_due_subscriptions,
    get_subscriptions_for_reminder,
    process_subscription_payment,
    calculate_next_payment_date,
)
from app.core.events import event_dispatcher, SubscriptionEvents

logger = logging.getLogger(__name__)


@celery_app.task(base=BaseTask, bind=True, name="tasks.subscription.process_renewals")
def process_subscription_renewals(self) -> Dict[str, Any]:
    """
    Daily task to process subscription renewals.

    For each active subscription with payment due:
    1. Check if renewal is due today (based on next_payment_date)
    2. Create an expense record for the subscription payment
    3. If auto_pay is enabled, deduct from linked account
    4. Record payment in subscription_payments table
    5. Update next_payment_date
    6. If payment fails due to insufficient funds, mark as failed and notify

    Returns:
        Dict with processing results
    """
    import asyncio
    from sqlalchemy import select

    async def _process():
        async with get_async_db_session() as db:
            from app.modules.savings.transaction_service import InsufficientFundsError
            from app.modules.savings.models import SavingsAccount
            from app.modules.notifications.service import NotificationService

            now = datetime.now(timezone.utc)

            # Get all subscriptions with payments due
            due_subscriptions = await get_due_subscriptions(db, now)

            renewed = 0
            expenses_created = 0
            auto_paid = 0
            failed_payments = 0
            errors = 0

            for subscription in due_subscriptions:
                try:
                    # Process the payment
                    payment = await process_subscription_payment(
                        db=db,
                        subscription=subscription,
                        payment_date=now.replace(tzinfo=None),
                        notes="Auto-processed subscription renewal"
                    )

                    if payment:
                        renewed += 1
                        expenses_created += 1

                        if payment.account_transaction_id:
                            auto_paid += 1

                        # Dispatch renewal event for notification
                        await event_dispatcher.dispatch(
                            SubscriptionEvents.RENEWAL_PROCESSED,
                            user_id=subscription.user_id,
                            subscription_id=str(subscription.id),
                            subscription_name=subscription.name,
                            amount=float(subscription.amount),
                            currency=subscription.currency,
                            next_payment_date=subscription.next_payment_date.isoformat() if subscription.next_payment_date else None,
                            auto_paid=payment.account_transaction_id is not None,
                        )

                        logger.info(f"Processed renewal for subscription: {subscription.name}")

                except InsufficientFundsError as e:
                    # Mark payment as failed and create notification
                    failed_payments += 1
                    logger.warning(f"Insufficient funds for subscription {subscription.id}: {e}")

                    # Mark subscription status as payment_failed
                    from app.modules.subscriptions.models import SubscriptionStatus
                    subscription.status = SubscriptionStatus.PAYMENT_FAILED.value

                    # Get account details for notification
                    account_result = await db.execute(
                        select(SavingsAccount).where(SavingsAccount.id == subscription.payment_account_id)
                    )
                    account = account_result.scalar_one_or_none()
                    account_name = account.name if account else "Unknown"
                    current_balance = account.current_balance if account else None

                    # Create notification
                    notification_service = NotificationService(db)
                    await notification_service.create_payment_failed_notification(
                        user_id=subscription.user_id,
                        payment_type="subscription",
                        amount=subscription.amount,
                        currency=subscription.currency,
                        account_name=account_name,
                        item_name=subscription.name,
                        current_balance=current_balance
                    )

                except Exception as e:
                    errors += 1
                    logger.error(f"Error processing subscription {subscription.id}: {e}")
                    continue

            await db.commit()

            logger.info(f"Subscription renewals complete: {renewed} renewed, {expenses_created} expenses, {auto_paid} auto-paid, {failed_payments} failed, {errors} errors")

            return {
                "renewed": renewed,
                "expenses_created": expenses_created,
                "auto_paid": auto_paid,
                "failed_payments": failed_payments,
                "errors": errors,
                "timestamp": now.isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_process())


@celery_app.task(base=BaseTask, bind=True, name="tasks.subscription.send_renewal_reminders")
def send_renewal_reminders(self) -> Dict[str, Any]:
    """
    Daily task to send renewal reminders.

    1. Find subscriptions with next_payment_date within reminder window
    2. Check if reminder hasn't been sent recently
    3. Create notification for user

    Returns:
        Dict with results
    """
    import asyncio

    async def _send():
        async with get_async_db_session() as db:
            now = datetime.now(timezone.utc)

            # Get subscriptions that need reminders
            subscriptions = await get_subscriptions_for_reminder(db, now)

            reminders_sent = 0

            for subscription in subscriptions:
                try:
                    days_until = 0
                    if subscription.next_payment_date:
                        next_payment = subscription.next_payment_date.replace(tzinfo=None) if subscription.next_payment_date.tzinfo else subscription.next_payment_date
                        days_until = (next_payment - now.replace(tzinfo=None)).days

                    # Dispatch reminder event
                    await event_dispatcher.dispatch(
                        SubscriptionEvents.RENEWAL_REMINDER,
                        user_id=subscription.user_id,
                        subscription_id=str(subscription.id),
                        subscription_name=subscription.name,
                        amount=float(subscription.amount),
                        currency=subscription.currency,
                        next_payment_date=subscription.next_payment_date.isoformat() if subscription.next_payment_date else None,
                        days_until_renewal=days_until,
                        auto_pay_enabled=subscription.auto_pay,
                    )

                    # Update last reminder timestamp
                    subscription.last_reminder_at = now.replace(tzinfo=None)
                    reminders_sent += 1

                    logger.info(f"Sent renewal reminder for subscription: {subscription.name} ({days_until} days)")

                except Exception as e:
                    logger.error(f"Error sending reminder for subscription {subscription.id}: {e}")
                    continue

            await db.commit()

            logger.info(f"Subscription reminders complete: {reminders_sent} sent")

            return {
                "reminders_sent": reminders_sent,
                "timestamp": now.isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_send())


@celery_app.task(base=BaseTask, bind=True, name="tasks.subscription.check_expired_subscriptions")
def check_expired_subscriptions(self) -> Dict[str, Any]:
    """
    Daily task to check for expired subscriptions.

    1. Find subscriptions past their end_date
    2. Mark as expired
    3. Send notification to user

    Returns:
        Dict with results
    """
    import asyncio

    async def _check():
        async with get_async_db_session() as db:
            now = datetime.now(timezone.utc)

            # Get active subscriptions with end_date passed
            result = await db.execute(
                select(Subscription).where(
                    and_(
                        Subscription.is_active == True,
                        Subscription.status == "active",
                        Subscription.end_date.isnot(None),
                        Subscription.end_date < now.replace(tzinfo=None)
                    )
                )
            )
            expired_subscriptions = list(result.scalars().all())

            expired_count = 0
            notifications_sent = 0

            for subscription in expired_subscriptions:
                try:
                    # Mark as expired
                    subscription.status = "expired"
                    subscription.is_active = False
                    expired_count += 1

                    # Dispatch expiration event
                    await event_dispatcher.dispatch(
                        SubscriptionEvents.SUBSCRIPTION_EXPIRED,
                        user_id=subscription.user_id,
                        subscription_id=str(subscription.id),
                        subscription_name=subscription.name,
                        end_date=subscription.end_date.isoformat() if subscription.end_date else None,
                    )
                    notifications_sent += 1

                    logger.info(f"Marked subscription as expired: {subscription.name}")

                except Exception as e:
                    logger.error(f"Error expiring subscription {subscription.id}: {e}")
                    continue

            await db.commit()

            logger.info(f"Expired subscriptions check complete: {expired_count} expired, {notifications_sent} notifications")

            return {
                "expired_count": expired_count,
                "notifications_sent": notifications_sent,
                "timestamp": now.isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_check())


@celery_app.task(base=BaseTask, bind=True, name="tasks.subscription.check_paused_for_resume")
def check_paused_for_resume(self) -> Dict[str, Any]:
    """
    Daily task to check paused subscriptions that should be auto-resumed.

    1. Find paused subscriptions with resume_date <= now
    2. Resume them
    3. Send notification to user

    Returns:
        Dict with results
    """
    import asyncio
    from app.modules.subscriptions.service import resume_subscription

    async def _check():
        async with get_async_db_session() as db:
            now = datetime.now(timezone.utc)

            # Get paused subscriptions with resume_date passed
            result = await db.execute(
                select(Subscription).where(
                    and_(
                        Subscription.status == "paused",
                        Subscription.resume_date.isnot(None),
                        Subscription.resume_date <= now.replace(tzinfo=None)
                    )
                )
            )
            subscriptions_to_resume = list(result.scalars().all())

            resumed_count = 0

            for subscription in subscriptions_to_resume:
                try:
                    await resume_subscription(db, subscription)
                    resumed_count += 1

                    # Dispatch resume event
                    await event_dispatcher.dispatch(
                        SubscriptionEvents.SUBSCRIPTION_RESUMED,
                        user_id=subscription.user_id,
                        subscription_id=str(subscription.id),
                        subscription_name=subscription.name,
                        next_payment_date=subscription.next_payment_date.isoformat() if subscription.next_payment_date else None,
                    )

                    logger.info(f"Auto-resumed subscription: {subscription.name}")

                except Exception as e:
                    logger.error(f"Error resuming subscription {subscription.id}: {e}")
                    continue

            logger.info(f"Paused subscriptions check complete: {resumed_count} resumed")

            return {
                "resumed_count": resumed_count,
                "timestamp": now.isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_check())


@celery_app.task(base=BaseTask, bind=True, name="tasks.subscription.initialize_payment_dates")
def initialize_subscription_payment_dates(self) -> Dict[str, Any]:
    """
    One-time task to initialize next_payment_date for existing subscriptions.
    Run this after migration to populate payment dates.

    Returns:
        Dict with results
    """
    import asyncio

    async def _initialize():
        async with get_async_db_session() as db:
            now = datetime.now(timezone.utc)

            # Get all active subscriptions without next_payment_date
            result = await db.execute(
                select(Subscription).where(
                    and_(
                        Subscription.is_active == True,
                        Subscription.next_payment_date.is_(None)
                    )
                )
            )
            subscriptions = list(result.scalars().all())

            updated_count = 0

            for subscription in subscriptions:
                try:
                    subscription.next_payment_date = calculate_next_payment_date(
                        subscription.start_date,
                        subscription.frequency
                    )
                    updated_count += 1
                except Exception as e:
                    logger.error(f"Error initializing payment date for {subscription.id}: {e}")

            await db.commit()

            logger.info(f"Initialized payment dates for {updated_count} subscriptions")

            return {
                "updated_count": updated_count,
                "timestamp": now.isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_initialize())
