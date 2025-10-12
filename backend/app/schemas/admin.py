"""
Pydantic schemas for admin endpoints.
"""
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List
from datetime import datetime
from uuid import UUID


# User Management Schemas
class UserListItem(BaseModel):
    """User list item for admin dashboard."""
    id: UUID
    email: EmailStr
    name: Optional[str] = None
    role: str
    tier_name: Optional[str] = None
    tier_display_name: Optional[str] = None
    created_at: datetime
    is_active: bool = Field(default=True, description="Derived from deleted_at")

    class Config:
        from_attributes = True


class UserDetail(BaseModel):
    """Detailed user information for admin."""
    id: UUID
    email: EmailStr
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    google_id: Optional[str] = None
    apple_id: Optional[str] = None
    role: str
    tier_id: Optional[UUID] = None
    tier_name: Optional[str] = None
    tier_display_name: Optional[str] = None
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    """Admin update user request."""
    tier_id: Optional[UUID] = Field(None, description="Change user tier")
    role: Optional[str] = Field(None, description="Change user role (USER/ADMIN)")


class UserImpersonate(BaseModel):
    """Impersonation response."""
    token: str
    user: UserDetail


class UserSuspend(BaseModel):
    """Suspend/ban user request."""
    reason: Optional[str] = Field(None, description="Reason for suspension")


class UserListResponse(BaseModel):
    """Paginated user list response."""
    users: List[UserListItem]
    total: int
    page: int
    page_size: int


# Tier Management Schemas
class TierDetail(BaseModel):
    """Tier detail with feature assignments."""
    id: UUID
    name: str
    display_name: str
    description: Optional[str] = None
    price_monthly: int
    price_annual: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TierUpdate(BaseModel):
    """Update tier request."""
    display_name: Optional[str] = None
    description: Optional[str] = None
    price_monthly: Optional[int] = None
    price_annual: Optional[int] = None
    is_active: Optional[bool] = None


class FeatureDetail(BaseModel):
    """Feature detail."""
    id: UUID
    key: str
    name: str
    description: Optional[str] = None
    module: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class TierFeatureAssignment(BaseModel):
    """Assign/update feature for tier."""
    feature_id: UUID
    enabled: bool
    limit_value: Optional[int] = None


class TierFeatureResponse(BaseModel):
    """Tier feature with details."""
    tier_id: UUID
    feature_id: UUID
    feature_key: str
    feature_name: str
    enabled: bool
    limit_value: Optional[int] = None

    class Config:
        from_attributes = True


# Configuration Schemas
class ConfigurationItem(BaseModel):
    """Configuration item."""
    id: UUID
    key: str
    value: dict
    description: Optional[str] = None
    is_system: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ConfigurationCreate(BaseModel):
    """Create configuration request."""
    key: str = Field(..., max_length=100)
    value: dict
    description: Optional[str] = None
    is_system: bool = False


class ConfigurationUpdate(BaseModel):
    """Update configuration request."""
    value: Optional[dict] = None
    description: Optional[str] = None


class EmailTemplateDetail(BaseModel):
    """Email template detail."""
    id: UUID
    name: str
    subject: str
    html_content: str
    text_content: Optional[str] = None
    variables: Optional[dict] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class EmailTemplateCreate(BaseModel):
    """Create email template request."""
    name: str = Field(..., max_length=100)
    subject: str = Field(..., max_length=255)
    html_content: str
    text_content: Optional[str] = None
    variables: Optional[dict] = None
    is_active: bool = True


class EmailTemplateUpdate(BaseModel):
    """Update email template request."""
    subject: Optional[str] = None
    html_content: Optional[str] = None
    text_content: Optional[str] = None
    variables: Optional[dict] = None
    is_active: Optional[bool] = None


# Analytics Schemas
class PlatformStats(BaseModel):
    """Overall platform statistics."""
    total_users: int
    active_users: int  # Users who logged in last 30 days
    new_users_today: int
    new_users_this_week: int
    new_users_this_month: int
    total_subscriptions: int
    active_subscriptions: int
    mrr: int  # Monthly Recurring Revenue in cents
    arr: int  # Annual Recurring Revenue in cents
    churn_rate: float  # Percentage


class UserAcquisition(BaseModel):
    """User acquisition data point."""
    date: datetime
    count: int


class RevenueData(BaseModel):
    """Revenue data point."""
    date: datetime
    amount: int  # In cents
    tier: Optional[str] = None


class EngagementMetrics(BaseModel):
    """User engagement metrics."""
    dau: int  # Daily Active Users
    wau: int  # Weekly Active Users
    mau: int  # Monthly Active Users
    avg_session_duration: Optional[float] = None  # In minutes
    retention_rate_30d: float  # 30-day retention percentage


class FeatureUsage(BaseModel):
    """Feature usage statistics."""
    module: str
    total_users: int
    active_users_30d: int
    total_records: int


class ChurnAnalysis(BaseModel):
    """Churn analysis data."""
    period: str  # "last_30_days", "last_90_days"
    churned_users: int
    churn_rate: float
    top_churn_reasons: List[dict]  # [{"reason": "too_expensive", "count": 10}]
