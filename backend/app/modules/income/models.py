"""
Income module models.
"""
from sqlalchemy import Column, String, Numeric, Boolean, ForeignKey, Enum, DateTime
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

    # Relationships
    user = relationship("User")
    transactions = relationship("IncomeTransaction", back_populates="source", cascade="all, delete-orphan")

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

    # Relationships
    user = relationship("User")
    source = relationship("IncomeSource", back_populates="transactions")

    def __repr__(self) -> str:
        return f"<IncomeTransaction(id={self.id}, amount={self.amount}, date={self.date})>"
