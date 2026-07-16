"""Expense statistics, history, and payment summaries."""
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from typing import Optional
from uuid import UUID
from decimal import Decimal
from app.modules.expenses.models import Expense, ExpenseFrequency, ExpenseStatus
from app.modules.expenses.schemas import (
    ExpenseStats,
    ExpenseHistoryResponse,
    MonthlyExpenseHistory,
    ExpensePaymentSummary
)
from app.services.currency_service import CurrencyService
from .common import get_user_display_currency

async def get_expense_stats(
    db: AsyncSession,
    user_id: UUID,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
) -> ExpenseStats:
    """
    Calculate expense statistics based on date range.

    For date-based calculation:
    - One-time expenses: included if their date falls within the range
    - Recurring expenses: included if their start_date/end_date overlaps with the range,
      and amount is calculated as monthly equivalent

    Example for October 2025:
    - Monthly expense (208 UAH): 208 UAH
    - Quarterly expense (24000 UAH): 8000 UAH (monthly equivalent)
    - One-time expense on Oct 10 (4500 UAH): 4500 UAH
    - Total: 208 + 8000 + 4500 = 12,708 UAH
    """
    # Get user preferences for display currency
    display_currency = await get_user_display_currency(db, user_id)

    # Frequency multipliers for calculating monthly equivalents
    frequency_to_monthly = {
        'daily': Decimal('30'),
        'weekly': Decimal('4.33333'),
        'biweekly': Decimal('2.16667'),
        'monthly': Decimal('1'),
        'quarterly': Decimal('0.333333'),
        'annually': Decimal('0.083333'),
    }

    # Remove timezone info to match database datetimes
    if start_date:
        start_date = start_date.replace(tzinfo=None)
    if end_date:
        end_date = end_date.replace(tzinfo=None)

    # Get all expenses
    result = await db.execute(
        select(Expense).where(
            Expense.user_id == user_id
        )
    )
    expenses = result.scalars().all()

    currency_service = CurrencyService(db)

    # Calculate totals
    total_daily = Decimal(0)
    total_weekly = Decimal(0)
    total_monthly = Decimal(0)
    total_annual = Decimal(0)
    total_one_time = Decimal(0)  # Track one-time expenses separately
    expenses_by_category: dict[str, Decimal] = {}

    # Track filtered counts
    filtered_expenses_count = 0
    filtered_active_count = 0

    for expense in expenses:
        if not expense.is_active:
            continue

        # Check if expense is within date range (if dates provided)
        if start_date and end_date:
            expense_in_range = False

            if expense.frequency == 'one_time':
                # One-time expenses: check if date is within range
                if expense.date:
                    expense_date = expense.date.replace(tzinfo=None) if expense.date.tzinfo else expense.date
                    if start_date <= expense_date <= end_date:
                        expense_in_range = True
            else:
                # Recurring expenses: check if start_date/end_date overlaps with range
                expense_start = expense.start_date.replace(tzinfo=None) if expense.start_date and expense.start_date.tzinfo else expense.start_date
                expense_end = expense.end_date.replace(tzinfo=None) if expense.end_date and expense.end_date.tzinfo else expense.end_date

                if expense_start:
                    # Expense starts before or during the range
                    if expense_end:
                        # Has end date: check overlap
                        if expense_start <= end_date and expense_end >= start_date:
                            expense_in_range = True
                    else:
                        # No end date: ongoing, check if it started before range ends
                        if expense_start <= end_date:
                            expense_in_range = True

            if not expense_in_range:
                continue

        # Count this expense as it passed the filter
        filtered_expenses_count += 1
        filtered_active_count += 1

        # Convert amount to display currency
        if expense.currency == display_currency:
            converted_amount = expense.amount
        else:
            converted_amount = await currency_service.convert_amount(
                expense.amount,
                expense.currency,
                display_currency
            )
            if converted_amount is None:
                converted_amount = expense.amount

        amount = Decimal(str(converted_amount))

        # Calculate monthly equivalent for the total
        if expense.frequency == 'one_time':
            # One-time expenses: use full amount and track separately
            monthly_equiv = amount
            total_one_time += amount
        else:
            # Recurring expenses: convert to monthly equivalent
            multiplier = frequency_to_monthly.get(expense.frequency, Decimal('1'))
            monthly_equiv = amount * multiplier

        # Add to frequency-specific totals (for backward compatibility)
        if expense.frequency == ExpenseFrequency.DAILY:
            total_daily += amount
        elif expense.frequency == ExpenseFrequency.WEEKLY:
            total_weekly += amount
        elif expense.frequency == ExpenseFrequency.BIWEEKLY:
            total_weekly += amount / Decimal(2)
        elif expense.frequency == ExpenseFrequency.MONTHLY:
            total_monthly += amount
        elif expense.frequency == ExpenseFrequency.QUARTERLY:
            total_monthly += amount / Decimal(3)
        elif expense.frequency == ExpenseFrequency.ANNUALLY:
            total_annual += amount

        # Add to category totals
        if expense.category:
            expenses_by_category[expense.category] = (
                expenses_by_category.get(expense.category, Decimal(0)) + monthly_equiv
            )

    # Convert everything to monthly/annual
    # Include one-time expenses in the total when date range is provided
    total_monthly_expense = (
        total_daily * Decimal(30) +
        total_weekly * Decimal(4.33) +
        total_monthly +
        total_annual / Decimal(12) +
        total_one_time  # Add one-time expenses to the monthly total
    )
    total_annual_expense = total_monthly_expense * Decimal(12)

    # Calculate daily and weekly equivalents from monthly total
    total_daily_expense = total_monthly_expense / Decimal(30)
    total_weekly_expense = total_monthly_expense * Decimal(7) / Decimal(30)

    # Use filtered counts if date range was provided, otherwise use all counts
    if start_date and end_date:
        total_expenses = filtered_expenses_count
        active_expenses = filtered_active_count
    else:
        total_expenses = len(expenses)
        active_expenses = sum(1 for e in expenses if e.is_active)

    return ExpenseStats(
        total_expenses=total_expenses,
        active_expenses=active_expenses,
        total_daily_expense=total_daily_expense,
        total_weekly_expense=total_weekly_expense,
        total_monthly_expense=total_monthly_expense,
        total_annual_expense=total_annual_expense,
        expenses_by_category=expenses_by_category,
        currency=display_currency
    )

async def get_expense_history(
    db: AsyncSession,
    user_id: UUID,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
) -> ExpenseHistoryResponse:
    """
    Get expense history grouped by month.

    Returns monthly totals and counts of expenses, along with overall average.
    Only includes active expenses.
    """
    from collections import defaultdict
    from dateutil.relativedelta import relativedelta

    # Get user preferences for display currency
    display_currency = await get_user_display_currency(db, user_id)

    # Frequency multipliers for calculating monthly equivalents
    frequency_to_monthly = {
        'daily': Decimal('30'),
        'weekly': Decimal('4.33333'),
        'biweekly': Decimal('2.16667'),
        'monthly': Decimal('1'),
        'quarterly': Decimal('0.333333'),
        'annually': Decimal('0.083333'),
    }

    # Remove timezone info to match database datetimes
    if start_date:
        start_date = start_date.replace(tzinfo=None)
    if end_date:
        end_date = end_date.replace(tzinfo=None)

    # Get all active expenses
    result = await db.execute(
        select(Expense).where(
            Expense.user_id == user_id,
            Expense.is_active == True
        )
    )
    expenses = result.scalars().all()

    currency_service = CurrencyService(db)

    # Dictionary to store monthly data: {month: {"total": Decimal, "count": int}}
    monthly_data = defaultdict(lambda: {"total": Decimal(0), "count": 0})

    for expense in expenses:
        # Convert amount to display currency
        if expense.currency == display_currency:
            converted_amount = expense.amount
        else:
            converted_amount = await currency_service.convert_amount(
                expense.amount,
                expense.currency,
                display_currency
            )
            if converted_amount is None:
                converted_amount = expense.amount

        amount = Decimal(str(converted_amount))

        if expense.frequency == 'one_time':
            # One-time expenses: add to the month they occurred
            if expense.date:
                expense_date = expense.date.replace(tzinfo=None) if expense.date.tzinfo else expense.date

                # Filter by date range if provided
                if start_date and end_date:
                    if not (start_date <= expense_date <= end_date):
                        continue

                month_key = expense_date.strftime('%Y-%m')
                monthly_data[month_key]["total"] += amount
                monthly_data[month_key]["count"] += 1
        else:
            # Recurring expenses: add monthly equivalent to each month in range
            if not expense.start_date:
                continue

            expense_start = expense.start_date.replace(tzinfo=None) if expense.start_date.tzinfo else expense.start_date
            expense_end = expense.end_date.replace(tzinfo=None) if expense.end_date and expense.end_date.tzinfo else expense.end_date

            # Calculate monthly equivalent
            multiplier = frequency_to_monthly.get(expense.frequency, Decimal('1'))
            monthly_equiv = amount * multiplier

            # Determine date range for this expense
            range_start = max(expense_start, start_date) if start_date else expense_start
            range_end = min(expense_end, end_date) if expense_end and end_date else (expense_end or end_date)

            # If no end date for expense and no filter end date, use current date + 12 months
            if not range_end:
                range_end = datetime.now() + relativedelta(months=12)

            # Generate months for this recurring expense
            current_month = range_start.replace(day=1)
            end_month = range_end.replace(day=1)

            while current_month <= end_month:
                month_key = current_month.strftime('%Y-%m')
                monthly_data[month_key]["total"] += monthly_equiv
                monthly_data[month_key]["count"] += 1
                current_month += relativedelta(months=1)

    # Convert to list and sort by month
    history = [
        MonthlyExpenseHistory(
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

    return ExpenseHistoryResponse(
        history=history,
        total_months=total_months,
        overall_average=overall_average,
        currency=display_currency
    )

async def get_expense_payment_summary(
    db: AsyncSession,
    user_id: UUID
) -> ExpensePaymentSummary:
    """Get payment summary for a user's expenses."""
    display_currency = await get_user_display_currency(db, user_id)
    currency_service = CurrencyService(db)

    # Get all active expenses
    result = await db.execute(
        select(Expense).where(
            and_(
                Expense.user_id == user_id,
                Expense.is_active == True,
                Expense.deleted_at.is_(None)
            )
        )
    )
    expenses = result.scalars().all()

    total_pending = 0
    total_paid = 0
    total_overdue = 0
    pending_amount = Decimal(0)
    paid_amount = Decimal(0)
    overdue_amount = Decimal(0)

    for expense in expenses:
        # Convert amount to display currency
        if expense.currency == display_currency:
            amount = expense.amount
            paid = expense.paid_amount or Decimal(0)
        else:
            amount = await currency_service.convert_amount(
                expense.amount,
                expense.currency,
                display_currency
            )
            if amount is None:
                amount = expense.amount

            if expense.paid_amount:
                paid = await currency_service.convert_amount(
                    expense.paid_amount,
                    expense.currency,
                    display_currency
                )
                if paid is None:
                    paid = expense.paid_amount
            else:
                paid = Decimal(0)

        if expense.status == ExpenseStatus.PENDING.value:
            total_pending += 1
            pending_amount += amount
        elif expense.status == ExpenseStatus.PAID.value:
            total_paid += 1
            paid_amount += paid
        elif expense.status == ExpenseStatus.OVERDUE.value:
            total_overdue += 1
            overdue_amount += amount

    return ExpensePaymentSummary(
        total_pending=total_pending,
        total_paid=total_paid,
        total_overdue=total_overdue,
        pending_amount=pending_amount,
        paid_amount=paid_amount,
        overdue_amount=overdue_amount,
        currency=display_currency
    )
