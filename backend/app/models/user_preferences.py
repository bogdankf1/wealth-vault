"""
User preferences model for storing UI and application settings.
"""
from sqlalchemy import Column, String, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.models.base import BaseModel


class UserPreferences(BaseModel):
    """User preferences for appearance, notifications, and privacy settings."""

    __tablename__ = "user_preferences"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)

    # Appearance preferences
    theme = Column(String(20), default="system", nullable=False)  # "light", "dark", "system"
    accent_color = Column(String(20), default="blue", nullable=False)
    font_size = Column(String(20), default="medium", nullable=False)  # "small", "medium", "large"
    default_content_view = Column(String(20), default="card", nullable=False)  # "card", "list"
    default_stats_view = Column(String(20), default="cards", nullable=False)  # "cards", "compact"

    # Locale preferences
    language = Column(String(10), default="en", nullable=False)
    timezone = Column(String(50), default="UTC", nullable=False)
    currency = Column(String(3), default="USD", nullable=False)  # Preferred currency for data entry
    display_currency = Column(String(3), nullable=True)  # Currency to display amounts in (defaults to currency)
    date_format = Column(String(20), default="MM/DD/YYYY", nullable=False)

    # Notification preferences
    email_notifications = Column(JSON, default=lambda: {
        "marketing": True,
        "product_updates": True,
        "security_alerts": True,
        "billing": True,
        "weekly_summary": True
    })
    push_notifications = Column(JSON, default=lambda: {
        "budget_alerts": True,
        "goal_milestones": True,
        "subscription_reminders": True,
        "income_notifications": True
    })

    # Privacy preferences
    analytics_opt_out = Column(JSON, default=lambda: {
        "usage_analytics": False,
        "error_reporting": False,
        "performance_monitoring": False
    })
    data_visibility = Column(String(20), default="private", nullable=False)  # "private", "anonymous"

    # Dashboard preferences
    dashboard_layout = Column(JSON, default=lambda: {
        "widgets": [
            "net_worth",
            "monthly_summary",
            "income_sources",
            "expenses",
            "goals",
            "investments"
        ],
        "widget_order": None  # null means default order
    })

    # Relationships
    user = relationship("User", backref="preferences", uselist=False)

    def __repr__(self) -> str:
        return f"<UserPreferences(user_id={self.user_id}, theme={self.theme})>"
