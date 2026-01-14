"""
Taxes module service layer
"""
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
    TaxPaymentCreate, LinkedIncomeSourceInfo,
    PayTaxRequest
)
from app.services.currency_service import CurrencyService
from dateutil.relativedelta import relativedelta


async def get_user_display_currency(db: AsyncSession, user_id: UUID) -> str:
    """Get user's preferred display currency"""
    from app.models.user_preferences import UserPreferences
    prefs_result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user_id)
    )
    user_prefs = prefs_result.scalar_one_or_none()
    return user_prefs.display_currency if user_prefs and user_prefs.display_currency else "USD"


def get_current_period_range(frequency: str, reference_date: datetime = None) -> Tuple[datetime, datetime]:
    """
    Get the start and end dates of the current payment period based on frequency.

    Returns:
        Tuple of (period_start, period_end)
    """
    if reference_date is None:
        reference_date = datetime.utcnow()

    # Handle enum values
    freq_str = frequency.value if hasattr(frequency, 'value') else str(frequency)

    if freq_str == "monthly":
        # Current month
        period_start = reference_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        period_end = (period_start + relativedelta(months=1)) - relativedelta(seconds=1)
    elif freq_str == "quarterly":
        # Current quarter
        quarter = (reference_date.month - 1) // 3
        period_start = reference_date.replace(month=quarter * 3 + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
        period_end = (period_start + relativedelta(months=3)) - relativedelta(seconds=1)
    elif freq_str == "annually":
        # Current year
        period_start = reference_date.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        period_end = reference_date.replace(month=12, day=31, hour=23, minute=59, second=59, microsecond=999999)
    else:
        # Default to monthly
        period_start = reference_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        period_end = (period_start + relativedelta(months=1)) - relativedelta(seconds=1)

    return period_start, period_end


async def get_tax_payment_status(
    db: AsyncSession,
    tax: Tax,
    reference_date: datetime = None
) -> dict:
    """
    Check if a tax has been paid for the current period.

    Returns:
        dict with:
        - is_paid: bool - whether tax is paid for current period
        - period_start: datetime - start of current period
        - period_end: datetime - end of current period
        - last_payment_date: datetime or None - date of last payment in period
        - last_payment_amount: Decimal or None - amount of last payment
    """
    if reference_date is None:
        reference_date = datetime.utcnow()

    period_start, period_end = get_current_period_range(tax.frequency, reference_date)

    # Query for payments within the current period
    result = await db.execute(
        select(TaxPayment)
        .where(
            and_(
                TaxPayment.tax_id == tax.id,
                TaxPayment.status == "completed",
                TaxPayment.payment_date >= period_start,
                TaxPayment.payment_date <= period_end
            )
        )
        .order_by(TaxPayment.payment_date.desc())
        .limit(1)
    )
    payment = result.scalar_one_or_none()

    return {
        "is_paid": payment is not None,
        "period_start": period_start,
        "period_end": period_end,
        "last_payment_date": payment.payment_date if payment else None,
        "last_payment_amount": payment.amount if payment else None
    }


async def get_total_monthly_income(db: AsyncSession, user_id: UUID, income_source_id: Optional[UUID] = None) -> Decimal:
    """
    Get total monthly income for the user in display currency.
    If income_source_id is provided, only returns income from that source.
    """
    from app.modules.income.models import IncomeSource

    # Get user's display currency
    display_currency = await get_user_display_currency(db, user_id)
    currency_service = CurrencyService(db)

    conditions = [
        IncomeSource.user_id == user_id,
        IncomeSource.is_active == True,
        IncomeSource.deleted_at.is_(None)
    ]

    # Filter to specific income source if provided
    if income_source_id:
        conditions.append(IncomeSource.id == income_source_id)

    query = select(IncomeSource).where(and_(*conditions))
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
        elif source.frequency == "annually":
            total_income += amount_in_display / Decimal("12")
        elif source.frequency == "quarterly":
            total_income += amount_in_display / Decimal("3")

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
        # Get monthly income - either from specific source or all sources
        total_income = await get_total_monthly_income(
            db, user_id,
            income_source_id=tax.income_source_id  # Will filter to specific source if set
        )

        # Calculate tax amount as percentage of income
        tax_amount = (total_income * tax.percentage) / Decimal("100")

        tax.calculated_amount = tax_amount
        tax.display_currency = display_currency

    # Calculate payment status for current period
    payment_status = await get_tax_payment_status(db, tax)
    tax.is_paid_current_period = payment_status["is_paid"]
    tax.current_period_start = payment_status["period_start"]
    tax.current_period_end = payment_status["period_end"]
    tax.last_payment_date = payment_status["last_payment_date"]
    tax.last_payment_amount = payment_status["last_payment_amount"]


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


# ============================================================================
# Tax Payment Functions
# ============================================================================

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


# ============================================================================
# Auto-Pay and Manual Payment Functions
# ============================================================================

def calculate_next_payment_date(frequency, from_date: datetime = None) -> datetime:
    """Calculate the next payment date based on frequency"""
    if from_date is None:
        from_date = datetime.utcnow()

    # Handle both string and enum values
    freq_str = frequency.value if hasattr(frequency, 'value') else str(frequency)

    if freq_str == "monthly":
        return from_date + relativedelta(months=1)
    elif freq_str == "quarterly":
        return from_date + relativedelta(months=3)
    elif freq_str == "annually":
        return from_date + relativedelta(years=1)
    else:
        return from_date + relativedelta(months=1)  # Default to monthly


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
