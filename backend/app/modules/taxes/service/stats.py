"""Tax statistics and income-tax summaries."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from uuid import UUID
from decimal import Decimal
from app.modules.taxes.models import Tax
from app.modules.taxes.schemas import (
    TaxStats
)
from app.services.currency_service import CurrencyService
from .common import get_total_monthly_income, get_user_display_currency

async def get_tax_stats(
    db: AsyncSession,
    user_id: UUID
) -> TaxStats:
    """Get tax statistics"""
    display_currency = await get_user_display_currency(db, user_id)
    currency_service = CurrencyService(db)

    # Get only active taxes with income source relationship
    query = (
        select(Tax)
        .options(selectinload(Tax.income_source))
        .where(
            and_(
                Tax.user_id == user_id,
                Tax.deleted_at.is_(None),
                Tax.is_active == True
            )
        )
    )
    result = await db.execute(query)
    taxes = list(result.scalars().all())

    total_taxes = len(taxes)
    active_taxes = len(taxes)
    total_tax_amount = Decimal("0")
    total_fixed_taxes = Decimal("0")
    total_percentage_taxes = Decimal("0")

    for tax in taxes:
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
            # Get income for this specific source or all sources
            income = await get_total_monthly_income(
                db, user_id,
                income_source_id=tax.income_source_id
            )
            # Calculate percentage of income
            tax_amount = (income * tax.percentage) / Decimal("100")
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

async def get_income_tax_summary(
    db: AsyncSession,
    user_id: UUID
) -> list[dict]:
    """
    Get a summary of income sources and their associated taxes.
    Returns a list of income sources with their applicable taxes.
    """
    from app.modules.income.models import IncomeSource

    display_currency = await get_user_display_currency(db, user_id)
    currency_service = CurrencyService(db)

    # Get all active income sources
    income_query = select(IncomeSource).where(
        and_(
            IncomeSource.user_id == user_id,
            IncomeSource.is_active == True,
            IncomeSource.deleted_at.is_(None)
        )
    )
    income_result = await db.execute(income_query)
    income_sources = list(income_result.scalars().all())

    # Get all active taxes with income source relationships
    tax_query = (
        select(Tax)
        .options(selectinload(Tax.income_source))
        .where(
            and_(
                Tax.user_id == user_id,
                Tax.is_active == True,
                Tax.deleted_at.is_(None)
            )
        )
    )
    tax_result = await db.execute(tax_query)
    taxes = list(tax_result.scalars().all())

    # Separate taxes by whether they apply to specific income or all income
    global_taxes = [t for t in taxes if t.income_source_id is None]
    specific_taxes = {t.income_source_id: [] for t in taxes if t.income_source_id}
    for t in taxes:
        if t.income_source_id:
            specific_taxes[t.income_source_id].append(t)

    summary = []
    for source in income_sources:
        # Convert income to display currency
        monthly_income = source.calculate_monthly_amount()
        if source.currency != display_currency:
            converted = await currency_service.convert_amount(
                monthly_income,
                source.currency,
                display_currency
            )
            if converted is not None:
                monthly_income = Decimal(str(converted))

        # Get applicable taxes (specific to this source + global)
        applicable_taxes = specific_taxes.get(source.id, []) + global_taxes

        taxes_breakdown = []
        total_tax = Decimal("0")

        for tax in applicable_taxes:
            if tax.tax_type == "percentage" and tax.percentage:
                # For percentage taxes, calculate based on this income source only if specific
                # or all income if global
                if tax.income_source_id:
                    tax_amount = (monthly_income * tax.percentage) / Decimal("100")
                else:
                    # Global tax - still calculate based on this source's portion
                    tax_amount = (monthly_income * tax.percentage) / Decimal("100")

                taxes_breakdown.append({
                    "tax_id": str(tax.id),
                    "tax_name": tax.name,
                    "tax_type": tax.tax_type,
                    "percentage": float(tax.percentage),
                    "amount": float(tax_amount),
                    "is_global": tax.income_source_id is None
                })
                total_tax += tax_amount

            elif tax.tax_type == "fixed" and tax.fixed_amount:
                amount_in_display = tax.fixed_amount
                if tax.currency != display_currency:
                    converted = await currency_service.convert_amount(
                        tax.fixed_amount,
                        tax.currency,
                        display_currency
                    )
                    if converted is not None:
                        amount_in_display = Decimal(str(converted))

                taxes_breakdown.append({
                    "tax_id": str(tax.id),
                    "tax_name": tax.name,
                    "tax_type": tax.tax_type,
                    "fixed_amount": float(amount_in_display),
                    "amount": float(amount_in_display),
                    "is_global": tax.income_source_id is None
                })
                total_tax += amount_in_display

        summary.append({
            "income_source_id": str(source.id),
            "income_source_name": source.name,
            "monthly_income": float(monthly_income),
            "currency": display_currency,
            "taxes": taxes_breakdown,
            "total_tax": float(total_tax),
            "net_income": float(monthly_income - total_tax)
        })

    return summary
