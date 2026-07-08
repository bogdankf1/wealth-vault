"""Tax payment records and auto-pay processing."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from typing import Optional, Tuple
from uuid import UUID
from decimal import Decimal
from datetime import datetime
from app.modules.taxes.models import Tax, TaxPayment
from app.modules.taxes.schemas import (
    TaxCreate, TaxUpdate, TaxStats,
    TaxPaymentCreate, PayTaxRequest
)
from app.services.currency_service import CurrencyService
from .common import calculate_next_payment_date, get_total_monthly_income, get_user_display_currency
from .crud import get_tax

async def create_tax_payment(
    db: AsyncSession,
    user_id: UUID,
    payment_data: TaxPaymentCreate
) -> TaxPayment:
    """Create a new tax payment record"""
    # Verify the tax exists and belongs to user
    tax = await get_tax(db, payment_data.tax_id, user_id)
    if not tax:
        raise ValueError("Tax not found")

    payment = TaxPayment(
        user_id=user_id,
        tax_id=payment_data.tax_id,
        amount=payment_data.amount,
        currency=payment_data.currency,
        payment_date=payment_data.payment_date,
        period_start=payment_data.period_start,
        period_end=payment_data.period_end,
        notes=payment_data.notes,
        status="completed"
    )
    db.add(payment)
    await db.commit()
    await db.refresh(payment)
    return payment

async def get_tax_payments(
    db: AsyncSession,
    user_id: UUID,
    tax_id: Optional[UUID] = None,
    skip: int = 0,
    limit: int = 100
) -> Tuple[list[TaxPayment], int]:
    """Get tax payments for a user, optionally filtered by tax_id"""
    conditions = [TaxPayment.user_id == user_id]

    if tax_id:
        conditions.append(TaxPayment.tax_id == tax_id)

    # Count query
    count_query = select(func.count(TaxPayment.id)).where(and_(*conditions))
    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0

    # Data query
    query = (
        select(TaxPayment)
        .where(and_(*conditions))
        .order_by(TaxPayment.payment_date.desc())
        .offset(skip)
        .limit(limit)
    )

    result = await db.execute(query)
    payments = list(result.scalars().all())

    return payments, total

async def get_tax_payment(
    db: AsyncSession,
    payment_id: UUID,
    user_id: UUID
) -> Optional[TaxPayment]:
    """Get a specific tax payment"""
    query = select(TaxPayment).where(
        and_(
            TaxPayment.id == payment_id,
            TaxPayment.user_id == user_id
        )
    )
    result = await db.execute(query)
    return result.scalar_one_or_none()

async def delete_tax_payment(
    db: AsyncSession,
    payment_id: UUID,
    user_id: UUID
) -> bool:
    """Delete a tax payment"""
    payment = await get_tax_payment(db, payment_id, user_id)
    if not payment:
        return False

    await db.delete(payment)
    await db.commit()
    return True

async def get_taxes_due_for_auto_pay(
    db: AsyncSession,
    as_of: datetime = None
) -> list[Tax]:
    """Get all taxes that are due for auto-payment"""
    if as_of is None:
        as_of = datetime.utcnow()

    query = (
        select(Tax)
        .options(
            selectinload(Tax.income_source),
            selectinload(Tax.payment_account)
        )
        .where(
            and_(
                Tax.auto_pay == True,
                Tax.is_active == True,
                Tax.deleted_at.is_(None),
                Tax.payment_account_id.isnot(None),
                Tax.next_payment_date <= as_of
            )
        )
    )
    result = await db.execute(query)
    return list(result.scalars().all())

async def pay_tax(
    db: AsyncSession,
    user_id: UUID,
    tax_id: UUID,
    request: PayTaxRequest = None,
    is_auto_pay: bool = False
) -> Tuple[TaxPayment, Optional[UUID]]:
    """
    Pay a tax manually or via auto-pay.

    Args:
        db: Database session
        user_id: User ID
        tax_id: Tax ID to pay
        request: Optional payment request with custom account/amount
        is_auto_pay: Whether this is an auto-pay transaction

    Returns:
        Tuple of (TaxPayment record, transaction_id if created)
    """
    from app.modules.savings.models import SavingsAccount, AccountTransaction

    # Get the tax with relationships
    tax = await get_tax(db, tax_id, user_id)
    if not tax:
        raise ValueError("Tax not found")

    # Determine payment account
    account_id = None
    if request and request.account_id:
        account_id = request.account_id
    elif tax.payment_account_id:
        account_id = tax.payment_account_id

    if not account_id:
        raise ValueError("No payment account specified")

    # Get the payment account
    account_query = select(SavingsAccount).where(
        and_(
            SavingsAccount.id == account_id,
            SavingsAccount.user_id == user_id
        )
    )
    account_result = await db.execute(account_query)
    account = account_result.scalar_one_or_none()

    if not account:
        raise ValueError("Payment account not found")

    # Calculate payment amount
    display_currency = await get_user_display_currency(db, user_id)
    currency_service = CurrencyService(db)

    if request and request.amount:
        payment_amount = request.amount
    else:
        # Calculate tax amount
        if tax.tax_type == "fixed" and tax.fixed_amount:
            payment_amount = tax.fixed_amount
            # Convert if currencies differ
            if tax.currency != account.currency:
                converted = await currency_service.convert_amount(
                    tax.fixed_amount,
                    tax.currency,
                    account.currency
                )
                if converted is not None:
                    payment_amount = converted
        elif tax.tax_type == "percentage" and tax.percentage:
            # Get income and calculate percentage
            total_income = await get_total_monthly_income(
                db, user_id,
                income_source_id=tax.income_source_id
            )
            payment_amount = (total_income * tax.percentage) / Decimal("100")
            # Convert to account currency if needed
            if display_currency != account.currency:
                converted = await currency_service.convert_amount(
                    payment_amount,
                    display_currency,
                    account.currency
                )
                if converted is not None:
                    payment_amount = converted
        else:
            raise ValueError("Unable to calculate tax amount")

    # Check sufficient balance
    if account.current_balance < payment_amount:
        raise ValueError(f"Insufficient balance. Required: {payment_amount} {account.currency}, Available: {account.current_balance} {account.currency}")

    # Calculate balance before and after
    balance_before = account.current_balance
    balance_after = balance_before - payment_amount

    # Create withdrawal transaction
    transaction = AccountTransaction(
        account_id=account.id,
        user_id=user_id,
        transaction_type="withdrawal",
        amount=payment_amount,
        currency=account.currency,
        balance_before=balance_before,
        balance_after=balance_after,
        category="tax",
        description=f"Tax payment: {tax.name}" + (" (Auto-pay)" if is_auto_pay else ""),
        transaction_date=datetime.utcnow()
    )
    db.add(transaction)

    # Update account balance
    account.current_balance = balance_after
    account.updated_at = datetime.utcnow()

    # Flush to get transaction ID
    await db.flush()

    # Create tax payment record
    notes = request.notes if request and request.notes else None
    if is_auto_pay:
        notes = (notes + " - " if notes else "") + "Auto-pay"

    payment = TaxPayment(
        user_id=user_id,
        tax_id=tax_id,
        amount=payment_amount,
        currency=account.currency,
        payment_date=datetime.utcnow(),
        account_transaction_id=transaction.id,
        notes=notes,
        status="completed"
    )
    db.add(payment)

    # Update next payment date if auto-pay is enabled
    if tax.auto_pay:
        tax.next_payment_date = calculate_next_payment_date(tax.frequency)

    await db.commit()
    await db.refresh(payment)

    return payment, transaction.id
