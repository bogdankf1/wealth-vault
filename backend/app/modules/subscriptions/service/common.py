"""Shared helpers: currency conversion and subscription date math."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from typing import Optional, Tuple, List
from uuid import UUID
from decimal import Decimal
from datetime import datetime
from dateutil.relativedelta import relativedelta
import logging
from app.modules.subscriptions.models import Subscription, SubscriptionPayment
from app.services.currency_service import CurrencyService

logger = logging.getLogger("app.modules.subscriptions.service")

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

def calculate_next_payment_date(start_date: datetime, frequency: str, from_date: datetime = None) -> datetime:
    """
    Calculate the next payment date based on frequency.
    If from_date is provided, calculates next date after from_date.
    """
    if from_date is None:
        from_date = datetime.utcnow()

    # Remove timezone info for comparison
    start = start_date.replace(tzinfo=None) if start_date.tzinfo else start_date
    current = from_date.replace(tzinfo=None) if from_date.tzinfo else from_date

    # Frequency to relativedelta mapping
    frequency_delta = {
        "monthly": relativedelta(months=1),
        "quarterly": relativedelta(months=3),
        "biannually": relativedelta(months=6),
        "annually": relativedelta(years=1),
    }

    delta = frequency_delta.get(frequency, relativedelta(months=1))

    # Start from the subscription start date and advance until we pass current date
    next_date = start
    while next_date <= current:
        next_date = next_date + delta

    return next_date

def calculate_period_dates(payment_date: datetime, frequency: str) -> Tuple[datetime, datetime]:
    """Calculate billing period start and end for a payment."""
    frequency_delta = {
        "monthly": relativedelta(months=1),
        "quarterly": relativedelta(months=3),
        "biannually": relativedelta(months=6),
        "annually": relativedelta(years=1),
    }

    delta = frequency_delta.get(frequency, relativedelta(months=1))
    period_start = payment_date
    period_end = payment_date + delta - relativedelta(days=1)

    return period_start, period_end
