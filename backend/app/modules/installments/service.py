"""
Installments module service layer.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
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
    """Calculate the final payment date based on frequency and remaining payments."""
    remaining_payments = number_of_payments - payments_made

    # Ensure first_payment_date is naive
    if first_payment_date.tzinfo is not None:
        first_payment_date = first_payment_date.replace(tzinfo=None)

    if frequency == "weekly":
        delta = relativedelta(weeks=remaining_payments)
    elif frequency == "biweekly":
        delta = relativedelta(weeks=remaining_payments * 2)
    else:  # monthly
        delta = relativedelta(months=remaining_payments)

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
    user_id: UUID
) -> InstallmentStats:
    """Get installment statistics"""
    # Get all installments for the user
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
        # Total debt (remaining balance)
        if installment.remaining_balance:
            total_debt += installment.remaining_balance

        # Monthly payment (normalize based on frequency)
        if installment.is_active:
            multiplier = frequency_to_monthly.get(installment.frequency, Decimal('1'))
            monthly_equivalent = installment.amount_per_payment * multiplier
            monthly_payment += monthly_equivalent

        # Total paid
        paid = installment.amount_per_payment * Decimal(str(installment.payments_made))
        total_paid += paid

        # By category (remaining balance)
        if installment.category:
            category_balance = installment.remaining_balance or Decimal('0')
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
        currency="USD",  # For now, assume USD
        by_category=by_category,
        by_frequency=by_frequency,
        average_interest_rate=average_interest_rate,
        debt_free_date=debt_free_date
    )
