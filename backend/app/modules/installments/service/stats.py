"""Installment statistics and history."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from typing import Optional, Tuple
from uuid import UUID
from decimal import Decimal
from datetime import datetime
from dateutil.relativedelta import relativedelta
from app.modules.installments.models import Installment, InstallmentPayment
from app.modules.installments.schemas import (
    InstallmentCreate,
    InstallmentUpdate,
    InstallmentStats
)
from app.services.currency_service import CurrencyService
from .common import get_user_display_currency

async def get_installment_stats(
    db: AsyncSession,
    user_id: UUID,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
) -> InstallmentStats:
    """Get installment statistics, optionally filtered by date range"""
    # Get display currency
    display_currency = await get_user_display_currency(db, user_id)
    currency_service = CurrencyService(db)

    # Get installments with optional date filtering
    if start_date and end_date:
        # Remove timezone info for comparison
        filter_start = start_date.replace(tzinfo=None)
        filter_end = end_date.replace(tzinfo=None)

        # When date filtering is applied, only get active installments
        # Installments overlap if: first_payment_date <= period_end AND (end_date is NULL OR end_date >= period_start)
        query = select(Installment).where(
            and_(
                Installment.user_id == user_id,
                Installment.is_active == True,
                Installment.first_payment_date <= filter_end,
                or_(
                    Installment.end_date.is_(None),
                    Installment.end_date >= filter_start
                )
            )
        )
    else:
        query = select(Installment).where(Installment.user_id == user_id)

    result = await db.execute(query)
    installments = result.scalars().all()

    # Calculate installment counts based on whether date filtering is applied
    if start_date and end_date:
        # When date range is provided, count only active installments in range
        total_installments = len(installments)
        active_installments = len(installments)
    else:
        # When no date range, count all installments and active installments separately
        from sqlalchemy import case
        all_installments_query = select(
            func.count(Installment.id).label("total"),
            func.sum(
                case((Installment.is_active == True, 1), else_=0)
            ).label("active")
        ).where(Installment.user_id == user_id)
        all_installments_result = await db.execute(all_installments_query)
        all_installments_stats = all_installments_result.one()
        total_installments = all_installments_stats.total or 0
        active_installments = all_installments_stats.active or 0

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
        # Check if installment is paid off
        is_paid_off = installment.payments_made >= installment.number_of_payments

        # Total debt (remaining balance) - convert to display currency
        if installment.remaining_balance:
            remaining_in_display = installment.remaining_balance
            if installment.currency != display_currency:
                converted = await currency_service.convert_amount(
                    installment.remaining_balance,
                    installment.currency,
                    display_currency
                )
                if converted is not None:
                    remaining_in_display = converted
            total_debt += remaining_in_display

        # Monthly payment (normalize based on frequency) - convert to display currency
        # Only include if active AND not paid off
        if installment.is_active and not is_paid_off:
            multiplier = frequency_to_monthly.get(installment.frequency, Decimal('1'))
            monthly_equivalent = installment.amount_per_payment * multiplier

            if installment.currency != display_currency:
                converted = await currency_service.convert_amount(
                    monthly_equivalent,
                    installment.currency,
                    display_currency
                )
                if converted is not None:
                    monthly_equivalent = converted
            monthly_payment += monthly_equivalent

        # Total paid - convert to display currency
        paid = installment.amount_per_payment * Decimal(str(installment.payments_made))
        if installment.currency != display_currency:
            converted = await currency_service.convert_amount(
                paid,
                installment.currency,
                display_currency
            )
            if converted is not None:
                paid = converted
        total_paid += paid

        # By category (remaining balance) - convert to display currency
        if installment.category:
            category_balance = installment.remaining_balance or Decimal('0')
            if installment.currency != display_currency and category_balance > 0:
                converted = await currency_service.convert_amount(
                    category_balance,
                    installment.currency,
                    display_currency
                )
                if converted is not None:
                    category_balance = converted
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
        currency=display_currency,
        by_category=by_category,
        by_frequency=by_frequency,
        average_interest_rate=average_interest_rate,
        debt_free_date=debt_free_date
    )

async def get_installment_history(
    db: AsyncSession,
    user_id: UUID,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
) -> dict:
    """Get installment payment history grouped by month."""
    from collections import defaultdict
    from dateutil.relativedelta import relativedelta
    from app.modules.installments.models import Installment
    from app.modules.installments.schemas import MonthlyInstallmentHistory, InstallmentHistoryResponse
    
    # Get user's display currency
    display_currency = await get_user_display_currency(db, user_id)
    
    # Frequency multipliers for monthly cost
    frequency_to_monthly = {
        'weekly': Decimal('4.33333'),
        'biweekly': Decimal('2.16667'),
        'monthly': Decimal('1'),
    }
    
    # Remove timezone info
    if start_date:
        start_date = start_date.replace(tzinfo=None)
    if end_date:
        end_date = end_date.replace(tzinfo=None)
    
    # Get all active installments
    result = await db.execute(
        select(Installment).where(
            Installment.user_id == user_id,
            Installment.is_active == True
        )
    )
    installments = result.scalars().all()
    
    currency_service = CurrencyService(db)
    monthly_data = defaultdict(lambda: {"total": Decimal(0), "count": 0})
    
    for installment in installments:
        # Check if installment is within date range (if dates provided)
        if start_date and end_date:
            installment_in_range = False

            # Installments are all recurring, check if first_payment_date/end_date overlaps with range
            installment_start = installment.first_payment_date.replace(tzinfo=None) if installment.first_payment_date and installment.first_payment_date.tzinfo else installment.first_payment_date
            installment_end = installment.end_date.replace(tzinfo=None) if installment.end_date and installment.end_date.tzinfo else installment.end_date

            if installment_start:
                # Installment starts before or during the range
                if installment_end:
                    # Has end date: check overlap
                    if installment_start <= end_date and installment_end >= start_date:
                        installment_in_range = True
                else:
                    # No end date: ongoing, check if it started before range ends
                    if installment_start <= end_date:
                        installment_in_range = True

            if not installment_in_range:
                continue

        # Convert to display currency
        if installment.currency == display_currency:
            converted_amount = installment.amount_per_payment
        else:
            converted_amount = await currency_service.convert_amount(
                installment.amount_per_payment, installment.currency, display_currency
            )
            if converted_amount is None:
                converted_amount = installment.amount_per_payment

        amount = Decimal(str(converted_amount))

        # Calculate monthly equivalent
        multiplier = frequency_to_monthly.get(installment.frequency, Decimal('1'))
        monthly_equiv = amount * multiplier

        if not installment.first_payment_date:
            continue
        
        installment_start = installment.first_payment_date.replace(tzinfo=None) if installment.first_payment_date.tzinfo else installment.first_payment_date
        installment_end = installment.end_date.replace(tzinfo=None) if installment.end_date and installment.end_date.tzinfo else installment.end_date
        
        # Determine date range
        range_start = max(installment_start, start_date) if start_date else installment_start
        range_end = min(installment_end, end_date) if installment_end and end_date else (installment_end or end_date)
        
        # If no end date, project to current date or end of filter range
        if not range_end:
            if end_date:
                range_end = end_date
            else:
                range_end = datetime.now()
        
        # Generate months
        current_month = range_start.replace(day=1)
        end_month = range_end.replace(day=1)
        
        while current_month <= end_month:
            month_key = current_month.strftime('%Y-%m')
            monthly_data[month_key]["total"] += monthly_equiv
            monthly_data[month_key]["count"] += 1
            current_month += relativedelta(months=1)
    
    # Convert to list and sort
    history = [
        MonthlyInstallmentHistory(
            month=month,
            total=data["total"],
            count=data["count"],
            currency=display_currency
        )
        for month, data in sorted(monthly_data.items())
    ]
    
    # Calculate overall average
    total_months = len(history)
    overall_average = Decimal(0)
    if total_months > 0:
        total_sum = sum(item.total for item in history)
        overall_average = total_sum / Decimal(total_months)
    
    return InstallmentHistoryResponse(
        history=history,
        total_months=total_months,
        overall_average=overall_average,
        currency=display_currency
    )
