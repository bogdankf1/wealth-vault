"""
Pydantic schemas for user preferences.
"""
from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime
from typing import Optional


class EmailNotifications(BaseModel):
    """Email notification preferences."""
    marketing: bool = True
    product_updates: bool = True
    security_alerts: bool = True
    billing: bool = True
    weekly_summary: bool = True


class PushNotifications(BaseModel):
    """Push notification preferences."""
    budget_alerts: bool = True
    goal_milestones: bool = True
    subscription_reminders: bool = True
    income_notifications: bool = True


class AnalyticsOptOut(BaseModel):
    """Analytics opt-out preferences."""
    usage_analytics: bool = False
    error_reporting: bool = False
    performance_monitoring: bool = False


class DashboardLayout(BaseModel):
    """Dashboard layout preferences."""
    widgets: list[str] = Field(default=[
        "net_worth",
        "monthly_summary",
        "income_sources",
        "expenses",
        "goals",
        "investments"
    ])
    widget_order: Optional[list[str]] = None


class UserPreferencesBase(BaseModel):
    """Base schema for user preferences."""
    theme: str = Field(default="system", pattern="^(light|dark|system)$")
    accent_color: str = Field(default="blue", pattern="^(blue|purple|green|orange|red|pink|indigo|teal)$")
    font_size: str = Field(default="medium", pattern="^(small|medium|large)$")
    language: str = Field(default="en", max_length=10)
    timezone: str = Field(default="UTC", max_length=50)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    date_format: str = Field(default="MM/DD/YYYY", max_length=20)
    email_notifications: EmailNotifications = Field(default_factory=EmailNotifications)
    push_notifications: PushNotifications = Field(default_factory=PushNotifications)
    analytics_opt_out: AnalyticsOptOut = Field(default_factory=AnalyticsOptOut)
    data_visibility: str = Field(default="private", pattern="^(private|anonymous)$")
    dashboard_layout: DashboardLayout = Field(default_factory=DashboardLayout)


class UserPreferencesCreate(UserPreferencesBase):
    """Schema for creating user preferences."""
    pass


class UserPreferencesUpdate(BaseModel):
    """Schema for updating user preferences (all fields optional)."""
    theme: Optional[str] = Field(None, pattern="^(light|dark|system)$")
    accent_color: Optional[str] = Field(None, pattern="^(blue|purple|green|orange|red|pink|indigo|teal)$")
    font_size: Optional[str] = Field(None, pattern="^(small|medium|large)$")
    language: Optional[str] = Field(None, max_length=10)
    timezone: Optional[str] = Field(None, max_length=50)
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    date_format: Optional[str] = Field(None, max_length=20)
    email_notifications: Optional[EmailNotifications] = None
    push_notifications: Optional[PushNotifications] = None
    analytics_opt_out: Optional[AnalyticsOptOut] = None
    data_visibility: Optional[str] = Field(None, pattern="^(private|anonymous)$")
    dashboard_layout: Optional[DashboardLayout] = None


class UserPreferencesResponse(UserPreferencesBase):
    """Schema for user preferences response."""
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
