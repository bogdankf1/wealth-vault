"""
Notification module models.
"""
from sqlalchemy import Column, String, Boolean, ForeignKey, Enum, DateTime, Integer, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
import enum
from datetime import datetime

from app.models.base import BaseModel


class NotificationType(str, enum.Enum):
    """Notification type enumeration."""
    ALERT = "alert"          # Urgent notification requiring attention
    REMINDER = "reminder"    # Scheduled reminder
    ACHIEVEMENT = "achievement"  # Goal/milestone achievement
    WARNING = "warning"      # Warning about budget/debt/etc.
    INFO = "info"           # General information


class NotificationCategory(str, enum.Enum):
    """Notification category enumeration."""
    BUDGET = "budget"
    GOAL = "goal"
    SUBSCRIPTION = "subscription"
    INSTALLMENT = "installment"
    DEBT = "debt"
    SAVINGS = "savings"
    PORTFOLIO = "portfolio"
    INCOME = "income"
    EXPENSE = "expense"
    BILLING = "billing"
    SYSTEM = "system"


class Notification(BaseModel):
    """User notification model."""

    __tablename__ = "notifications"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)

    # Notification content
    notification_type = Column(
        Enum(NotificationType, native_enum=False, length=20),
        nullable=False,
        default=NotificationType.INFO,
        index=True
    )
    category = Column(
        Enum(NotificationCategory, native_enum=False, length=20),
        nullable=False,
        default=NotificationCategory.SYSTEM,
        index=True
    )
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)

    # Priority (1 = highest, 5 = lowest)
    priority = Column(Integer, nullable=False, default=3)

    # Status
    is_read = Column(Boolean, default=False, nullable=False, index=True)
    read_at = Column(DateTime(timezone=True), nullable=True)

    # Optional action URL for navigation
    action_url = Column(String(500), nullable=True)

    # Flexible extra data for category-specific information
    extra_data = Column(JSONB, nullable=True)

    # Expiration (optional - for time-sensitive notifications)
    expires_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    user = relationship("User")

    def __repr__(self) -> str:
        return f"<Notification(id={self.id}, type={self.notification_type}, title={self.title[:30]}...)>"

    def mark_as_read(self) -> None:
        """Mark notification as read."""
        from datetime import datetime, timezone
        self.is_read = True
        self.read_at = datetime.now(timezone.utc)

    def is_expired(self) -> bool:
        """Check if notification has expired."""
        if self.expires_at is None:
            return False
        from datetime import datetime, timezone
        return datetime.now(timezone.utc) > self.expires_at
