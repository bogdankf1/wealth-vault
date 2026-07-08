"""Installment CRUD and status transitions."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from typing import Optional, Tuple
from uuid import UUID
from decimal import Decimal
from datetime import datetime
from app.modules.installments.models import Installment, InstallmentPayment
from app.modules.installments.schemas import (
    InstallmentCreate,
    InstallmentUpdate,
    InstallmentStats
)
from .common import calculate_end_date, calculate_next_installment_payment_date, calculate_payments_made, calculate_remaining_balance, logger
from .payments import backfill_installment_payments, reverse_installment_payments

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
