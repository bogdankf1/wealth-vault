"""
Budget module service layer.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from typing import Optional
from uuid import UUID
from datetime import datetime
from decimal import Decimal

from app.modules.budgets.models import Budget, BudgetPeriod
from app.modules.budgets.schemas import (
    BudgetCreate,
    BudgetUpdate,
    BudgetResponse,
    BudgetWithProgress,
    BudgetStats,
    BudgetSummaryByCategory,
    BudgetOverviewResponse,
)
from app.modules.expenses.models import Expense
from app.services.currency_service import CurrencyService


async def get_user_display_currency(db: AsyncSession, user_id: UUID) -> str:
    """Get user's preferred display currency"""
    from app.models.user_preferences import UserPreferences
    prefs_result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user_id)
    )
    user_prefs = prefs_result.scalar_one_or_none()
    return user_prefs.display_currency if user_prefs and user_prefs.display_currency else "USD"


async def convert_budget_to_display_currency(db: AsyncSession, user_id: UUID, budget: Budget) -> None:
    """
    Convert budget amounts to user's display currency.
    Modifies the budget object in-place, adding display_* attributes.
    """
    display_currency = await get_user_display_currency(db, user_id)

    # If budget is already in display currency, no conversion needed
    if budget.currency == display_currency:
        budget.display_amount = budget.amount
        budget.display_currency = display_currency
        if hasattr(budget, 'spent') and budget.spent is not None:
            budget.display_spent = budget.spent
        if hasattr(budget, 'remaining') and budget.remaining is not None:
            budget.display_remaining = budget.remaining
        return

    # Convert using currency service
    currency_service = CurrencyService(db)

    # Convert budget amount
    converted_amount = await currency_service.convert_amount(
        budget.amount,
        budget.currency,
        display_currency
    )

    # Set converted values as display values
    if converted_amount is not None:
        budget.display_amount = converted_amount
        budget.display_currency = display_currency

        # Convert spent and remaining if they exist
        if hasattr(budget, 'spent') and budget.spent is not None:
            converted_spent = await currency_service.convert_amount(
                budget.spent,
                budget.currency,
                display_currency
            )
            budget.display_spent = converted_spent if converted_spent is not None else budget.spent

        if hasattr(budget, 'remaining') and budget.remaining is not None:
            converted_remaining = await currency_service.convert_amount(
                budget.remaining,
                budget.currency,
                display_currency
            )
            budget.display_remaining = converted_remaining if converted_remaining is not None else budget.remaining
    else:
        # Fallback to original values if conversion fails
        budget.display_amount = budget.amount
        budget.display_currency = budget.currency
        if hasattr(budget, 'spent'):
            budget.display_spent = budget.spent
        if hasattr(budget, 'remaining'):
            budget.display_remaining = budget.remaining


async def create_budget(
    db: AsyncSession,
    user_id: UUID,
    budget_data: BudgetCreate
) -> Budget:
    """Create a new budget."""
    data = budget_data.model_dump()

    # Remove timezone info from datetime fields to match database schema
    if data.get('start_date') and hasattr(data['start_date'], 'replace'):
        data['start_date'] = data['start_date'].replace(tzinfo=None)
    if data.get('end_date') and hasattr(data['end_date'], 'replace'):
        data['end_date'] = data['end_date'].replace(tzinfo=None)

    budget = Budget(
        user_id=user_id,
        **data
    )
    db.add(budget)
    await db.commit()
    await db.refresh(budget)
    return budget


async def get_budget(
    db: AsyncSession,
    budget_id: UUID,
    user_id: UUID
) -> Optional[Budget]:
    """Get a budget by ID."""
    query = select(Budget).where(
        and_(
            Budget.id == budget_id,
            Budget.user_id == user_id,
            Budget.deleted_at.is_(None)
        )
    )
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_budgets(
    db: AsyncSession,
    user_id: UUID,
    category: Optional[str] = None,
    period: Optional[BudgetPeriod] = None,
    is_active: Optional[bool] = None,
    skip: int = 0,
    limit: int = 100
) -> list[Budget]:
    """Get all budgets for a user with optional filters."""
    conditions = [
        Budget.user_id == user_id,
        Budget.deleted_at.is_(None)
    ]

    if category:
        conditions.append(Budget.category == category)
    if period:
        conditions.append(Budget.period == period)
    if is_active is not None:
        conditions.append(Budget.is_active == is_active)

    query = (
        select(Budget)
        .where(and_(*conditions))
        .order_by(Budget.start_date.desc())
        .offset(skip)
        .limit(limit)
    )

    result = await db.execute(query)
    return list(result.scalars().all())


async def update_budget(
    db: AsyncSession,
    budget_id: UUID,
    user_id: UUID,
    budget_data: BudgetUpdate
) -> Optional[Budget]:
    """Update a budget."""
    budget = await get_budget(db, budget_id, user_id)
    if not budget:
        return None

    update_data = budget_data.model_dump(exclude_unset=True)

    # Remove timezone info from datetime fields to match database schema
    if 'start_date' in update_data and update_data['start_date'] and hasattr(update_data['start_date'], 'replace'):
        update_data['start_date'] = update_data['start_date'].replace(tzinfo=None)
    if 'end_date' in update_data and update_data['end_date'] and hasattr(update_data['end_date'], 'replace'):
        update_data['end_date'] = update_data['end_date'].replace(tzinfo=None)

    for field, value in update_data.items():
        setattr(budget, field, value)

    await db.commit()
    await db.refresh(budget)
    return budget


async def delete_budget(
    db: AsyncSession,
    budget_id: UUID,
    user_id: UUID
) -> bool:
    """Soft delete a budget."""
    budget = await get_budget(db, budget_id, user_id)
    if not budget:
        return False

    budget.deleted_at = datetime.utcnow()
    await db.commit()
    return True


async def get_budget_with_progress(
    db: AsyncSession,
    budget_id: UUID,
    user_id: UUID
) -> Optional[BudgetWithProgress]:
    """Get a budget with spending progress."""
    budget = await get_budget(db, budget_id, user_id)
    if not budget:
        return None

    # Get expenses for this budget's category and period
    expenses = await _get_expenses_for_budget(db, budget, user_id)

    # Calculate spending metrics (with currency conversion)
    spent = await _calculate_spent_amount_in_budget_currency(db, budget, expenses)
    remaining = budget.calculate_remaining(spent)
    percentage_used = budget.calculate_percentage_used(spent)
    is_overspent = budget.is_overspent(spent)
    should_alert = budget.should_alert(spent)

    # Calculate days remaining
    days_remaining = None
    if budget.end_date:
        days_remaining = (budget.end_date - datetime.utcnow()).days
        days_remaining = max(0, days_remaining)

    # Convert to display currency
    budget.spent = spent
    budget.remaining = remaining
    await convert_budget_to_display_currency(db, user_id, budget)

    # Create response with budget data
    budget_response = BudgetResponse.model_validate(budget)
    budget_response.spent = spent
    budget_response.remaining = remaining
    budget_response.percentage_used = percentage_used
    budget_response.is_overspent = is_overspent
    budget_response.should_alert = should_alert
    budget_response.display_amount = getattr(budget, 'display_amount', None)
    budget_response.display_spent = getattr(budget, 'display_spent', None)
    budget_response.display_remaining = getattr(budget, 'display_remaining', None)
    budget_response.display_currency = getattr(budget, 'display_currency', None)

    return BudgetWithProgress(
        budget=budget_response,
        spent=spent,
        remaining=remaining,
        percentage_used=percentage_used,
        is_overspent=is_overspent,
        should_alert=should_alert,
        days_remaining=days_remaining
    )


async def get_budget_overview(
    db: AsyncSession,
    user_id: UUID,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
) -> BudgetOverviewResponse:
    """Get comprehensive budget overview with stats and category breakdown."""
    # Get display currency
    display_currency = await get_user_display_currency(db, user_id)
    currency_service = CurrencyService(db)

    # Get all active budgets
    budgets = await get_budgets(db, user_id, is_active=True)

    if not budgets:
        return BudgetOverviewResponse(
            stats=BudgetStats(
                total_budgets=0,
                active_budgets=0,
                total_budgeted=Decimal("0"),
                total_spent=Decimal("0"),
                total_remaining=Decimal("0"),
                overall_percentage_used=0.0,
                budgets_overspent=0,
                budgets_near_limit=0,
                currency=display_currency
            ),
            by_category=[],
            alerts=[]
        )

    # Calculate spending for each budget
    category_data: dict[str, dict] = {}
    total_budgeted = Decimal("0")
    total_spent = Decimal("0")
    budgets_overspent = 0
    budgets_near_limit = 0
    alerts: list[str] = []

    for budget in budgets:
        expenses = await _get_expenses_for_budget(db, budget, user_id)
        spent = await _calculate_spent_amount_in_budget_currency(db, budget, expenses)
        remaining = budget.calculate_remaining(spent)
        percentage_used = budget.calculate_percentage_used(spent)
        is_overspent = budget.is_overspent(spent)
        should_alert = budget.should_alert(spent)

        # Convert to display currency
        budget_amount_display = budget.amount
        spent_display = spent
        remaining_display = remaining

        if budget.currency != display_currency:
            converted_amount = await currency_service.convert_amount(budget.amount, budget.currency, display_currency)
            if converted_amount is not None:
                budget_amount_display = converted_amount

            converted_spent = await currency_service.convert_amount(spent, budget.currency, display_currency)
            if converted_spent is not None:
                spent_display = converted_spent

            converted_remaining = await currency_service.convert_amount(remaining, budget.currency, display_currency)
            if converted_remaining is not None:
                remaining_display = converted_remaining

        # Aggregate by category
        if budget.category not in category_data:
            category_data[budget.category] = {
                'budgeted': Decimal("0"),
                'spent': Decimal("0"),
            }

        category_data[budget.category]['budgeted'] += budget_amount_display
        category_data[budget.category]['spent'] += spent_display

        # Global stats
        total_budgeted += budget_amount_display
        total_spent += spent_display

        if is_overspent:
            budgets_overspent += 1
            alerts.append(f"⚠️ Budget '{budget.name}' is overspent by {abs(remaining_display):.2f} {display_currency}")
        elif should_alert:
            budgets_near_limit += 1
            alerts.append(f"⚠️ Budget '{budget.name}' is at {percentage_used:.1f}% ({spent_display:.2f}/{budget_amount_display:.2f} {display_currency})")

    # Build category summaries
    by_category = []
    for category, data in category_data.items():
        budgeted = data['budgeted']
        spent = data['spent']
        remaining = budgeted - spent
        percentage_used = float((spent / budgeted) * 100) if budgeted > 0 else 0.0
        is_overspent = spent > budgeted

        by_category.append(BudgetSummaryByCategory(
            category=category,
            budgeted=budgeted,
            spent=spent,
            remaining=remaining,
            percentage_used=percentage_used,
            is_overspent=is_overspent
        ))

    # Sort by percentage used descending
    by_category.sort(key=lambda x: x.percentage_used, reverse=True)

    # Calculate overall stats
    total_remaining = total_budgeted - total_spent
    overall_percentage_used = float((total_spent / total_budgeted) * 100) if total_budgeted > 0 else 0.0

    stats = BudgetStats(
        total_budgets=len(budgets),
        active_budgets=len([b for b in budgets if b.is_active]),
        total_budgeted=total_budgeted,
        total_spent=total_spent,
        total_remaining=total_remaining,
        overall_percentage_used=overall_percentage_used,
        budgets_overspent=budgets_overspent,
        budgets_near_limit=budgets_near_limit,
        currency=display_currency
    )

    return BudgetOverviewResponse(
        stats=stats,
        by_category=by_category,
        alerts=alerts
    )


async def _get_expenses_for_budget(
    db: AsyncSession,
    budget: Budget,
    user_id: UUID
) -> list[Expense]:
    """Get expenses that fall within a budget's category and time period."""
    conditions = [
        Expense.user_id == user_id,
        Expense.category == budget.category,
        Expense.is_active == True
    ]

    # Date filtering
    # For one-time expenses, use 'date'
    # For recurring expenses, use 'start_date'
    date_conditions = []

    if budget.end_date:
        # Budget has end date
        date_conditions.append(
            and_(
                Expense.date.isnot(None),
                Expense.date >= budget.start_date,
                Expense.date <= budget.end_date
            )
        )
        date_conditions.append(
            and_(
                Expense.start_date.isnot(None),
                Expense.start_date >= budget.start_date,
                Expense.start_date <= budget.end_date
            )
        )
    else:
        # Budget is recurring (no end date)
        date_conditions.append(
            and_(
                Expense.date.isnot(None),
                Expense.date >= budget.start_date
            )
        )
        date_conditions.append(
            and_(
                Expense.start_date.isnot(None),
                Expense.start_date >= budget.start_date
            )
        )

    conditions.append(or_(*date_conditions))

    query = select(Expense).where(and_(*conditions))
    result = await db.execute(query)
    return list(result.scalars().all())


async def _calculate_spent_amount_in_budget_currency(
    db: AsyncSession,
    budget: Budget,
    expenses: list[Expense]
) -> Decimal:
    """
    Calculate total amount spent, converting each expense to the budget's currency.

    Args:
        db: Database session
        budget: Budget instance
        expenses: List of expenses to sum

    Returns:
        Total spent amount in budget's currency
    """
    currency_service = CurrencyService(db)
    total = Decimal("0")

    for expense in expenses:
        # Expenses are already filtered by category in _get_expenses_for_budget
        # Just check date is within budget period
        expense_date = expense.date or expense.start_date
        if expense_date and expense_date >= budget.start_date:
            if budget.end_date is None or expense_date <= budget.end_date:
                # Convert expense amount to budget currency if needed
                expense_amount = expense.amount

                if expense.currency != budget.currency:
                    converted_amount = await currency_service.convert_amount(
                        expense.amount,
                        expense.currency,
                        budget.currency
                    )
                    if converted_amount is not None:
                        expense_amount = converted_amount

                total += expense_amount

    return total
