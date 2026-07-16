"""Subscription statistics and history."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from typing import Optional
from uuid import UUID
from decimal import Decimal
from datetime import datetime
from dateutil.relativedelta import relativedelta
from app.modules.subscriptions.models import Subscription
from app.modules.subscriptions.schemas import (
    SubscriptionStats
)
from app.services.currency_service import CurrencyService
from .common import get_user_display_currency

async def get_subscription_stats(
    db: AsyncSession,
    user_id: UUID,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
) -> SubscriptionStats:
    """Get subscription statistics, optionally filtered by date range"""
    # Get display currency
    display_currency = await get_user_display_currency(db, user_id)
    currency_service = CurrencyService(db)

    # Get subscriptions with optional date filtering
    if start_date and end_date:
        # Remove timezone info for comparison
        filter_start = start_date.replace(tzinfo=None)
        filter_end = end_date.replace(tzinfo=None)

        # When date filtering is applied, only get active subscriptions
        # Subscriptions overlap if: start_date <= period_end AND (end_date is NULL OR end_date >= period_start)
        query = select(Subscription).where(
            and_(
                Subscription.user_id == user_id,
                Subscription.is_active == True,
                Subscription.start_date <= filter_end,
                or_(
                    Subscription.end_date.is_(None),
                    Subscription.end_date >= filter_start
                )
            )
        )
    else:
        query = select(Subscription).where(Subscription.user_id == user_id)

    result = await db.execute(query)
    subscriptions = result.scalars().all()

    # Calculate subscription counts based on whether date filtering is applied
    if start_date and end_date:
        # When date range is provided, count only active subscriptions in range
        total_subscriptions = len(subscriptions)
        active_subscriptions = len(subscriptions)
    else:
        # When no date range, count all subscriptions and active subscriptions separately
        from sqlalchemy import case
        all_subscriptions_query = select(
            func.count(Subscription.id).label("total"),
            func.sum(
                case((Subscription.is_active == True, 1), else_=0)
            ).label("active")
        ).where(Subscription.user_id == user_id)
        all_subscriptions_result = await db.execute(all_subscriptions_query)
        all_subscriptions_stats = all_subscriptions_result.one()
        total_subscriptions = all_subscriptions_stats.total or 0
        active_subscriptions = all_subscriptions_stats.active or 0

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
            # Convert amount to display currency first
            amount_in_display = subscription.amount
            if subscription.currency != display_currency:
                converted = await currency_service.convert_amount(
                    subscription.amount,
                    subscription.currency,
                    display_currency
                )
                if converted is not None:
                    amount_in_display = converted

            # Calculate monthly cost
            multiplier = frequency_to_monthly.get(subscription.frequency, 1)
            monthly_equivalent = amount_in_display * Decimal(str(multiplier))
            monthly_cost += monthly_equivalent

            # Calculate annual cost
            annual_multiplier = frequency_to_annual.get(subscription.frequency, 12)
            annual_equivalent = amount_in_display * Decimal(str(annual_multiplier))
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

async def get_subscription_history(
    db: AsyncSession,
    user_id: UUID,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
) -> dict:
    """Get subscription cost history grouped by month."""
    from collections import defaultdict
    from app.modules.subscriptions.models import Subscription
    from app.modules.subscriptions.schemas import MonthlySubscriptionHistory, SubscriptionHistoryResponse
    
    # Get user's display currency
    display_currency = await get_user_display_currency(db, user_id)
    
    # Frequency multipliers for monthly cost
    frequency_to_monthly = {
        'monthly': Decimal('1'),
        'quarterly': Decimal('0.333333'),
        'biannually': Decimal('0.166667'),
        'annually': Decimal('0.083333'),
    }
    
    # Remove timezone info
    if start_date:
        start_date = start_date.replace(tzinfo=None)
    if end_date:
        end_date = end_date.replace(tzinfo=None)
    
    # Get all active subscriptions
    result = await db.execute(
        select(Subscription).where(
            Subscription.user_id == user_id,
            Subscription.is_active == True
        )
    )
    subscriptions = result.scalars().all()
    
    currency_service = CurrencyService(db)
    monthly_data = defaultdict(lambda: {"total": Decimal(0), "count": 0})
    
    for sub in subscriptions:
        # Check if subscription is within date range (if dates provided)
        if start_date and end_date:
            sub_in_range = False

            # Subscriptions are all recurring, check if start_date/end_date overlaps with range
            sub_start = sub.start_date.replace(tzinfo=None) if sub.start_date and sub.start_date.tzinfo else sub.start_date
            sub_end = sub.end_date.replace(tzinfo=None) if sub.end_date and sub.end_date.tzinfo else sub.end_date

            if sub_start:
                # Subscription starts before or during the range
                if sub_end:
                    # Has end date: check overlap
                    if sub_start <= end_date and sub_end >= start_date:
                        sub_in_range = True
                else:
                    # No end date: ongoing, check if it started before range ends
                    if sub_start <= end_date:
                        sub_in_range = True

            if not sub_in_range:
                continue

        # Convert to display currency
        if sub.currency == display_currency:
            converted_amount = sub.amount
        else:
            converted_amount = await currency_service.convert_amount(
                sub.amount, sub.currency, display_currency
            )
            if converted_amount is None:
                converted_amount = sub.amount

        amount = Decimal(str(converted_amount))

        # Calculate monthly equivalent
        multiplier = frequency_to_monthly.get(sub.frequency, Decimal('1'))
        monthly_equiv = amount * multiplier

        if not sub.start_date:
            continue
        
        sub_start = sub.start_date.replace(tzinfo=None) if sub.start_date.tzinfo else sub.start_date
        sub_end = sub.end_date.replace(tzinfo=None) if sub.end_date and sub.end_date.tzinfo else sub.end_date
        
        # Determine date range
        range_start = max(sub_start, start_date) if start_date else sub_start
        range_end = min(sub_end, end_date) if sub_end and end_date else (sub_end or end_date)
        
        # If no end date, project 12 months forward
        if not range_end:
            range_end = datetime.now() + relativedelta(months=12)
        
        # Generate months
        current_month = range_start.replace(day=1)
        end_month = range_end.replace(day=1)
        
        while current_month <= end_month:
            month_key = current_month.strftime('%Y-%m')
            monthly_data[month_key]["total"] += monthly_equiv
            monthly_data[month_key]["count"] += 1
            current_month += relativedelta(months=1)
    
    # Convert to list and sort
    history = [
        MonthlySubscriptionHistory(
            month=month,
            total=data["total"],
            count=data["count"],
            currency=display_currency
        )
        for month, data in sorted(monthly_data.items())
    ]
    
    # Calculate overall average
    total_months = len(history)
    overall_average = Decimal(0)
    if total_months > 0:
        total_sum = sum(item.total for item in history)
        overall_average = total_sum / Decimal(total_months)
    
    return SubscriptionHistoryResponse(
        history=history,
        total_months=total_months,
        overall_average=overall_average,
        currency=display_currency
    )
