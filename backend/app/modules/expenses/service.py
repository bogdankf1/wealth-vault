"""
Expenses service layer
"""
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from typing import Optional, List
from uuid import UUID
from decimal import Decimal
import logging

from app.modules.expenses.models import Expense, ExpenseFrequency, ExpenseStatus
from app.modules.expenses.schemas import (
    ExpenseCreate,
    ExpenseUpdate,
    ExpenseStats,
    ExpenseHistoryResponse,
    MonthlyExpenseHistory,
    PayExpenseRequest,
    PayExpenseResponse,
    ExpensePaymentSummary
)
from app.services.currency_service import CurrencyService
from app.core.events import event_dispatcher, ExpenseEvents

logger = logging.getLogger(__name__)


async def get_user_display_currency(db: AsyncSession, user_id: UUID) -> str:
    """Get user's preferred display currency"""
    from app.models.user_preferences import UserPreferences
    prefs_result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user_id)
    )
    user_prefs = prefs_result.scalar_one_or_none()
    return user_prefs.display_currency if user_prefs and user_prefs.display_currency else "USD"


async def convert_expense_to_display_currency(db: AsyncSession, user_id: UUID, expense: Expense) -> None:
    """
    Convert expense amount to user's display currency.
    Modifies the expense object in-place, adding display_amount and display_currency attributes.
    """
    display_currency = await get_user_display_currency(db, user_id)

    # If expense is already in display currency, no conversion needed
    if expense.currency == display_currency:
        expense.display_amount = expense.amount
        expense.display_currency = display_currency
        expense.display_monthly_equivalent = expense.monthly_equivalent
        return

    # Convert using currency service
    currency_service = CurrencyService(db)
    converted_amount = await currency_service.convert_amount(
        expense.amount,
        expense.currency,
        display_currency
    )

    # Set converted values as display values
    if converted_amount is not None:
        expense.display_amount = converted_amount
        expense.display_currency = display_currency

        # Also convert monthly equivalent
        if expense.monthly_equivalent:
            converted_monthly = await currency_service.convert_amount(
                expense.monthly_equivalent,
                expense.currency,
                display_currency
            )
            if converted_monthly:
                expense.display_monthly_equivalent = converted_monthly
            else:
                logger.warning(
                    f"Currency conversion failed for expense {expense.id} monthly equivalent: "
                    f"could not convert {expense.currency} to {display_currency}"
                )
                expense.display_monthly_equivalent = expense.monthly_equivalent
        else:
            expense.display_monthly_equivalent = None
    else:
        # Fallback to original values if conversion fails
        logger.warning(
            f"Currency conversion failed for expense {expense.id}: "
            f"could not convert {expense.currency} to {display_currency}. "
            f"Using original currency values."
        )
        expense.display_amount = expense.amount
        expense.display_currency = expense.currency
        expense.display_monthly_equivalent = expense.monthly_equivalent


def calculate_monthly_equivalent(amount: Decimal, frequency: ExpenseFrequency) -> Decimal:
    """Calculate monthly equivalent of expense based on frequency"""
    if frequency == ExpenseFrequency.ONE_TIME:
        return Decimal(0)
    elif frequency == ExpenseFrequency.DAILY:
        return amount * Decimal(30)
    elif frequency == ExpenseFrequency.WEEKLY:
        return amount * Decimal(4.33)
    elif frequency == ExpenseFrequency.BIWEEKLY:
        return amount * Decimal(2.17)
    elif frequency == ExpenseFrequency.MONTHLY:
        return amount
    elif frequency == ExpenseFrequency.QUARTERLY:
        return amount / Decimal(3)
    elif frequency == ExpenseFrequency.ANNUALLY:
        return amount / Decimal(12)
    return Decimal(0)


def get_frequency_interval(frequency: ExpenseFrequency):
    """Get the relativedelta interval for a given frequency."""
    from dateutil.relativedelta import relativedelta

    if frequency == ExpenseFrequency.DAILY:
        return relativedelta(days=1)
    elif frequency == ExpenseFrequency.WEEKLY:
        return relativedelta(weeks=1)
    elif frequency == ExpenseFrequency.BIWEEKLY:
        return relativedelta(weeks=2)
    elif frequency == ExpenseFrequency.MONTHLY:
        return relativedelta(months=1)
    elif frequency == ExpenseFrequency.QUARTERLY:
        return relativedelta(months=3)
    elif frequency == ExpenseFrequency.ANNUALLY:
        return relativedelta(years=1)
    return relativedelta(months=1)


async def backfill_expense_payments(
    db: AsyncSession,
    user_id: UUID,
    expense: Expense,
    skip_existing: bool = False
) -> int:
    """
    Backfill historical payments for a recurring expense.

    Creates withdrawal transactions for all past periods since start_date.
    Updates the expense with the most recent payment details.

    Args:
        db: Database session
        user_id: User ID
        expense: The expense to backfill
        skip_existing: If True, skip dates that already have transactions

    Returns:
        Number of payments created
    """
    from app.modules.savings.transaction_service import TransactionService
    from app.modules.savings.models import AccountTransaction, SavingsAccount
    from app.services.currency_service import CurrencyService

    if not expense.payment_account_id:
        return 0

    # Get account to check currency and prepare conversion if needed
    account_result = await db.execute(
        select(SavingsAccount).where(SavingsAccount.id == expense.payment_account_id)
    )
    account = account_result.scalar_one_or_none()
    if not account:
        return 0

    # Handle currency conversion if needed
    source_currency = None
    exchange_rate = None
    if expense.currency and expense.currency != account.currency:
        source_currency = expense.currency
        currency_service = CurrencyService(db)
        exchange_rate = await currency_service.get_exchange_rate(
            expense.currency, account.currency
        )
        if not exchange_rate:
            logger.warning(
                f"Could not get exchange rate from {expense.currency} to {account.currency} "
                f"for expense {expense.id}, using 1:1"
            )
            exchange_rate = Decimal("1")

    if expense.frequency == ExpenseFrequency.ONE_TIME:
        # For one-time expenses, just pay if date is in the past
        if expense.date and expense.date.date() <= datetime.utcnow().date():
            if expense.status != ExpenseStatus.PAID.value:
                try:
                    transaction_service = TransactionService(db)
                    transaction = await transaction_service.create_withdrawal(
                        account_id=expense.payment_account_id,
                        user_id=user_id,
                        amount=Decimal(str(expense.amount)),
                        description=f"Payment for expense: {expense.name}",
                        source_type="expense",
                        source_id=expense.id,
                        transaction_date=expense.date,
                        category=expense.category,
                        source_currency=source_currency,
                        exchange_rate=exchange_rate,
                    )

                    expense.status = ExpenseStatus.PAID.value
                    expense.paid_date = expense.date
                    expense.paid_amount = expense.amount
                    expense.account_transaction_id = transaction.id
                    await db.commit()
                    return 1
                except Exception as e:
                    logger.warning(f"Failed to backfill one-time expense {expense.id}: {e}")
                    return 0
        return 0

    # For recurring expenses
    if not expense.start_date:
        return 0

    today = datetime.utcnow().date()
    start_date = expense.start_date.replace(tzinfo=None) if expense.start_date.tzinfo else expense.start_date
    end_date = expense.end_date.replace(tzinfo=None) if expense.end_date and expense.end_date.tzinfo else expense.end_date

    # Get existing transaction dates to avoid duplicates
    existing_dates = set()
    if skip_existing:
        result = await db.execute(
            select(AccountTransaction.transaction_date).where(
                AccountTransaction.source_type == "expense",
                AccountTransaction.source_id == expense.id
            )
        )
        existing_dates = {txn_date.date() for txn_date in result.scalars().all() if txn_date}

    interval = get_frequency_interval(expense.frequency)
    current_date = start_date
    payments_created = 0
    transaction_service = TransactionService(db)

    last_payment_date = None
    last_payment_amount = None
    last_transaction_id = None

    while current_date.date() <= today:
        if end_date and current_date.date() > end_date.date():
            break

        # Skip if transaction already exists
        if current_date.date() in existing_dates:
            current_date = current_date + interval
            continue

        try:
            transaction = await transaction_service.create_withdrawal(
                account_id=expense.payment_account_id,
                user_id=user_id,
                amount=Decimal(str(expense.amount)),
                description=f"Payment for expense: {expense.name}",
                source_type="expense",
                source_id=expense.id,
                transaction_date=current_date,
                category=expense.category,
                source_currency=source_currency,
                exchange_rate=exchange_rate,
            )

            payments_created += 1
            last_payment_date = current_date
            last_payment_amount = expense.amount
            last_transaction_id = transaction.id

            logger.info(f"Created historical payment for expense {expense.id} on {current_date.date()}")

        except Exception as e:
            logger.warning(f"Failed to create payment for expense {expense.id} on {current_date.date()}: {e}")
            # Continue with next date even if one fails

        current_date = current_date + interval

    # Update expense with most recent payment details
    if payments_created > 0:
        expense.status = ExpenseStatus.PAID.value
        expense.paid_date = last_payment_date
        expense.paid_amount = last_payment_amount
        expense.account_transaction_id = last_transaction_id
        await db.commit()

    logger.info(f"Backfilled {payments_created} payments for expense {expense.id}")
    return payments_created


async def create_expense(
    db: AsyncSession,
    user_id: UUID,
    expense_data: ExpenseCreate,
    commit: bool = True,
) -> Expense:
    """Create a new expense"""

    # Calculate monthly equivalent
    monthly_equiv = calculate_monthly_equivalent(expense_data.amount, expense_data.frequency)

    expense = Expense(
        user_id=user_id,
        name=expense_data.name,
        description=expense_data.description,
        category=expense_data.category,
        amount=expense_data.amount,
        currency=expense_data.currency,
        frequency=expense_data.frequency,
        date=expense_data.date,
        start_date=expense_data.start_date,
        end_date=expense_data.end_date,
        is_active=expense_data.is_active,
        tags=expense_data.tags,
        monthly_equivalent=monthly_equiv,
        # Payment integration fields
        payment_account_id=expense_data.payment_account_id,
        payment_method=expense_data.payment_method,
        auto_pay=expense_data.auto_pay,
        status=ExpenseStatus.PENDING.value
    )

    db.add(expense)

    if not commit:
        # Caller owns the transaction (e.g. the agent action layer commits the entity and its
        # audit row atomically). Flush to emit the INSERT and populate the row, but do NOT commit.
        # Two side-effects of the committed path are deliberately skipped here:
        #  - payment backfill: moot — this path never sets auto_pay/payment_account_id.
        #  - the ExpenseEvents.CREATED dispatch: so the real-time over-budget Celery ALERT is not
        #    fired for agent-added expenses. Data stays correct (budget_status recomputes spend
        #    from the table); only the proactive alert is skipped. To restore it, dispatch
        #    ExpenseEvents.CREATED from the caller AFTER its commit.
        await db.flush()
        await db.refresh(expense)
        return expense

    await db.commit()
    await db.refresh(expense)

    # If auto_pay and sync_historical are enabled, backfill historical payments
    if expense_data.auto_pay and expense_data.sync_historical and expense_data.payment_account_id:
        await backfill_expense_payments(db, user_id, expense)

    # Dispatch expense created event for budget tracking
    await event_dispatcher.dispatch(
        ExpenseEvents.CREATED,
        user_id=user_id,
        expense_id=str(expense.id),
        category=expense.category,
        amount=float(expense.amount),
        currency=expense.currency,
        name=expense.name,
    )

    return expense


async def get_expense(
    db: AsyncSession,
    user_id: UUID,
    expense_id: UUID
) -> Optional[Expense]:
    """Get a single expense by ID"""
    result = await db.execute(
        select(Expense).where(
            Expense.id == expense_id,
            Expense.user_id == user_id
        )
    )
    expense = result.scalar_one_or_none()

    if expense:
        # Convert to user's display currency
        await convert_expense_to_display_currency(db, user_id, expense)

    return expense


async def list_expenses(
    db: AsyncSession,
    user_id: UUID,
    skip: int = 0,
    limit: int = 100,
    category: Optional[str] = None,
    is_active: Optional[bool] = None
) -> tuple[List[Expense], int]:
    """List expenses with pagination and filters"""
    query = select(Expense).where(Expense.user_id == user_id)

    # Apply filters
    if category:
        query = query.where(Expense.category == category)
    if is_active is not None:
        query = query.where(Expense.is_active == is_active)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query)

    # Apply pagination and ordering
    # Sort by the actual expense date (date for one-time, start_date for recurring)
    # Use COALESCE to handle both fields, with nulls last
    query = query.order_by(
        func.coalesce(Expense.date, Expense.start_date).desc(),
        Expense.created_at.desc()
    ).offset(skip).limit(limit)

    result = await db.execute(query)
    expenses = result.scalars().all()

    # Convert all expenses to user's display currency
    for expense in expenses:
        await convert_expense_to_display_currency(db, user_id, expense)

    return list(expenses), total or 0


async def update_expense(
    db: AsyncSession,
    user_id: UUID,
    expense_id: UUID,
    expense_data: ExpenseUpdate
) -> Optional[Expense]:
    """Update an expense"""
    expense = await get_expense(db, user_id, expense_id)
    if not expense:
        return None

    # Track previous auto_pay state to detect if it's being enabled
    was_auto_pay_enabled = expense.auto_pay and expense.payment_account_id

    # Extract sync_historical before updating fields (it's not a model field)
    sync_historical = expense_data.sync_historical

    # Update fields (excluding sync_historical which is not a model field)
    update_data = expense_data.model_dump(exclude_unset=True, exclude={'sync_historical'})

    for field, value in update_data.items():
        setattr(expense, field, value)

    # Recalculate monthly equivalent if amount or frequency changed
    if 'amount' in update_data or 'frequency' in update_data:
        expense.monthly_equivalent = calculate_monthly_equivalent(
            expense.amount, expense.frequency
        )

    await db.commit()
    await db.refresh(expense)

    # Check if auto_pay is now enabled
    is_auto_pay_enabled = expense.auto_pay and expense.payment_account_id

    # If sync_historical is True and auto_pay is enabled, backfill all payments
    if sync_historical and is_auto_pay_enabled:
        await backfill_expense_payments(db, user_id, expense, skip_existing=False)
    # If auto_pay was just enabled (without sync_historical), backfill missing payments
    elif is_auto_pay_enabled and not was_auto_pay_enabled:
        await backfill_expense_payments(db, user_id, expense, skip_existing=True)

    # Dispatch expense updated event for budget tracking (if amount or category changed)
    if 'amount' in update_data or 'category' in update_data:
        await event_dispatcher.dispatch(
            ExpenseEvents.UPDATED,
            user_id=user_id,
            expense_id=str(expense.id),
            category=expense.category,
            amount=float(expense.amount),
            currency=expense.currency,
            name=expense.name,
        )

    return expense


async def delete_expense(
    db: AsyncSession,
    user_id: UUID,
    expense_id: UUID
) -> bool:
    """Delete an expense"""
    expense = await get_expense(db, user_id, expense_id)
    if not expense:
        return False

    await db.delete(expense)
    await db.commit()
    return True


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


# ============================================================================
# Payment Integration Functions (Phase 3)
# ============================================================================

async def pay_expense(
    db: AsyncSession,
    user_id: UUID,
    expense_id: UUID,
    pay_request: PayExpenseRequest
) -> PayExpenseResponse:
    """
    Mark expense as paid and optionally deduct from linked account.

    Args:
        db: Database session
        user_id: User ID
        expense_id: Expense ID to pay
        pay_request: Payment request with optional account_id, amount, payment_method

    Returns:
        PayExpenseResponse with payment details

    Raises:
        ValueError: If expense not found or already paid
        InsufficientFundsError: If account has insufficient balance
    """
    from app.modules.savings.transaction_service import TransactionService, InsufficientFundsError

    # Get expense
    result = await db.execute(
        select(Expense).where(
            Expense.id == expense_id,
            Expense.user_id == user_id
        )
    )
    expense = result.scalar_one_or_none()

    if not expense:
        raise ValueError("Expense not found")

    if expense.status == ExpenseStatus.PAID.value:
        raise ValueError("Expense is already paid")

    # Determine payment details
    account_id = pay_request.account_id or expense.payment_account_id
    amount = pay_request.amount or expense.amount
    payment_method = pay_request.payment_method or expense.payment_method

    now = datetime.utcnow()
    account_transaction_id = None

    # If account specified, create withdrawal transaction
    if account_id:
        from app.modules.savings.models import SavingsAccount
        from app.services.currency_service import CurrencyService

        transaction_service = TransactionService(db)

        # Get account to check currency
        account_result = await db.execute(
            select(SavingsAccount).where(SavingsAccount.id == account_id)
        )
        account = account_result.scalar_one_or_none()

        # Handle currency conversion if needed
        source_currency = None
        exchange_rate = None
        if account and expense.currency and expense.currency != account.currency:
            source_currency = expense.currency
            currency_service = CurrencyService(db)
            exchange_rate = await currency_service.get_exchange_rate(
                expense.currency, account.currency
            )
            if not exchange_rate:
                logger.warning(
                    f"Could not get exchange rate from {expense.currency} to {account.currency} "
                    f"for expense {expense_id}, using 1:1"
                )
                exchange_rate = Decimal("1")

        try:
            # Create withdrawal from the linked account
            transaction = await transaction_service.create_withdrawal(
                account_id=account_id,
                user_id=user_id,
                amount=Decimal(str(amount)),
                description=pay_request.description or f"Payment for expense: {expense.name}",
                source_type="expense",
                source_id=expense_id,
                transaction_date=now,
                category=expense.category,
                source_currency=source_currency,
                exchange_rate=exchange_rate,
            )
            account_transaction_id = transaction.id
            logger.info(f"Created withdrawal transaction {transaction.id} for expense {expense_id}")
        except InsufficientFundsError as e:
            raise InsufficientFundsError(str(e))

    # Update expense status
    expense.status = ExpenseStatus.PAID.value
    expense.paid_date = now
    expense.paid_amount = amount
    expense.account_transaction_id = account_transaction_id
    expense.payment_method = payment_method
    expense.updated_at = now

    await db.commit()
    await db.refresh(expense)

    logger.info(f"Expense {expense_id} marked as paid")

    return PayExpenseResponse(
        expense_id=expense_id,
        account_transaction_id=account_transaction_id,
        paid_amount=amount,
        paid_date=now,
        status=ExpenseStatus.PAID.value,
        message="Expense paid successfully" + (
            " and deducted from account" if account_transaction_id else ""
        )
    )


async def get_pending_expenses(
    db: AsyncSession,
    user_id: UUID,
    skip: int = 0,
    limit: int = 100
) -> tuple[List[Expense], int]:
    """Get all pending expenses for a user."""
    query = select(Expense).where(
        and_(
            Expense.user_id == user_id,
            Expense.status == ExpenseStatus.PENDING.value,
            Expense.is_active == True,
            Expense.deleted_at.is_(None)
        )
    )

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query)

    # Apply pagination and ordering
    query = query.order_by(
        func.coalesce(Expense.date, Expense.start_date).asc()
    ).offset(skip).limit(limit)

    result = await db.execute(query)
    expenses = result.scalars().all()

    # Convert to display currency
    for expense in expenses:
        await convert_expense_to_display_currency(db, user_id, expense)

    return list(expenses), total or 0


async def get_overdue_expenses(
    db: AsyncSession,
    user_id: UUID,
    skip: int = 0,
    limit: int = 100
) -> tuple[List[Expense], int]:
    """Get all overdue expenses for a user."""
    query = select(Expense).where(
        and_(
            Expense.user_id == user_id,
            Expense.status == ExpenseStatus.OVERDUE.value,
            Expense.is_active == True,
            Expense.deleted_at.is_(None)
        )
    )

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query)

    # Apply pagination and ordering
    query = query.order_by(
        func.coalesce(Expense.date, Expense.start_date).asc()
    ).offset(skip).limit(limit)

    result = await db.execute(query)
    expenses = result.scalars().all()

    # Convert to display currency
    for expense in expenses:
        await convert_expense_to_display_currency(db, user_id, expense)

    return list(expenses), total or 0


async def mark_expenses_overdue(db: AsyncSession) -> int:
    """
    Mark pending expenses as overdue if their due date has passed.
    This is typically called by a Celery task.

    Returns:
        Number of expenses marked as overdue
    """
    now = datetime.utcnow()

    # Find pending expenses where the due date has passed
    result = await db.execute(
        select(Expense).where(
            and_(
                Expense.status == ExpenseStatus.PENDING.value,
                Expense.is_active == True,
                Expense.deleted_at.is_(None),
                # For one-time expenses, check date
                # For recurring expenses, check start_date
                func.coalesce(Expense.date, Expense.start_date) < now
            )
        )
    )
    expenses = result.scalars().all()

    count = 0
    for expense in expenses:
        expense.status = ExpenseStatus.OVERDUE.value
        expense.updated_at = now
        count += 1

    if count > 0:
        await db.commit()
        logger.info(f"Marked {count} expenses as overdue")

    return count


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


async def cancel_expense(
    db: AsyncSession,
    user_id: UUID,
    expense_id: UUID
) -> Optional[Expense]:
    """Cancel an expense (set status to cancelled)."""
    result = await db.execute(
        select(Expense).where(
            Expense.id == expense_id,
            Expense.user_id == user_id
        )
    )
    expense = result.scalar_one_or_none()

    if not expense:
        return None

    expense.status = ExpenseStatus.CANCELLED.value
    expense.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(expense)

    return expense


async def get_expense_with_account_name(
    db: AsyncSession,
    user_id: UUID,
    expense_id: UUID
) -> Optional[Expense]:
    """
    Get expense with joined payment account name for display.
    """
    from app.modules.savings.models import SavingsAccount

    result = await db.execute(
        select(Expense, SavingsAccount.name.label('payment_account_name'))
        .outerjoin(SavingsAccount, Expense.payment_account_id == SavingsAccount.id)
        .where(
            Expense.id == expense_id,
            Expense.user_id == user_id
        )
    )
    row = result.first()

    if not row:
        return None

    expense = row[0]
    expense.payment_account_name = row[1]

    # Convert to user's display currency
    await convert_expense_to_display_currency(db, user_id, expense)

    return expense


async def list_expenses_with_account_names(
    db: AsyncSession,
    user_id: UUID,
    skip: int = 0,
    limit: int = 100,
    category: Optional[str] = None,
    is_active: Optional[bool] = None,
    status: Optional[str] = None
) -> tuple[List[Expense], int]:
    """
    List expenses with pagination, filters, and joined account names.
    """
    from app.modules.savings.models import SavingsAccount

    # Build query with join
    query = (
        select(Expense, SavingsAccount.name.label('payment_account_name'))
        .outerjoin(SavingsAccount, Expense.payment_account_id == SavingsAccount.id)
        .where(
            Expense.user_id == user_id,
            Expense.deleted_at.is_(None)
        )
    )

    # Apply filters
    if category:
        query = query.where(Expense.category == category)
    if is_active is not None:
        query = query.where(Expense.is_active == is_active)
    if status:
        query = query.where(Expense.status == status)

    # Get total count
    count_query = select(func.count()).select_from(
        select(Expense).where(
            Expense.user_id == user_id,
            Expense.deleted_at.is_(None)
        ).subquery()
    )

    if category:
        count_query = select(func.count()).select_from(
            select(Expense).where(
                Expense.user_id == user_id,
                Expense.category == category,
                Expense.deleted_at.is_(None)
            ).subquery()
        )

    total = await db.scalar(count_query)

    # Apply pagination and ordering
    query = query.order_by(
        func.coalesce(Expense.date, Expense.start_date).desc(),
        Expense.created_at.desc()
    ).offset(skip).limit(limit)

    result = await db.execute(query)
    rows = result.all()

    expenses = []
    for row in rows:
        expense = row[0]
        expense.payment_account_name = row[1]
        await convert_expense_to_display_currency(db, user_id, expense)
        expenses.append(expense)

    return expenses, total or 0
