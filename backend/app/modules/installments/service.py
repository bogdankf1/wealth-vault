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


def calculate_payments_made(
    first_payment_date: datetime,
    frequency: str,
    number_of_payments: int
) -> int:
    """
    Calculate how many payments have been made based on the current date.

    Logic:
    - Counts how many payment dates have passed (including today if it's a payment date)
    - A payment is considered "made" if the payment date has passed or is today
    - Never exceeds the total number of payments

    Example: If first payment is April 22, 2025, frequency is monthly, total payments is 10,
    and today is November 23, 2025:
    - Payment dates: Apr 22, May 22, Jun 22, Jul 22, Aug 22, Sep 22, Oct 22, Nov 22, Dec 22, Jan 22
    - Since Nov 22 has passed (today is Nov 23), payments made = 8
    """
    # Get current date (naive)
    current_date = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=None)

    # Ensure first_payment_date is naive and at midnight
    if first_payment_date.tzinfo is not None:
        first_payment_date = first_payment_date.replace(tzinfo=None)
    first_payment_date = first_payment_date.replace(hour=0, minute=0, second=0, microsecond=0)

    # If first payment hasn't happened yet, no payments made
    if current_date < first_payment_date:
        return 0

    # Calculate how many payment intervals have passed
    payments_made = 0
    payment_date = first_payment_date

    for i in range(number_of_payments):
        if payment_date <= current_date:
            payments_made += 1
            # Calculate next payment date
            if frequency == "weekly":
                payment_date += relativedelta(weeks=1)
            elif frequency == "biweekly":
                payment_date += relativedelta(weeks=2)
            else:  # monthly
                payment_date += relativedelta(months=1)
        else:
            break

    return min(payments_made, number_of_payments)


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
    # Automatically calculate payments made based on current date
    payments_made = calculate_payments_made(
        installment_data.first_payment_date,
        installment_data.frequency,
        installment_data.number_of_payments
    )

    # Calculate remaining balance
    remaining_balance = calculate_remaining_balance(
        installment_data.total_amount,
        installment_data.amount_per_payment,
        payments_made,
        installment_data.interest_rate
    )

    # Calculate end date if not provided
    end_date = installment_data.end_date
    if not end_date:
        end_date = calculate_end_date(
            installment_data.first_payment_date,
            installment_data.frequency,
            installment_data.number_of_payments,
            payments_made
        )

    # Create installment with calculated payments_made
    installment_dict = installment_data.model_dump(exclude={'end_date', 'payments_made'})
    installment = Installment(
        user_id=user_id,
        payments_made=payments_made,
        remaining_balance=remaining_balance,
        end_date=end_date,
        **installment_dict
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

    # Update fields (exclude payments_made since it's auto-calculated)
    update_dict = installment_data.model_dump(exclude_unset=True, exclude={'payments_made'})
    for key, value in update_dict.items():
        setattr(installment, key, value)

    # Recalculate payments made based on current date (always recalculate on update)
    installment.payments_made = calculate_payments_made(
        installment.first_payment_date,
        installment.frequency,
        installment.number_of_payments
    )

    # Recalculate remaining balance
    installment.remaining_balance = calculate_remaining_balance(
        installment.total_amount,
        installment.amount_per_payment,
        installment.payments_made,
        installment.interest_rate
    )

    # Recalculate end date
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

        # When date filtering is applied, only get active installments
        # Installments overlap if: first_payment_date <= period_end AND (end_date is NULL OR end_date >= period_start)
        query = select(Installment).where(
            and_(
                Installment.user_id == user_id,
                Installment.is_active == True,
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

    # Calculate installment counts based on whether date filtering is applied
    if start_date and end_date:
        # When date range is provided, count only active installments in range
        total_installments = len(installments)
        active_installments = len(installments)
    else:
        # When no date range, count all installments and active installments separately
        from sqlalchemy import case
        all_installments_query = select(
            func.count(Installment.id).label("total"),
            func.sum(
                case((Installment.is_active == True, 1), else_=0)
            ).label("active")
        ).where(Installment.user_id == user_id)
        all_installments_result = await db.execute(all_installments_query)
        all_installments_stats = all_installments_result.one()
        total_installments = all_installments_stats.total or 0
        active_installments = all_installments_stats.active or 0

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
        # Check if installment is paid off
        is_paid_off = installment.payments_made >= installment.number_of_payments

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
        # Only include if active AND not paid off
        if installment.is_active and not is_paid_off:
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


async def get_installment_history(
    db: AsyncSession,
    user_id: UUID,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
) -> dict:
    """Get installment payment history grouped by month."""
    from collections import defaultdict
    from dateutil.relativedelta import relativedelta
    from app.modules.installments.models import Installment
    from app.modules.installments.schemas import MonthlyInstallmentHistory, InstallmentHistoryResponse
    
    # Get user's display currency
    display_currency = await get_user_display_currency(db, user_id)
    
    # Frequency multipliers for monthly cost
    frequency_to_monthly = {
        'weekly': Decimal('4.33333'),
        'biweekly': Decimal('2.16667'),
        'monthly': Decimal('1'),
    }
    
    # Remove timezone info
    if start_date:
        start_date = start_date.replace(tzinfo=None)
    if end_date:
        end_date = end_date.replace(tzinfo=None)
    
    # Get all active installments
    result = await db.execute(
        select(Installment).where(
            Installment.user_id == user_id,
            Installment.is_active == True
        )
    )
    installments = result.scalars().all()
    
    currency_service = CurrencyService(db)
    monthly_data = defaultdict(lambda: {"total": Decimal(0), "count": 0})
    
    for installment in installments:
        # Check if installment is within date range (if dates provided)
        if start_date and end_date:
            installment_in_range = False

            # Installments are all recurring, check if first_payment_date/end_date overlaps with range
            installment_start = installment.first_payment_date.replace(tzinfo=None) if installment.first_payment_date and installment.first_payment_date.tzinfo else installment.first_payment_date
            installment_end = installment.end_date.replace(tzinfo=None) if installment.end_date and installment.end_date.tzinfo else installment.end_date

            if installment_start:
                # Installment starts before or during the range
                if installment_end:
                    # Has end date: check overlap
                    if installment_start <= end_date and installment_end >= start_date:
                        installment_in_range = True
                else:
                    # No end date: ongoing, check if it started before range ends
                    if installment_start <= end_date:
                        installment_in_range = True

            if not installment_in_range:
                continue

        # Convert to display currency
        if installment.currency == display_currency:
            converted_amount = installment.amount_per_payment
        else:
            converted_amount = await currency_service.convert_amount(
                installment.amount_per_payment, installment.currency, display_currency
            )
            if converted_amount is None:
                converted_amount = installment.amount_per_payment

        amount = Decimal(str(converted_amount))

        # Calculate monthly equivalent
        multiplier = frequency_to_monthly.get(installment.frequency, Decimal('1'))
        monthly_equiv = amount * multiplier

        if not installment.first_payment_date:
            continue
        
        installment_start = installment.first_payment_date.replace(tzinfo=None) if installment.first_payment_date.tzinfo else installment.first_payment_date
        installment_end = installment.end_date.replace(tzinfo=None) if installment.end_date and installment.end_date.tzinfo else installment.end_date
        
        # Determine date range
        range_start = max(installment_start, start_date) if start_date else installment_start
        range_end = min(installment_end, end_date) if installment_end and end_date else (installment_end or end_date)
        
        # If no end date, project to current date or end of filter range
        if not range_end:
            if end_date:
                range_end = end_date
            else:
                range_end = datetime.now()
        
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
        MonthlyInstallmentHistory(
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
    
    return InstallmentHistoryResponse(
        history=history,
        total_months=total_months,
        overall_average=overall_average,
        currency=display_currency
    )
