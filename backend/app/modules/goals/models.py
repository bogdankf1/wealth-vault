"""
Goals module database models.
"""
import enum
from sqlalchemy import Column, String, Numeric, DateTime, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime

from app.models.base import Base


class AllocationType(str, enum.Enum):
    """Allocation type for linking accounts to goals"""
    FULL = "full"  # 100% of account balance counts toward goal
    PERCENTAGE = "percentage"  # A percentage of account balance
    FIXED = "fixed"  # A fixed amount from the account


class ProgressTriggerType(str, enum.Enum):
    """What triggered a progress history snapshot"""
    MANUAL = "manual"  # User manually recorded progress
    SCHEDULED = "scheduled"  # Daily/scheduled task
    TRANSACTION = "transaction"  # Account transaction triggered update
    MILESTONE = "milestone"  # Milestone reached (25%, 50%, 75%, 100%)


class Goal(Base):
    """
    Goal model for tracking financial goals and savings targets.

    Examples: vacation fund, emergency fund, down payment, retirement savings
    """
    __tablename__ = "goals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Basic information
    name = Column(String(100), nullable=False)  # e.g., "Hawaii Vacation 2026"
    description = Column(String(500), nullable=True)
    category = Column(String(50), nullable=True, index=True)  # Home, Vehicle, Education, Travel, etc.

    # Goal amounts
    target_amount = Column(Numeric(12, 2), nullable=False)  # Target amount to save
    current_amount = Column(Numeric(12, 2), nullable=False, default=0)  # Amount saved so far
    currency = Column(String(3), nullable=False, default="USD")

    # Optional contribution tracking
    monthly_contribution = Column(Numeric(12, 2), nullable=True)  # Planned monthly contribution

    # Dates
    start_date = Column(DateTime, nullable=False)  # When goal was created/started
    target_date = Column(DateTime, nullable=True)  # Target completion date (optional)

    # Status
    is_active = Column(Boolean, nullable=False, default=True)
    is_completed = Column(Boolean, nullable=False, default=False)
    completed_at = Column(DateTime, nullable=True)  # When goal was achieved

    # Auto-tracking from linked accounts
    auto_track_progress = Column(Boolean, nullable=False, default=False)

    # Calculated field
    progress_percentage = Column(Numeric(5, 2), nullable=True)  # % of goal achieved

    # Timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="goals")
    account_links = relationship("GoalAccountLink", back_populates="goal", cascade="all, delete-orphan")
    progress_history = relationship("GoalProgressHistory", back_populates="goal", cascade="all, delete-orphan", order_by="desc(GoalProgressHistory.recorded_date)")

    def __repr__(self) -> str:
        return f"<Goal(id={self.id}, name={self.name}, user_id={self.user_id})>"


class GoalAccountLink(Base):
    """
    Link between a goal and a savings account.
    Allows tracking goal progress from account balances.
    """
    __tablename__ = "goal_account_links"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    goal_id = Column(UUID(as_uuid=True), ForeignKey("goals.id", ondelete="CASCADE"), nullable=False, index=True)
    account_id = Column(UUID(as_uuid=True), ForeignKey("savings_accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Allocation settings - how much of the account counts toward this goal
    allocation_type = Column(String(20), nullable=False, default="full")  # full, percentage, fixed
    allocation_percentage = Column(Numeric(5, 2), nullable=True)  # For percentage type (0-100)
    allocation_amount = Column(Numeric(12, 2), nullable=True)  # For fixed type

    # Timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    goal = relationship("Goal", back_populates="account_links")
    account = relationship("SavingsAccount")
    user = relationship("User")

    def __repr__(self) -> str:
        return f"<GoalAccountLink(goal_id={self.goal_id}, account_id={self.account_id}, type={self.allocation_type})>"

    def calculate_allocated_amount(self, account_balance: float) -> float:
        """Calculate how much of the account balance counts toward this goal"""
        if self.allocation_type == AllocationType.FULL.value:
            return account_balance
        elif self.allocation_type == AllocationType.PERCENTAGE.value:
            if self.allocation_percentage:
                return account_balance * (float(self.allocation_percentage) / 100)
            return 0
        elif self.allocation_type == AllocationType.FIXED.value:
            if self.allocation_amount:
                # Return the lesser of fixed amount or actual balance
                return min(float(self.allocation_amount), account_balance)
            return 0
        return 0


class GoalProgressHistory(Base):
    """
    Historical progress tracking for goals.
    Stores snapshots of goal progress over time.
    """
    __tablename__ = "goal_progress_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    goal_id = Column(UUID(as_uuid=True), ForeignKey("goals.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Progress snapshot
    recorded_date = Column(DateTime, nullable=False, index=True)
    current_amount = Column(Numeric(12, 2), nullable=False)
    target_amount = Column(Numeric(12, 2), nullable=False)
    progress_percentage = Column(Numeric(5, 2), nullable=False)

    # Snapshot of linked account balances at this point
    linked_accounts_snapshot = Column(JSONB, nullable=True)

    # What triggered this snapshot
    trigger_type = Column(String(30), nullable=False, default="manual")  # manual, scheduled, transaction, milestone
    notes = Column(String(500), nullable=True)

    # Timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Relationships
    goal = relationship("Goal", back_populates="progress_history")
    user = relationship("User")

    def __repr__(self) -> str:
        return f"<GoalProgressHistory(goal_id={self.goal_id}, date={self.recorded_date}, progress={self.progress_percentage}%)>"
