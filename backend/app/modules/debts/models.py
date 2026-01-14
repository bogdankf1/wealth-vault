"""
Debts module database models
"""
import uuid
from sqlalchemy import Column, String, Numeric, DateTime, Boolean, ForeignKey, Text, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
from decimal import Decimal

from app.core.database import Base


class Debt(Base):
    """Debt model for tracking money owed to the user"""
    __tablename__ = "debts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Debt details
    debtor_name = Column(String(100), nullable=False)  # Person/entity who owes money
    description = Column(Text, nullable=True)
    amount = Column(Numeric(12, 2), nullable=False)  # Total debt amount
    amount_paid = Column(Numeric(12, 2), nullable=False, default=0)  # Amount paid so far
    currency = Column(String(3), nullable=False, default="USD")

    # Status tracking
    is_active = Column(Boolean, nullable=False, default=True)
    is_paid = Column(Boolean, nullable=False, default=False)
    due_date = Column(DateTime, nullable=True)
    paid_date = Column(DateTime, nullable=True)

    # Payment integration fields
    deposit_account_id = Column(UUID(as_uuid=True), ForeignKey("savings_accounts.id", ondelete="SET NULL"), nullable=True)
    auto_deposit = Column(Boolean, nullable=False, default=False)
    interest_rate = Column(Numeric(5, 2), nullable=True)  # Annual interest rate %
    accrued_interest = Column(Numeric(12, 2), nullable=False, default=0)
    reminder_days_before = Column(Integer, nullable=False, default=3)
    last_reminder_at = Column(DateTime, nullable=True)
    next_payment_date = Column(DateTime, nullable=True)
    payment_frequency = Column(String(20), nullable=True)  # weekly, biweekly, monthly
    expected_payment_amount = Column(Numeric(12, 2), nullable=True)

    # Metadata
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)

    # Relationships
    user = relationship("User", back_populates="debts")
    deposit_account = relationship("SavingsAccount", foreign_keys=[deposit_account_id])
    payments = relationship("DebtPayment", back_populates="debt", cascade="all, delete-orphan")

    @property
    def amount_remaining(self) -> Decimal:
        """Calculate remaining amount to be collected"""
        return Decimal(str(self.amount)) - Decimal(str(self.amount_paid))

    @property
    def total_with_interest(self) -> Decimal:
        """Calculate total amount including accrued interest"""
        return Decimal(str(self.amount)) + Decimal(str(self.accrued_interest or 0))

    def __repr__(self):
        return f"<Debt(id={self.id}, debtor={self.debtor_name}, amount={self.amount})>"


class DebtPayment(Base):
    """Payment record for a debt"""
    __tablename__ = "debt_payments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    debt_id = Column(UUID(as_uuid=True), ForeignKey("debts.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Payment details
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), nullable=False)
    payment_date = Column(DateTime, nullable=False)

    # Payment breakdown
    principal_amount = Column(Numeric(12, 2), nullable=True)  # Portion reducing principal
    interest_amount = Column(Numeric(12, 2), nullable=True)   # Interest portion

    # Balance tracking
    balance_before = Column(Numeric(12, 2), nullable=False)
    balance_after = Column(Numeric(12, 2), nullable=False)

    # Link to account transaction (for deposits)
    account_transaction_id = Column(UUID(as_uuid=True), ForeignKey("account_transactions.id", ondelete="SET NULL"), nullable=True)

    # Status
    status = Column(String(20), nullable=False, default="completed")  # pending, completed, failed

    # Metadata
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Relationships
    debt = relationship("Debt", back_populates="payments")
    user = relationship("User")
    account_transaction = relationship("AccountTransaction")

    def __repr__(self):
        return f"<DebtPayment(id={self.id}, debt_id={self.debt_id}, amount={self.amount})>"
