"""Shared helpers: currency conversion and installment math."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from uuid import UUID
from decimal import Decimal
from datetime import datetime
from dateutil.relativedelta import relativedelta
from app.modules.installments.models import Installment
from app.services.currency_service import CurrencyService
import logging

logger = logging.getLogger("app.modules.installments.service")

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
