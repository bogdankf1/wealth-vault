"""
Notification module API endpoints.
"""
from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import get_current_user
from app.models.user import User
from app.modules.notifications.models import NotificationType, NotificationCategory
from app.modules.notifications.schemas import (
    NotificationResponse,
    NotificationListResponse,
    NotificationMarkRead,
    NotificationMarkAllRead,
    NotificationBatchDelete,
    NotificationBatchResponse,
    NotificationStatsResponse,
    UnreadCountResponse,
)
from app.modules.notifications.service import NotificationService

router = APIRouter(prefix="/notifications", tags=["Notifications"])


# ============================================================================
# List and Get Endpoints
# ============================================================================

@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
    notification_type: Optional[NotificationType] = Query(None, description="Filter by type"),
    category: Optional[NotificationCategory] = Query(None, description="Filter by category"),
    is_read: Optional[bool] = Query(None, description="Filter by read status"),
    priority: Optional[int] = Query(None, ge=1, le=5, description="Filter by priority"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List user's notifications with pagination and filtering.

    Returns notifications ordered by: unread first, then priority (1 first), then most recent.
    """
    service = NotificationService(db)

    notifications, total, unread_count = await service.list_notifications(
        user_id=current_user.id,
        page=page,
        page_size=page_size,
        notification_type=notification_type,
        category=category,
        is_read=is_read,
        priority=priority
    )

    return NotificationListResponse(
        items=[NotificationResponse.model_validate(n) for n in notifications],
        total=total,
        unread_count=unread_count,
        page=page,
        page_size=page_size
    )


@router.get("/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get unread notification count for badge display.

    Returns the count and whether there are any urgent (priority 1) notifications.
    """
    service = NotificationService(db)
    unread_count, has_urgent = await service.get_unread_count(current_user.id)

    return UnreadCountResponse(
        unread_count=unread_count,
        has_urgent=has_urgent
    )


@router.get("/stats", response_model=NotificationStatsResponse)
async def get_notification_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get notification statistics.

    Returns counts by type, category, and priority.
    """
    service = NotificationService(db)
    return await service.get_stats(current_user.id)


@router.get("/{notification_id}", response_model=NotificationResponse)
async def get_notification(
    notification_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific notification by ID."""
    service = NotificationService(db)
    notification = await service.get_notification(notification_id, current_user.id)

    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )

    return NotificationResponse.model_validate(notification)


# ============================================================================
# Action Endpoints
# ============================================================================

@router.post("/mark-read", response_model=NotificationBatchResponse)
async def mark_notifications_as_read(
    data: NotificationMarkRead,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark specific notifications as read."""
    service = NotificationService(db)
    success_count = await service.mark_as_read(data.notification_ids, current_user.id)

    return NotificationBatchResponse(
        success_count=success_count,
        failed_count=len(data.notification_ids) - success_count,
        failed_ids=[]  # We don't track individual failures here
    )


@router.post("/mark-all-read", response_model=NotificationBatchResponse)
async def mark_all_notifications_as_read(
    data: Optional[NotificationMarkAllRead] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Mark all notifications as read.

    Optionally filter by category to only mark specific category as read.
    """
    service = NotificationService(db)
    category = data.category if data else None
    success_count = await service.mark_all_as_read(current_user.id, category)

    return NotificationBatchResponse(
        success_count=success_count,
        failed_count=0,
        failed_ids=[]
    )


@router.post("/delete", response_model=NotificationBatchResponse)
async def delete_notifications(
    data: NotificationBatchDelete,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete specific notifications."""
    service = NotificationService(db)
    success_count = await service.delete_notifications(data.notification_ids, current_user.id)

    return NotificationBatchResponse(
        success_count=success_count,
        failed_count=len(data.notification_ids) - success_count,
        failed_ids=[]
    )


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(
    notification_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a specific notification."""
    service = NotificationService(db)
    deleted_count = await service.delete_notifications([notification_id], current_user.id)

    if deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )
