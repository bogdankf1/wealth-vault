"""
Subscriptions module API routes
"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from uuid import UUID

from app.core.database import get_db
from app.core.permissions import get_current_user, require_feature, check_usage_limit
from app.models.user import User
from app.modules.subscriptions import service
from app.modules.subscriptions.schemas import (
    SubscriptionCreate,
    SubscriptionUpdate,
    SubscriptionResponse,
    SubscriptionListResponse,
    SubscriptionStats,
    SubscriptionHistoryResponse,
    SubscriptionBatchDelete,
    SubscriptionBatchDeleteResponse)
from app.modules.subscriptions.service import (
    convert_subscription_to_display_currency,
    get_user_display_currency,
    get_subscription_history
)

router = APIRouter(prefix="/api/v1/subscriptions", tags=["subscriptions"])


@router.post("", response_model=SubscriptionResponse, status_code=status.HTTP_201_CREATED)
@require_feature("subscription_tracking")
async def create_subscription(
    subscription_data: SubscriptionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new subscription"""
    # Check tier limits
    tier_limits = {
        "starter": 10,
        "growth": 50,
        "wealth": None  # Unlimited
    }

    # Get current count
    subscriptions, total = await service.list_subscriptions(
        db,
        current_user.id,
        skip=0,
        limit=1
    )

    # Check if limit exceeded
    limit = tier_limits.get(current_user.tier)
    if limit is not None and total >= limit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Subscription limit reached for {current_user.tier} tier ({limit} subscriptions)"
        )

    subscription = await service.create_subscription(db, current_user.id, subscription_data)
    return subscription


@router.get("", response_model=SubscriptionListResponse)
@require_feature("subscription_tracking")
async def list_subscriptions(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    category: Optional[str] = None,
    frequency: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all subscriptions with pagination and filters"""
    skip = (page - 1) * page_size
    subscriptions, total = await service.list_subscriptions(
        db,
        current_user.id,
        skip=skip,
        limit=page_size,
        category=category,
        frequency=frequency,
        is_active=is_active
    )

    # Convert each subscription to display currency
    subscription_dicts = []
    for subscription in subscriptions:
        await convert_subscription_to_display_currency(db, current_user.id, subscription)

        subscription_dict = {
            "id": str(subscription.id),
            "user_id": str(subscription.user_id),
            "name": subscription.name,
            "description": subscription.description,
            "category": subscription.category,
            "amount": float(subscription.amount) if subscription.amount else 0,
            "currency": subscription.currency,
            "frequency": subscription.frequency,
            "start_date": subscription.start_date.isoformat() if subscription.start_date else None,
            "end_date": subscription.end_date.isoformat() if subscription.end_date else None,
            "is_active": subscription.is_active,
            "created_at": subscription.created_at,
            "updated_at": subscription.updated_at,
            "display_amount": float(subscription.display_amount) if hasattr(subscription, 'display_amount') and subscription.display_amount is not None else None,
            "display_currency": subscription.display_currency if hasattr(subscription, 'display_currency') and subscription.display_currency is not None else None,
            "display_monthly_equivalent": float(subscription.display_monthly_equivalent) if hasattr(subscription, 'display_monthly_equivalent') and subscription.display_monthly_equivalent is not None else None,
        }
        subscription_dicts.append(subscription_dict)

    return SubscriptionListResponse(
        items=subscription_dicts,
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/stats", response_model=SubscriptionStats)
@require_feature("subscription_tracking")
async def get_subscription_stats(
    start_date: Optional[datetime] = Query(None, description="Start date for filtering (ISO format)"),
    end_date: Optional[datetime] = Query(None, description="End date for filtering (ISO format)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get subscription statistics, optionally filtered by date range."""
    stats = await service.get_subscription_stats(db, current_user.id, start_date, end_date)
    # Update currency to user's display currency
    display_currency = await get_user_display_currency(db, current_user.id)
    stats.currency = display_currency
    return stats


@router.get("/history", response_model=SubscriptionHistoryResponse)
@require_feature("subscription_tracking")
async def get_subscription_history_endpoint(
    start_date: Optional[datetime] = Query(None, description="Start date for filtering (ISO format)"),
    end_date: Optional[datetime] = Query(None, description="End date for filtering (ISO format)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get subscription cost history grouped by month.

    Returns monthly totals and counts of subscriptions, along with overall average.
    If start_date and end_date are provided, filters history to that range.

    Requires: subscription_tracking feature
    """
    history = await get_subscription_history(db, current_user.id, start_date, end_date)
    return history


@router.get("/{subscription_id}", response_model=SubscriptionResponse)
@require_feature("subscription_tracking")
async def get_subscription(
    subscription_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific subscription"""
    subscription = await service.get_subscription(db, current_user.id, subscription_id)
    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subscription not found"
        )

    # Convert to display currency
    await convert_subscription_to_display_currency(db, current_user.id, subscription)

    subscription_dict = {
        "id": str(subscription.id),
        "user_id": str(subscription.user_id),
        "name": subscription.name,
        "description": subscription.description,
        "category": subscription.category,
        "amount": float(subscription.amount) if subscription.amount else 0,
        "currency": subscription.currency,
        "frequency": subscription.frequency,
        "start_date": subscription.start_date.isoformat() if subscription.start_date else None,
        "end_date": subscription.end_date.isoformat() if subscription.end_date else None,
        "is_active": subscription.is_active,
        "created_at": subscription.created_at,
        "updated_at": subscription.updated_at,
        "display_amount": float(subscription.display_amount) if hasattr(subscription, 'display_amount') and subscription.display_amount is not None else None,
        "display_currency": subscription.display_currency if hasattr(subscription, 'display_currency') and subscription.display_currency is not None else None,
        "display_monthly_equivalent": float(subscription.display_monthly_equivalent) if hasattr(subscription, 'display_monthly_equivalent') and subscription.display_monthly_equivalent is not None else None,
    }

    return subscription_dict


@router.put("/{subscription_id}", response_model=SubscriptionResponse)
@require_feature("subscription_tracking")
async def update_subscription(
    subscription_id: UUID,
    subscription_data: SubscriptionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a subscription"""
    subscription = await service.update_subscription(
        db,
        current_user.id,
        subscription_id,
        subscription_data
    )
    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subscription not found"
        )
    return subscription


@router.delete("/{subscription_id}", status_code=status.HTTP_204_NO_CONTENT)
@require_feature("subscription_tracking")
async def delete_subscription(
    subscription_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a subscription"""
    deleted = await service.delete_subscription(db, current_user.id, subscription_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subscription not found"
        )


@router.post("/batch-delete", response_model=SubscriptionBatchDeleteResponse)
async def batch_delete_subscriptions(
    batch_data: SubscriptionBatchDelete,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete multiple subscriptions in a single request.

    Returns the count of successfully deleted items and any IDs that failed to delete.
    """
    deleted_count = 0
    failed_ids = []

    for item_id in batch_data.ids:
        try:
            success = await service.delete_subscription(db, current_user.id, item_id)
            if success:
                deleted_count += 1
            else:
                failed_ids.append(item_id)
        except Exception:
            failed_ids.append(item_id)

    return SubscriptionBatchDeleteResponse(
        deleted_count=deleted_count,
        failed_ids=failed_ids
    )
