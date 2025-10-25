"""
Debts module service layer
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from typing import Optional, Tuple
from uuid import UUID
from decimal import Decimal
from datetime import datetime

from app.modules.debts.models import Debt
from app.modules.debts.schemas import DebtCreate, DebtUpdate, DebtStats
from app.services.currency_service import CurrencyService


async def get_user_display_currency(db: AsyncSession, user_id: UUID) -> str:
    """Get user's preferred display currency"""
    from app.models.user_preferences import UserPreferences
    prefs_result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user_id)
    )
    user_prefs = prefs_result.scalar_one_or_none()
    return user_prefs.display_currency if user_prefs and user_prefs.display_currency else "USD"


async def convert_debt_to_display_currency(db: AsyncSession, user_id: UUID, debt: Debt) -> None:
    """
    Convert debt amounts to user's display currency.
    Modifies the debt object in-place, adding display_* attributes.
    """
    display_currency = await get_user_display_currency(db, user_id)

    # If debt is already in display currency, no conversion needed
    if debt.currency == display_currency:
        debt.display_amount = debt.amount
        debt.display_amount_paid = debt.amount_paid
        debt.display_currency = display_currency
        return

    # Convert using currency service
    currency_service = CurrencyService(db)

    # Convert total amount
    converted_amount = await currency_service.convert_amount(
        debt.amount,
        debt.currency,
        display_currency
    )

    # Convert amount paid
    converted_amount_paid = await currency_service.convert_amount(
        debt.amount_paid,
        debt.currency,
        display_currency
    )

    # Set converted values as display values
    if converted_amount is not None and converted_amount_paid is not None:
        debt.display_amount = converted_amount
        debt.display_amount_paid = converted_amount_paid
        debt.display_currency = display_currency
    else:
        # Fallback to original values if conversion fails
        debt.display_amount = debt.amount
        debt.display_amount_paid = debt.amount_paid
        debt.display_currency = debt.currency


async def create_debt(
    db: AsyncSession,
    user_id: UUID,
    debt_data: DebtCreate
) -> Debt:
    """Create a new debt"""
    data = debt_data.model_dump()

    # Remove timezone info from datetime fields
    if data.get('due_date') and hasattr(data['due_date'], 'replace'):
        data['due_date'] = data['due_date'].replace(tzinfo=None)
    if data.get('paid_date') and hasattr(data['paid_date'], 'replace'):
        data['paid_date'] = data['paid_date'].replace(tzinfo=None)

    debt = Debt(
        user_id=user_id,
        **data
    )
    db.add(debt)
    await db.commit()
    await db.refresh(debt)
    return debt


async def get_debt(
    db: AsyncSession,
    debt_id: UUID,
    user_id: UUID
) -> Optional[Debt]:
    """Get a debt by ID"""
    query = select(Debt).where(
        and_(
            Debt.id == debt_id,
            Debt.user_id == user_id,
            Debt.deleted_at.is_(None)
        )
    )
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_debts(
    db: AsyncSession,
    user_id: UUID,
    is_paid: Optional[bool] = None,
    skip: int = 0,
    limit: int = 100
) -> Tuple[list[Debt], int]:
    """Get all debts for a user with optional filters"""
    conditions = [
        Debt.user_id == user_id,
        Debt.deleted_at.is_(None)
    ]

    if is_paid is not None:
        conditions.append(Debt.is_paid == is_paid)

    # Count query
    count_query = select(func.count(Debt.id)).where(and_(*conditions))
    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0

    # Data query
    query = (
        select(Debt)
        .where(and_(*conditions))
        .order_by(Debt.created_at.desc())
        .offset(skip)
        .limit(limit)
    )

    result = await db.execute(query)
    debts = list(result.scalars().all())

    return debts, total


async def update_debt(
    db: AsyncSession,
    debt_id: UUID,
    user_id: UUID,
    debt_data: DebtUpdate
) -> Optional[Debt]:
    """Update a debt"""
    debt = await get_debt(db, debt_id, user_id)
    if not debt:
        return None

    update_data = debt_data.model_dump(exclude_unset=True)

    # Remove timezone info from datetime fields
    if 'due_date' in update_data and update_data['due_date'] and hasattr(update_data['due_date'], 'replace'):
        update_data['due_date'] = update_data['due_date'].replace(tzinfo=None)
    if 'paid_date' in update_data and update_data['paid_date'] and hasattr(update_data['paid_date'], 'replace'):
        update_data['paid_date'] = update_data['paid_date'].replace(tzinfo=None)

    for field, value in update_data.items():
        setattr(debt, field, value)

    await db.commit()
    await db.refresh(debt)
    return debt


async def delete_debt(
    db: AsyncSession,
    debt_id: UUID,
    user_id: UUID
) -> bool:
    """Soft delete a debt"""
    debt = await get_debt(db, debt_id, user_id)
    if not debt:
        return False

    debt.deleted_at = datetime.utcnow()
    await db.commit()
    return True


async def get_debt_stats(
    db: AsyncSession,
    user_id: UUID
) -> DebtStats:
    """Get debt statistics"""
    display_currency = await get_user_display_currency(db, user_id)
    currency_service = CurrencyService(db)

    # Get all non-deleted debts
    query = select(Debt).where(
        and_(
            Debt.user_id == user_id,
            Debt.deleted_at.is_(None)
        )
    )
    result = await db.execute(query)
    debts = list(result.scalars().all())

    total_debts = len(debts)
    active_debts = 0
    paid_debts = 0
    total_amount_owed = Decimal("0")
    total_amount_paid = Decimal("0")
    overdue_debts = 0

    now = datetime.utcnow()

    for debt in debts:
        # Convert to display currency
        amount_in_display = debt.amount
        if debt.currency != display_currency:
            converted = await currency_service.convert_amount(
                debt.amount,
                debt.currency,
                display_currency
            )
            if converted is not None:
                amount_in_display = converted

        if debt.is_paid:
            paid_debts += 1
            total_amount_paid += amount_in_display
        else:
            active_debts += 1
            total_amount_owed += amount_in_display

            # Check if overdue
            if debt.due_date and now > debt.due_date:
                overdue_debts += 1

    return DebtStats(
        total_debts=total_debts,
        active_debts=active_debts,
        paid_debts=paid_debts,
        total_amount_owed=total_amount_owed,
        total_amount_paid=total_amount_paid,
        overdue_debts=overdue_debts,
        currency=display_currency
    )
