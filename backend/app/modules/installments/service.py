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

from app.modules.installments.models import Installment, InstallmentPayment
from app.modules.installments.schemas import (
    InstallmentCreate,
    InstallmentUpdate,
    InstallmentStats
)
from app.services.currency_service import CurrencyService
import logging

logger = logging.getLogger(__name__)


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

    # Extract sync_historical before creating model
    sync_historical = installment_data.sync_historical

    # Create installment with calculated payments_made
    installment_dict = installment_data.model_dump(exclude={'end_date', 'payments_made', 'sync_historical'})
    installment = Installment(
        user_id=user_id,
        payments_made=payments_made,
        remaining_balance=remaining_balance,
        end_date=end_date,
        **installment_dict
    )

    # Calculate next payment date
    installment.next_payment_date = calculate_next_installment_payment_date(
        installment_data.first_payment_date,
        installment_data.frequency,
        installment_data.number_of_payments
    )

    db.add(installment)
    await db.commit()
    await db.refresh(installment)

    # If sync_historical and payment account is linked, backfill payments
    if sync_historical and installment.payment_account_id:
        await backfill_installment_payments(db, installment)
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

    # Update fields (exclude payments_made and sync_historical since they're handled separately)
    update_dict = installment_data.model_dump(exclude_unset=True)
    sync_historical = update_dict.pop('sync_historical', False)
    update_dict.pop('payments_made', None)  # Never update payments_made directly
    old_payment_account_id = installment.payment_account_id
    new_payment_account_id = update_dict.get('payment_account_id')

    # Check if payment account is being changed
    account_changing = (
        'payment_account_id' in update_dict and
        new_payment_account_id != old_payment_account_id
    )

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

    # Recalculate next payment date if frequency or first_payment_date changed
    if 'frequency' in update_dict or 'first_payment_date' in update_dict:
        installment.next_payment_date = calculate_next_installment_payment_date(
            installment.first_payment_date,
            installment.frequency,
            installment.number_of_payments
        )

    installment.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(installment)

    # Handle sync_historical request
    logger.info(f"Update installment: sync_historical={sync_historical}, payment_account_id={installment.payment_account_id}, auto_pay={installment.auto_pay}")
    if sync_historical and installment.payment_account_id:
        logger.info(f"Backfilling payments for installment {installment.name}, auto_pay={installment.auto_pay}")
        if account_changing:
            # Account is changing - reverse old payments first
            if old_payment_account_id:
                await reverse_installment_payments(db, installment_id, user_id)

        # Backfill payments for the current/new account
        payments_created = await backfill_installment_payments(db, installment)
        logger.info(f"Backfill complete: {payments_created} payments created for {installment.name}")
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


# ============== Payment Integration Functions ==============

def calculate_next_installment_payment_date(
    first_payment_date: datetime,
    frequency: str,
    number_of_payments: int,
    from_date: datetime = None
) -> Optional[datetime]:
    """
    Calculate the next payment date based on frequency.
    Returns None if all payments are complete.
    """
    if from_date is None:
        from_date = datetime.utcnow()

    # Remove timezone info for comparison
    first = first_payment_date.replace(tzinfo=None) if first_payment_date.tzinfo else first_payment_date
    current = from_date.replace(tzinfo=None) if from_date.tzinfo else from_date

    # Frequency to relativedelta mapping
    frequency_delta = {
        "weekly": relativedelta(weeks=1),
        "biweekly": relativedelta(weeks=2),
        "monthly": relativedelta(months=1),
    }

    delta = frequency_delta.get(frequency, relativedelta(months=1))

    # Count payments and find next date
    payment_date = first
    payment_count = 0

    while payment_date <= current and payment_count < number_of_payments:
        payment_count += 1
        if payment_count < number_of_payments:
            payment_date = payment_date + delta

    # If all payments made, return None
    if payment_count >= number_of_payments and payment_date <= current:
        return None

    # Find next future date
    next_date = first
    for i in range(number_of_payments):
        if next_date > current:
            return next_date
        next_date = next_date + delta

    return None


async def process_installment_payment(
    db: AsyncSession,
    installment: Installment,
    payment_number: int = None,
    payment_date: datetime = None,
    amount: Decimal = None,
    notes: str = None
) -> Optional[InstallmentPayment]:
    """
    Process an installment payment - create expense, deduct from account, record payment.

    Returns the payment record if successful, None if failed.
    """
    from app.modules.savings.transaction_service import TransactionService
    from app.modules.expenses.models import Expense, ExpenseFrequency

    if payment_date is None:
        payment_date = datetime.utcnow()

    if amount is None:
        amount = installment.amount_per_payment

    if payment_number is None:
        payment_number = installment.payments_made + 1

    payment_date = payment_date.replace(tzinfo=None) if payment_date.tzinfo else payment_date

    # Calculate scheduled date for this payment number
    frequency_delta = {
        "weekly": relativedelta(weeks=1),
        "biweekly": relativedelta(weeks=2),
        "monthly": relativedelta(months=1),
    }
    delta = frequency_delta.get(installment.frequency, relativedelta(months=1))
    scheduled_date = installment.first_payment_date + (delta * (payment_number - 1))
    if scheduled_date.tzinfo:
        scheduled_date = scheduled_date.replace(tzinfo=None)

    # Calculate if payment is late
    is_late = payment_date.date() > scheduled_date.date()
    days_late = (payment_date.date() - scheduled_date.date()).days if is_late else None

    # Calculate principal/interest split (simple approximation)
    principal_amount = None
    interest_amount = None
    if installment.interest_rate and installment.interest_rate > 0:
        # Simple interest calculation: remaining balance * (annual rate / 12) for monthly payments
        remaining = installment.remaining_balance or installment.total_amount
        monthly_rate = installment.interest_rate / Decimal('100') / Decimal('12')
        interest_amount = remaining * monthly_rate
        principal_amount = amount - interest_amount if amount > interest_amount else Decimal('0')
    else:
        principal_amount = amount
        interest_amount = Decimal('0')

    try:
        # Create expense record for this payment
        expense = Expense(
            user_id=installment.user_id,
            name=f"{installment.name} - Payment #{payment_number}",
            description=f"Auto-generated from installment: {installment.name}",
            category=installment.category or "Installments",
            amount=amount,
            currency=installment.currency,
            frequency=ExpenseFrequency.ONE_TIME,
            date=payment_date,
            is_active=True,
            status="paid",
            paid_date=payment_date,
            paid_amount=amount,
            payment_account_id=installment.payment_account_id,
            payment_method="transfer" if installment.payment_account_id else None,
        )
        db.add(expense)
        await db.flush()

        account_transaction_id = None

        # If auto_pay is enabled and account is linked, deduct from account
        if installment.auto_pay and installment.payment_account_id:
            from app.modules.savings.transaction_service import InsufficientFundsError
            from app.modules.savings.models import SavingsAccount
            from app.services.currency_service import CurrencyService
            try:
                transaction_service = TransactionService(db)

                # Get account to check currency
                account_result = await db.execute(
                    select(SavingsAccount).where(SavingsAccount.id == installment.payment_account_id)
                )
                account = account_result.scalar_one_or_none()

                # Handle currency conversion if needed
                source_currency = None
                exchange_rate = None
                if account and installment.currency != account.currency:
                    source_currency = installment.currency
                    currency_service = CurrencyService(db)
                    exchange_rate = await currency_service.get_exchange_rate(
                        installment.currency, account.currency
                    )
                    if not exchange_rate:
                        logger.warning(
                            f"Could not get exchange rate from {installment.currency} to {account.currency} "
                            f"for installment {installment.id}, using 1:1"
                        )
                        exchange_rate = Decimal("1")

                transaction = await transaction_service.create_withdrawal(
                    account_id=installment.payment_account_id,
                    user_id=installment.user_id,
                    amount=Decimal(str(amount)),
                    description=f"Installment payment: {installment.name} (#{payment_number})",
                    source_type="installment",
                    source_id=installment.id,
                    transaction_date=payment_date,
                    category=installment.category or "Installments",
                    source_currency=source_currency,
                    exchange_rate=exchange_rate,
                )
                account_transaction_id = transaction.id
                expense.account_transaction_id = transaction.id
            except InsufficientFundsError:
                # Re-raise InsufficientFundsError to be handled by caller
                raise
            except Exception as e:
                logger.warning(f"Failed to create withdrawal for installment {installment.id}: {e}")
                # Continue without the withdrawal - payment still recorded

        # Create payment record
        payment = InstallmentPayment(
            installment_id=installment.id,
            user_id=installment.user_id,
            payment_number=payment_number,
            scheduled_date=scheduled_date,
            actual_payment_date=payment_date,
            scheduled_amount=installment.amount_per_payment,
            actual_amount=amount,
            principal_amount=principal_amount,
            interest_amount=interest_amount,
            currency=installment.currency,
            expense_id=expense.id,
            account_transaction_id=account_transaction_id,
            status="completed",
            is_late=is_late,
            days_late=days_late,
            notes=notes,
        )
        db.add(payment)

        # Update installment dates and payment count
        installment.last_payment_date = payment_date
        installment.payments_made = payment_number
        installment.remaining_balance = calculate_remaining_balance(
            installment.total_amount,
            installment.amount_per_payment,
            installment.payments_made,
            installment.interest_rate
        )
        installment.next_payment_date = calculate_next_installment_payment_date(
            installment.first_payment_date,
            installment.frequency,
            installment.number_of_payments,
            payment_date
        )

        # Check if installment is complete
        if installment.payments_made >= installment.number_of_payments:
            installment.status = "completed"
            installment.is_active = False
            installment.remaining_balance = Decimal('0')

        await db.flush()

        logger.info(f"Processed installment payment #{payment_number} for {installment.name}: {amount} {installment.currency}")
        return payment

    except Exception as e:
        logger.error(f"Error processing installment payment for {installment.id}: {e}")
        raise


async def backfill_installment_payments(
    db: AsyncSession,
    installment: Installment,
    from_date: datetime = None
) -> int:
    """
    Create historical payment records for an installment from first_payment_date to now.
    Used when linking a payment account with sync_historical enabled.

    Returns the number of payments created.
    """
    if from_date is None:
        from_date = installment.first_payment_date

    from_date = from_date.replace(tzinfo=None) if from_date.tzinfo else from_date
    now = datetime.utcnow()

    # Get existing payment numbers to avoid duplicates
    existing_result = await db.execute(
        select(InstallmentPayment.payment_number).where(
            InstallmentPayment.installment_id == installment.id
        )
    )
    existing_numbers = {row[0] for row in existing_result.fetchall()}

    # Calculate all payment dates from start to now
    frequency_delta = {
        "weekly": relativedelta(weeks=1),
        "biweekly": relativedelta(weeks=2),
        "monthly": relativedelta(months=1),
    }
    delta = frequency_delta.get(installment.frequency, relativedelta(months=1))

    payments_created = 0
    payments_skipped = 0
    payment_date = from_date

    for payment_num in range(1, installment.number_of_payments + 1):
        if payment_date > now:
            break

        if payment_num in existing_numbers:
            payments_skipped += 1
            payment_date = payment_date + delta
            continue

        try:
            await process_installment_payment(
                db=db,
                installment=installment,
                payment_number=payment_num,
                payment_date=payment_date,
                notes="Historical payment (backfilled)"
            )
            payments_created += 1
        except Exception as e:
            logger.error(f"Error creating backfill payment #{payment_num} for {installment.id}: {e}")

        payment_date = payment_date + delta

    logger.info(f"Backfilled {payments_created} payments for installment {installment.name} (skipped {payments_skipped} existing)")
    return payments_created


async def reverse_installment_payments(
    db: AsyncSession,
    installment_id: UUID,
    user_id: UUID
) -> int:
    """
    Reverse all payments for an installment (soft delete expenses, reverse transactions).
    Used when changing payment account with sync_historical.
    """
    from app.modules.savings.transaction_service import TransactionService

    # Get all payments for this installment
    result = await db.execute(
        select(InstallmentPayment).where(
            and_(
                InstallmentPayment.installment_id == installment_id,
                InstallmentPayment.user_id == user_id
            )
        )
    )
    payments = list(result.scalars().all())

    reversed_count = 0
    transaction_service = TransactionService(db)

    for payment in payments:
        try:
            # Reverse account transaction if exists
            if payment.account_transaction_id:
                await transaction_service.reverse_transaction(payment.account_transaction_id, user_id)

            # Soft delete the expense if exists
            if payment.expense_id:
                from app.modules.expenses.models import Expense
                expense_result = await db.execute(
                    select(Expense).where(Expense.id == payment.expense_id)
                )
                expense = expense_result.scalar_one_or_none()
                if expense:
                    expense.deleted_at = datetime.utcnow()
                    expense.is_active = False

            # Delete the payment record
            await db.delete(payment)
            reversed_count += 1

        except Exception as e:
            logger.error(f"Error reversing payment {payment.id}: {e}")

    # Update installment - reset payments_made and recalculate
    installment_result = await db.execute(
        select(Installment).where(Installment.id == installment_id)
    )
    installment = installment_result.scalar_one_or_none()
    if installment:
        installment.payments_made = 0
        installment.last_payment_date = None
        installment.remaining_balance = installment.total_amount
        installment.next_payment_date = calculate_next_installment_payment_date(
            installment.first_payment_date,
            installment.frequency,
            installment.number_of_payments
        )

    logger.info(f"Reversed {reversed_count} payments for installment {installment_id}")
    return reversed_count


async def mark_installment_completed(
    db: AsyncSession,
    installment: Installment
) -> Installment:
    """Mark an installment as completed (all payments made)."""
    installment.status = "completed"
    installment.is_active = False
    installment.remaining_balance = Decimal('0')
    installment.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(installment)

    logger.info(f"Marked installment {installment.name} as completed")
    return installment


async def mark_installment_defaulted(
    db: AsyncSession,
    installment: Installment,
    reason: str = None
) -> Installment:
    """Mark an installment as defaulted."""
    installment.status = "defaulted"
    installment.is_active = False
    installment.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(installment)

    logger.info(f"Marked installment {installment.name} as defaulted. Reason: {reason}")
    return installment


async def reactivate_installment(
    db: AsyncSession,
    installment: Installment
) -> Installment:
    """Reactivate a defaulted or completed installment."""
    installment.status = "active"
    installment.is_active = True
    installment.updated_at = datetime.utcnow()

    # Recalculate next payment date
    installment.next_payment_date = calculate_next_installment_payment_date(
        installment.first_payment_date,
        installment.frequency,
        installment.number_of_payments,
        datetime.utcnow()
    )

    await db.commit()
    await db.refresh(installment)

    logger.info(f"Reactivated installment {installment.name}")
    return installment


async def get_installment_payments(
    db: AsyncSession,
    installment_id: UUID,
    user_id: UUID,
    skip: int = 0,
    limit: int = 50
) -> Tuple[list[InstallmentPayment], int]:
    """Get payment history for an installment."""
    query = select(InstallmentPayment).where(
        and_(
            InstallmentPayment.installment_id == installment_id,
            InstallmentPayment.user_id == user_id
        )
    ).order_by(InstallmentPayment.payment_number.desc())

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    # Apply pagination
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    payments = list(result.scalars().all())

    return payments, total


async def get_due_installments(
    db: AsyncSession,
    as_of_date: datetime = None
) -> list[Installment]:
    """Get all installments with payments due on or before the given date."""
    if as_of_date is None:
        as_of_date = datetime.utcnow()

    as_of_date = as_of_date.replace(tzinfo=None) if as_of_date.tzinfo else as_of_date

    result = await db.execute(
        select(Installment).where(
            and_(
                Installment.is_active == True,
                Installment.status == "active",
                Installment.next_payment_date <= as_of_date
            )
        )
    )

    return list(result.scalars().all())


async def get_installments_for_reminder(
    db: AsyncSession,
    as_of_date: datetime = None
) -> list[Installment]:
    """Get installments that need payment reminders."""
    if as_of_date is None:
        as_of_date = datetime.utcnow()

    as_of_date = as_of_date.replace(tzinfo=None) if as_of_date.tzinfo else as_of_date

    result = await db.execute(
        select(Installment).where(
            and_(
                Installment.is_active == True,
                Installment.status == "active",
                Installment.next_payment_date.isnot(None)
            )
        )
    )

    installments = list(result.scalars().all())

    # Filter by reminder window and check if reminder was already sent
    reminders_due = []
    for inst in installments:
        if inst.next_payment_date is None:
            continue

        next_payment = inst.next_payment_date.replace(tzinfo=None) if inst.next_payment_date.tzinfo else inst.next_payment_date
        days_until = (next_payment - as_of_date).days

        # Check if within reminder window
        if 0 <= days_until <= inst.reminder_days_before:
            # Check if reminder was already sent for this period
            if inst.last_reminder_at is None:
                reminders_due.append(inst)
            else:
                last_reminder = inst.last_reminder_at.replace(tzinfo=None) if inst.last_reminder_at.tzinfo else inst.last_reminder_at
                # Only send if last reminder was before the current payment window
                if last_reminder < (next_payment - relativedelta(days=inst.reminder_days_before + 1)):
                    reminders_due.append(inst)

    return reminders_due
