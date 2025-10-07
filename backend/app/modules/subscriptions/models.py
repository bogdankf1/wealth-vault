"""
Subscriptions module database models
"""
import enum
import uuid
from sqlalchemy import Column, String, Numeric, DateTime, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base


class SubscriptionFrequency(str, enum.Enum):
    """Subscription billing frequencies"""
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    ANNUALLY = "annually"
    BIANNUALLY = "biannually"


class Subscription(Base):
    """Subscription model"""
    __tablename__ = "subscriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Subscription details
    name = Column(String(100), nullable=False)
    description = Column(String(500), nullable=True)
    category = Column(String(50), nullable=True)  # e.g., Streaming, Software, Gym, etc.

    # Pricing
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="USD")
    frequency = Column(String(20), nullable=False, default="monthly")

    # Dates (store as date-only strings to avoid timezone issues)
    start_date = Column(DateTime, nullable=False)  # When subscription started
    end_date = Column(DateTime, nullable=True)  # Optional cancellation/end date

    # Status
    is_active = Column(Boolean, nullable=False, default=True)

    # Metadata
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="subscriptions")
