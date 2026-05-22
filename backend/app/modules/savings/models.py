"""
Savings module database models
"""
import enum
import uuid
from sqlalchemy import Column, String, Numeric, DateTime, Boolean, ForeignKey, Index, Enum as SQLEnum
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


class InterestFrequency(str, enum.Enum):
    """Interest calculation frequency"""
    DAILY = "daily"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    ANNUALLY = "annually"


class InterestMethod(str, enum.Enum):
    """Interest accrual method"""
    SIMPLE = "simple"
    COMPOUND = "compound"


class TransactionType(str, enum.Enum):
    """Types of account transactions"""
    DEPOSIT = "deposit"
    WITHDRAWAL = "withdrawal"
    TRANSFER_IN = "transfer_in"
    TRANSFER_OUT = "transfer_out"
    INTEREST = "interest"
    FEE = "fee"
    ADJUSTMENT = "adjustment"


class TransactionStatus(str, enum.Enum):
    """Transaction status"""
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
    REVERSED = "reversed"


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

    # Interest settings
    interest_rate = Column(Numeric(5, 4), nullable=True)  # APY as decimal (0.0450 = 4.5%)
    interest_frequency = Column(String(20), nullable=False, default="monthly")
    interest_accrual_method = Column(String(20), nullable=False, default="compound")
    last_interest_accrual = Column(DateTime(timezone=True), nullable=True)
    accrued_interest = Column(Numeric(12, 2), nullable=False, default=0)

    # Status
    is_active = Column(Boolean, nullable=False, default=True)

    # External integration linkage (e.g. Monobank). Nullable for manual accounts.
    external_source = Column(String(32), nullable=True)
    external_id = Column(String(128), nullable=True)

    # Metadata
    notes = Column(String(500), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index(
            "ix_savings_accounts_external",
            "user_id", "external_source", "external_id",
            unique=True,
            postgresql_where=Column("external_id").isnot(None),
        ),
    )

    # Relationships
    user = relationship("User", back_populates="savings_accounts")
    balance_history = relationship("BalanceHistory", back_populates="account", cascade="all, delete-orphan")
    transactions = relationship("AccountTransaction", back_populates="account", cascade="all, delete-orphan")
    transfers_from = relationship("AccountTransfer", foreign_keys="AccountTransfer.from_account_id", back_populates="from_account")
    transfers_to = relationship("AccountTransfer", foreign_keys="AccountTransfer.to_account_id", back_populates="to_account")

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


class AccountTransaction(Base):
    """Account transaction model for tracking deposits, withdrawals, etc."""
    __tablename__ = "account_transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id = Column(UUID(as_uuid=True), ForeignKey("savings_accounts.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Transaction details
    transaction_type = Column(String(20), nullable=False)  # deposit, withdrawal, transfer_in, transfer_out, interest, fee, adjustment
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), nullable=False)

    # Balance tracking
    balance_before = Column(Numeric(12, 2), nullable=False)
    balance_after = Column(Numeric(12, 2), nullable=False)

    # Source linking (for integration with other modules)
    source_type = Column(String(50), nullable=True)  # income, expense, subscription, installment, transfer, manual, interest
    source_id = Column(UUID(as_uuid=True), nullable=True)

    # Metadata
    description = Column(String(500), nullable=True)
    category = Column(String(50), nullable=True)
    reference_number = Column(String(100), nullable=True)

    # Dates
    transaction_date = Column(DateTime(timezone=True), nullable=False)
    posted_date = Column(DateTime(timezone=True), nullable=True)

    # Status
    status = Column(String(20), nullable=False, default="completed")

    # External integration linkage (e.g. Monobank statement item id). Nullable for manual entries.
    external_source = Column(String(32), nullable=True)
    external_id = Column(String(128), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index(
            "ix_account_transactions_external",
            "user_id", "external_source", "external_id",
            unique=True,
            postgresql_where=Column("external_id").isnot(None),
        ),
    )

    # Relationships
    account = relationship("SavingsAccount", back_populates="transactions")
    user = relationship("User")

    def __repr__(self):
        return f"<AccountTransaction(id={self.id}, type={self.transaction_type}, amount={self.amount})>"


class AccountTransfer(Base):
    """Account transfer model for tracking transfers between accounts"""
    __tablename__ = "account_transfers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Accounts involved
    from_account_id = Column(UUID(as_uuid=True), ForeignKey("savings_accounts.id", ondelete="CASCADE"), nullable=False)
    to_account_id = Column(UUID(as_uuid=True), ForeignKey("savings_accounts.id", ondelete="CASCADE"), nullable=False)

    # Amount
    amount = Column(Numeric(12, 2), nullable=False)
    from_currency = Column(String(3), nullable=False)

    # Cross-currency support
    to_currency = Column(String(3), nullable=True)
    exchange_rate = Column(Numeric(12, 6), nullable=True)
    converted_amount = Column(Numeric(12, 2), nullable=True)

    # Transaction references
    from_transaction_id = Column(UUID(as_uuid=True), ForeignKey("account_transactions.id", ondelete="SET NULL"), nullable=True)
    to_transaction_id = Column(UUID(as_uuid=True), ForeignKey("account_transactions.id", ondelete="SET NULL"), nullable=True)

    # Metadata
    description = Column(String(500), nullable=True)
    transfer_date = Column(DateTime(timezone=True), nullable=False)

    # Status
    status = Column(String(20), nullable=False, default="completed")

    # Timestamps
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User")
    from_account = relationship("SavingsAccount", foreign_keys=[from_account_id], back_populates="transfers_from")
    to_account = relationship("SavingsAccount", foreign_keys=[to_account_id], back_populates="transfers_to")
    from_transaction = relationship("AccountTransaction", foreign_keys=[from_transaction_id])
    to_transaction = relationship("AccountTransaction", foreign_keys=[to_transaction_id])

    def __repr__(self):
        return f"<AccountTransfer(id={self.id}, amount={self.amount}, from={self.from_account_id}, to={self.to_account_id})>"
