"""
Paddle service for handling payments and subscriptions.
"""
import hmac
import hashlib
import httpx
from typing import Optional, Dict, Any
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.logging_config import get_logger
from app.models.user import User
from app.models.tier import Tier
from app.models.billing import (
    UserSubscription,
    PaymentHistory,
    SubscriptionStatus,
    PaymentStatus,
    PaymentProvider,
)

logger = get_logger(__name__)


class PaddleService:
    """Service for handling Paddle operations."""

    # API Base URLs
    SANDBOX_API_BASE = "https://sandbox-api.paddle.com"
    PRODUCTION_API_BASE = "https://api.paddle.com"

    @classmethod
    def _get_api_base(cls) -> str:
        """Get the appropriate API base URL based on environment."""
        if settings.PADDLE_ENV == "production":
            return cls.PRODUCTION_API_BASE
        return cls.SANDBOX_API_BASE

    @classmethod
    def _get_headers(cls) -> Dict[str, str]:
        """Get common API headers."""
        return {
            "Authorization": f"Bearer {settings.PADDLE_API_KEY}",
            "Content-Type": "application/json",
        }

    @classmethod
    async def get_subscription(cls, subscription_id: str) -> Dict[str, Any]:
        """
        Get a Paddle subscription by ID.

        Args:
            subscription_id: Paddle subscription ID

        Returns:
            Subscription details dictionary
        """
        url = f"{cls._get_api_base()}/subscriptions/{subscription_id}"

        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=cls._get_headers())

            if response.status_code != 200:
                logger.error(f"Failed to get Paddle subscription: {response.text}")
                raise Exception(f"Failed to get Paddle subscription: {subscription_id}")

            return response.json().get("data", {})

    @classmethod
    async def get_transaction(cls, transaction_id: str) -> Dict[str, Any]:
        """
        Get a Paddle transaction by ID.

        Args:
            transaction_id: Paddle transaction ID

        Returns:
            Transaction details dictionary
        """
        url = f"{cls._get_api_base()}/transactions/{transaction_id}"

        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=cls._get_headers())

            if response.status_code != 200:
                logger.error(f"Failed to get Paddle transaction: {response.text}")
                raise Exception(f"Failed to get Paddle transaction: {transaction_id}")

            return response.json().get("data", {})

    @classmethod
    async def activate_subscription(
        cls,
        subscription_id: str,
        transaction_id: str,
        user: User,
        db: AsyncSession,
    ) -> Dict[str, Any]:
        """
        Verify and activate a Paddle subscription after checkout.

        This is called after the user completes the Paddle checkout.
        We verify the subscription status with Paddle and update our database.

        Args:
            subscription_id: Paddle subscription ID from checkout (can be empty if using transaction_id)
            transaction_id: Paddle transaction ID from checkout
            user: Current user
            db: Database session

        Returns:
            Result dictionary with success status
        """
        # If subscription_id is not provided, get it from the transaction
        if not subscription_id and transaction_id:
            import asyncio

            # Paddle may take a moment to associate subscription with transaction
            # Retry a few times with delay
            for attempt in range(5):
                transaction = await cls.get_transaction(transaction_id)
                logger.info(f"Transaction data (attempt {attempt + 1}): {transaction}")

                subscription_id = transaction.get("subscription_id")
                if subscription_id:
                    break

                # Wait before retry (1, 2, 3, 4 seconds)
                if attempt < 4:
                    await asyncio.sleep(attempt + 1)

            if not subscription_id:
                logger.error(f"Transaction {transaction_id} has no subscription_id after retries. Transaction: {transaction}")
                raise ValueError("Transaction does not have an associated subscription. Please try again or contact support.")

        # Get subscription details from Paddle
        subscription = await cls.get_subscription(subscription_id)

        status = subscription.get("status")
        if status not in ["active", "trialing"]:
            logger.warning(f"Paddle subscription not active: {status}")
            raise Exception(f"Subscription is not active: {status}")

        # Determine tier based on price ID
        items = subscription.get("items", [])
        if not items:
            raise ValueError("No items in subscription")

        price_id = items[0].get("price", {}).get("id")
        if price_id == settings.PADDLE_GROWTH_PRICE_ID:
            tier_name = "growth"
        elif price_id == settings.PADDLE_WEALTH_PRICE_ID:
            tier_name = "wealth"
        else:
            logger.error(f"Unknown Paddle price_id: {price_id}")
            raise ValueError(f"Unknown Paddle price_id: {price_id}")

        # Get tier from database
        result = await db.execute(select(Tier).where(Tier.name == tier_name))
        tier = result.scalar_one_or_none()

        if not tier:
            raise ValueError(f"Tier not found: {tier_name}")

        # Update user tier and Paddle subscription ID
        user.tier_id = tier.id
        user.paddle_subscription_id = subscription_id
        user.paddle_customer_id = subscription.get("customer_id")

        # Parse billing dates
        current_billing_period = subscription.get("current_billing_period", {})
        started_at = current_billing_period.get("starts_at")
        ends_at = current_billing_period.get("ends_at")

        current_period_start = None
        current_period_end = None

        if started_at:
            current_period_start = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
        if ends_at:
            current_period_end = datetime.fromisoformat(ends_at.replace("Z", "+00:00"))

        # Check for existing subscription record
        result = await db.execute(
            select(UserSubscription).where(UserSubscription.user_id == user.id)
        )
        user_subscription = result.scalar_one_or_none()

        subscription_data = {
            "user_id": user.id,
            "payment_provider": "paddle",
            "paddle_subscription_id": subscription_id,
            "paddle_customer_id": subscription.get("customer_id"),
            "paddle_price_id": price_id,
            # Clear other provider IDs
            "stripe_subscription_id": None,
            "stripe_customer_id": None,
            "stripe_price_id": None,
            "paypal_subscription_id": None,
            "paypal_plan_id": None,
            "status": SubscriptionStatus.ACTIVE,
            "cancel_at_period_end": 0,
            "current_period_start": current_period_start or datetime.utcnow(),
            "current_period_end": current_period_end,
        }

        if user_subscription:
            for key, value in subscription_data.items():
                setattr(user_subscription, key, value)
        else:
            user_subscription = UserSubscription(**subscription_data)
            db.add(user_subscription)

        # Record initial payment if transaction provided
        if transaction_id:
            try:
                transaction = await cls.get_transaction(transaction_id)
                details = transaction.get("details", {})
                totals = details.get("totals", {})
                amount = int(totals.get("total", "0"))  # Already in cents
                currency = transaction.get("currency_code", "USD")

                # Check if payment already recorded
                result = await db.execute(
                    select(PaymentHistory).where(
                        PaymentHistory.paddle_transaction_id == transaction_id,
                        PaymentHistory.user_id == user.id,
                    )
                )
                existing_payment = result.scalar_one_or_none()

                if not existing_payment:
                    payment = PaymentHistory(
                        user_id=user.id,
                        payment_provider=PaymentProvider.PADDLE,
                        paddle_subscription_id=subscription_id,
                        paddle_transaction_id=transaction_id,
                        amount=amount,
                        currency=currency,
                        status=PaymentStatus.SUCCEEDED,
                        description=f"Subscription payment - {tier_name.title()} tier",
                        payment_method="paddle",
                        paid_at=current_period_start or datetime.utcnow(),
                    )
                    db.add(payment)
            except Exception as e:
                logger.warning(f"Failed to record initial payment: {e}")

        await db.commit()

        return {
            "success": True,
            "subscription_id": subscription_id,
            "tier": tier_name,
            "status": "active",
        }

    @classmethod
    async def cancel_subscription(
        cls,
        subscription_id: str,
        effective_from: str = "next_billing_period",
    ) -> Dict[str, Any]:
        """
        Cancel a Paddle subscription.

        Args:
            subscription_id: Paddle subscription ID
            effective_from: When cancellation takes effect
                           "immediately" or "next_billing_period"

        Returns:
            Result dictionary
        """
        url = f"{cls._get_api_base()}/subscriptions/{subscription_id}/cancel"

        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                headers=cls._get_headers(),
                json={"effective_from": effective_from},
            )

            if response.status_code not in [200, 201]:
                logger.error(f"Failed to cancel Paddle subscription: {response.text}")
                raise Exception("Failed to cancel Paddle subscription")

            return {"success": True, "subscription_id": subscription_id}

    @classmethod
    async def pause_subscription(cls, subscription_id: str) -> Dict[str, Any]:
        """
        Pause a Paddle subscription.

        Args:
            subscription_id: Paddle subscription ID

        Returns:
            Result dictionary
        """
        url = f"{cls._get_api_base()}/subscriptions/{subscription_id}/pause"

        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                headers=cls._get_headers(),
                json={},
            )

            if response.status_code not in [200, 201]:
                logger.error(f"Failed to pause Paddle subscription: {response.text}")
                raise Exception("Failed to pause Paddle subscription")

            return {"success": True, "subscription_id": subscription_id}

    @classmethod
    async def resume_subscription(cls, subscription_id: str) -> Dict[str, Any]:
        """
        Resume a paused Paddle subscription.

        Args:
            subscription_id: Paddle subscription ID

        Returns:
            Result dictionary
        """
        url = f"{cls._get_api_base()}/subscriptions/{subscription_id}/resume"

        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                headers=cls._get_headers(),
                json={"effective_from": "immediately"},
            )

            if response.status_code not in [200, 201]:
                logger.error(f"Failed to resume Paddle subscription: {response.text}")
                raise Exception("Failed to resume Paddle subscription")

            return {"success": True, "subscription_id": subscription_id}

    @classmethod
    async def update_subscription(
        cls,
        subscription_id: str,
        new_price_id: str,
        db: AsyncSession,
        user: User,
    ) -> Dict[str, Any]:
        """
        Update subscription to a new price (upgrade/downgrade).

        Args:
            subscription_id: Current Paddle subscription ID
            new_price_id: New Paddle price ID
            db: Database session
            user: Current user

        Returns:
            Result dictionary
        """
        # Get current subscription to get the item ID
        subscription = await cls.get_subscription(subscription_id)
        items = subscription.get("items", [])
        if not items:
            raise ValueError("No items in subscription")

        # Update the subscription items with new price
        url = f"{cls._get_api_base()}/subscriptions/{subscription_id}"

        update_data = {
            "items": [
                {
                    "price_id": new_price_id,
                    "quantity": 1,
                }
            ],
            "proration_billing_mode": "prorated_immediately",
        }

        async with httpx.AsyncClient() as client:
            response = await client.patch(
                url,
                headers=cls._get_headers(),
                json=update_data,
            )

            if response.status_code not in [200, 201]:
                logger.error(f"Failed to update Paddle subscription: {response.text}")
                raise Exception("Failed to update Paddle subscription")

            return {
                "success": True,
                "subscription_id": subscription_id,
                "new_price_id": new_price_id,
            }

    @classmethod
    async def handle_webhook_event(
        cls,
        event_type: str,
        data: Dict[str, Any],
        db: AsyncSession,
    ) -> None:
        """
        Handle Paddle webhook events.

        Args:
            event_type: Paddle webhook event type
            data: Event data
            db: Database session
        """
        logger.info(f"Processing Paddle webhook: {event_type}")

        if event_type == "subscription.created":
            await cls._handle_subscription_created(data, db)

        elif event_type == "subscription.activated":
            await cls._handle_subscription_activated(data, db)

        elif event_type == "subscription.updated":
            await cls._handle_subscription_updated(data, db)

        elif event_type == "subscription.canceled":
            await cls._handle_subscription_cancelled(data, db)

        elif event_type == "subscription.paused":
            await cls._handle_subscription_paused(data, db)

        elif event_type == "subscription.resumed":
            await cls._handle_subscription_resumed(data, db)

        elif event_type == "transaction.completed":
            await cls._handle_transaction_completed(data, db)

        elif event_type == "transaction.payment_failed":
            await cls._handle_transaction_failed(data, db)

        else:
            logger.info(f"Unhandled Paddle webhook event: {event_type}")

    @classmethod
    async def _handle_subscription_created(
        cls,
        data: Dict[str, Any],
        db: AsyncSession,
    ) -> None:
        """Handle subscription created event."""
        subscription_id = data.get("id")
        customer_id = data.get("customer_id")

        logger.info(f"Paddle subscription created: {subscription_id} for customer {customer_id}")
        # Most handling is done in activate_subscription called from frontend

    @classmethod
    async def _handle_subscription_activated(
        cls,
        data: Dict[str, Any],
        db: AsyncSession,
    ) -> None:
        """Handle subscription activated event."""
        subscription_id = data.get("id")

        result = await db.execute(
            select(UserSubscription).where(
                UserSubscription.paddle_subscription_id == subscription_id
            )
        )
        user_subscription = result.scalar_one_or_none()

        if user_subscription:
            user_subscription.status = SubscriptionStatus.ACTIVE
            await db.commit()
            logger.info(f"Paddle subscription activated: {subscription_id}")

    @classmethod
    async def _handle_subscription_updated(
        cls,
        data: Dict[str, Any],
        db: AsyncSession,
    ) -> None:
        """Handle subscription updated event."""
        subscription_id = data.get("id")

        result = await db.execute(
            select(UserSubscription).where(
                UserSubscription.paddle_subscription_id == subscription_id
            )
        )
        user_subscription = result.scalar_one_or_none()

        if user_subscription:
            # Update billing dates if available
            current_billing_period = data.get("current_billing_period", {})
            starts_at = current_billing_period.get("starts_at")
            ends_at = current_billing_period.get("ends_at")

            if starts_at:
                user_subscription.current_period_start = datetime.fromisoformat(
                    starts_at.replace("Z", "+00:00")
                )
            if ends_at:
                user_subscription.current_period_end = datetime.fromisoformat(
                    ends_at.replace("Z", "+00:00")
                )

            # Check for scheduled cancellation
            scheduled_change = data.get("scheduled_change")
            if scheduled_change and scheduled_change.get("action") == "cancel":
                user_subscription.cancel_at_period_end = 1

            # Update price ID if changed
            items = data.get("items", [])
            if items:
                new_price_id = items[0].get("price", {}).get("id")
                if new_price_id:
                    user_subscription.paddle_price_id = new_price_id

                    # Update user tier based on new price
                    if new_price_id == settings.PADDLE_GROWTH_PRICE_ID:
                        tier_name = "growth"
                    elif new_price_id == settings.PADDLE_WEALTH_PRICE_ID:
                        tier_name = "wealth"
                    else:
                        tier_name = None

                    if tier_name:
                        tier_result = await db.execute(
                            select(Tier).where(Tier.name == tier_name)
                        )
                        tier = tier_result.scalar_one_or_none()
                        if tier:
                            # Get and update user
                            from app.models.user import User
                            user_result = await db.execute(
                                select(User).where(User.id == user_subscription.user_id)
                            )
                            user = user_result.scalar_one_or_none()
                            if user:
                                user.tier_id = tier.id

            await db.commit()
            logger.info(f"Paddle subscription updated: {subscription_id}")

    @classmethod
    async def _handle_subscription_cancelled(
        cls,
        data: Dict[str, Any],
        db: AsyncSession,
    ) -> None:
        """Handle subscription cancelled event."""
        from app.services.tier_downgrade_service import TierDowngradeService

        subscription_id = data.get("id")

        result = await db.execute(
            select(UserSubscription).where(
                UserSubscription.paddle_subscription_id == subscription_id
            )
        )
        user_subscription = result.scalar_one_or_none()

        if user_subscription:
            user_subscription.status = SubscriptionStatus.CANCELED
            user_subscription.canceled_at = datetime.utcnow()

            # Downgrade user to starter tier
            await TierDowngradeService.downgrade_user_to_starter(
                db=db,
                user_id=user_subscription.user_id,
                reason="paddle_subscription_cancelled",
            )

            logger.info(f"Paddle subscription cancelled: {subscription_id}")

    @classmethod
    async def _handle_subscription_paused(
        cls,
        data: Dict[str, Any],
        db: AsyncSession,
    ) -> None:
        """Handle subscription paused event."""
        subscription_id = data.get("id")

        result = await db.execute(
            select(UserSubscription).where(
                UserSubscription.paddle_subscription_id == subscription_id
            )
        )
        user_subscription = result.scalar_one_or_none()

        if user_subscription:
            user_subscription.status = SubscriptionStatus.PAUSED
            await db.commit()
            logger.info(f"Paddle subscription paused: {subscription_id}")

    @classmethod
    async def _handle_subscription_resumed(
        cls,
        data: Dict[str, Any],
        db: AsyncSession,
    ) -> None:
        """Handle subscription resumed event."""
        subscription_id = data.get("id")

        result = await db.execute(
            select(UserSubscription).where(
                UserSubscription.paddle_subscription_id == subscription_id
            )
        )
        user_subscription = result.scalar_one_or_none()

        if user_subscription:
            user_subscription.status = SubscriptionStatus.ACTIVE
            await db.commit()
            logger.info(f"Paddle subscription resumed: {subscription_id}")

    @classmethod
    async def _handle_transaction_completed(
        cls,
        data: Dict[str, Any],
        db: AsyncSession,
    ) -> None:
        """Handle successful transaction event."""
        transaction_id = data.get("id")
        subscription_id = data.get("subscription_id")

        if not subscription_id:
            logger.info(f"Transaction {transaction_id} has no subscription_id (one-time payment)")
            return

        # Get user subscription
        result = await db.execute(
            select(UserSubscription).where(
                UserSubscription.paddle_subscription_id == subscription_id
            )
        )
        user_subscription = result.scalar_one_or_none()

        if not user_subscription:
            logger.warning(f"Subscription not found for transaction: {subscription_id}")
            return

        # Check if payment already recorded
        result = await db.execute(
            select(PaymentHistory).where(
                PaymentHistory.paddle_transaction_id == transaction_id
            )
        )
        existing = result.scalar_one_or_none()

        if not existing:
            details = data.get("details", {})
            totals = details.get("totals", {})
            amount = int(totals.get("total", "0"))
            currency = data.get("currency_code", "USD")

            payment = PaymentHistory(
                user_id=user_subscription.user_id,
                payment_provider=PaymentProvider.PADDLE,
                paddle_transaction_id=transaction_id,
                paddle_subscription_id=subscription_id,
                amount=amount,
                currency=currency,
                status=PaymentStatus.SUCCEEDED,
                description="Subscription payment",
                payment_method="paddle",
                paid_at=datetime.utcnow(),
            )
            db.add(payment)

            # Update subscription period
            billing_period = data.get("billing_period", {})
            starts_at = billing_period.get("starts_at")
            ends_at = billing_period.get("ends_at")

            if starts_at:
                user_subscription.current_period_start = datetime.fromisoformat(
                    starts_at.replace("Z", "+00:00")
                )
            if ends_at:
                user_subscription.current_period_end = datetime.fromisoformat(
                    ends_at.replace("Z", "+00:00")
                )

            # Ensure subscription is active
            user_subscription.status = SubscriptionStatus.ACTIVE

            await db.commit()
            logger.info(f"Paddle transaction recorded: {transaction_id}")

    @classmethod
    async def _handle_transaction_failed(
        cls,
        data: Dict[str, Any],
        db: AsyncSession,
    ) -> None:
        """Handle failed transaction event."""
        transaction_id = data.get("id")
        subscription_id = data.get("subscription_id")

        if not subscription_id:
            return

        result = await db.execute(
            select(UserSubscription).where(
                UserSubscription.paddle_subscription_id == subscription_id
            )
        )
        user_subscription = result.scalar_one_or_none()

        if not user_subscription:
            return

        # Record failed payment
        details = data.get("details", {})
        totals = details.get("totals", {})
        amount = int(totals.get("total", "0"))
        currency = data.get("currency_code", "USD")

        payment = PaymentHistory(
            user_id=user_subscription.user_id,
            payment_provider=PaymentProvider.PADDLE,
            paddle_transaction_id=transaction_id,
            paddle_subscription_id=subscription_id,
            amount=amount,
            currency=currency,
            status=PaymentStatus.FAILED,
            description="Failed subscription payment",
            payment_method="paddle",
            failed_at=datetime.utcnow(),
        )
        db.add(payment)

        # Update subscription status
        user_subscription.status = SubscriptionStatus.PAST_DUE
        await db.commit()

        logger.info(f"Paddle transaction failed: {transaction_id}")

    @classmethod
    def verify_webhook_signature(
        cls,
        payload: bytes,
        signature: str,
    ) -> bool:
        """
        Verify Paddle webhook signature.

        Paddle uses a simple signature: base64(HMAC-SHA256(secret, payload))
        The signature is in the Paddle-Signature header as: ts=...;h1=...

        Args:
            payload: Raw request body
            signature: Paddle-Signature header value

        Returns:
            True if signature is valid
        """
        if not settings.PADDLE_WEBHOOK_SECRET:
            logger.warning("PADDLE_WEBHOOK_SECRET not configured, skipping verification")
            return True

        try:
            # Parse the signature header
            # Format: ts=timestamp;h1=signature
            parts = {}
            for part in signature.split(";"):
                if "=" in part:
                    key, value = part.split("=", 1)
                    parts[key] = value

            timestamp = parts.get("ts", "")
            received_signature = parts.get("h1", "")

            if not timestamp or not received_signature:
                logger.warning("Invalid Paddle signature format")
                return False

            # Construct the signed payload: timestamp:payload
            signed_payload = f"{timestamp}:{payload.decode('utf-8')}"

            # Calculate expected signature
            expected_signature = hmac.new(
                settings.PADDLE_WEBHOOK_SECRET.encode(),
                signed_payload.encode(),
                hashlib.sha256,
            ).hexdigest()

            # Compare signatures
            return hmac.compare_digest(expected_signature, received_signature)

        except Exception as e:
            logger.error(f"Paddle webhook signature verification failed: {e}")
            return False
