"""Shared helpers: currency conversion, frequency math."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from uuid import UUID
from decimal import Decimal
import logging
from app.modules.expenses.models import Expense, ExpenseFrequency, ExpenseStatus
from app.services.currency_service import CurrencyService

logger = logging.getLogger("app.modules.expenses.service")

async def get_user_display_currency(db: AsyncSession, user_id: UUID) -> str:
    """Get user's preferred display currency"""
    from app.models.user_preferences import UserPreferences
    prefs_result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user_id)
    )
    user_prefs = prefs_result.scalar_one_or_none()
    return user_prefs.display_currency if user_prefs and user_prefs.display_currency else "USD"

async def convert_expense_to_display_currency(db: AsyncSession, user_id: UUID, expense: Expense) -> None:
    """
    Convert expense amount to user's display currency.
    Modifies the expense object in-place, adding display_amount and display_currency attributes.
    """
    display_currency = await get_user_display_currency(db, user_id)

    # If expense is already in display currency, no conversion needed
    if expense.currency == display_currency:
        expense.display_amount = expense.amount
        expense.display_currency = display_currency
        expense.display_monthly_equivalent = expense.monthly_equivalent
        return

    # Convert using currency service
    currency_service = CurrencyService(db)
    converted_amount = await currency_service.convert_amount(
        expense.amount,
        expense.currency,
        display_currency
    )

    # Set converted values as display values
    if converted_amount is not None:
        expense.display_amount = converted_amount
        expense.display_currency = display_currency

        # Also convert monthly equivalent
        if expense.monthly_equivalent:
            converted_monthly = await currency_service.convert_amount(
                expense.monthly_equivalent,
                expense.currency,
                display_currency
            )
            if converted_monthly:
                expense.display_monthly_equivalent = converted_monthly
            else:
                logger.warning(
                    f"Currency conversion failed for expense {expense.id} monthly equivalent: "
                    f"could not convert {expense.currency} to {display_currency}"
                )
                expense.display_monthly_equivalent = expense.monthly_equivalent
        else:
            expense.display_monthly_equivalent = None
    else:
        # Fallback to original values if conversion fails
        logger.warning(
            f"Currency conversion failed for expense {expense.id}: "
            f"could not convert {expense.currency} to {display_currency}. "
            f"Using original currency values."
        )
        expense.display_amount = expense.amount
        expense.display_currency = expense.currency
        expense.display_monthly_equivalent = expense.monthly_equivalent

def calculate_monthly_equivalent(amount: Decimal, frequency: ExpenseFrequency) -> Decimal:
    """Calculate monthly equivalent of expense based on frequency"""
    if frequency == ExpenseFrequency.ONE_TIME:
        return Decimal(0)
    elif frequency == ExpenseFrequency.DAILY:
        return amount * Decimal(30)
    elif frequency == ExpenseFrequency.WEEKLY:
        return amount * Decimal(4.33)
    elif frequency == ExpenseFrequency.BIWEEKLY:
        return amount * Decimal(2.17)
    elif frequency == ExpenseFrequency.MONTHLY:
        return amount
    elif frequency == ExpenseFrequency.QUARTERLY:
        return amount / Decimal(3)
    elif frequency == ExpenseFrequency.ANNUALLY:
        return amount / Decimal(12)
    return Decimal(0)

def get_frequency_interval(frequency: ExpenseFrequency):
    """Get the relativedelta interval for a given frequency."""
    from dateutil.relativedelta import relativedelta

    if frequency == ExpenseFrequency.DAILY:
        return relativedelta(days=1)
    elif frequency == ExpenseFrequency.WEEKLY:
        return relativedelta(weeks=1)
    elif frequency == ExpenseFrequency.BIWEEKLY:
        return relativedelta(weeks=2)
    elif frequency == ExpenseFrequency.MONTHLY:
        return relativedelta(months=1)
    elif frequency == ExpenseFrequency.QUARTERLY:
        return relativedelta(months=3)
    elif frequency == ExpenseFrequency.ANNUALLY:
        return relativedelta(years=1)
    return relativedelta(months=1)
