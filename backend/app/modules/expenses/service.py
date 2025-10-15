"""
Expenses service layer
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case
from typing import Optional, List
from uuid import UUID
from decimal import Decimal

from app.modules.expenses.models import Expense, ExpenseFrequency
from app.modules.expenses.schemas import ExpenseCreate, ExpenseUpdate, ExpenseStats
from app.services.currency_service import CurrencyService


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
            expense.display_monthly_equivalent = converted_monthly if converted_monthly else expense.monthly_equivalent
        else:
            expense.display_monthly_equivalent = None
    else:
        # Fallback to original values if conversion fails
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


async def create_expense(
    db: AsyncSession,
    user_id: UUID,
    expense_data: ExpenseCreate
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
        monthly_equivalent=monthly_equiv
    )

    db.add(expense)
    await db.commit()
    await db.refresh(expense)
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

    # Update fields
    update_data = expense_data.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(expense, field, value)

    # Recalculate monthly equivalent if amount or frequency changed
    if 'amount' in update_data or 'frequency' in update_data:
        expense.monthly_equivalent = calculate_monthly_equivalent(
            expense.amount, expense.frequency
        )

    await db.commit()
    await db.refresh(expense)
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
    user_id: UUID
) -> ExpenseStats:
    """Calculate expense statistics"""
    # Get user preferences for display currency
    display_currency = await get_user_display_currency(db, user_id)

    # Get all expenses
    result = await db.execute(
        select(Expense).where(
            Expense.user_id == user_id
        )
    )
    expenses = result.scalars().all()

    # Convert all expenses to display currency
    currency_service = CurrencyService(db)

    total_expenses = len(expenses)
    active_expenses = sum(1 for e in expenses if e.is_active)

    # Calculate totals by frequency (in display currency)
    total_daily = Decimal(0)
    total_weekly = Decimal(0)
    total_monthly = Decimal(0)
    total_annual = Decimal(0)

    # Expenses by category
    expenses_by_category: dict[str, Decimal] = {}

    for expense in expenses:
        if not expense.is_active:
            continue

        # Convert amount to display currency
        if expense.currency == display_currency:
            converted_amount = expense.amount
            converted_monthly_equiv = expense.monthly_equivalent or Decimal(0)
        else:
            converted_amount = await currency_service.convert_amount(
                expense.amount,
                expense.currency,
                display_currency
            )
            if converted_amount is None:
                # Fallback to original if conversion fails
                converted_amount = expense.amount

            # Convert monthly equivalent too
            if expense.monthly_equivalent:
                converted_monthly_equiv = await currency_service.convert_amount(
                    expense.monthly_equivalent,
                    expense.currency,
                    display_currency
                )
                if converted_monthly_equiv is None:
                    converted_monthly_equiv = expense.monthly_equivalent
            else:
                converted_monthly_equiv = Decimal(0)

        amount = Decimal(str(converted_amount))

        # Add to total based on frequency
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

        # Add to category totals (using converted monthly equivalent)
        if expense.category:
            monthly_equiv = Decimal(str(converted_monthly_equiv))
            expenses_by_category[expense.category] = (
                expenses_by_category.get(expense.category, Decimal(0)) + monthly_equiv
            )

    # Convert everything to monthly/annual
    total_monthly_expense = (
        total_daily * Decimal(30) +
        total_weekly * Decimal(4.33) +
        total_monthly +
        total_annual / Decimal(12)
    )
    total_annual_expense = total_monthly_expense * Decimal(12)

    return ExpenseStats(
        total_expenses=total_expenses,
        active_expenses=active_expenses,
        total_daily_expense=total_daily,
        total_weekly_expense=total_weekly,
        total_monthly_expense=total_monthly_expense,
        total_annual_expense=total_annual_expense,
        expenses_by_category=expenses_by_category,
        currency=display_currency
    )
