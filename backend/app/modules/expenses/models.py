"""
Expenses database models
"""
from datetime import datetime
from sqlalchemy import Column, String, Numeric, Boolean, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
import uuid
import enum

from app.core.database import Base


class ExpenseFrequency(str, enum.Enum):
    """Expense frequency types"""
    ONE_TIME = "one_time"
    DAILY = "daily"
    WEEKLY = "weekly"
    BIWEEKLY = "biweekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    ANNUALLY = "annually"


class Expense(Base):
    """Expense model"""
    __tablename__ = "expenses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Basic info
    name = Column(String(100), nullable=False)
    description = Column(String(500), nullable=True)
    category = Column(String(50), nullable=True, index=True)

    # Amount
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="USD")

    # Frequency and dates
    frequency = Column(SQLEnum(ExpenseFrequency), nullable=False, default=ExpenseFrequency.ONE_TIME)

    # Date fields - use date for one-time, start_date/end_date for recurring
    date = Column(DateTime, nullable=True)  # For one-time expenses
    start_date = Column(DateTime, nullable=True)  # For recurring expenses
    end_date = Column(DateTime, nullable=True)  # For recurring expenses (optional)

    # Status
    is_active = Column(Boolean, default=True, nullable=False)

    # Tags (optional array of strings)
    tags = Column(JSONB, nullable=True)

    # Calculated field (stored for performance)
    monthly_equivalent = Column(Numeric(12, 2), nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="expenses")

    def __repr__(self):
        return f"<Expense {self.name} (${self.amount} {self.frequency.value})>"
