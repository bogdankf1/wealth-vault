"""
Billing/Tier subscription-related Celery tasks.

Tasks:
- Check tier expirations and auto-downgrade
- Send expiration warnings
- Clean up tier-specific data on downgrade
"""
import logging
from datetime import datetime
from typing import Dict, Any
from uuid import UUID

from app.core.celery_app import celery_app
from app.tasks.base import BaseTask, get_async_db_session

logger = logging.getLogger(__name__)


@celery_app.task(base=BaseTask, bind=True, name="tasks.billing.check_tier_expirations")
def check_tier_expirations(self) -> Dict[str, Any]:
    """
    Daily task to check and process tier subscription expirations.

    For each user subscription where:
    - cancel_at_period_end = True
    - current_period_end < now

    Actions:
    1. Downgrade user tier to 'starter'
    2. Archive tier-specific data if needed
    3. Update user_subscription record
    4. Send notification about downgrade
    5. Log the downgrade for audit

    Returns:
        Dict with results
    """
    import asyncio

    async def _check():
        from app.services.tier_downgrade_service import TierDowngradeService

        async with get_async_db_session() as db:
            logger.info("Checking tier expirations...")

            # Get all expired subscriptions
            expired = await TierDowngradeService.get_expired_subscriptions(db)

            downgrades_processed = 0
            notifications_sent = 0
            errors = []

            for subscription in expired:
                try:
                    user_id = UUID(subscription["user_id"])

                    # Downgrade the user
                    result = await TierDowngradeService.downgrade_user_to_starter(
                        db=db,
                        user_id=user_id,
                        reason="subscription_expired"
                    )

                    if result.get("success"):
                        downgrades_processed += 1
                        notifications_sent += 1  # Event system sends notification
                        logger.info(
                            f"Downgraded user {user_id} from {result.get('from_tier')} to starter"
                        )
                    else:
                        errors.append({
                            "user_id": str(user_id),
                            "error": result.get("error", "Unknown error")
                        })

                except Exception as e:
                    logger.error(f"Error processing expiration for {subscription}: {e}")
                    errors.append({
                        "user_id": subscription.get("user_id"),
                        "error": str(e)
                    })

            logger.info(
                f"Tier expiration check complete. "
                f"Checked: {len(expired)}, Downgraded: {downgrades_processed}"
            )

            return {
                "subscriptions_checked": len(expired),
                "downgrades_processed": downgrades_processed,
                "notifications_sent": notifications_sent,
                "errors": errors if errors else None,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_check())


@celery_app.task(base=BaseTask, bind=True, name="tasks.billing.send_expiration_warnings")
def send_expiration_warnings(self) -> Dict[str, Any]:
    """
    Daily task to send tier expiration warnings.

    Send warnings at:
    - 7 days before expiration
    - 3 days before expiration
    - 1 day before expiration

    For each expiring subscription:
    1. Check if warning hasn't been sent for this interval
    2. Calculate features that will be lost
    3. Send notification with renewal options
    4. Mark warning as sent

    Returns:
        Dict with results
    """
    import asyncio

    async def _send():
        from app.services.tier_downgrade_service import TierDowngradeService

        async with get_async_db_session() as db:
            logger.info("Sending tier expiration warnings...")

            # Warning intervals (in days)
            warning_intervals = [7, 3, 1]
            results = {
                "subscriptions_checked": 0,
                "warnings_7_days": 0,
                "warnings_3_days": 0,
                "warnings_1_day": 0,
                "total_sent": 0,
                "errors": [],
                "timestamp": datetime.utcnow().isoformat()
            }

            for days in warning_intervals:
                # Get subscriptions expiring in exactly this many days (±1 day window)
                expiring = await TierDowngradeService.get_expiring_subscriptions(db, days)

                # Filter to only those in the target day range
                for subscription in expiring:
                    days_left = subscription.get("days_until_expiry", 0)

                    # Only send warning if days_left matches our interval
                    # Allow a small window: days-1 <= days_left <= days
                    if not (days - 1 <= days_left <= days):
                        continue

                    results["subscriptions_checked"] += 1

                    try:
                        user_id = UUID(subscription["user_id"])

                        # Get starter tier to calculate lost features
                        starter_tier = await TierDowngradeService.get_starter_tier(db)
                        user = await TierDowngradeService.get_user_by_id(db, user_id)

                        if not user or not user.tier or not starter_tier:
                            continue

                        # Calculate features being lost
                        lost_features = await TierDowngradeService.get_features_being_lost(
                            db, user.tier.id, starter_tier.id
                        )

                        # Send the warning
                        sent = await TierDowngradeService.send_expiration_warning(
                            db=db,
                            user_id=user_id,
                            days_until_expiry=days_left,
                            lost_features=lost_features
                        )

                        if sent:
                            results["total_sent"] += 1
                            if days == 7:
                                results["warnings_7_days"] += 1
                            elif days == 3:
                                results["warnings_3_days"] += 1
                            elif days == 1:
                                results["warnings_1_day"] += 1

                            logger.info(
                                f"Sent {days_left}-day warning to user {user_id}"
                            )

                    except Exception as e:
                        logger.error(
                            f"Error sending warning for subscription {subscription}: {e}"
                        )
                        results["errors"].append({
                            "user_id": subscription.get("user_id"),
                            "error": str(e)
                        })

            logger.info(
                f"Expiration warnings complete. "
                f"Checked: {results['subscriptions_checked']}, Sent: {results['total_sent']}"
            )

            if not results["errors"]:
                results["errors"] = None

            return results

    return asyncio.get_event_loop().run_until_complete(_send())


@celery_app.task(base=BaseTask, bind=True, name="tasks.billing.cleanup_tier_data")
def cleanup_tier_data(self, user_id: str, from_tier: str, to_tier: str) -> Dict[str, Any]:
    """
    Task to clean up/archive tier-specific data on downgrade.

    Actions based on tier downgrade:
    - Wealth -> Growth: Archive AI insights, exports
    - Growth -> Starter: Archive batch operations data, reduce limits
    - Any downgrade: Check feature limits and archive excess

    Args:
        user_id: UUID of the user
        from_tier: Previous tier name
        to_tier: New tier name

    Returns:
        Dict with cleanup results
    """
    import asyncio

    async def _cleanup():
        from app.services.tier_downgrade_service import TierDowngradeService

        async with get_async_db_session() as db:
            logger.info(f"Cleaning up tier data for user {user_id}: {from_tier} -> {to_tier}")

            user_uuid = UUID(user_id)
            items_archived = {}

            try:
                # Get tiers
                from_tier_obj = await TierDowngradeService.get_tier_by_name(db, from_tier)
                to_tier_obj = await TierDowngradeService.get_tier_by_name(db, to_tier)

                if from_tier_obj and to_tier_obj:
                    # Calculate features being lost
                    lost_features = await TierDowngradeService.get_features_being_lost(
                        db, from_tier_obj.id, to_tier_obj.id
                    )

                    # Archive excess data based on lost features
                    items_archived = await TierDowngradeService.archive_excess_data(
                        db, user_uuid, lost_features
                    )

                    logger.info(
                        f"Cleanup complete for user {user_id}. "
                        f"Features affected: {len(lost_features)}"
                    )

            except Exception as e:
                logger.error(f"Error during tier data cleanup: {e}")
                return {
                    "user_id": user_id,
                    "from_tier": from_tier,
                    "to_tier": to_tier,
                    "error": str(e),
                    "timestamp": datetime.utcnow().isoformat()
                }

            return {
                "user_id": user_id,
                "from_tier": from_tier,
                "to_tier": to_tier,
                "items_archived": items_archived,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_cleanup())


@celery_app.task(base=BaseTask, bind=True, name="tasks.billing.check_trial_expirations")
def check_trial_expirations(self) -> Dict[str, Any]:
    """
    Daily task to check and process trial subscription expirations.

    For each user subscription where:
    - status == TRIALING
    - trial_end < now

    Actions:
    1. Downgrade user tier to 'starter'
    2. Update subscription status to canceled
    3. Log the downgrade for audit

    Returns:
        Dict with results
    """
    import asyncio

    async def _check():
        from app.services.trial_service import TrialService

        async with get_async_db_session() as db:
            logger.info("Checking trial expirations...")

            # Get all expired trials
            expired = await TrialService.get_expired_trials(db)

            downgrades_processed = 0
            errors = []

            for trial in expired:
                try:
                    user_id = UUID(trial["user_id"])

                    # Expire the trial and downgrade
                    result = await TrialService.expire_trial(db=db, user_id=user_id)

                    if result.get("success"):
                        downgrades_processed += 1
                        logger.info(
                            f"Trial expired for user {user_id}, "
                            f"downgraded from {result.get('from_tier')} to starter"
                        )
                    else:
                        errors.append({
                            "user_id": str(user_id),
                            "error": result.get("error", "Unknown error")
                        })

                except Exception as e:
                    logger.error(f"Error processing trial expiration for {trial}: {e}")
                    errors.append({
                        "user_id": trial.get("user_id"),
                        "error": str(e)
                    })

            logger.info(
                f"Trial expiration check complete. "
                f"Checked: {len(expired)}, Downgraded: {downgrades_processed}"
            )

            return {
                "trials_checked": len(expired),
                "downgrades_processed": downgrades_processed,
                "errors": errors if errors else None,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_check())


@celery_app.task(base=BaseTask, bind=True, name="tasks.billing.sync_stripe_status")
def sync_stripe_status(self) -> Dict[str, Any]:
    """
    Periodic task to sync subscription status with Stripe.

    Ensures local database is in sync with Stripe:
    1. Fetch all active subscriptions from Stripe
    2. Compare with local records
    3. Update any discrepancies
    4. Log sync results

    Returns:
        Dict with sync results
    """
    import asyncio
    import stripe
    from app.core.config import settings

    async def _sync():
        from sqlalchemy import select
        from app.models.billing import UserSubscription, SubscriptionStatus

        stripe.api_key = settings.STRIPE_SECRET_KEY

        async with get_async_db_session() as db:
            logger.info("Syncing Stripe subscription status...")

            results = {
                "subscriptions_checked": 0,
                "discrepancies_found": 0,
                "updates_made": 0,
                "errors": [],
                "timestamp": datetime.utcnow().isoformat()
            }

            # Get all local subscriptions with Stripe IDs
            result = await db.execute(
                select(UserSubscription)
                .where(UserSubscription.stripe_subscription_id.isnot(None))
            )
            local_subscriptions = result.scalars().all()

            for local_sub in local_subscriptions:
                results["subscriptions_checked"] += 1

                try:
                    # Fetch subscription from Stripe
                    stripe_sub = stripe.Subscription.retrieve(
                        local_sub.stripe_subscription_id
                    )

                    # Compare and update if different
                    updated = False

                    # Check status
                    stripe_status = SubscriptionStatus(stripe_sub.status)
                    if local_sub.status != stripe_status:
                        logger.info(
                            f"Status mismatch for {local_sub.stripe_subscription_id}: "
                            f"local={local_sub.status}, stripe={stripe_status}"
                        )
                        local_sub.status = stripe_status
                        updated = True
                        results["discrepancies_found"] += 1

                    # Check cancel_at_period_end
                    stripe_cancel = 1 if stripe_sub.cancel_at_period_end else 0
                    if local_sub.cancel_at_period_end != stripe_cancel:
                        local_sub.cancel_at_period_end = stripe_cancel
                        updated = True
                        results["discrepancies_found"] += 1

                    # Check period dates (may not exist for certain subscription states)
                    period_start = getattr(stripe_sub, 'current_period_start', None)
                    period_end = getattr(stripe_sub, 'current_period_end', None)

                    if period_start is not None:
                        stripe_period_start = datetime.fromtimestamp(period_start)
                        if local_sub.current_period_start != stripe_period_start:
                            local_sub.current_period_start = stripe_period_start
                            updated = True

                    if period_end is not None:
                        stripe_period_end = datetime.fromtimestamp(period_end)
                        if local_sub.current_period_end != stripe_period_end:
                            local_sub.current_period_end = stripe_period_end
                            updated = True

                    if updated:
                        results["updates_made"] += 1

                except stripe.InvalidRequestError as e:
                    # Subscription doesn't exist in Stripe
                    logger.warning(
                        f"Subscription {local_sub.stripe_subscription_id} not found in Stripe: {e}"
                    )
                    results["errors"].append({
                        "subscription_id": local_sub.stripe_subscription_id,
                        "error": "Not found in Stripe"
                    })
                except Exception as e:
                    logger.error(
                        f"Error syncing subscription {local_sub.stripe_subscription_id}: {e}"
                    )
                    results["errors"].append({
                        "subscription_id": local_sub.stripe_subscription_id,
                        "error": str(e)
                    })

            await db.commit()

            logger.info(
                f"Stripe sync complete. "
                f"Checked: {results['subscriptions_checked']}, "
                f"Updates: {results['updates_made']}"
            )

            if not results["errors"]:
                results["errors"] = None

            return results

    return asyncio.get_event_loop().run_until_complete(_sync())
