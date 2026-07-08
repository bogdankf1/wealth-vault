"""Shared helpers: currency conversion, period ranges, income and payment-status calculations."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from typing import Optional, Tuple
from uuid import UUID
from decimal import Decimal
from datetime import datetime
from app.modules.taxes.models import Tax, TaxPayment
from app.services.currency_service import CurrencyService
from dateutil.relativedelta import relativedelta

async def get_user_display_currency(db: AsyncSession, user_id: UUID) -> str:
    """Get user's preferred display currency"""
    from app.models.user_preferences import UserPreferences
    prefs_result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user_id)
    )
    user_prefs = prefs_result.scalar_one_or_none()
    return user_prefs.display_currency if user_prefs and user_prefs.display_currency else "USD"

def get_current_period_range(frequency: str, reference_date: datetime = None) -> Tuple[datetime, datetime]:
    """
    Get the start and end dates of the current payment period based on frequency.

    Returns:
        Tuple of (period_start, period_end)
    """
    if reference_date is None:
        reference_date = datetime.utcnow()

    # Handle enum values
    freq_str = frequency.value if hasattr(frequency, 'value') else str(frequency)

    if freq_str == "monthly":
        # Current month
        period_start = reference_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        period_end = (period_start + relativedelta(months=1)) - relativedelta(seconds=1)
    elif freq_str == "quarterly":
        # Current quarter
        quarter = (reference_date.month - 1) // 3
        period_start = reference_date.replace(month=quarter * 3 + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
        period_end = (period_start + relativedelta(months=3)) - relativedelta(seconds=1)
    elif freq_str == "annually":
        # Current year
        period_start = reference_date.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        period_end = reference_date.replace(month=12, day=31, hour=23, minute=59, second=59, microsecond=999999)
    else:
        # Default to monthly
        period_start = reference_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        period_end = (period_start + relativedelta(months=1)) - relativedelta(seconds=1)

    return period_start, period_end

async def get_tax_payment_status(
    db: AsyncSession,
    tax: Tax,
    reference_date: datetime = None
) -> dict:
    """
    Check if a tax has been paid for the current period.

    Returns:
        dict with:
        - is_paid: bool - whether tax is paid for current period
        - period_start: datetime - start of current period
        - period_end: datetime - end of current period
        - last_payment_date: datetime or None - date of last payment in period
        - last_payment_amount: Decimal or None - amount of last payment
    """
    if reference_date is None:
        reference_date = datetime.utcnow()

    period_start, period_end = get_current_period_range(tax.frequency, reference_date)

    # Query for payments within the current period
    result = await db.execute(
        select(TaxPayment)
        .where(
            and_(
                TaxPayment.tax_id == tax.id,
                TaxPayment.status == "completed",
                TaxPayment.payment_date >= period_start,
                TaxPayment.payment_date <= period_end
            )
        )
        .order_by(TaxPayment.payment_date.desc())
        .limit(1)
    )
    payment = result.scalar_one_or_none()

    return {
        "is_paid": payment is not None,
        "period_start": period_start,
        "period_end": period_end,
        "last_payment_date": payment.payment_date if payment else None,
        "last_payment_amount": payment.amount if payment else None
    }

async def get_total_monthly_income(db: AsyncSession, user_id: UUID, income_source_id: Optional[UUID] = None) -> Decimal:
    """
    Get total monthly income for the user in display currency.
    If income_source_id is provided, only returns income from that source.
    """
    from app.modules.income.models import IncomeSource

    # Get user's display currency
    display_currency = await get_user_display_currency(db, user_id)
    currency_service = CurrencyService(db)

    conditions = [
        IncomeSource.user_id == user_id,
        IncomeSource.is_active == True,
        IncomeSource.deleted_at.is_(None)
    ]

    # Filter to specific income source if provided
    if income_source_id:
        conditions.append(IncomeSource.id == income_source_id)

    query = select(IncomeSource).where(and_(*conditions))
    result = await db.execute(query)
    income_sources = list(result.scalars().all())

    total_income = Decimal("0")
    for source in income_sources:
        # Convert amount to display currency first
        amount_in_display = source.amount
        if source.currency != display_currency:
            converted = await currency_service.convert_amount(
                source.amount,
                source.currency,
                display_currency
            )
            if converted is not None:
                amount_in_display = converted

        # Convert to monthly equivalent
        if source.frequency == "monthly":
            total_income += amount_in_display
        elif source.frequency == "weekly":
            total_income += amount_in_display * Decimal("4.33")
        elif source.frequency == "biweekly":
            total_income += amount_in_display * Decimal("2.17")
        elif source.frequency == "annually":
            total_income += amount_in_display / Decimal("12")
        elif source.frequency == "quarterly":
            total_income += amount_in_display / Decimal("3")

    return total_income

async def convert_tax_to_display_currency(db: AsyncSession, user_id: UUID, tax: Tax) -> None:
    """
    Convert tax amount to user's display currency and calculate percentage-based taxes.
    Modifies the tax object in-place, adding display_* and calculated_amount attributes.
    """
    display_currency = await get_user_display_currency(db, user_id)
    currency_service = CurrencyService(db)

    # For fixed amount taxes
    if tax.tax_type == "fixed" and tax.fixed_amount:
        if tax.currency == display_currency:
            tax.display_fixed_amount = tax.fixed_amount
            tax.display_currency = display_currency
            tax.calculated_amount = tax.fixed_amount
        else:
            # Convert to display currency
            converted_amount = await currency_service.convert_amount(
                tax.fixed_amount,
                tax.currency,
                display_currency
            )
            if converted_amount is not None:
                tax.display_fixed_amount = converted_amount
                tax.display_currency = display_currency
                tax.calculated_amount = converted_amount
            else:
                tax.display_fixed_amount = tax.fixed_amount
                tax.display_currency = tax.currency
                tax.calculated_amount = tax.fixed_amount

    # For percentage-based taxes
    elif tax.tax_type == "percentage" and tax.percentage:
        # Get monthly income - either from specific source or all sources
        total_income = await get_total_monthly_income(
            db, user_id,
            income_source_id=tax.income_source_id  # Will filter to specific source if set
        )

        # Calculate tax amount as percentage of income
        tax_amount = (total_income * tax.percentage) / Decimal("100")

        tax.calculated_amount = tax_amount
        tax.display_currency = display_currency

    # Calculate payment status for current period
    payment_status = await get_tax_payment_status(db, tax)
    tax.is_paid_current_period = payment_status["is_paid"]
    tax.current_period_start = payment_status["period_start"]
    tax.current_period_end = payment_status["period_end"]
    tax.last_payment_date = payment_status["last_payment_date"]
    tax.last_payment_amount = payment_status["last_payment_amount"]

def calculate_next_payment_date(frequency, from_date: datetime = None) -> datetime:
    """Calculate the next payment date based on frequency"""
    if from_date is None:
        from_date = datetime.utcnow()

    # Handle both string and enum values
    freq_str = frequency.value if hasattr(frequency, 'value') else str(frequency)

    if freq_str == "monthly":
        return from_date + relativedelta(months=1)
    elif freq_str == "quarterly":
        return from_date + relativedelta(months=3)
    elif freq_str == "annually":
        return from_date + relativedelta(years=1)
    else:
        return from_date + relativedelta(months=1)  # Default to monthly
