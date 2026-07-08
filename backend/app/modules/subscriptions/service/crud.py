"""Subscription CRUD and lifecycle (pause/resume/cancel)."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from typing import Optional, Tuple, List
from uuid import UUID
from datetime import datetime
from app.modules.subscriptions.models import Subscription, SubscriptionPayment
from app.modules.subscriptions.schemas import (
    SubscriptionCreate,
    SubscriptionUpdate,
    SubscriptionStats
)
from .common import calculate_next_payment_date, logger
from .payments import backfill_subscription_payments, reverse_subscription_payments

async def create_subscription(
    db: AsyncSession,
    user_id: UUID,
    subscription_data: SubscriptionCreate,
    commit: bool = True,
) -> Subscription:
    """Create a new subscription"""
    data = subscription_data.model_dump(exclude={'sync_historical'})
    sync_historical = subscription_data.sync_historical

    subscription = Subscription(
        user_id=user_id,
        **data
    )

    # Calculate next payment date
    subscription.next_payment_date = calculate_next_payment_date(
        subscription.start_date,
        subscription.frequency
    )

    db.add(subscription)

    if not commit:
        # Caller owns the transaction (agent action layer: atomic entity+audit). Flush only;
        # skip commit and the historical-payment backfill (agent path links no payment account).
        await db.flush()
        await db.refresh(subscription)
        return subscription

    await db.commit()
    await db.refresh(subscription)

    if sync_historical and subscription.payment_account_id:
        await backfill_subscription_payments(db, subscription)
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
    sync_historical = update_dict.pop('sync_historical', False)
    old_payment_account_id = subscription.payment_account_id
    new_payment_account_id = update_dict.get('payment_account_id')

    # Check if payment account is being changed
    account_changing = (
        'payment_account_id' in update_dict and
        new_payment_account_id != old_payment_account_id
    )

    for key, value in update_dict.items():
        setattr(subscription, key, value)

    # Recalculate next payment date if frequency or start_date changed
    if 'frequency' in update_dict or 'start_date' in update_dict:
        subscription.next_payment_date = calculate_next_payment_date(
            subscription.start_date,
            subscription.frequency
        )

    subscription.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(subscription)

    # Handle sync_historical request
    print(f"[DEBUG] Update subscription: sync_historical={sync_historical}, payment_account_id={subscription.payment_account_id}, auto_pay={subscription.auto_pay}")
    logger.info(f"Update subscription: sync_historical={sync_historical}, payment_account_id={subscription.payment_account_id}, auto_pay={subscription.auto_pay}")
    if sync_historical and subscription.payment_account_id:
        print(f"[DEBUG] Backfilling payments for subscription {subscription.name}, auto_pay={subscription.auto_pay}")
        logger.info(f"Backfilling payments for subscription {subscription.name}, auto_pay={subscription.auto_pay}")
        if account_changing:
            # Account is changing - reverse old payments first
            if old_payment_account_id:
                await reverse_subscription_payments(db, subscription_id, user_id)

        # Backfill payments for the current/new account
        payments_created = await backfill_subscription_payments(db, subscription)
        logger.info(f"Backfill complete: {payments_created} payments created for {subscription.name}")
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

async def pause_subscription(
    db: AsyncSession,
    subscription: Subscription,
    resume_date: datetime = None
) -> Subscription:
    """Pause a subscription, optionally with a resume date."""
    subscription.status = "paused"
    subscription.paused_at = datetime.utcnow()
    subscription.resume_date = resume_date
    subscription.is_active = False
    subscription.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(subscription)

    logger.info(f"Paused subscription {subscription.name}")
    return subscription

async def resume_subscription(
    db: AsyncSession,
    subscription: Subscription
) -> Subscription:
    """Resume a paused subscription."""
    subscription.status = "active"
    subscription.paused_at = None
    subscription.resume_date = None
    subscription.is_active = True
    subscription.updated_at = datetime.utcnow()

    # Recalculate next payment date from now
    subscription.next_payment_date = calculate_next_payment_date(
        subscription.start_date,
        subscription.frequency,
        datetime.utcnow()
    )

    await db.commit()
    await db.refresh(subscription)

    logger.info(f"Resumed subscription {subscription.name}")
    return subscription

async def cancel_subscription(
    db: AsyncSession,
    subscription: Subscription
) -> Subscription:
    """Cancel a subscription."""
    subscription.status = "cancelled"
    subscription.is_active = False
    subscription.end_date = datetime.utcnow()
    subscription.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(subscription)

    logger.info(f"Cancelled subscription {subscription.name}")
    return subscription
