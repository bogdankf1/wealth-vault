"""
Subscriptions module service layer
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from typing import Optional, Tuple, List
from uuid import UUID
from decimal import Decimal
from datetime import datetime

from app.modules.subscriptions.models import Subscription
from app.modules.subscriptions.schemas import (
    SubscriptionCreate,
    SubscriptionUpdate,
    SubscriptionStats
)


async def create_subscription(
    db: AsyncSession,
    user_id: UUID,
    subscription_data: SubscriptionCreate
) -> Subscription:
    """Create a new subscription"""
    subscription = Subscription(
        user_id=user_id,
        **subscription_data.model_dump()
    )
    db.add(subscription)
    await db.commit()
    await db.refresh(subscription)
    return subscription


async def get_subscription(
    db: AsyncSession,
    user_id: UUID,
    subscription_id: UUID
) -> Optional[Subscription]:
    """Get a single subscription"""
    query = select(Subscription).where(
        and_(
            Subscription.id == subscription_id,
            Subscription.user_id == user_id
        )
    )
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def list_subscriptions(
    db: AsyncSession,
    user_id: UUID,
    skip: int = 0,
    limit: int = 50,
    category: Optional[str] = None,
    frequency: Optional[str] = None,
    is_active: Optional[bool] = None
) -> Tuple[List[Subscription], int]:
    """List subscriptions with filters"""
    query = select(Subscription).where(Subscription.user_id == user_id)

    # Apply filters
    if category:
        query = query.where(Subscription.category == category)
    if frequency:
        query = query.where(Subscription.frequency == frequency)
    if is_active is not None:
        query = query.where(Subscription.is_active == is_active)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    # Apply pagination
    query = query.order_by(Subscription.created_at.desc())
    query = query.offset(skip).limit(limit)

    result = await db.execute(query)
    subscriptions = result.scalars().all()

    return list(subscriptions), total


async def update_subscription(
    db: AsyncSession,
    user_id: UUID,
    subscription_id: UUID,
    subscription_data: SubscriptionUpdate
) -> Optional[Subscription]:
    """Update a subscription"""
    subscription = await get_subscription(db, user_id, subscription_id)
    if not subscription:
        return None

    update_dict = subscription_data.model_dump(exclude_unset=True)

    for key, value in update_dict.items():
        setattr(subscription, key, value)

    subscription.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(subscription)

    return subscription


async def delete_subscription(
    db: AsyncSession,
    user_id: UUID,
    subscription_id: UUID
) -> bool:
    """Delete a subscription"""
    subscription = await get_subscription(db, user_id, subscription_id)
    if not subscription:
        return False

    await db.delete(subscription)
    await db.commit()
    return True


async def get_subscription_stats(
    db: AsyncSession,
    user_id: UUID
) -> SubscriptionStats:
    """Get subscription statistics"""
    # Get all subscriptions
    query = select(Subscription).where(Subscription.user_id == user_id)
    result = await db.execute(query)
    subscriptions = result.scalars().all()

    total_subscriptions = len(subscriptions)
    active_subscriptions = sum(1 for sub in subscriptions if sub.is_active)

    # Calculate costs normalized to monthly and annual
    monthly_cost = Decimal(0)
    total_annual_cost = Decimal(0)
    by_category = {}
    by_frequency = {}

    # Frequency multipliers to convert to monthly
    frequency_to_monthly = {
        "monthly": 1,
        "quarterly": 1/3,
        "annually": 1/12,
        "biannually": 1/6,
    }

    # Frequency multipliers to convert to annual
    frequency_to_annual = {
        "monthly": 12,
        "quarterly": 4,
        "annually": 1,
        "biannually": 2,
    }

    for subscription in subscriptions:
        if subscription.is_active:
            # Calculate monthly cost
            multiplier = frequency_to_monthly.get(subscription.frequency, 1)
            monthly_equivalent = subscription.amount * Decimal(str(multiplier))
            monthly_cost += monthly_equivalent

            # Calculate annual cost
            annual_multiplier = frequency_to_annual.get(subscription.frequency, 12)
            annual_equivalent = subscription.amount * Decimal(str(annual_multiplier))
            total_annual_cost += annual_equivalent

            # Group by category
            if subscription.category:
                category_monthly = by_category.get(subscription.category, Decimal(0))
                by_category[subscription.category] = category_monthly + monthly_equivalent

        # Count by frequency
        freq = subscription.frequency
        by_frequency[freq] = by_frequency.get(freq, 0) + 1

    return SubscriptionStats(
        total_subscriptions=total_subscriptions,
        active_subscriptions=active_subscriptions,
        monthly_cost=monthly_cost,
        total_annual_cost=total_annual_cost,
        by_category=by_category,
        by_frequency=by_frequency
    )
