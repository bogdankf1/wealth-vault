"""
Goals module database models.
"""
from sqlalchemy import Column, String, Numeric, DateTime, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime

from app.models.base import Base


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

    # Calculated field
    progress_percentage = Column(Numeric(5, 2), nullable=True)  # % of goal achieved

    # Timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="goals")

    def __repr__(self) -> str:
        return f"<Goal(id={self.id}, name={self.name}, user_id={self.user_id})>"
