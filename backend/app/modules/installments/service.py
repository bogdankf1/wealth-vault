"""
Installments module service layer.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from typing import Optional, Tuple
from uuid import UUID
from decimal import Decimal
from datetime import datetime
from dateutil.relativedelta import relativedelta

from app.modules.installments.models import Installment
from app.modules.installments.schemas import (
    InstallmentCreate,
    InstallmentUpdate,
    InstallmentStats
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


async def convert_installment_to_display_currency(db: AsyncSession, user_id: UUID, installment: Installment) -> None:
    """
    Convert installment amounts to user's display currency.
    Modifies the installment object in-place, adding display_* attributes.
    """
    display_currency = await get_user_display_currency(db, user_id)

    # If installment is already in display currency, no conversion needed
    if installment.currency == display_currency:
        installment.display_total_amount = installment.total_amount
        installment.display_amount_per_payment = installment.amount_per_payment
        installment.display_remaining_balance = installment.remaining_balance
        installment.display_currency = display_currency
        return

    # Convert using currency service
    currency_service = CurrencyService(db)

    # Convert total amount
    converted_total = await currency_service.convert_amount(
        installment.total_amount,
        installment.currency,
        display_currency
    )

    # Convert payment amount
    converted_payment = await currency_service.convert_amount(
        installment.amount_per_payment,
        installment.currency,
        display_currency
    )

    # Convert remaining balance
    converted_balance = None
    if installment.remaining_balance is not None:
        converted_balance = await currency_service.convert_amount(
            installment.remaining_balance,
            installment.currency,
            display_currency
        )

    # Set converted values as display values
    if converted_total is not None and converted_payment is not None:
        installment.display_total_amount = converted_total
        installment.display_amount_per_payment = converted_payment
        installment.display_remaining_balance = converted_balance
        installment.display_currency = display_currency
    else:
        # Fallback to original values if conversion fails
        installment.display_total_amount = installment.total_amount
        installment.display_amount_per_payment = installment.amount_per_payment
        installment.display_remaining_balance = installment.remaining_balance
        installment.display_currency = installment.currency


def calculate_remaining_balance(
    total_amount: Decimal,
    amount_per_payment: Decimal,
    payments_made: int,
    interest_rate: Optional[Decimal] = None
) -> Decimal:
    """
    Calculate remaining balance on an installment.

    Simple calculation: total - (payment * payments_made)
    For interest-bearing loans, this is an approximation.
    """
    if interest_rate and interest_rate > 0:
        # With interest, we use simple calculation for now
        # In a real app, you'd use amortization formulas
        paid_amount = amount_per_payment * Decimal(str(payments_made))
        remaining = total_amount - paid_amount
        return max(Decimal('0'), remaining)
    else:
        # No interest - straightforward calculation
        paid_amount = amount_per_payment * Decimal(str(payments_made))
        remaining = total_amount - paid_amount
        return max(Decimal('0'), remaining)


def calculate_end_date(
    first_payment_date: datetime,
    frequency: str,
    number_of_payments: int,
    payments_made: int = 0
) -> datetime:
    """
    Calculate the final payment date based on frequency and total number of payments.

    The payoff date is fixed based on the first payment date and total number of payments,
    regardless of how many payments have been made (payments_made is for tracking only).

    Example: If first payment is April 22, 2025 and there are 10 monthly payments,
    the last payment (payoff date) will be January 22, 2026 (first payment + 9 months).
    """
    # Ensure first_payment_date is naive
    if first_payment_date.tzinfo is not None:
        first_payment_date = first_payment_date.replace(tzinfo=None)

    # Calculate the date of the LAST payment
    # We subtract 1 because the first payment is on first_payment_date (payment 1 of N)
    intervals_to_last_payment = number_of_payments - 1

    if frequency == "weekly":
        delta = relativedelta(weeks=intervals_to_last_payment)
    elif frequency == "biweekly":
        delta = relativedelta(weeks=intervals_to_last_payment * 2)
    else:  # monthly
        delta = relativedelta(months=intervals_to_last_payment)

    result = first_payment_date + delta

    # Ensure result is naive
    if result.tzinfo is not None:
        result = result.replace(tzinfo=None)

    return result


async def create_installment(
    db: AsyncSession,
    user_id: UUID,
    installment_data: InstallmentCreate
) -> Installment:
    """Create a new installment"""
    # Calculate remaining balance
    remaining_balance = calculate_remaining_balance(
        installment_data.total_amount,
        installment_data.amount_per_payment,
        installment_data.payments_made,
        installment_data.interest_rate
    )

    # Calculate end date if not provided
    end_date = installment_data.end_date
    if not end_date:
        end_date = calculate_end_date(
            installment_data.first_payment_date,
            installment_data.frequency,
            installment_data.number_of_payments,
            installment_data.payments_made
        )

    installment = Installment(
        user_id=user_id,
        remaining_balance=remaining_balance,
        end_date=end_date,
        **installment_data.model_dump(exclude={'end_date'})
    )
    db.add(installment)
    await db.commit()
    await db.refresh(installment)
    return installment


async def get_installment(
    db: AsyncSession,
    user_id: UUID,
    installment_id: UUID
) -> Optional[Installment]:
    """Get a single installment"""
    query = select(Installment).where(
        and_(
            Installment.id == installment_id,
            Installment.user_id == user_id
        )
    )
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def list_installments(
    db: AsyncSession,
    user_id: UUID,
    page: int = 1,
    page_size: int = 50,
    category: Optional[str] = None,
    frequency: Optional[str] = None,
    is_active: Optional[bool] = None
) -> Tuple[list[Installment], int]:
    """List installments with pagination and filters"""
    # Base query
    query = select(Installment).where(Installment.user_id == user_id)

    # Apply filters
    if category:
        query = query.where(Installment.category == category)
    if frequency:
        query = query.where(Installment.frequency == frequency)
    if is_active is not None:
        query = query.where(Installment.is_active == is_active)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query)

    # Apply pagination and ordering
    query = query.order_by(Installment.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    installments = result.scalars().all()

    return list(installments), total or 0


async def update_installment(
    db: AsyncSession,
    user_id: UUID,
    installment_id: UUID,
    installment_data: InstallmentUpdate
) -> Optional[Installment]:
    """Update an installment"""
    installment = await get_installment(db, user_id, installment_id)
    if not installment:
        return None

    # Update fields
    update_dict = installment_data.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(installment, key, value)

    # Recalculate remaining balance if relevant fields changed
    if any(k in update_dict for k in ['total_amount', 'amount_per_payment', 'payments_made', 'interest_rate']):
        installment.remaining_balance = calculate_remaining_balance(
            installment.total_amount,
            installment.amount_per_payment,
            installment.payments_made,
            installment.interest_rate
        )

    # Recalculate end date if relevant fields changed
    if any(k in update_dict for k in ['first_payment_date', 'frequency', 'number_of_payments', 'payments_made']):
        installment.end_date = calculate_end_date(
            installment.first_payment_date,
            installment.frequency,
            installment.number_of_payments,
            installment.payments_made
        )

    installment.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(installment)
    return installment


async def delete_installment(
    db: AsyncSession,
    user_id: UUID,
    installment_id: UUID
) -> bool:
    """Delete an installment"""
    installment = await get_installment(db, user_id, installment_id)
    if not installment:
        return False

    await db.delete(installment)
    await db.commit()
    return True


async def get_installment_stats(
    db: AsyncSession,
    user_id: UUID,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
) -> InstallmentStats:
    """Get installment statistics, optionally filtered by date range"""
    # Get display currency
    display_currency = await get_user_display_currency(db, user_id)
    currency_service = CurrencyService(db)

    # Get installments with optional date filtering
    if start_date and end_date:
        # Remove timezone info for comparison
        filter_start = start_date.replace(tzinfo=None)
        filter_end = end_date.replace(tzinfo=None)

        # Installments overlap if: first_payment_date <= period_end AND (end_date is NULL OR end_date >= period_start)
        query = select(Installment).where(
            and_(
                Installment.user_id == user_id,
                Installment.first_payment_date <= filter_end,
                or_(
                    Installment.end_date.is_(None),
                    Installment.end_date >= filter_start
                )
            )
        )
    else:
        query = select(Installment).where(Installment.user_id == user_id)

    result = await db.execute(query)
    installments = result.scalars().all()

    total_installments = len(installments)
    active_installments = sum(1 for i in installments if i.is_active)

    # Calculate totals
    total_debt = Decimal('0')
    monthly_payment = Decimal('0')
    total_paid = Decimal('0')
    by_category: dict[str, Decimal] = {}
    by_frequency: dict[str, int] = {}
    interest_rates = []
    latest_end_date = None

    # Frequency multipliers to convert to monthly
    frequency_to_monthly = {
        "weekly": Decimal('4.33'),  # Approximately 4.33 weeks per month
        "biweekly": Decimal('2.17'),  # Approximately 2.17 biweekly periods per month
        "monthly": Decimal('1'),
    }

    for installment in installments:
        # Total debt (remaining balance) - convert to display currency
        if installment.remaining_balance:
            remaining_in_display = installment.remaining_balance
            if installment.currency != display_currency:
                converted = await currency_service.convert_amount(
                    installment.remaining_balance,
                    installment.currency,
                    display_currency
                )
                if converted is not None:
                    remaining_in_display = converted
            total_debt += remaining_in_display

        # Monthly payment (normalize based on frequency) - convert to display currency
        if installment.is_active:
            multiplier = frequency_to_monthly.get(installment.frequency, Decimal('1'))
            monthly_equivalent = installment.amount_per_payment * multiplier

            if installment.currency != display_currency:
                converted = await currency_service.convert_amount(
                    monthly_equivalent,
                    installment.currency,
                    display_currency
                )
                if converted is not None:
                    monthly_equivalent = converted
            monthly_payment += monthly_equivalent

        # Total paid - convert to display currency
        paid = installment.amount_per_payment * Decimal(str(installment.payments_made))
        if installment.currency != display_currency:
            converted = await currency_service.convert_amount(
                paid,
                installment.currency,
                display_currency
            )
            if converted is not None:
                paid = converted
        total_paid += paid

        # By category (remaining balance) - convert to display currency
        if installment.category:
            category_balance = installment.remaining_balance or Decimal('0')
            if installment.currency != display_currency and category_balance > 0:
                converted = await currency_service.convert_amount(
                    category_balance,
                    installment.currency,
                    display_currency
                )
                if converted is not None:
                    category_balance = converted
            by_category[installment.category] = by_category.get(installment.category, Decimal('0')) + category_balance

        # By frequency
        by_frequency[installment.frequency] = by_frequency.get(installment.frequency, 0) + 1

        # Interest rates
        if installment.interest_rate and installment.interest_rate > 0:
            interest_rates.append(installment.interest_rate)

        # Latest end date for debt-free date
        if installment.is_active and installment.end_date:
            if not latest_end_date or installment.end_date > latest_end_date:
                latest_end_date = installment.end_date

    # Average interest rate
    average_interest_rate = None
    if interest_rates:
        average_interest_rate = sum(interest_rates) / Decimal(str(len(interest_rates)))

    # Debt-free date (when last active installment ends)
    debt_free_date = latest_end_date.isoformat() if latest_end_date else None

    return InstallmentStats(
        total_installments=total_installments,
        active_installments=active_installments,
        total_debt=total_debt,
        monthly_payment=monthly_payment,
        total_paid=total_paid,
        currency=display_currency,
        by_category=by_category,
        by_frequency=by_frequency,
        average_interest_rate=average_interest_rate,
        debt_free_date=debt_free_date
    )
