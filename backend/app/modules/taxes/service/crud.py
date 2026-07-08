"""Tax CRUD operations."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from typing import Optional, Tuple
from uuid import UUID
from datetime import datetime
from app.modules.taxes.models import Tax, TaxPayment
from app.modules.taxes.schemas import (
    TaxCreate, TaxUpdate, TaxStats,
    TaxPaymentCreate, PayTaxRequest
)
from .common import calculate_next_payment_date

async def create_tax(
    db: AsyncSession,
    user_id: UUID,
    tax_data: TaxCreate
) -> Tax:
    """Create a new tax"""
    data = tax_data.model_dump()

    # If auto_pay is enabled and next_payment_date not set, calculate it
    if data.get('auto_pay') and not data.get('next_payment_date'):
        frequency = data.get('frequency', 'annually')
        data['next_payment_date'] = calculate_next_payment_date(frequency)

    tax = Tax(
        user_id=user_id,
        **data
    )
    db.add(tax)
    await db.commit()

    # Reload with relationships
    return await get_tax(db, tax.id, user_id)

async def get_tax(
    db: AsyncSession,
    tax_id: UUID,
    user_id: UUID
) -> Optional[Tax]:
    """Get a tax by ID with income source and payment account relationships loaded"""
    query = (
        select(Tax)
        .options(
            selectinload(Tax.income_source),
            selectinload(Tax.payment_account)
        )
        .where(
            and_(
                Tax.id == tax_id,
                Tax.user_id == user_id,
                Tax.deleted_at.is_(None)
            )
        )
    )
    result = await db.execute(query)
    return result.scalar_one_or_none()

async def get_taxes(
    db: AsyncSession,
    user_id: UUID,
    is_active: Optional[bool] = None,
    income_source_id: Optional[UUID] = None,
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

    if income_source_id is not None:
        conditions.append(Tax.income_source_id == income_source_id)

    # Count query
    count_query = select(func.count(Tax.id)).where(and_(*conditions))
    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0

    # Data query with income_source and payment_account relationships
    query = (
        select(Tax)
        .options(
            selectinload(Tax.income_source),
            selectinload(Tax.payment_account)
        )
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

    # If enabling auto_pay and no next_payment_date, calculate it
    enabling_auto_pay = update_data.get('auto_pay') and not tax.auto_pay
    has_no_payment_date = not update_data.get('next_payment_date') and not tax.next_payment_date
    if enabling_auto_pay and has_no_payment_date:
        frequency = update_data.get('frequency', tax.frequency)
        update_data['next_payment_date'] = calculate_next_payment_date(frequency)

    for field, value in update_data.items():
        setattr(tax, field, value)

    await db.commit()

    # Reload with relationships
    return await get_tax(db, tax_id, user_id)

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

async def batch_delete_taxes(
    db: AsyncSession,
    user_id: UUID,
    tax_ids: list[UUID]
) -> Tuple[int, list[UUID]]:
    """Batch delete taxes (soft delete)"""
    deleted_count = 0
    failed_ids = []

    for tax_id in tax_ids:
        success = await delete_tax(db, tax_id, user_id)
        if success:
            deleted_count += 1
        else:
            failed_ids.append(tax_id)

    return deleted_count, failed_ids
