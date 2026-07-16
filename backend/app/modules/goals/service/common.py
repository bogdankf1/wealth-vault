"""Shared helpers: currency conversion and progress math."""
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from uuid import UUID
from decimal import Decimal
from datetime import datetime
from dateutil.relativedelta import relativedelta
from app.modules.goals.models import Goal
from app.services.currency_service import CurrencyService

logger = logging.getLogger("app.modules.goals.service")

async def get_user_display_currency(db: AsyncSession, user_id: UUID) -> str:
    """Get user's preferred display currency"""
    from app.models.user_preferences import UserPreferences
    prefs_result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user_id)
    )
    user_prefs = prefs_result.scalar_one_or_none()
    return user_prefs.display_currency if user_prefs and user_prefs.display_currency else "USD"

async def convert_goal_to_display_currency(db: AsyncSession, user_id: UUID, goal: Goal) -> None:
    """
    Convert goal amounts to user's display currency.
    Modifies the goal object in-place, adding display_* attributes.
    """
    display_currency = await get_user_display_currency(db, user_id)

    # If goal is already in display currency, no conversion needed
    if goal.currency == display_currency:
        goal.display_target_amount = goal.target_amount
        goal.display_current_amount = goal.current_amount
        goal.display_monthly_contribution = goal.monthly_contribution
        goal.display_currency = display_currency
        return

    # Convert using currency service
    currency_service = CurrencyService(db)

    # Convert target amount
    converted_target = await currency_service.convert_amount(
        goal.target_amount,
        goal.currency,
        display_currency
    )

    # Convert current amount
    converted_current = await currency_service.convert_amount(
        goal.current_amount,
        goal.currency,
        display_currency
    )

    # Convert monthly contribution
    converted_contribution = None
    if goal.monthly_contribution is not None:
        converted_contribution = await currency_service.convert_amount(
            goal.monthly_contribution,
            goal.currency,
            display_currency
        )

    # Set converted values as display values
    if converted_target is not None and converted_current is not None:
        goal.display_target_amount = converted_target
        goal.display_current_amount = converted_current
        goal.display_monthly_contribution = converted_contribution
        goal.display_currency = display_currency
    else:
        # Fallback to original values if conversion fails
        logger.warning(
            f"Currency conversion failed for goal {goal.id}: "
            f"could not convert {goal.currency} to {display_currency}. "
            f"Using original currency values."
        )
        goal.display_target_amount = goal.target_amount
        goal.display_current_amount = goal.current_amount
        goal.display_monthly_contribution = goal.monthly_contribution
        goal.display_currency = goal.currency

def calculate_progress_percentage(current_amount: Decimal, target_amount: Decimal) -> Decimal:
    """Calculate progress percentage toward goal."""
    if target_amount <= 0:
        return Decimal('0')

    progress = (current_amount / target_amount) * Decimal('100')
    return min(progress, Decimal('100'))  # Cap at 100%

def calculate_projected_completion_date(
    current_amount: Decimal,
    target_amount: Decimal,
    monthly_contribution: Optional[Decimal],
    start_date: datetime
) -> Optional[datetime]:
    """Calculate when goal will be achieved based on monthly contribution."""
    if not monthly_contribution or monthly_contribution <= 0:
        return None

    remaining = target_amount - current_amount
    if remaining <= 0:
        return datetime.utcnow()  # Already achieved

    months_needed = int((remaining / monthly_contribution).to_integral_value())

    # Ensure start_date is naive
    if start_date.tzinfo is not None:
        start_date = start_date.replace(tzinfo=None)

    projected_date = start_date + relativedelta(months=months_needed)

    return projected_date
