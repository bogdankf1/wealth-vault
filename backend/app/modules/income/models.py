"""
Income module models.
"""
from sqlalchemy import Column, String, Numeric, Boolean, ForeignKey, Enum, DateTime, Integer, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import enum
from decimal import Decimal
from datetime import datetime

from app.models.base import BaseModel


class IncomeFrequency(str, enum.Enum):
    """Income frequency enumeration."""
    ONE_TIME = "one_time"
    WEEKLY = "weekly"
    BIWEEKLY = "biweekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    ANNUALLY = "annually"


class IncomeTransactionStatus(str, enum.Enum):
    """Income transaction status enumeration."""
    EXPECTED = "expected"      # Future/scheduled income
    RECEIVED = "received"      # Income received but not deposited to account
    DEPOSITED = "deposited"    # Income deposited to savings account


class DistributionType(str, enum.Enum):
    """Distribution rule type enumeration."""
    PERCENTAGE = "percentage"      # Distribute a percentage of income
    FIXED_AMOUNT = "fixed_amount"  # Distribute a fixed amount
    REMAINDER = "remainder"        # Distribute whatever is left after other rules


class IncomeSource(BaseModel):
    """Income source model."""

    __tablename__ = "income_sources"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)  # e.g., "Full-time Salary", "Freelance Work"
    description = Column(String(500), nullable=True)
    category = Column(String(50), nullable=True)  # e.g., "Salary", "Freelance", "Investment", "Other"

    # Financial details
    amount = Column(Numeric(15, 2), nullable=False, default=Decimal("0.00"))
    currency = Column(String(3), nullable=False, default="USD")
    frequency = Column(
        Enum(IncomeFrequency, native_enum=False, length=20),
        nullable=False,
        default=IncomeFrequency.MONTHLY
    )

    # Status
    is_active = Column(Boolean, default=True, nullable=False)

    # Date fields - use date for one-time, start_date/end_date for recurring
    date = Column(DateTime, nullable=True)  # For one-time payments
    start_date = Column(DateTime, nullable=True)  # For recurring income
    end_date = Column(DateTime, nullable=True)  # For recurring income (optional)

    # Account integration (Phase 2)
    target_account_id = Column(UUID(as_uuid=True), ForeignKey("savings_accounts.id", ondelete="SET NULL"), nullable=True, index=True)
    auto_deposit = Column(Boolean, default=False, nullable=False)

    # Relationships
    user = relationship("User")
    transactions = relationship("IncomeTransaction", back_populates="source", cascade="all, delete-orphan")
    target_account = relationship("SavingsAccount", foreign_keys=[target_account_id])
    distribution_rules = relationship("IncomeDistributionRule", back_populates="income_source", cascade="all, delete-orphan")
    taxes = relationship("Tax", back_populates="income_source")

    def __repr__(self) -> str:
        return f"<IncomeSource(id={self.id}, name={self.name}, amount={self.amount})>"

    def calculate_monthly_amount(self) -> Decimal:
        """Calculate monthly equivalent amount based on frequency."""
        frequency_multipliers = {
            IncomeFrequency.ONE_TIME: Decimal("0"),
            IncomeFrequency.WEEKLY: Decimal("4.33"),  # ~52 weeks / 12 months
            IncomeFrequency.BIWEEKLY: Decimal("2.17"),  # ~26 weeks / 12 months
            IncomeFrequency.MONTHLY: Decimal("1"),
            IncomeFrequency.QUARTERLY: Decimal("0.33"),  # 4 quarters / 12 months
            IncomeFrequency.ANNUALLY: Decimal("0.083"),  # 1 year / 12 months
        }

        multiplier = frequency_multipliers.get(self.frequency, Decimal("1"))
        return self.amount * multiplier


class IncomeTransaction(BaseModel):
    """Income transaction model for tracking actual income received."""

    __tablename__ = "income_transactions"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    source_id = Column(UUID(as_uuid=True), ForeignKey("income_sources.id"), nullable=True, index=True)

    # Transaction details
    description = Column(String(500), nullable=True)
    amount = Column(Numeric(15, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="USD")
    date = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)

    # Optional categorization
    category = Column(String(50), nullable=True)
    notes = Column(String(1000), nullable=True)

    # Account integration (Phase 2)
    deposited_to_account_id = Column(UUID(as_uuid=True), ForeignKey("savings_accounts.id", ondelete="SET NULL"), nullable=True, index=True)
    account_transaction_id = Column(UUID(as_uuid=True), ForeignKey("account_transactions.id", ondelete="SET NULL"), nullable=True)
    status = Column(
        Enum(IncomeTransactionStatus, native_enum=False, length=20),
        nullable=False,
        default=IncomeTransactionStatus.RECEIVED
    )

    # Relationships
    user = relationship("User")
    source = relationship("IncomeSource", back_populates="transactions")
    deposited_to_account = relationship("SavingsAccount", foreign_keys=[deposited_to_account_id])
    account_transaction = relationship("AccountTransaction", foreign_keys=[account_transaction_id])

    def __repr__(self) -> str:
        return f"<IncomeTransaction(id={self.id}, amount={self.amount}, date={self.date}, status={self.status})>"


class IncomeDistributionRule(BaseModel):
    """
    Income distribution rule model.
    Defines how income should be distributed to accounts and goals.
    """

    __tablename__ = "income_distribution_rules"
    __table_args__ = (
        CheckConstraint(
            'target_account_id IS NOT NULL OR target_goal_id IS NOT NULL',
            name='ck_distribution_rule_has_target'
        ),
    )

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Optional link to specific income source (null = applies to all income)
    income_source_id = Column(UUID(as_uuid=True), ForeignKey("income_sources.id", ondelete="CASCADE"), nullable=True, index=True)

    # Distribution target - either account or goal (at least one required)
    target_account_id = Column(UUID(as_uuid=True), ForeignKey("savings_accounts.id", ondelete="CASCADE"), nullable=True, index=True)
    target_goal_id = Column(UUID(as_uuid=True), ForeignKey("goals.id", ondelete="CASCADE"), nullable=True, index=True)

    # Distribution configuration
    distribution_type = Column(
        Enum(DistributionType, native_enum=False, length=20),
        nullable=False,
        default=DistributionType.PERCENTAGE
    )
    amount = Column(Numeric(12, 2), nullable=True)  # For fixed_amount type
    percentage = Column(Numeric(5, 2), nullable=True)  # For percentage type (0-100)

    # Priority for ordering (lower = higher priority)
    priority = Column(Integer, nullable=False, default=0)

    # Rule metadata
    name = Column(String(100), nullable=True)

    # Status
    is_active = Column(Boolean, default=True, nullable=False)

    # Relationships
    user = relationship("User")
    income_source = relationship("IncomeSource", back_populates="distribution_rules")
    target_account = relationship("SavingsAccount", foreign_keys=[target_account_id])
    target_goal = relationship("Goal", foreign_keys=[target_goal_id])

    def __repr__(self) -> str:
        target = f"account={self.target_account_id}" if self.target_account_id else f"goal={self.target_goal_id}"
        return f"<IncomeDistributionRule(id={self.id}, type={self.distribution_type}, {target})>"
