"""
PayPal service for handling payments and subscriptions.
"""
import requests
import base64
from typing import Dict, Any
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


class PayPalService:
    """Service for handling PayPal operations."""

    # API Base URLs
    SANDBOX_API_BASE = "https://api-m.sandbox.paypal.com"
    LIVE_API_BASE = "https://api-m.paypal.com"

    @classmethod
    def _get_api_base(cls) -> str:
        """Get the appropriate API base URL based on mode."""
        if settings.PAYPAL_MODE == "live":
            return cls.LIVE_API_BASE
        return cls.SANDBOX_API_BASE

    @classmethod
    async def _get_access_token(cls) -> str:
        """
        Get PayPal OAuth access token.

        Returns:
            Access token string
        """
        url = f"{cls._get_api_base()}/v1/oauth2/token"

        # Create Basic Auth header
        credentials = f"{settings.PAYPAL_CLIENT_ID}:{settings.PAYPAL_CLIENT_SECRET}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()

        response = requests.post(
            url,
            headers={
                "Authorization": f"Basic {encoded_credentials}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={"grant_type": "client_credentials"},
        )

        if response.status_code != 200:
            logger.error(f"Failed to get PayPal access token: {response.text}")
            raise Exception("Failed to get PayPal access token")

        return response.json()["access_token"]

    @classmethod
    async def get_subscription(cls, subscription_id: str) -> Dict[str, Any]:
        """
        Get a PayPal subscription by ID.

        Args:
            subscription_id: PayPal subscription ID

        Returns:
            Subscription details dictionary
        """
        access_token = await cls._get_access_token()
        url = f"{cls._get_api_base()}/v1/billing/subscriptions/{subscription_id}"

        response = requests.get(
            url,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
        )

        if response.status_code != 200:
            logger.error(f"Failed to get PayPal subscription: {response.text}")
            raise Exception(f"Failed to get PayPal subscription: {subscription_id}")

        return response.json()

    @classmethod
    async def activate_subscription(
        cls,
        subscription_id: str,
        user: User,
        db: AsyncSession,
    ) -> Dict[str, Any]:
        """
        Verify and activate a PayPal subscription after user approval.

        This is called after the user approves the subscription in the PayPal popup.
        We verify the subscription status with PayPal and update our database.

        Args:
            subscription_id: PayPal subscription ID from frontend
            user: Current user
            db: Database session

        Returns:
            Result dictionary with success status
        """
        # Get subscription details from PayPal
        subscription = await cls.get_subscription(subscription_id)

        status = subscription.get("status")
        if status not in ["ACTIVE", "APPROVED"]:
            logger.warning(f"PayPal subscription not active: {status}")
            raise Exception(f"Subscription is not active: {status}")

        # Determine tier based on plan ID
        plan_id = subscription.get("plan_id")
        if plan_id == settings.PAYPAL_GROWTH_PLAN_ID:
            tier_name = "growth"
        elif plan_id == settings.PAYPAL_WEALTH_PLAN_ID:
            tier_name = "wealth"
        else:
            logger.error(f"Unknown PayPal plan_id: {plan_id}")
            raise ValueError(f"Unknown PayPal plan_id: {plan_id}")

        # Get tier from database
        result = await db.execute(select(Tier).where(Tier.name == tier_name))
        tier = result.scalar_one_or_none()

        if not tier:
            raise ValueError(f"Tier not found: {tier_name}")

        # Update user tier and PayPal subscription ID
        user.tier_id = tier.id
        user.paypal_subscription_id = subscription_id

        # Parse billing dates
        billing_info = subscription.get("billing_info", {})
        next_billing_time = billing_info.get("next_billing_time")
        last_payment = billing_info.get("last_payment", {})
        last_payment_time = last_payment.get("time")

        current_period_start = None
        current_period_end = None

        if last_payment_time:
            current_period_start = datetime.fromisoformat(
                last_payment_time.replace("Z", "+00:00")
            )
        else:
            # Use subscription start time
            start_time = subscription.get("start_time")
            if start_time:
                current_period_start = datetime.fromisoformat(
                    start_time.replace("Z", "+00:00")
                )

        if next_billing_time:
            current_period_end = datetime.fromisoformat(
                next_billing_time.replace("Z", "+00:00")
            )

        # Check for existing subscription record
        result = await db.execute(
            select(UserSubscription).where(UserSubscription.user_id == user.id)
        )
        user_subscription = result.scalar_one_or_none()

        subscription_data = {
            "user_id": user.id,
            "payment_provider": "paypal",
            "paypal_subscription_id": subscription_id,
            "paypal_plan_id": plan_id,
            "stripe_subscription_id": None,
            "stripe_customer_id": None,
            "stripe_price_id": None,
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

        # Record initial payment if available
        if last_payment:
            payment_amount = last_payment.get("amount", {})
            amount_value = payment_amount.get("value", "0")
            currency = payment_amount.get("currency_code", "USD")

            # Check if payment already recorded
            result = await db.execute(
                select(PaymentHistory).where(
                    PaymentHistory.paypal_subscription_id == subscription_id,
                    PaymentHistory.user_id == user.id,
                )
            )
            existing_payment = result.scalar_one_or_none()

            if not existing_payment:
                payment = PaymentHistory(
                    user_id=user.id,
                    payment_provider=PaymentProvider.PAYPAL,
                    paypal_subscription_id=subscription_id,
                    paypal_transaction_id=f"INIT_{subscription_id}",
                    amount=int(float(amount_value) * 100),  # Convert to cents
                    currency=currency,
                    status=PaymentStatus.SUCCEEDED,
                    description=f"Subscription payment - {tier_name.title()} tier",
                    payment_method="paypal",
                    paid_at=current_period_start or datetime.utcnow(),
                )
                db.add(payment)

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
        reason: str = "User requested cancellation",
    ) -> Dict[str, Any]:
        """
        Cancel a PayPal subscription.

        Note: PayPal subscriptions can only be cancelled immediately,
        there's no "cancel at period end" option like Stripe.

        Args:
            subscription_id: PayPal subscription ID
            reason: Cancellation reason

        Returns:
            Result dictionary
        """
        access_token = await cls._get_access_token()
        url = f"{cls._get_api_base()}/v1/billing/subscriptions/{subscription_id}/cancel"

        response = requests.post(
            url,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json={"reason": reason},
        )

        if response.status_code not in [200, 204]:
            logger.error(f"Failed to cancel PayPal subscription: {response.text}")
            raise Exception("Failed to cancel PayPal subscription")

        return {"success": True, "subscription_id": subscription_id}

    @classmethod
    async def suspend_subscription(cls, subscription_id: str) -> Dict[str, Any]:
        """
        Suspend (pause) a PayPal subscription.

        Args:
            subscription_id: PayPal subscription ID

        Returns:
            Result dictionary
        """
        access_token = await cls._get_access_token()
        url = f"{cls._get_api_base()}/v1/billing/subscriptions/{subscription_id}/suspend"

        response = requests.post(
            url,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json={"reason": "User requested suspension"},
        )

        if response.status_code not in [200, 204]:
            logger.error(f"Failed to suspend PayPal subscription: {response.text}")
            raise Exception("Failed to suspend PayPal subscription")

        return {"success": True, "subscription_id": subscription_id}

    @classmethod
    async def update_subscription(
        cls,
        subscription_id: str,
        new_plan_id: str,
        db: AsyncSession,
        user: User,
    ) -> Dict[str, Any]:
        """
        Update subscription to a new plan (upgrade/downgrade).

        PayPal requires creating a new subscription for plan changes,
        so we cancel the old one and guide user to create new.

        For simplicity, we'll revise the subscription using PayPal's revise API.

        Args:
            subscription_id: Current PayPal subscription ID
            new_plan_id: New PayPal plan ID
            db: Database session
            user: Current user

        Returns:
            Result dictionary with approval link if needed
        """
        access_token = await cls._get_access_token()
        url = f"{cls._get_api_base()}/v1/billing/subscriptions/{subscription_id}/revise"

        response = requests.post(
            url,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json={
                "plan_id": new_plan_id,
                "application_context": {
                    "brand_name": "Wealth Vault",
                    "shipping_preference": "NO_SHIPPING",
                    "user_action": "SUBSCRIBE_NOW",
                },
            },
        )

        if response.status_code not in [200, 201]:
            logger.error(f"Failed to revise PayPal subscription: {response.text}")
            raise Exception("Failed to update PayPal subscription")

        result = response.json()

        # Find approval link
        approval_link = None
        for link in result.get("links", []):
            if link.get("rel") == "approve":
                approval_link = link.get("href")
                break

        return {
            "success": True,
            "subscription_id": subscription_id,
            "requires_approval": approval_link is not None,
            "approval_url": approval_link,
        }

    @classmethod
    async def handle_webhook_event(
        cls,
        event_type: str,
        resource: Dict[str, Any],
        db: AsyncSession,
    ) -> None:
        """
        Handle PayPal webhook events.

        Args:
            event_type: PayPal webhook event type
            resource: Event resource data
            db: Database session
        """
        logger.info(f"Processing PayPal webhook: {event_type}")

        if event_type == "BILLING.SUBSCRIPTION.ACTIVATED":
            await cls._handle_subscription_activated(resource, db)

        elif event_type == "BILLING.SUBSCRIPTION.UPDATED":
            await cls._handle_subscription_updated(resource, db)

        elif event_type == "BILLING.SUBSCRIPTION.CANCELLED":
            await cls._handle_subscription_cancelled(resource, db)

        elif event_type == "BILLING.SUBSCRIPTION.SUSPENDED":
            await cls._handle_subscription_suspended(resource, db)

        elif event_type == "PAYMENT.SALE.COMPLETED":
            await cls._handle_payment_completed(resource, db)

        elif event_type == "PAYMENT.SALE.DENIED":
            await cls._handle_payment_denied(resource, db)

        else:
            logger.info(f"Unhandled PayPal webhook event: {event_type}")

    @classmethod
    async def _handle_subscription_activated(
        cls,
        resource: Dict[str, Any],
        db: AsyncSession,
    ) -> None:
        """Handle subscription activated event."""
        subscription_id = resource.get("id")

        result = await db.execute(
            select(UserSubscription).where(
                UserSubscription.paypal_subscription_id == subscription_id
            )
        )
        user_subscription = result.scalar_one_or_none()

        if user_subscription:
            user_subscription.status = SubscriptionStatus.ACTIVE
            await db.commit()
            logger.info(f"PayPal subscription activated: {subscription_id}")

    @classmethod
    async def _handle_subscription_updated(
        cls,
        resource: Dict[str, Any],
        db: AsyncSession,
    ) -> None:
        """Handle subscription updated event."""
        subscription_id = resource.get("id")

        result = await db.execute(
            select(UserSubscription).where(
                UserSubscription.paypal_subscription_id == subscription_id
            )
        )
        user_subscription = result.scalar_one_or_none()

        if user_subscription:
            # Update billing dates if available
            billing_info = resource.get("billing_info", {})
            next_billing_time = billing_info.get("next_billing_time")

            if next_billing_time:
                user_subscription.current_period_end = datetime.fromisoformat(
                    next_billing_time.replace("Z", "+00:00")
                )

            await db.commit()
            logger.info(f"PayPal subscription updated: {subscription_id}")

    @classmethod
    async def _handle_subscription_cancelled(
        cls,
        resource: Dict[str, Any],
        db: AsyncSession,
    ) -> None:
        """Handle subscription cancelled event."""
        from app.services.tier_downgrade_service import TierDowngradeService

        subscription_id = resource.get("id")

        result = await db.execute(
            select(UserSubscription).where(
                UserSubscription.paypal_subscription_id == subscription_id
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
                reason="paypal_subscription_cancelled",
            )

            logger.info(f"PayPal subscription cancelled: {subscription_id}")

    @classmethod
    async def _handle_subscription_suspended(
        cls,
        resource: Dict[str, Any],
        db: AsyncSession,
    ) -> None:
        """Handle subscription suspended event."""
        subscription_id = resource.get("id")

        result = await db.execute(
            select(UserSubscription).where(
                UserSubscription.paypal_subscription_id == subscription_id
            )
        )
        user_subscription = result.scalar_one_or_none()

        if user_subscription:
            user_subscription.status = SubscriptionStatus.PAUSED
            await db.commit()
            logger.info(f"PayPal subscription suspended: {subscription_id}")

    @classmethod
    async def _handle_payment_completed(
        cls,
        resource: Dict[str, Any],
        db: AsyncSession,
    ) -> None:
        """Handle successful payment event."""
        billing_agreement_id = resource.get("billing_agreement_id")

        if not billing_agreement_id:
            logger.warning("Payment completed without billing_agreement_id")
            return

        # Get user subscription
        result = await db.execute(
            select(UserSubscription).where(
                UserSubscription.paypal_subscription_id == billing_agreement_id
            )
        )
        user_subscription = result.scalar_one_or_none()

        if not user_subscription:
            logger.warning(f"Subscription not found for payment: {billing_agreement_id}")
            return

        # Record payment
        transaction_id = resource.get("id")
        amount = resource.get("amount", {})
        amount_value = amount.get("total", "0")
        currency = amount.get("currency", "USD")

        # Check if payment already recorded
        result = await db.execute(
            select(PaymentHistory).where(
                PaymentHistory.paypal_transaction_id == transaction_id
            )
        )
        existing = result.scalar_one_or_none()

        if not existing:
            payment = PaymentHistory(
                user_id=user_subscription.user_id,
                payment_provider=PaymentProvider.PAYPAL,
                paypal_transaction_id=transaction_id,
                paypal_subscription_id=billing_agreement_id,
                amount=int(float(amount_value) * 100),
                currency=currency,
                status=PaymentStatus.SUCCEEDED,
                description="Subscription payment",
                payment_method="paypal",
                paid_at=datetime.utcnow(),
            )
            db.add(payment)

            # Update subscription period
            user_subscription.current_period_start = datetime.utcnow()

            await db.commit()
            logger.info(f"PayPal payment recorded: {transaction_id}")

    @classmethod
    async def _handle_payment_denied(
        cls,
        resource: Dict[str, Any],
        db: AsyncSession,
    ) -> None:
        """Handle failed payment event."""
        billing_agreement_id = resource.get("billing_agreement_id")

        if not billing_agreement_id:
            return

        result = await db.execute(
            select(UserSubscription).where(
                UserSubscription.paypal_subscription_id == billing_agreement_id
            )
        )
        user_subscription = result.scalar_one_or_none()

        if not user_subscription:
            return

        # Record failed payment
        transaction_id = resource.get("id")
        amount = resource.get("amount", {})
        amount_value = amount.get("total", "0")
        currency = amount.get("currency", "USD")

        payment = PaymentHistory(
            user_id=user_subscription.user_id,
            payment_provider=PaymentProvider.PAYPAL,
            paypal_transaction_id=transaction_id,
            paypal_subscription_id=billing_agreement_id,
            amount=int(float(amount_value) * 100),
            currency=currency,
            status=PaymentStatus.FAILED,
            description="Failed subscription payment",
            payment_method="paypal",
            failed_at=datetime.utcnow(),
        )
        db.add(payment)

        # Update subscription status
        user_subscription.status = SubscriptionStatus.PAST_DUE
        await db.commit()

        logger.info(f"PayPal payment failed: {transaction_id}")

    @classmethod
    async def verify_webhook_signature(
        cls,
        webhook_id: str,
        event_body: bytes,
        headers: Dict[str, str],
    ) -> bool:
        """
        Verify PayPal webhook signature.

        Args:
            webhook_id: PayPal webhook ID from settings
            event_body: Raw request body
            headers: Request headers

        Returns:
            True if signature is valid
        """
        access_token = await cls._get_access_token()
        url = f"{cls._get_api_base()}/v1/notifications/verify-webhook-signature"

        verification_data = {
            "auth_algo": headers.get("paypal-auth-algo", ""),
            "cert_url": headers.get("paypal-cert-url", ""),
            "transmission_id": headers.get("paypal-transmission-id", ""),
            "transmission_sig": headers.get("paypal-transmission-sig", ""),
            "transmission_time": headers.get("paypal-transmission-time", ""),
            "webhook_id": webhook_id,
            "webhook_event": event_body.decode("utf-8") if isinstance(event_body, bytes) else event_body,
        }

        # For webhook verification, we need to pass the raw event as JSON
        import json
        try:
            verification_data["webhook_event"] = json.loads(event_body)
        except json.JSONDecodeError:
            logger.error("Failed to parse webhook event body")
            return False

        response = requests.post(
            url,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json=verification_data,
        )

        if response.status_code != 200:
            logger.error(f"Webhook verification failed: {response.text}")
            return False

        result = response.json()
        return result.get("verification_status") == "SUCCESS"
