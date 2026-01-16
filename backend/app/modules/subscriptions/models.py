"""
Subscriptions module database models
"""
import enum
import uuid
from sqlalchemy import Column, String, Numeric, DateTime, Boolean, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base


class SubscriptionFrequency(str, enum.Enum):
    """Subscription billing frequencies"""
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    ANNUALLY = "annually"
    BIANNUALLY = "biannually"


class SubscriptionStatus(str, enum.Enum):
    """Subscription status types"""
    ACTIVE = "active"
    PAUSED = "paused"
    CANCELLED = "cancelled"
    EXPIRED = "expired"
    PAYMENT_FAILED = "payment_failed"


class Subscription(Base):
    """Subscription model"""
    __tablename__ = "subscriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Subscription details
    name = Column(String(100), nullable=False)
    description = Column(String(500), nullable=True)
    category = Column(String(50), nullable=True)  # e.g., Streaming, Software, Gym, etc.

    # Pricing
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="USD")
    frequency = Column(String(20), nullable=False, default="monthly")

    # Dates (store as date-only strings to avoid timezone issues)
    start_date = Column(DateTime, nullable=False)  # When subscription started
    end_date = Column(DateTime, nullable=True)  # Optional cancellation/end date

    # Status - is_active kept for backwards compatibility
    is_active = Column(Boolean, nullable=False, default=True)
    status = Column(String(20), nullable=False, default="active")  # active, paused, cancelled, expired

    # Payment integration fields
    payment_account_id = Column(UUID(as_uuid=True), ForeignKey("savings_accounts.id", ondelete="SET NULL"), nullable=True, index=True)
    auto_pay = Column(Boolean, nullable=False, default=False)  # Auto-pay from linked account
    next_payment_date = Column(DateTime, nullable=True, index=True)
    last_payment_date = Column(DateTime, nullable=True)

    # Reminder settings
    reminder_days_before = Column(Integer, nullable=False, default=3)  # Days before renewal to send reminder
    last_reminder_at = Column(DateTime, nullable=True)  # Prevent duplicate reminders

    # Pause/resume support
    paused_at = Column(DateTime, nullable=True)
    resume_date = Column(DateTime, nullable=True)

    # Metadata
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="subscriptions")
    payment_account = relationship("SavingsAccount", foreign_keys=[payment_account_id])
    payments = relationship("SubscriptionPayment", back_populates="subscription", cascade="all, delete-orphan")


class SubscriptionPayment(Base):
    """Track individual subscription payments"""
    __tablename__ = "subscription_payments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subscription_id = Column(UUID(as_uuid=True), ForeignKey("subscriptions.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Payment details
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), nullable=False)
    payment_date = Column(DateTime, nullable=False, index=True)

    # Billing period
    period_start = Column(DateTime, nullable=True)
    period_end = Column(DateTime, nullable=True)

    # Links to expense and account transaction
    expense_id = Column(UUID(as_uuid=True), ForeignKey("expenses.id", ondelete="SET NULL"), nullable=True)
    account_transaction_id = Column(UUID(as_uuid=True), ForeignKey("account_transactions.id", ondelete="SET NULL"), nullable=True)

    # Status and notes
    status = Column(String(20), nullable=False, default="completed")  # pending, completed, failed
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Relationships
    subscription = relationship("Subscription", back_populates="payments")
    user = relationship("User")
    expense = relationship("Expense", foreign_keys=[expense_id])
    account_transaction = relationship("AccountTransaction", foreign_keys=[account_transaction_id])
