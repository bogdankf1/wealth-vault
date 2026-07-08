"""Goal statistics."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from uuid import UUID
from decimal import Decimal
from app.modules.goals.models import Goal, GoalAccountLink, GoalProgressHistory
from app.modules.goals.schemas import (
    GoalCreate,
    GoalUpdate,
    GoalStats,
    GoalAccountLinkCreate,
    GoalAccountLinkUpdate,
    GoalAccountLinkResponse,
    LinkedAccountInfo
)
from app.services.currency_service import CurrencyService
from .common import calculate_projected_completion_date, get_user_display_currency

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
