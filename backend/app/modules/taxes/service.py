"""
Taxes module service layer
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from typing import Optional, Tuple
from uuid import UUID
from decimal import Decimal
from datetime import datetime

from app.modules.taxes.models import Tax
from app.modules.taxes.schemas import TaxCreate, TaxUpdate, TaxStats
from app.services.currency_service import CurrencyService


async def get_user_display_currency(db: AsyncSession, user_id: UUID) -> str:
    """Get user's preferred display currency"""
    from app.models.user_preferences import UserPreferences
    prefs_result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user_id)
    )
    user_prefs = prefs_result.scalar_one_or_none()
    return user_prefs.display_currency if user_prefs and user_prefs.display_currency else "USD"


async def get_total_monthly_income(db: AsyncSession, user_id: UUID) -> Decimal:
    """Get total monthly income for the user in display currency"""
    from app.modules.income.models import IncomeSource

    # Get user's display currency
    display_currency = await get_user_display_currency(db, user_id)
    currency_service = CurrencyService(db)

    query = select(IncomeSource).where(
        and_(
            IncomeSource.user_id == user_id,
            IncomeSource.is_active == True,
            IncomeSource.deleted_at.is_(None)
        )
    )
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
        elif source.frequency == "annual":
            total_income += amount_in_display / Decimal("12")

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
        # Get total monthly income
        total_income = await get_total_monthly_income(db, user_id)

        # Calculate tax amount as percentage of income
        tax_amount = (total_income * tax.percentage) / Decimal("100")

        tax.calculated_amount = tax_amount
        tax.display_currency = display_currency


async def create_tax(
    db: AsyncSession,
    user_id: UUID,
    tax_data: TaxCreate
) -> Tax:
    """Create a new tax"""
    data = tax_data.model_dump()

    tax = Tax(
        user_id=user_id,
        **data
    )
    db.add(tax)
    await db.commit()
    await db.refresh(tax)
    return tax


async def get_tax(
    db: AsyncSession,
    tax_id: UUID,
    user_id: UUID
) -> Optional[Tax]:
    """Get a tax by ID"""
    query = select(Tax).where(
        and_(
            Tax.id == tax_id,
            Tax.user_id == user_id,
            Tax.deleted_at.is_(None)
        )
    )
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_taxes(
    db: AsyncSession,
    user_id: UUID,
    is_active: Optional[bool] = None,
    skip: int = 0,
    limit: int = 100
) -> Tuple[list[Tax], int]:
    """Get all taxes for a user with optional filters"""
    conditions = [
        Tax.user_id == user_id,
        Tax.deleted_at.is_(None)
    ]

    if is_active is not None:
        conditions.append(Tax.is_active == is_active)

    # Count query
    count_query = select(func.count(Tax.id)).where(and_(*conditions))
    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0

    # Data query
    query = (
        select(Tax)
        .where(and_(*conditions))
        .order_by(Tax.created_at.desc())
        .offset(skip)
        .limit(limit)
    )

    result = await db.execute(query)
    taxes = list(result.scalars().all())

    return taxes, total


async def update_tax(
    db: AsyncSession,
    tax_id: UUID,
    user_id: UUID,
    tax_data: TaxUpdate
) -> Optional[Tax]:
    """Update a tax"""
    tax = await get_tax(db, tax_id, user_id)
    if not tax:
        return None

    update_data = tax_data.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(tax, field, value)

    await db.commit()
    await db.refresh(tax)
    return tax


async def delete_tax(
    db: AsyncSession,
    tax_id: UUID,
    user_id: UUID
) -> bool:
    """Soft delete a tax"""
    tax = await get_tax(db, tax_id, user_id)
    if not tax:
        return False

    tax.deleted_at = datetime.utcnow()
    await db.commit()
    return True


async def get_tax_stats(
    db: AsyncSession,
    user_id: UUID
) -> TaxStats:
    """Get tax statistics"""
    display_currency = await get_user_display_currency(db, user_id)
    currency_service = CurrencyService(db)

    # Get all non-deleted taxes
    query = select(Tax).where(
        and_(
            Tax.user_id == user_id,
            Tax.deleted_at.is_(None)
        )
    )
    result = await db.execute(query)
    taxes = list(result.scalars().all())

    total_taxes = len(taxes)
    active_taxes = 0
    total_tax_amount = Decimal("0")
    total_fixed_taxes = Decimal("0")
    total_percentage_taxes = Decimal("0")

    # Get total monthly income for percentage calculations
    total_income = await get_total_monthly_income(db, user_id)

    for tax in taxes:
        if tax.is_active:
            active_taxes += 1

            if tax.tax_type == "fixed" and tax.fixed_amount:
                # Convert to display currency
                amount_in_display = tax.fixed_amount
                if tax.currency != display_currency:
                    converted = await currency_service.convert_amount(
                        tax.fixed_amount,
                        tax.currency,
                        display_currency
                    )
                    if converted is not None:
                        amount_in_display = converted

                total_fixed_taxes += amount_in_display
                total_tax_amount += amount_in_display

            elif tax.tax_type == "percentage" and tax.percentage:
                # Calculate percentage of income
                tax_amount = (total_income * tax.percentage) / Decimal("100")
                total_percentage_taxes += tax_amount
                total_tax_amount += tax_amount

    return TaxStats(
        total_taxes=total_taxes,
        active_taxes=active_taxes,
        total_tax_amount=total_tax_amount,
        total_fixed_taxes=total_fixed_taxes,
        total_percentage_taxes=total_percentage_taxes,
        currency=display_currency
    )
