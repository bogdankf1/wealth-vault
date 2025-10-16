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
from app.services.currency_service import CurrencyService


async def get_user_display_currency(db: AsyncSession, user_id: UUID) -> str:
    """Get user's preferred display currency"""
    from app.models.user_preferences import UserPreferences
    prefs_result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user_id)
    )
    user_prefs = prefs_result.scalar_one_or_none()
    return user_prefs.display_currency if user_prefs and user_prefs.display_currency else "USD"


async def convert_subscription_to_display_currency(db: AsyncSession, user_id: UUID, subscription: Subscription) -> None:
    """
    Convert subscription amount to user's display currency.
    Modifies the subscription object in-place, adding display_amount and display_currency attributes.
    """
    display_currency = await get_user_display_currency(db, user_id)

    # If subscription is already in display currency, no conversion needed
    if subscription.currency == display_currency:
        subscription.display_amount = subscription.amount
        subscription.display_currency = display_currency
        # Calculate and set display_monthly_equivalent
        subscription.display_monthly_equivalent = calculate_monthly_equivalent(subscription.amount, subscription.frequency)
        return

    # Convert using currency service
    currency_service = CurrencyService(db)
    converted_amount = await currency_service.convert_amount(
        subscription.amount,
        subscription.currency,
        display_currency
    )

    # Set converted values as display values
    if converted_amount is not None:
        subscription.display_amount = converted_amount
        subscription.display_currency = display_currency

        # Also convert monthly equivalent
        monthly_amount = calculate_monthly_equivalent(subscription.amount, subscription.frequency)
        if monthly_amount:
            converted_monthly = await currency_service.convert_amount(
                monthly_amount,
                subscription.currency,
                display_currency
            )
            subscription.display_monthly_equivalent = converted_monthly if converted_monthly else monthly_amount
        else:
            subscription.display_monthly_equivalent = None
    else:
        # Fallback to original values if conversion fails
        subscription.display_amount = subscription.amount
        subscription.display_currency = subscription.currency
        subscription.display_monthly_equivalent = calculate_monthly_equivalent(subscription.amount, subscription.frequency)


def calculate_monthly_equivalent(amount: Decimal, frequency: str) -> Decimal:
    """Calculate monthly equivalent amount based on frequency"""
    frequency_to_monthly = {
        "monthly": 1,
        "quarterly": Decimal("0.333333"),
        "annually": Decimal("0.083333"),
        "biannually": Decimal("0.166667"),
    }
    multiplier = frequency_to_monthly.get(frequency, 1)
    return amount * Decimal(str(multiplier))


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
