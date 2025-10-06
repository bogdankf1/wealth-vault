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
    return result.scalar_one_or_none()


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
    query = query.order_by(Expense.created_at.desc()).offset(skip).limit(limit)

    result = await db.execute(query)
    expenses = result.scalars().all()

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
    # Get all active expenses
    result = await db.execute(
        select(Expense).where(
            Expense.user_id == user_id
        )
    )
    expenses = result.scalars().all()

    total_expenses = len(expenses)
    active_expenses = sum(1 for e in expenses if e.is_active)

    # Calculate totals by frequency
    total_daily = Decimal(0)
    total_weekly = Decimal(0)
    total_monthly = Decimal(0)
    total_annual = Decimal(0)

    # Expenses by category
    expenses_by_category: dict[str, Decimal] = {}

    for expense in expenses:
        if not expense.is_active:
            continue

        amount = Decimal(str(expense.amount))

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

        # Add to category totals (using monthly equivalent)
        if expense.category:
            monthly_equiv = Decimal(str(expense.monthly_equivalent or 0))
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
        currency="USD"
    )
