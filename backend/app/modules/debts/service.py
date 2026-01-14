"""
Debts module service layer
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from typing import Optional, Tuple, List
from uuid import UUID
from decimal import Decimal
from datetime import datetime
from dateutil.relativedelta import relativedelta
import logging

from app.modules.debts.models import Debt, DebtPayment
from app.modules.debts.schemas import DebtCreate, DebtUpdate, DebtStats, RecordDebtPayment
from app.services.currency_service import CurrencyService

logger = logging.getLogger(__name__)


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
    data = debt_data.model_dump(exclude={'sync_historical'})
    sync_historical = debt_data.sync_historical

    # Remove timezone info from datetime fields
    if data.get('due_date') and hasattr(data['due_date'], 'replace'):
        data['due_date'] = data['due_date'].replace(tzinfo=None)
    if data.get('paid_date') and hasattr(data['paid_date'], 'replace'):
        data['paid_date'] = data['paid_date'].replace(tzinfo=None)
    if data.get('next_payment_date') and hasattr(data['next_payment_date'], 'replace'):
        data['next_payment_date'] = data['next_payment_date'].replace(tzinfo=None)

    debt = Debt(
        user_id=user_id,
        **data
    )
    db.add(debt)
    await db.commit()
    await db.refresh(debt)

    # If sync_historical and deposit account is linked, backfill payments
    if sync_historical and debt.deposit_account_id and debt.amount_paid > 0:
        await backfill_debt_payments(db, debt)
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
    is_active: Optional[bool] = None,
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

    if is_active is not None:
        conditions.append(Debt.is_active == is_active)

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
    sync_historical = update_data.pop('sync_historical', False)
    old_deposit_account_id = debt.deposit_account_id

    # Remove timezone info from datetime fields
    if 'due_date' in update_data and update_data['due_date'] and hasattr(update_data['due_date'], 'replace'):
        update_data['due_date'] = update_data['due_date'].replace(tzinfo=None)
    if 'paid_date' in update_data and update_data['paid_date'] and hasattr(update_data['paid_date'], 'replace'):
        update_data['paid_date'] = update_data['paid_date'].replace(tzinfo=None)
    if 'next_payment_date' in update_data and update_data['next_payment_date'] and hasattr(update_data['next_payment_date'], 'replace'):
        update_data['next_payment_date'] = update_data['next_payment_date'].replace(tzinfo=None)

    for field, value in update_data.items():
        setattr(debt, field, value)

    await db.commit()
    await db.refresh(debt)

    # If sync_historical and deposit account changed, reverse old payments and create new ones
    new_deposit_account_id = update_data.get('deposit_account_id')
    if sync_historical and new_deposit_account_id and new_deposit_account_id != old_deposit_account_id:
        # Reverse old payments if there were any
        if old_deposit_account_id:
            await reverse_debt_payments(db, debt_id, user_id)

        # Backfill with new account
        if debt.amount_paid > 0:
            await backfill_debt_payments(db, debt)

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

    # Get only active debts
    query = select(Debt).where(
        and_(
            Debt.user_id == user_id,
            Debt.deleted_at.is_(None),
            Debt.is_active == True
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


# ============================================================================
# Payment Functions
# ============================================================================

def calculate_next_payment_date(
    start_date: datetime,
    frequency: str,
    after_date: datetime = None
) -> datetime:
    """Calculate the next payment date based on frequency"""
    if after_date is None:
        after_date = datetime.utcnow()

    # Ensure no timezone
    start_date = start_date.replace(tzinfo=None) if start_date.tzinfo else start_date
    after_date = after_date.replace(tzinfo=None) if after_date.tzinfo else after_date

    frequency_map = {
        "weekly": relativedelta(weeks=1),
        "biweekly": relativedelta(weeks=2),
        "monthly": relativedelta(months=1),
        "quarterly": relativedelta(months=3),
        "annually": relativedelta(years=1),
    }

    delta = frequency_map.get(frequency, relativedelta(months=1))
    next_date = start_date

    while next_date <= after_date:
        next_date = next_date + delta

    return next_date


async def record_debt_payment(
    db: AsyncSession,
    debt: Debt,
    payment_data: RecordDebtPayment
) -> DebtPayment:
    """
    Record a payment received for a debt.
    Creates a deposit transaction if account is linked and deposit_to_account is True.
    """
    from app.modules.savings.transaction_service import TransactionService

    payment_date = payment_data.payment_date or datetime.utcnow()
    payment_date = payment_date.replace(tzinfo=None) if payment_date.tzinfo else payment_date

    amount = Decimal(str(payment_data.amount))
    balance_before = Decimal(str(debt.amount)) - Decimal(str(debt.amount_paid))
    balance_after = max(balance_before - amount, Decimal('0'))

    account_transaction_id = None

    # If auto_deposit or deposit_to_account is True and account is linked, create deposit
    if (debt.auto_deposit or payment_data.deposit_to_account) and debt.deposit_account_id:
        try:
            transaction_service = TransactionService(db)
            transaction = await transaction_service.create_deposit(
                account_id=debt.deposit_account_id,
                user_id=debt.user_id,
                amount=amount,
                description=f"Debt payment from: {debt.debtor_name}",
                source_type="debt",
                source_id=debt.id,
                transaction_date=payment_date,
                category="Debt Collection",
            )
            account_transaction_id = transaction.id
        except Exception as e:
            logger.warning(f"Failed to create deposit for debt {debt.id}: {e}")
            # Continue without the deposit - payment still recorded

    # Create payment record
    payment = DebtPayment(
        debt_id=debt.id,
        user_id=debt.user_id,
        amount=amount,
        currency=debt.currency,
        payment_date=payment_date,
        principal_amount=amount,  # For simplicity, whole amount is principal unless interest tracking is used
        interest_amount=Decimal('0'),
        balance_before=balance_before,
        balance_after=balance_after,
        account_transaction_id=account_transaction_id,
        status="completed",
        notes=payment_data.notes,
    )
    db.add(payment)

    # Update debt amount_paid
    debt.amount_paid = Decimal(str(debt.amount_paid)) + amount

    # Check if fully paid
    if debt.amount_paid >= debt.amount:
        debt.is_paid = True
        debt.paid_date = payment_date

    await db.flush()
    logger.info(f"Recorded debt payment from {debt.debtor_name}: {amount} {debt.currency}")
    return payment


async def get_debt_payments(
    db: AsyncSession,
    debt_id: UUID,
    user_id: UUID
) -> List[DebtPayment]:
    """Get all payments for a debt"""
    result = await db.execute(
        select(DebtPayment).where(
            and_(
                DebtPayment.debt_id == debt_id,
                DebtPayment.user_id == user_id
            )
        ).order_by(DebtPayment.payment_date.desc())
    )
    return list(result.scalars().all())


async def backfill_debt_payments(
    db: AsyncSession,
    debt: Debt
) -> int:
    """
    Create a single historical payment record for the amount_paid.
    Used when linking a deposit account with sync_historical enabled.

    Returns the number of payments created.
    """
    if not debt.deposit_account_id or debt.amount_paid <= 0:
        return 0

    from app.modules.savings.transaction_service import TransactionService

    # Check if there are already payments for this debt
    existing_result = await db.execute(
        select(func.count(DebtPayment.id)).where(
            DebtPayment.debt_id == debt.id
        )
    )
    existing_count = existing_result.scalar() or 0

    if existing_count > 0:
        logger.info(f"Debt {debt.id} already has {existing_count} payments, skipping backfill")
        return 0

    # Create a single historical payment for the amount already paid
    payment_date = debt.created_at or datetime.utcnow()
    payment_date = payment_date.replace(tzinfo=None) if payment_date.tzinfo else payment_date

    amount = Decimal(str(debt.amount_paid))
    balance_before = Decimal(str(debt.amount))
    balance_after = balance_before - amount

    account_transaction_id = None

    try:
        transaction_service = TransactionService(db)
        transaction = await transaction_service.create_deposit(
            account_id=debt.deposit_account_id,
            user_id=debt.user_id,
            amount=amount,
            description=f"Historical debt payment from: {debt.debtor_name}",
            source_type="debt",
            source_id=debt.id,
            transaction_date=payment_date,
            category="Debt Collection",
        )
        account_transaction_id = transaction.id
    except Exception as e:
        logger.warning(f"Failed to create backfill deposit for debt {debt.id}: {e}")

    payment = DebtPayment(
        debt_id=debt.id,
        user_id=debt.user_id,
        amount=amount,
        currency=debt.currency,
        payment_date=payment_date,
        principal_amount=amount,
        interest_amount=Decimal('0'),
        balance_before=balance_before,
        balance_after=balance_after,
        account_transaction_id=account_transaction_id,
        status="completed",
        notes="Historical payment (backfilled)",
    )
    db.add(payment)

    logger.info(f"Backfilled 1 payment for debt {debt.debtor_name}: {amount} {debt.currency}")
    return 1


async def reverse_debt_payments(
    db: AsyncSession,
    debt_id: UUID,
    user_id: UUID
) -> int:
    """
    Reverse all payments for a debt (reverse transactions, delete payment records).
    Used when changing deposit account with sync_historical.
    """
    from app.modules.savings.transaction_service import TransactionService

    # Get all payments for this debt
    result = await db.execute(
        select(DebtPayment).where(
            and_(
                DebtPayment.debt_id == debt_id,
                DebtPayment.user_id == user_id
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

            # Delete the payment record
            await db.delete(payment)
            reversed_count += 1
        except Exception as e:
            logger.error(f"Error reversing payment {payment.id}: {e}")

    logger.info(f"Reversed {reversed_count} payments for debt {debt_id}")
    return reversed_count


async def mark_debt_paid(
    db: AsyncSession,
    debt_id: UUID,
    user_id: UUID
) -> Optional[Debt]:
    """Mark a debt as fully paid"""
    debt = await get_debt(db, debt_id, user_id)
    if not debt:
        return None

    debt.is_paid = True
    debt.paid_date = datetime.utcnow()
    debt.amount_paid = debt.amount  # Mark as fully paid

    await db.commit()
    await db.refresh(debt)
    return debt


async def mark_debt_forgiven(
    db: AsyncSession,
    debt_id: UUID,
    user_id: UUID
) -> Optional[Debt]:
    """Mark a debt as forgiven (write off remaining balance)"""
    debt = await get_debt(db, debt_id, user_id)
    if not debt:
        return None

    debt.is_paid = True
    debt.paid_date = datetime.utcnow()
    debt.notes = (debt.notes or "") + "\n[Debt forgiven]"

    await db.commit()
    await db.refresh(debt)
    return debt
