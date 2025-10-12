"""
Billing and subscription models for Stripe integration.
"""
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import enum
from datetime import datetime
from app.models.base import BaseModel


class SubscriptionStatus(str, enum.Enum):
    """Subscription status enumeration matching Stripe statuses."""
    ACTIVE = "active"
    CANCELED = "canceled"
    INCOMPLETE = "incomplete"
    INCOMPLETE_EXPIRED = "incomplete_expired"
    PAST_DUE = "past_due"
    TRIALING = "trialing"
    UNPAID = "unpaid"


class PaymentStatus(str, enum.Enum):
    """Payment status enumeration."""
    SUCCEEDED = "succeeded"
    PENDING = "pending"
    FAILED = "failed"
    REFUNDED = "refunded"


class UserSubscription(BaseModel):
    """
    User subscription details from Stripe.
    Tracks the current subscription state for a user.
    """

    __tablename__ = "user_subscriptions"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)

    # Stripe IDs
    stripe_subscription_id = Column(String(255), unique=True, nullable=False, index=True)
    stripe_customer_id = Column(String(255), nullable=False, index=True)
    stripe_price_id = Column(String(255), nullable=False)

    # Subscription details
    status = Column(
        Enum(SubscriptionStatus, native_enum=False, length=50),
        nullable=False,
        default=SubscriptionStatus.ACTIVE
    )

    # Billing period
    current_period_start = Column(DateTime(timezone=True), nullable=False)
    current_period_end = Column(DateTime(timezone=True), nullable=False)

    # Cancellation
    cancel_at_period_end = Column(Integer, default=0, nullable=False)  # 0 = False, 1 = True
    canceled_at = Column(DateTime(timezone=True), nullable=True)

    # Trial
    trial_start = Column(DateTime(timezone=True), nullable=True)
    trial_end = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    user = relationship("User", backref="subscription_detail")

    def __repr__(self) -> str:
        return f"<UserSubscription(user_id={self.user_id}, status={self.status})>"


class PaymentHistory(BaseModel):
    """
    Payment history for tracking all transactions.
    Records each successful payment, failed payment, or refund.
    """

    __tablename__ = "payment_history"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Stripe IDs
    stripe_payment_intent_id = Column(String(255), unique=True, nullable=True, index=True)
    stripe_invoice_id = Column(String(255), unique=True, nullable=True, index=True)
    stripe_subscription_id = Column(String(255), nullable=True)

    # Payment details
    amount = Column(Integer, nullable=False)  # Amount in cents
    currency = Column(String(3), nullable=False, default="USD")

    status = Column(
        Enum(PaymentStatus, native_enum=False, length=50),
        nullable=False,
        default=PaymentStatus.PENDING
    )

    # Metadata
    description = Column(String(500), nullable=True)
    payment_method = Column(String(100), nullable=True)  # e.g., "card", "sepa_debit"

    # Timestamps
    paid_at = Column(DateTime(timezone=True), nullable=True)
    failed_at = Column(DateTime(timezone=True), nullable=True)
    refunded_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    user = relationship("User", backref="payment_history")

    def __repr__(self) -> str:
        return f"<PaymentHistory(user_id={self.user_id}, amount={self.amount}, status={self.status})>"
