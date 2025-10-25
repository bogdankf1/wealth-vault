"""
Savings module database models
"""
import enum
import uuid
from sqlalchemy import Column, String, Numeric, DateTime, Boolean, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base


class AccountType(str, enum.Enum):
    """Types of savings accounts"""
    CRYPTO = "crypto"
    CASH = "cash"
    BUSINESS = "business"
    PERSONAL = "personal"
    FIXED_DEPOSIT = "fixed_deposit"
    OTHER = "other"


class SavingsAccount(Base):
    """Savings account model"""
    __tablename__ = "savings_accounts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Account details
    name = Column(String(100), nullable=False)
    account_type = Column(String(20), nullable=False, default="personal")
    institution = Column(String(100), nullable=True)  # Bank/institution name
    account_number_last4 = Column(String(4), nullable=True)  # Last 4 digits for security

    # Balance
    current_balance = Column(Numeric(12, 2), nullable=False, default=0)
    currency = Column(String(3), nullable=False, default="USD")

    # Status
    is_active = Column(Boolean, nullable=False, default=True)

    # Metadata
    notes = Column(String(500), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="savings_accounts")
    balance_history = relationship("BalanceHistory", back_populates="account", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<SavingsAccount(id={self.id}, name={self.name}, balance={self.current_balance})>"


class BalanceHistory(Base):
    """Historical balance tracking for savings accounts"""
    __tablename__ = "balance_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id = Column(UUID(as_uuid=True), ForeignKey("savings_accounts.id", ondelete="CASCADE"), nullable=False)

    # Balance snapshot
    balance = Column(Numeric(12, 2), nullable=False)
    date = Column(DateTime, nullable=False)

    # Optional: track what caused the balance change
    change_amount = Column(Numeric(12, 2), nullable=True)
    change_reason = Column(String(200), nullable=True)  # e.g., "Deposit", "Interest", "Manual update"

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Relationships
    account = relationship("SavingsAccount", back_populates="balance_history")

    def __repr__(self):
        return f"<BalanceHistory(account_id={self.account_id}, balance={self.balance}, date={self.date})>"
