"""
Stripe service for handling payments and subscriptions.
"""
import stripe
from typing import Optional, Dict, Any
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.models.user import User
from app.models.tier import Tier
from app.models.billing import UserSubscription, PaymentHistory, SubscriptionStatus, PaymentStatus

# Initialize Stripe
stripe.api_key = settings.STRIPE_SECRET_KEY


class StripeService:
    """Service for handling Stripe operations."""

    @staticmethod
    async def create_customer(
        email: str,
        name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> stripe.Customer:
        """
        Create a Stripe customer.

        Args:
            email: Customer email
            name: Customer name
            metadata: Additional metadata

        Returns:
            Stripe Customer object
        """
        customer_data = {"email": email}
        if name:
            customer_data["name"] = name
        if metadata:
            customer_data["metadata"] = metadata

        return stripe.Customer.create(**customer_data)

    @staticmethod
    async def create_checkout_session(
        customer_id: str,
        price_id: str,
        success_url: str,
        cancel_url: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> stripe.checkout.Session:
        """
        Create a Stripe Checkout session for subscription.

        Args:
            customer_id: Stripe customer ID
            price_id: Stripe price ID (growth or wealth tier)
            success_url: URL to redirect on success
            cancel_url: URL to redirect on cancel
            metadata: Additional metadata

        Returns:
            Stripe Checkout Session
        """
        session_data = {
            "customer": customer_id,
            "payment_method_types": ["card"],
            "line_items": [
                {
                    "price": price_id,
                    "quantity": 1,
                }
            ],
            "mode": "subscription",
            "success_url": success_url,
            "cancel_url": cancel_url,
        }

        if metadata:
            session_data["metadata"] = metadata

        return stripe.checkout.Session.create(**session_data)

    @staticmethod
    async def get_subscription(subscription_id: str) -> stripe.Subscription:
        """
        Get a Stripe subscription by ID.

        Args:
            subscription_id: Stripe subscription ID

        Returns:
            Stripe Subscription object
        """
        return stripe.Subscription.retrieve(subscription_id)

    @staticmethod
    async def cancel_subscription(
        subscription_id: str,
        at_period_end: bool = True
    ) -> stripe.Subscription:
        """
        Cancel a Stripe subscription.

        Args:
            subscription_id: Stripe subscription ID
            at_period_end: If True, cancel at end of billing period

        Returns:
            Updated Stripe Subscription object
        """
        if at_period_end:
            return stripe.Subscription.modify(
                subscription_id,
                cancel_at_period_end=True
            )
        else:
            return stripe.Subscription.cancel(subscription_id)

    @staticmethod
    async def update_subscription(
        subscription_id: str,
        new_price_id: str
    ) -> stripe.Subscription:
        """
        Update subscription to a new price (upgrade/downgrade).

        Args:
            subscription_id: Stripe subscription ID
            new_price_id: New Stripe price ID

        Returns:
            Updated Stripe Subscription object
        """
        subscription = await StripeService.get_subscription(subscription_id)

        return stripe.Subscription.modify(
            subscription_id,
            items=[{
                "id": subscription["items"]["data"][0].id,
                "price": new_price_id,
            }],
            proration_behavior="always_invoice",
        )

    @staticmethod
    async def create_customer_portal_session(
        customer_id: str,
        return_url: str
    ) -> stripe.billing_portal.Session:
        """
        Create a Stripe Customer Portal session.

        Args:
            customer_id: Stripe customer ID
            return_url: URL to return to after portal session

        Returns:
            Stripe Portal Session
        """
        return stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=return_url,
        )

    @staticmethod
    async def handle_checkout_completed(
        session: Dict[str, Any],
        db: AsyncSession
    ) -> None:
        """
        Handle successful checkout completion.

        Args:
            session: Stripe checkout session data
            db: Database session
        """
        customer_id = session["customer"]
        subscription_id = session["subscription"]

        # Get user by Stripe customer ID
        result = await db.execute(
            select(User).where(User.stripe_customer_id == customer_id)
        )
        user = result.scalar_one_or_none()

        if not user:
            raise ValueError(f"User not found for customer_id: {customer_id}")

        # Get subscription details from Stripe
        subscription = await StripeService.get_subscription(subscription_id)

        # Determine tier based on price ID
        price_id = subscription["items"]["data"][0]["price"]["id"]
        if price_id == settings.STRIPE_GROWTH_PRICE_ID:
            tier_name = "growth"
        elif price_id == settings.STRIPE_WEALTH_PRICE_ID:
            tier_name = "wealth"
        else:
            raise ValueError(f"Unknown price_id: {price_id}")

        # Get tier from database
        result = await db.execute(
            select(Tier).where(Tier.name == tier_name)
        )
        tier = result.scalar_one_or_none()

        if not tier:
            raise ValueError(f"Tier not found: {tier_name}")

        # Update user tier and Stripe IDs
        user.tier_id = tier.id
        user.stripe_customer_id = customer_id
        user.stripe_subscription_id = subscription_id

        # Create or update user subscription record
        result = await db.execute(
            select(UserSubscription).where(UserSubscription.user_id == user.id)
        )
        user_subscription = result.scalar_one_or_none()

        subscription_data = {
            "user_id": user.id,
            "stripe_subscription_id": subscription_id,
            "stripe_customer_id": customer_id,
            "stripe_price_id": price_id,
            "status": SubscriptionStatus(subscription.get("status", "incomplete")),
            "cancel_at_period_end": 1 if subscription.get("cancel_at_period_end") else 0,
        }

        # Add period dates if available
        if subscription.get("current_period_start"):
            subscription_data["current_period_start"] = datetime.fromtimestamp(subscription["current_period_start"])
        if subscription.get("current_period_end"):
            subscription_data["current_period_end"] = datetime.fromtimestamp(subscription["current_period_end"])

        # Add trial dates if available
        if subscription.get("trial_start"):
            subscription_data["trial_start"] = datetime.fromtimestamp(subscription["trial_start"])
        if subscription.get("trial_end"):
            subscription_data["trial_end"] = datetime.fromtimestamp(subscription["trial_end"])

        if user_subscription:
            for key, value in subscription_data.items():
                setattr(user_subscription, key, value)
        else:
            user_subscription = UserSubscription(**subscription_data)
            db.add(user_subscription)

        await db.commit()

    @staticmethod
    async def handle_subscription_updated(
        subscription_data: Dict[str, Any],
        db: AsyncSession
    ) -> None:
        """
        Handle subscription update webhook.

        Args:
            subscription_data: Stripe subscription data
            db: Database session
        """
        subscription_id = subscription_data["id"]

        # Get user subscription
        result = await db.execute(
            select(UserSubscription).where(
                UserSubscription.stripe_subscription_id == subscription_id
            )
        )
        user_subscription = result.scalar_one_or_none()

        if not user_subscription:
            return  # Subscription not in our system yet

        # Update subscription status
        user_subscription.status = SubscriptionStatus(subscription_data["status"])
        user_subscription.current_period_start = datetime.fromtimestamp(
            subscription_data["current_period_start"]
        )
        user_subscription.current_period_end = datetime.fromtimestamp(
            subscription_data["current_period_end"]
        )
        user_subscription.cancel_at_period_end = (
            1 if subscription_data.get("cancel_at_period_end") else 0
        )

        if subscription_data.get("canceled_at"):
            user_subscription.canceled_at = datetime.fromtimestamp(
                subscription_data["canceled_at"]
            )

        await db.commit()

    @staticmethod
    async def handle_invoice_paid(
        invoice_data: Dict[str, Any],
        db: AsyncSession
    ) -> None:
        """
        Handle successful invoice payment.

        Args:
            invoice_data: Stripe invoice data
            db: Database session
        """
        customer_id = invoice_data["customer"]
        subscription_id = invoice_data.get("subscription")

        # Get user by customer ID
        result = await db.execute(
            select(User).where(User.stripe_customer_id == customer_id)
        )
        user = result.scalar_one_or_none()

        if not user:
            return  # User not found

        # Record payment history
        payment = PaymentHistory(
            user_id=user.id,
            stripe_invoice_id=invoice_data["id"],
            stripe_payment_intent_id=invoice_data.get("payment_intent"),
            stripe_subscription_id=subscription_id,
            amount=invoice_data["amount_paid"],
            currency=invoice_data["currency"].upper(),
            status=PaymentStatus.SUCCEEDED,
            description=invoice_data.get("description"),
            paid_at=datetime.fromtimestamp(invoice_data["status_transitions"]["paid_at"]),
        )

        db.add(payment)
        await db.commit()

    @staticmethod
    async def handle_invoice_payment_failed(
        invoice_data: Dict[str, Any],
        db: AsyncSession
    ) -> None:
        """
        Handle failed invoice payment.

        Args:
            invoice_data: Stripe invoice data
            db: Database session
        """
        customer_id = invoice_data["customer"]

        # Get user by customer ID
        result = await db.execute(
            select(User).where(User.stripe_customer_id == customer_id)
        )
        user = result.scalar_one_or_none()

        if not user:
            return

        # Record failed payment
        payment = PaymentHistory(
            user_id=user.id,
            stripe_invoice_id=invoice_data["id"],
            stripe_payment_intent_id=invoice_data.get("payment_intent"),
            stripe_subscription_id=invoice_data.get("subscription"),
            amount=invoice_data["amount_due"],
            currency=invoice_data["currency"].upper(),
            status=PaymentStatus.FAILED,
            description=invoice_data.get("description"),
            failed_at=datetime.now(),
        )

        db.add(payment)
        await db.commit()
