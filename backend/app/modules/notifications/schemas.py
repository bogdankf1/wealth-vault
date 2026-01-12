"""
Notification module Pydantic schemas.
"""
from datetime import datetime
from typing import Optional, Dict, Any, List
from uuid import UUID
from pydantic import BaseModel, Field

from app.modules.notifications.models import NotificationType, NotificationCategory


# ============================================================================
# Notification Schemas
# ============================================================================

class NotificationBase(BaseModel):
    """Base schema for notification."""
    notification_type: NotificationType = Field(
        default=NotificationType.INFO,
        description="Type of notification"
    )
    category: NotificationCategory = Field(
        default=NotificationCategory.SYSTEM,
        description="Category of notification"
    )
    title: str = Field(..., min_length=1, max_length=200, description="Notification title")
    message: str = Field(..., min_length=1, description="Notification message")
    priority: int = Field(default=3, ge=1, le=5, description="Priority (1=highest, 5=lowest)")
    action_url: Optional[str] = Field(None, max_length=500, description="Optional action URL")
    extra_data: Optional[Dict[str, Any]] = Field(None, description="Additional data")
    expires_at: Optional[datetime] = Field(None, description="Optional expiration time")

    model_config = {
        "json_schema_extra": {
            "example": {
                "notification_type": "alert",
                "category": "budget",
                "title": "Budget Exceeded",
                "message": "You have exceeded your monthly entertainment budget by $50",
                "priority": 2,
                "action_url": "/budgets/123",
                "extra_data": {"budget_id": "123", "overspent": 50.00}
            }
        }
    }


class NotificationCreate(NotificationBase):
    """Schema for creating a notification (internal use)."""
    user_id: UUID = Field(..., description="User ID to create notification for")


class NotificationResponse(NotificationBase):
    """Schema for notification response."""
    id: UUID
    user_id: UUID
    is_read: bool = Field(default=False, description="Whether notification has been read")
    read_at: Optional[datetime] = Field(None, description="When notification was read")
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True
    }


class NotificationListResponse(BaseModel):
    """Schema for list of notifications."""
    items: List[NotificationResponse]
    total: int
    unread_count: int
    page: int = 1
    page_size: int = 50


# ============================================================================
# Action Schemas
# ============================================================================

class NotificationMarkRead(BaseModel):
    """Schema for marking notifications as read."""
    notification_ids: List[UUID] = Field(
        ...,
        min_length=1,
        description="List of notification IDs to mark as read"
    )


class NotificationMarkAllRead(BaseModel):
    """Schema for marking all notifications as read."""
    category: Optional[NotificationCategory] = Field(
        None,
        description="Optional category to filter (mark only this category as read)"
    )


class NotificationBatchDelete(BaseModel):
    """Schema for batch deleting notifications."""
    notification_ids: List[UUID] = Field(
        ...,
        min_length=1,
        description="List of notification IDs to delete"
    )


class NotificationBatchResponse(BaseModel):
    """Schema for batch operation response."""
    success_count: int = Field(..., description="Number of notifications processed")
    failed_count: int = Field(default=0, description="Number of failures")
    failed_ids: List[UUID] = Field(default=[], description="IDs of failed operations")


# ============================================================================
# Statistics Schemas
# ============================================================================

class NotificationStatsResponse(BaseModel):
    """Schema for notification statistics."""
    total: int = Field(..., description="Total notifications")
    unread: int = Field(..., description="Unread notifications")
    by_type: Dict[str, int] = Field(..., description="Count by notification type")
    by_category: Dict[str, int] = Field(..., description="Count by category")
    by_priority: Dict[int, int] = Field(..., description="Count by priority level")

    model_config = {
        "json_schema_extra": {
            "example": {
                "total": 25,
                "unread": 5,
                "by_type": {"alert": 3, "reminder": 10, "achievement": 2, "warning": 5, "info": 5},
                "by_category": {"budget": 8, "goal": 5, "subscription": 7, "billing": 3, "system": 2},
                "by_priority": {1: 2, 2: 5, 3: 15, 4: 2, 5: 1}
            }
        }
    }


# ============================================================================
# Unread Count Response (for badge)
# ============================================================================

class UnreadCountResponse(BaseModel):
    """Schema for unread notification count (used for badge)."""
    unread_count: int = Field(..., description="Number of unread notifications")
    has_urgent: bool = Field(default=False, description="Whether there are urgent (priority 1) unread notifications")
