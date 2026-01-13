"""
Budget module models.
"""
from sqlalchemy import Column, String, Numeric, Boolean, ForeignKey, Enum, DateTime, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import enum
from decimal import Decimal
from datetime import datetime

from app.models.base import BaseModel


class BudgetPeriod(str, enum.Enum):
    """Budget period enumeration."""
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    YEARLY = "yearly"


class Budget(BaseModel):
    """Budget model for tracking spending limits per category."""

    __tablename__ = "budgets"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)

    # Budget details
    name = Column(String(100), nullable=False)  # e.g., "Monthly Food Budget", "Q1 2025 Entertainment"
    category = Column(String(50), nullable=False, index=True)  # Expense category
    description = Column(String(500), nullable=True)

    # Budget amount and currency
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="USD")

    # Budget period
    period = Column(
        Enum(BudgetPeriod, native_enum=False, length=20),
        nullable=False,
        default=BudgetPeriod.MONTHLY
    )

    # Date range
    start_date = Column(DateTime, nullable=False, index=True)
    end_date = Column(DateTime, nullable=True)  # If None, budget is recurring

    # Status and settings
    is_active = Column(Boolean, default=True, nullable=False)
    rollover_unused = Column(Boolean, default=False, nullable=False)  # Rollover unused budget to next period
    rollover_amount = Column(Numeric(12, 2), default=Decimal("0"), nullable=False)  # Accumulated rollover from previous periods
    alert_threshold = Column(Integer, default=80, nullable=False)  # Alert when X% of budget is spent

    # Alert tracking - prevents duplicate notifications
    last_alert_at = Column(DateTime, nullable=True)  # When the last alert was sent
    last_alert_percentage = Column(Integer, nullable=True)  # Percentage when last alert was sent
    current_period_start = Column(DateTime, nullable=True)  # Start of current tracking period (for recurring budgets)

    # Relationships
    user = relationship("User")

    def __repr__(self) -> str:
        return f"<Budget(id={self.id}, name={self.name}, category={self.category}, amount={self.amount})>"

    def calculate_spent_amount(self, expenses: list) -> Decimal:
        """Calculate total amount spent in this budget's category during the period."""
        total = Decimal("0")
        for expense in expenses:
            if expense.category == self.category:
                # Check if expense date falls within budget period
                expense_date = expense.date or expense.start_date
                if expense_date and expense_date >= self.start_date:
                    if self.end_date is None or expense_date <= self.end_date:
                        total += expense.amount
        return total

    @property
    def effective_amount(self) -> Decimal:
        """Get total budget amount including rollover."""
        return self.amount + (self.rollover_amount or Decimal("0"))

    def calculate_remaining(self, spent_amount: Decimal) -> Decimal:
        """Calculate remaining budget amount (includes rollover)."""
        return self.effective_amount - spent_amount

    def calculate_percentage_used(self, spent_amount: Decimal) -> float:
        """Calculate percentage of budget used (based on effective amount with rollover)."""
        if self.effective_amount == 0:
            return 0.0
        return float((spent_amount / self.effective_amount) * 100)

    def is_overspent(self, spent_amount: Decimal) -> bool:
        """Check if budget is overspent (includes rollover)."""
        return spent_amount > self.effective_amount

    def should_alert(self, spent_amount: Decimal) -> bool:
        """Check if alert threshold has been reached."""
        percentage_used = self.calculate_percentage_used(spent_amount)
        return percentage_used >= self.alert_threshold
