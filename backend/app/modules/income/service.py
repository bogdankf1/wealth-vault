"""
Income service layer with currency conversion
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from uuid import UUID
from decimal import Decimal
from datetime import datetime

from app.modules.income.models import IncomeSource
from app.modules.income.schemas import MonthlyIncomeHistory, IncomeHistoryResponse
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


async def get_income_history(
    db: AsyncSession,
    user_id: UUID,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
) -> IncomeHistoryResponse:
    """
    Get income history grouped by month.

    Returns monthly totals and counts of income sources, along with overall average.
    Only includes active income sources.
    """
    from collections import defaultdict
    from dateutil.relativedelta import relativedelta

    # Get user preferences for display currency
    display_currency = await get_user_display_currency(db, user_id)

    # Frequency multipliers for calculating monthly equivalents
    frequency_to_monthly = {
        'one_time': Decimal('0'),
        'weekly': Decimal('4.33333'),
        'biweekly': Decimal('2.16667'),
        'monthly': Decimal('1'),
        'quarterly': Decimal('0.333333'),
        'annually': Decimal('0.083333'),
    }

    # Remove timezone info to match database datetimes
    if start_date:
        start_date = start_date.replace(tzinfo=None)
    if end_date:
        end_date = end_date.replace(tzinfo=None)

    # Get all active income sources (excluding soft-deleted)
    result = await db.execute(
        select(IncomeSource).where(
            IncomeSource.user_id == user_id,
            IncomeSource.is_active == True,
            IncomeSource.deleted_at.is_(None)
        )
    )
    income_sources = result.scalars().all()

    currency_service = CurrencyService(db)

    # Dictionary to store monthly data: {month: {"total": Decimal, "count": int}}
    monthly_data = defaultdict(lambda: {"total": Decimal(0), "count": 0})

    for income in income_sources:
        # Check if income is within date range (if dates provided)
        if start_date and end_date:
            income_in_range = False

            if income.frequency == 'one_time':
                # One-time income: check if date is within range
                if income.date:
                    income_date = income.date.replace(tzinfo=None) if income.date.tzinfo else income.date
                    if start_date <= income_date <= end_date:
                        income_in_range = True
            else:
                # Recurring income: check if start_date/end_date overlaps with range
                income_start = income.start_date.replace(tzinfo=None) if income.start_date and income.start_date.tzinfo else income.start_date
                income_end = income.end_date.replace(tzinfo=None) if income.end_date and income.end_date.tzinfo else income.end_date

                if income_start:
                    # Income starts before or during the range
                    if income_end:
                        # Has end date: check overlap
                        if income_start <= end_date and income_end >= start_date:
                            income_in_range = True
                    else:
                        # No end date: ongoing, check if it started before range ends
                        if income_start <= end_date:
                            income_in_range = True

            if not income_in_range:
                continue

        # Convert amount to display currency
        if income.currency == display_currency:
            converted_amount = income.amount
        else:
            converted_amount = await currency_service.convert_amount(
                income.amount,
                income.currency,
                display_currency
            )
            if converted_amount is None:
                converted_amount = income.amount

        amount = Decimal(str(converted_amount))

        if income.frequency == 'one_time':
            # One-time income: add to the month it occurred
            if income.date:
                income_date = income.date.replace(tzinfo=None) if income.date.tzinfo else income.date

                # Filter by date range if provided
                if start_date and end_date:
                    if not (start_date <= income_date <= end_date):
                        continue

                month_key = income_date.strftime('%Y-%m')
                monthly_data[month_key]["total"] += amount
                monthly_data[month_key]["count"] += 1
        else:
            # Recurring income: add monthly equivalent to each month in range
            if not income.start_date:
                continue

            income_start = income.start_date.replace(tzinfo=None) if income.start_date.tzinfo else income.start_date
            income_end = income.end_date.replace(tzinfo=None) if income.end_date and income.end_date.tzinfo else income.end_date

            # Calculate monthly equivalent
            multiplier = frequency_to_monthly.get(income.frequency, Decimal('1'))
            monthly_equiv = amount * multiplier

            # Determine date range for this income
            range_start = max(income_start, start_date) if start_date else income_start
            range_end = min(income_end, end_date) if income_end and end_date else (income_end or end_date)

            # If no end date for income and no filter end date, use current date + 12 months
            if not range_end:
                range_end = datetime.now() + relativedelta(months=12)

            # Generate months for this recurring income
            current_month = range_start.replace(day=1)
            end_month = range_end.replace(day=1)

            while current_month <= end_month:
                month_key = current_month.strftime('%Y-%m')
                monthly_data[month_key]["total"] += monthly_equiv
                monthly_data[month_key]["count"] += 1
                current_month += relativedelta(months=1)

    # Convert to list and sort by month
    history = [
        MonthlyIncomeHistory(
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

    return IncomeHistoryResponse(
        history=history,
        total_months=total_months,
        overall_average=overall_average,
        currency=display_currency
    )
