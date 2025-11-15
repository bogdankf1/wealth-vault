"""
Goals module service layer.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from typing import Optional, Tuple
from uuid import UUID
from decimal import Decimal
from datetime import datetime
from dateutil.relativedelta import relativedelta

from app.modules.goals.models import Goal
from app.modules.goals.schemas import (
    GoalCreate,
    GoalUpdate,
    GoalStats
)
from app.services.currency_service import CurrencyService


async def get_user_display_currency(db: AsyncSession, user_id: UUID) -> str:
    """Get user's preferred display currency"""
    from app.models.user_preferences import UserPreferences
    prefs_result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user_id)
    )
    user_prefs = prefs_result.scalar_one_or_none()
    return user_prefs.display_currency if user_prefs and user_prefs.display_currency else "USD"


async def convert_goal_to_display_currency(db: AsyncSession, user_id: UUID, goal: Goal) -> None:
    """
    Convert goal amounts to user's display currency.
    Modifies the goal object in-place, adding display_* attributes.
    """
    display_currency = await get_user_display_currency(db, user_id)

    # If goal is already in display currency, no conversion needed
    if goal.currency == display_currency:
        goal.display_target_amount = goal.target_amount
        goal.display_current_amount = goal.current_amount
        goal.display_monthly_contribution = goal.monthly_contribution
        goal.display_currency = display_currency
        return

    # Convert using currency service
    currency_service = CurrencyService(db)

    # Convert target amount
    converted_target = await currency_service.convert_amount(
        goal.target_amount,
        goal.currency,
        display_currency
    )

    # Convert current amount
    converted_current = await currency_service.convert_amount(
        goal.current_amount,
        goal.currency,
        display_currency
    )

    # Convert monthly contribution
    converted_contribution = None
    if goal.monthly_contribution is not None:
        converted_contribution = await currency_service.convert_amount(
            goal.monthly_contribution,
            goal.currency,
            display_currency
        )

    # Set converted values as display values
    if converted_target is not None and converted_current is not None:
        goal.display_target_amount = converted_target
        goal.display_current_amount = converted_current
        goal.display_monthly_contribution = converted_contribution
        goal.display_currency = display_currency
    else:
        # Fallback to original values if conversion fails
        goal.display_target_amount = goal.target_amount
        goal.display_current_amount = goal.current_amount
        goal.display_monthly_contribution = goal.monthly_contribution
        goal.display_currency = goal.currency


def calculate_progress_percentage(current_amount: Decimal, target_amount: Decimal) -> Decimal:
    """Calculate progress percentage toward goal."""
    if target_amount <= 0:
        return Decimal('0')

    progress = (current_amount / target_amount) * Decimal('100')
    return min(progress, Decimal('100'))  # Cap at 100%


def calculate_projected_completion_date(
    current_amount: Decimal,
    target_amount: Decimal,
    monthly_contribution: Optional[Decimal],
    start_date: datetime
) -> Optional[datetime]:
    """Calculate when goal will be achieved based on monthly contribution."""
    if not monthly_contribution or monthly_contribution <= 0:
        return None

    remaining = target_amount - current_amount
    if remaining <= 0:
        return datetime.utcnow()  # Already achieved

    months_needed = int((remaining / monthly_contribution).to_integral_value())

    # Ensure start_date is naive
    if start_date.tzinfo is not None:
        start_date = start_date.replace(tzinfo=None)

    projected_date = start_date + relativedelta(months=months_needed)

    return projected_date


async def create_goal(
    db: AsyncSession,
    user_id: UUID,
    goal_data: GoalCreate
) -> Goal:
    """Create a new goal"""
    # Calculate progress percentage
    progress = calculate_progress_percentage(
        goal_data.current_amount,
        goal_data.target_amount
    )

    # Check if goal is already completed
    is_completed = goal_data.current_amount >= goal_data.target_amount
    completed_at = datetime.utcnow() if is_completed else None

    goal = Goal(
        user_id=user_id,
        progress_percentage=progress,
        is_completed=is_completed,
        completed_at=completed_at,
        **goal_data.model_dump()
    )
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return goal


async def get_goal(
    db: AsyncSession,
    user_id: UUID,
    goal_id: UUID
) -> Optional[Goal]:
    """Get a single goal"""
    query = select(Goal).where(
        and_(
            Goal.id == goal_id,
            Goal.user_id == user_id
        )
    )
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def list_goals(
    db: AsyncSession,
    user_id: UUID,
    page: int = 1,
    page_size: int = 50,
    category: Optional[str] = None,
    is_active: Optional[bool] = None,
    is_completed: Optional[bool] = None
) -> Tuple[list[Goal], int]:
    """List goals with pagination and filters"""
    # Base query
    query = select(Goal).where(Goal.user_id == user_id)

    # Apply filters
    if category:
        query = query.where(Goal.category == category)
    if is_active is not None:
        query = query.where(Goal.is_active == is_active)
    if is_completed is not None:
        query = query.where(Goal.is_completed == is_completed)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query)

    # Apply pagination and ordering
    query = query.order_by(Goal.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    goals = result.scalars().all()

    return list(goals), total or 0


async def update_goal(
    db: AsyncSession,
    user_id: UUID,
    goal_id: UUID,
    goal_data: GoalUpdate
) -> Optional[Goal]:
    """Update a goal"""
    goal = await get_goal(db, user_id, goal_id)
    if not goal:
        return None

    # Update fields
    update_dict = goal_data.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(goal, key, value)

    # Recalculate progress percentage if amounts changed
    if 'current_amount' in update_dict or 'target_amount' in update_dict:
        goal.progress_percentage = calculate_progress_percentage(
            goal.current_amount,
            goal.target_amount
        )

        # Update completion status
        if goal.current_amount >= goal.target_amount and not goal.is_completed:
            goal.is_completed = True
            goal.completed_at = datetime.utcnow()
        elif goal.current_amount < goal.target_amount and goal.is_completed:
            goal.is_completed = False
            goal.completed_at = None

    goal.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(goal)
    return goal


async def delete_goal(
    db: AsyncSession,
    user_id: UUID,
    goal_id: UUID
) -> bool:
    """Delete a goal"""
    goal = await get_goal(db, user_id, goal_id)
    if not goal:
        return False

    await db.delete(goal)
    await db.commit()
    return True


async def get_goal_stats(
    db: AsyncSession,
    user_id: UUID
) -> GoalStats:
    """Get goal statistics"""
    # Get display currency
    display_currency = await get_user_display_currency(db, user_id)
    currency_service = CurrencyService(db)

    # Get only active goals for the user
    query = select(Goal).where(
        Goal.user_id == user_id,
        Goal.is_active == True
    )
    result = await db.execute(query)
    goals = result.scalars().all()

    total_goals = len(goals)
    active_goals = len(goals)
    completed_goals = sum(1 for g in goals if g.is_completed)

    # Calculate totals
    total_target_amount = Decimal('0')
    total_saved = Decimal('0')
    by_category: dict[str, Decimal] = {}
    progress_values = []
    goals_on_track = 0
    goals_behind = 0

    for goal in goals:
        # Convert target amount to display currency
        target_in_display = goal.target_amount
        if goal.currency != display_currency:
            converted = await currency_service.convert_amount(
                goal.target_amount,
                goal.currency,
                display_currency
            )
            if converted is not None:
                target_in_display = converted
        total_target_amount += target_in_display

        # Convert current amount to display currency
        current_in_display = goal.current_amount
        if goal.currency != display_currency:
            converted = await currency_service.convert_amount(
                goal.current_amount,
                goal.currency,
                display_currency
            )
            if converted is not None:
                current_in_display = converted
        total_saved += current_in_display

        # By category (target amounts) - convert to display currency
        if goal.category:
            category_target = target_in_display
            by_category[goal.category] = by_category.get(goal.category, Decimal('0')) + category_target

        # Progress tracking
        if goal.progress_percentage:
            progress_values.append(goal.progress_percentage)

        # On track vs behind (for active goals with target date)
        if goal.is_active and not goal.is_completed and goal.target_date and goal.monthly_contribution:
            projected = calculate_projected_completion_date(
                goal.current_amount,
                goal.target_amount,
                goal.monthly_contribution,
                goal.start_date
            )
            if projected and projected > goal.target_date:
                goals_behind += 1

    total_remaining = total_target_amount - total_saved

    # Calculate goals on track: all in-progress goals that aren't behind schedule
    in_progress_goals = active_goals - completed_goals
    goals_on_track = in_progress_goals - goals_behind

    # Calculate overall progress based on total saved vs total target
    average_progress = Decimal('0')
    if total_target_amount > 0:
        average_progress = (total_saved / total_target_amount) * Decimal('100')
        average_progress = min(average_progress, Decimal('100'))  # Cap at 100%

    return GoalStats(
        total_goals=total_goals,
        active_goals=active_goals,
        completed_goals=completed_goals,
        total_target_amount=total_target_amount,
        total_saved=total_saved,
        total_remaining=max(total_remaining, Decimal('0')),
        average_progress=average_progress,
        currency=display_currency,
        by_category=by_category,
        goals_on_track=goals_on_track,
        goals_behind=goals_behind
    )
