"""
Income service layer with currency conversion
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from uuid import UUID
from decimal import Decimal

from app.modules.income.models import IncomeSource
from app.services.currency_service import CurrencyService


async def get_user_display_currency(db: AsyncSession, user_id: UUID) -> str:
    """Get user's preferred display currency"""
    from app.models.user_preferences import UserPreferences
    prefs_result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user_id)
    )
    user_prefs = prefs_result.scalar_one_or_none()
    return user_prefs.display_currency if user_prefs and user_prefs.display_currency else "USD"


async def convert_income_to_display_currency(db: AsyncSession, user_id: UUID, income: IncomeSource) -> None:
    """
    Convert income amount to user's display currency.
    Modifies the income object in-place, adding display_amount and display_currency attributes.
    """
    display_currency = await get_user_display_currency(db, user_id)

    # If income is already in display currency, no conversion needed
    if income.currency == display_currency:
        income.display_amount = income.amount
        income.display_currency = display_currency
        # Calculate and set display_monthly_equivalent
        income.display_monthly_equivalent = income.calculate_monthly_amount()
        return

    # Convert using currency service
    currency_service = CurrencyService(db)
    converted_amount = await currency_service.convert_amount(
        income.amount,
        income.currency,
        display_currency
    )

    # Set converted values as display values
    if converted_amount is not None:
        income.display_amount = converted_amount
        income.display_currency = display_currency

        # Also convert monthly equivalent
        monthly_amount = income.calculate_monthly_amount()
        if monthly_amount:
            converted_monthly = await currency_service.convert_amount(
                monthly_amount,
                income.currency,
                display_currency
            )
            income.display_monthly_equivalent = converted_monthly if converted_monthly else monthly_amount
        else:
            income.display_monthly_equivalent = None
    else:
        # Fallback to original values if conversion fails
        income.display_amount = income.amount
        income.display_currency = income.currency
        income.display_monthly_equivalent = income.calculate_monthly_amount()
