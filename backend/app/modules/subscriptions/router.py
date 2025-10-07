"""
Subscriptions module API routes
"""
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
    SubscriptionStats
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

    return SubscriptionListResponse(
        items=subscriptions,
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/stats", response_model=SubscriptionStats)
@require_feature("subscription_tracking")
async def get_subscription_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get subscription statistics"""
    return await service.get_subscription_stats(db, current_user.id)


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
    return subscription


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
