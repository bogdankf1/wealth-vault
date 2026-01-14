"""
Taxes module database models
"""
import uuid
from sqlalchemy import Column, String, Numeric, DateTime, Boolean, ForeignKey, Text, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from app.core.database import Base


class TaxType(str, enum.Enum):
    """Types of tax calculation"""
    fixed = "fixed"  # Fixed amount
    percentage = "percentage"  # Percentage of income


class TaxFrequency(str, enum.Enum):
    """Tax payment frequency"""
    monthly = "monthly"
    quarterly = "quarterly"
    annually = "annually"


class TaxPaymentStatus(str, enum.Enum):
    """Tax payment status"""
    pending = "pending"
    completed = "completed"
    failed = "failed"


class Tax(Base):
    """Tax model for tracking tax obligations"""
    __tablename__ = "taxes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Tax details
    name = Column(String(100), nullable=False)  # e.g., "Federal Income Tax", "State Tax"
    description = Column(Text, nullable=True)
    tax_type = Column(SQLEnum(TaxType, native_enum=False, length=20), nullable=False, default=TaxType.fixed)
    frequency = Column(SQLEnum(TaxFrequency, native_enum=False, length=20), nullable=False, default=TaxFrequency.annually)

    # Amount (for fixed taxes)
    fixed_amount = Column(Numeric(12, 2), nullable=True)  # Fixed amount
    currency = Column(String(3), nullable=False, default="USD")

    # Percentage (for percentage-based taxes)
    percentage = Column(Numeric(5, 2), nullable=True)  # Percentage of income (0-100)

    # Income source linking (NULL = applies to ALL income sources)
    income_source_id = Column(UUID(as_uuid=True), ForeignKey("income_sources.id", ondelete="SET NULL"), nullable=True)

    # Payment account (which account to pay from)
    payment_account_id = Column(UUID(as_uuid=True), ForeignKey("savings_accounts.id", ondelete="SET NULL"), nullable=True)

    # Auto-pay settings
    auto_pay = Column(Boolean, nullable=False, default=False)
    next_payment_date = Column(DateTime, nullable=True)

    # Status
    is_active = Column(Boolean, nullable=False, default=True)

    # Metadata
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)

    # Relationships
    user = relationship("User", back_populates="taxes")
    income_source = relationship("IncomeSource", back_populates="taxes")
    payment_account = relationship("SavingsAccount", foreign_keys=[payment_account_id])
    payments = relationship("TaxPayment", back_populates="tax", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Tax(id={self.id}, name={self.name}, type={self.tax_type})>"


class TaxPayment(Base):
    """Tax payment model for tracking actual tax payments made"""
    __tablename__ = "tax_payments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tax_id = Column(UUID(as_uuid=True), ForeignKey("taxes.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Payment details
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="USD")
    payment_date = Column(DateTime, nullable=False)

    # Period this payment covers
    period_start = Column(DateTime, nullable=True)
    period_end = Column(DateTime, nullable=True)

    # Link to account transaction if paid from savings account
    account_transaction_id = Column(UUID(as_uuid=True), ForeignKey("account_transactions.id", ondelete="SET NULL"), nullable=True)

    # Status
    status = Column(SQLEnum(TaxPaymentStatus, native_enum=False, length=20), nullable=False, default=TaxPaymentStatus.completed)

    # Metadata
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    tax = relationship("Tax", back_populates="payments")
    user = relationship("User")
    account_transaction = relationship("AccountTransaction")

    def __repr__(self):
        return f"<TaxPayment(id={self.id}, tax_id={self.tax_id}, amount={self.amount})>"
