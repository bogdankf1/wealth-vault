"""
Installments module database models.
"""
import enum
from sqlalchemy import Column, String, Numeric, DateTime, Boolean, Integer, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime

from app.models.base import Base


class InstallmentStatus(str, enum.Enum):
    """Installment status types"""
    ACTIVE = "active"
    COMPLETED = "completed"
    DEFAULTED = "defaulted"


class InstallmentPaymentStatus(str, enum.Enum):
    """Individual payment status types"""
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class Installment(Base):
    """
    Installment model for tracking loans, debts, and payment plans.

    Examples: personal loans, auto loans, student loans, credit cards, mortgages
    """
    __tablename__ = "installments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Basic information
    name = Column(String(100), nullable=False)  # e.g., "Car Loan", "Student Loan"
    description = Column(String(500), nullable=True)
    category = Column(String(50), nullable=True, index=True)  # Personal, Auto, Student, Credit Card, Mortgage, etc.

    # Loan details
    total_amount = Column(Numeric(12, 2), nullable=False)  # Original loan amount
    amount_per_payment = Column(Numeric(12, 2), nullable=False)  # Payment amount (monthly, etc.)
    currency = Column(String(3), nullable=False, default="USD")
    interest_rate = Column(Numeric(5, 2), nullable=True)  # Annual interest rate (e.g., 5.5 for 5.5%)

    # Payment schedule
    frequency = Column(String(20), nullable=False, default="monthly")  # monthly, biweekly, weekly
    number_of_payments = Column(Integer, nullable=False)  # Total number of payments (e.g., 36, 60)
    payments_made = Column(Integer, nullable=False, default=0)  # Number of payments completed

    # Dates
    start_date = Column(DateTime, nullable=False)  # Loan start date
    first_payment_date = Column(DateTime, nullable=False)  # Date of first payment
    end_date = Column(DateTime, nullable=True)  # Calculated payoff date

    # Status - is_active kept for backwards compatibility
    is_active = Column(Boolean, nullable=False, default=True)
    status = Column(String(20), nullable=False, default="active")  # active, completed, defaulted
    remaining_balance = Column(Numeric(12, 2), nullable=True)  # Calculated field

    # Payment integration fields
    payment_account_id = Column(UUID(as_uuid=True), ForeignKey("savings_accounts.id", ondelete="SET NULL"), nullable=True, index=True)
    auto_pay = Column(Boolean, nullable=False, default=False)  # Auto-pay from linked account
    next_payment_date = Column(DateTime, nullable=True, index=True)
    last_payment_date = Column(DateTime, nullable=True)

    # Reminder settings
    reminder_days_before = Column(Integer, nullable=False, default=3)  # Days before payment to send reminder
    last_reminder_at = Column(DateTime, nullable=True)  # Prevent duplicate reminders

    # Timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="installments")
    payment_account = relationship("SavingsAccount", foreign_keys=[payment_account_id])
    payments = relationship("InstallmentPayment", back_populates="installment", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Installment(id={self.id}, name={self.name}, user_id={self.user_id})>"


class InstallmentPayment(Base):
    """Track individual installment payments"""
    __tablename__ = "installment_payments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    installment_id = Column(UUID(as_uuid=True), ForeignKey("installments.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Payment sequence
    payment_number = Column(Integer, nullable=False)  # Which payment in the sequence (1, 2, 3, ...)

    # Payment timing
    scheduled_date = Column(DateTime, nullable=False, index=True)  # When it was supposed to be paid
    actual_payment_date = Column(DateTime, nullable=True)  # When it was actually paid

    # Payment amounts
    scheduled_amount = Column(Numeric(12, 2), nullable=False)  # Expected payment amount
    actual_amount = Column(Numeric(12, 2), nullable=True)  # Actual payment amount (can differ)
    principal_amount = Column(Numeric(12, 2), nullable=True)  # Portion going to principal
    interest_amount = Column(Numeric(12, 2), nullable=True)  # Portion going to interest
    currency = Column(String(3), nullable=False)

    # Links to expense and account transaction
    expense_id = Column(UUID(as_uuid=True), ForeignKey("expenses.id", ondelete="SET NULL"), nullable=True)
    account_transaction_id = Column(UUID(as_uuid=True), ForeignKey("account_transactions.id", ondelete="SET NULL"), nullable=True)

    # Status and late tracking
    status = Column(String(20), nullable=False, default="pending")  # pending, completed, failed, skipped
    is_late = Column(Boolean, nullable=False, default=False)
    days_late = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Relationships
    installment = relationship("Installment", back_populates="payments")
    user = relationship("User")
    expense = relationship("Expense", foreign_keys=[expense_id])
    account_transaction = relationship("AccountTransaction", foreign_keys=[account_transaction_id])
