"""
Goals module service layer.
"""
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from typing import Optional, Tuple
from uuid import UUID
from decimal import Decimal
from datetime import datetime
from dateutil.relativedelta import relativedelta

logger = logging.getLogger(__name__)

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
from app.modules.savings.models import SavingsAccount
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
        logger.warning(
            f"Currency conversion failed for goal {goal.id}: "
            f"could not convert {goal.currency} to {display_currency}. "
            f"Using original currency values."
        )
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
    goal_id: UUID,
    include_links: bool = True
) -> Optional[Goal]:
    """Get a single goal with optional eager loading of account links"""
    query = select(Goal).where(
        and_(
            Goal.id == goal_id,
            Goal.user_id == user_id
        )
    )

    if include_links:
        query = query.options(selectinload(Goal.account_links).selectinload(GoalAccountLink.account))

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


# ============================================
# Account Linking Functions
# ============================================

async def link_account_to_goal(
    db: AsyncSession,
    user_id: UUID,
    goal_id: UUID,
    link_data: GoalAccountLinkCreate
) -> Optional[GoalAccountLink]:
    """Link a savings account to a goal"""
    # Verify goal exists and belongs to user
    goal = await get_goal(db, user_id, goal_id, include_links=False)
    if not goal:
        return None

    # Verify account exists and belongs to user
    account_query = select(SavingsAccount).where(
        and_(
            SavingsAccount.id == link_data.account_id,
            SavingsAccount.user_id == user_id
        )
    )
    account_result = await db.execute(account_query)
    account = account_result.scalar_one_or_none()
    if not account:
        return None

    # Check if link already exists
    existing_link = await db.execute(
        select(GoalAccountLink).where(
            and_(
                GoalAccountLink.goal_id == goal_id,
                GoalAccountLink.account_id == link_data.account_id
            )
        )
    )
    if existing_link.scalar_one_or_none():
        return None  # Link already exists

    # Create the link
    link = GoalAccountLink(
        goal_id=goal_id,
        account_id=link_data.account_id,
        user_id=user_id,
        allocation_type=link_data.allocation_type,
        allocation_percentage=link_data.allocation_percentage,
        allocation_amount=link_data.allocation_amount
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)

    # Reload with account relationship
    link_query = select(GoalAccountLink).where(GoalAccountLink.id == link.id).options(
        selectinload(GoalAccountLink.account)
    )
    result = await db.execute(link_query)
    return result.scalar_one_or_none()


async def unlink_account_from_goal(
    db: AsyncSession,
    user_id: UUID,
    goal_id: UUID,
    account_id: UUID
) -> bool:
    """Remove an account link from a goal"""
    link_query = select(GoalAccountLink).where(
        and_(
            GoalAccountLink.goal_id == goal_id,
            GoalAccountLink.account_id == account_id,
            GoalAccountLink.user_id == user_id
        )
    )
    result = await db.execute(link_query)
    link = result.scalar_one_or_none()

    if not link:
        return False

    await db.delete(link)
    await db.commit()
    return True


async def update_account_link(
    db: AsyncSession,
    user_id: UUID,
    goal_id: UUID,
    account_id: UUID,
    update_data: GoalAccountLinkUpdate
) -> Optional[GoalAccountLink]:
    """Update an account link's allocation settings"""
    link_query = select(GoalAccountLink).where(
        and_(
            GoalAccountLink.goal_id == goal_id,
            GoalAccountLink.account_id == account_id,
            GoalAccountLink.user_id == user_id
        )
    ).options(selectinload(GoalAccountLink.account))

    result = await db.execute(link_query)
    link = result.scalar_one_or_none()

    if not link:
        return None

    # Update fields
    update_dict = update_data.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(link, key, value)

    link.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(link)

    return link


async def get_goal_linked_accounts(
    db: AsyncSession,
    user_id: UUID,
    goal_id: UUID
) -> list[GoalAccountLink]:
    """Get all linked accounts for a goal"""
    query = select(GoalAccountLink).where(
        and_(
            GoalAccountLink.goal_id == goal_id,
            GoalAccountLink.user_id == user_id
        )
    ).options(selectinload(GoalAccountLink.account))

    result = await db.execute(query)
    return list(result.scalars().all())


async def get_goals_by_linked_account(
    db: AsyncSession,
    user_id: UUID,
    account_id: UUID
) -> list[Goal]:
    """
    Get all goals that are linked to a specific savings account.
    Used to update goal progress when account balance changes.
    """
    query = select(Goal).join(
        GoalAccountLink, Goal.id == GoalAccountLink.goal_id
    ).where(
        and_(
            GoalAccountLink.account_id == account_id,
            GoalAccountLink.user_id == user_id,
            Goal.is_active == True,
            Goal.auto_track_progress == True
        )
    )

    result = await db.execute(query)
    return list(result.scalars().all())


async def calculate_progress_from_accounts(
    db: AsyncSession,
    user_id: UUID,
    goal_id: UUID,
    goal_currency: Optional[str] = None
) -> Tuple[Decimal, dict]:
    """
    Calculate total progress from linked accounts.
    Returns (total_amount_in_goal_currency, account_breakdown)
    Amounts are converted to the goal's currency.
    """
    links = await get_goal_linked_accounts(db, user_id, goal_id)

    # If goal_currency not provided, get it from the goal
    if not goal_currency:
        goal = await get_goal(db, user_id, goal_id, include_links=False)
        goal_currency = goal.currency if goal else "USD"

    # Initialize currency service for conversions
    currency_service = CurrencyService(db)

    total = Decimal('0')
    breakdown = {}

    for link in links:
        if link.account and link.account.is_active:
            account_balance = float(link.account.current_balance)
            allocated = Decimal(str(link.calculate_allocated_amount(account_balance)))

            # Convert to goal's currency if different
            allocated_in_goal_currency = allocated
            if link.account.currency != goal_currency:
                converted = await currency_service.convert_amount(
                    allocated,
                    link.account.currency,
                    goal_currency
                )
                allocated_in_goal_currency = Decimal(str(converted))

            total += allocated_in_goal_currency
            breakdown[str(link.account_id)] = {
                "account_name": link.account.name,
                "account_balance": float(link.account.current_balance),
                "account_currency": link.account.currency,
                "allocation_type": link.allocation_type,
                "allocated_amount": float(allocated),
                "allocated_in_goal_currency": float(allocated_in_goal_currency)
            }

    return total, breakdown


async def update_goal_progress_from_accounts(
    db: AsyncSession,
    user_id: UUID,
    goal_id: UUID,
    trigger_type: str = "manual",
    notes: Optional[str] = None
) -> Optional[Goal]:
    """
    Update goal's current_amount from linked accounts and record progress snapshot.
    Only updates if auto_track_progress is enabled.
    """
    goal = await get_goal(db, user_id, goal_id)
    if not goal:
        return None

    # Calculate progress from linked accounts (with currency conversion)
    total_from_accounts, breakdown = await calculate_progress_from_accounts(
        db, user_id, goal_id, goal_currency=goal.currency
    )

    # Update goal if auto-tracking is enabled
    if goal.auto_track_progress:
        goal.current_amount = total_from_accounts
        goal.progress_percentage = calculate_progress_percentage(total_from_accounts, goal.target_amount)

        # Check for completion
        if total_from_accounts >= goal.target_amount and not goal.is_completed:
            goal.is_completed = True
            goal.completed_at = datetime.utcnow()
        elif total_from_accounts < goal.target_amount and goal.is_completed:
            goal.is_completed = False
            goal.completed_at = None

        goal.updated_at = datetime.utcnow()

    # Record progress snapshot
    await record_progress_snapshot(
        db, user_id, goal_id,
        current_amount=total_from_accounts if goal.auto_track_progress else goal.current_amount,
        trigger_type=trigger_type,
        linked_accounts_snapshot=breakdown if breakdown else None,
        notes=notes
    )

    await db.commit()
    await db.refresh(goal)
    return goal


# ============================================
# Progress History Functions
# ============================================

async def record_progress_snapshot(
    db: AsyncSession,
    user_id: UUID,
    goal_id: UUID,
    current_amount: Decimal,
    trigger_type: str = "manual",
    linked_accounts_snapshot: Optional[dict] = None,
    notes: Optional[str] = None,
    skip_if_unchanged: bool = True
) -> Optional[GoalProgressHistory]:
    """
    Record a progress snapshot for a goal.
    If skip_if_unchanged is True, skips recording if the most recent snapshot
    has the same current_amount and was recorded within the last minute.
    """
    goal = await get_goal(db, user_id, goal_id, include_links=False)
    if not goal:
        raise ValueError("Goal not found")

    progress = calculate_progress_percentage(current_amount, goal.target_amount)

    # Check for recent duplicate snapshots
    if skip_if_unchanged:
        recent_query = select(GoalProgressHistory).where(
            and_(
                GoalProgressHistory.goal_id == goal_id,
                GoalProgressHistory.user_id == user_id
            )
        ).order_by(GoalProgressHistory.recorded_date.desc()).limit(1)

        recent_result = await db.execute(recent_query)
        recent_snapshot = recent_result.scalar_one_or_none()

        if recent_snapshot:
            # Skip if amount is the same and last snapshot was within 1 minute
            now = datetime.utcnow()
            recorded_date = recent_snapshot.recorded_date
            # Handle timezone-aware datetimes by converting to naive
            if recorded_date.tzinfo is not None:
                recorded_date = recorded_date.replace(tzinfo=None)
            time_diff = now - recorded_date
            is_recent = time_diff.total_seconds() < 60
            is_same_amount = recent_snapshot.current_amount == current_amount

            if is_recent and is_same_amount:
                return recent_snapshot  # Return existing snapshot instead of creating duplicate

    snapshot = GoalProgressHistory(
        goal_id=goal_id,
        user_id=user_id,
        recorded_date=datetime.utcnow(),
        current_amount=current_amount,
        target_amount=goal.target_amount,
        progress_percentage=progress,
        linked_accounts_snapshot=linked_accounts_snapshot,
        trigger_type=trigger_type,
        notes=notes
    )

    db.add(snapshot)
    await db.commit()
    await db.refresh(snapshot)
    return snapshot


async def get_progress_history(
    db: AsyncSession,
    user_id: UUID,
    goal_id: UUID,
    page: int = 1,
    page_size: int = 50
) -> Tuple[list[GoalProgressHistory], int]:
    """Get progress history for a goal"""
    # Base query
    query = select(GoalProgressHistory).where(
        and_(
            GoalProgressHistory.goal_id == goal_id,
            GoalProgressHistory.user_id == user_id
        )
    )

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query)

    # Apply pagination and ordering (newest first)
    query = query.order_by(GoalProgressHistory.recorded_date.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    history = result.scalars().all()

    return list(history), total or 0


async def get_goal_with_linked_accounts_total(
    db: AsyncSession,
    user_id: UUID,
    goal: Goal
) -> Tuple[list[GoalAccountLinkResponse], Decimal]:
    """
    Get goal's linked accounts with calculated amounts and total.
    Returns (account_links_with_amounts, total_from_accounts)
    Amounts are converted to the goal's currency.
    """
    # Get links with accounts eagerly loaded
    links = await get_goal_linked_accounts(db, user_id, goal.id)

    # Initialize currency service for conversions
    currency_service = CurrencyService(db)
    goal_currency = goal.currency

    account_responses = []
    total = Decimal('0')

    for link in links:
        allocated = Decimal('0')
        allocated_in_goal_currency = Decimal('0')
        account_info = None

        if link.account:
            account_balance = float(link.account.current_balance)
            allocated = Decimal(str(link.calculate_allocated_amount(account_balance)))

            # Convert to goal's currency if different
            if link.account.currency != goal_currency:
                converted = await currency_service.convert_amount(
                    allocated,
                    link.account.currency,
                    goal_currency
                )
                allocated_in_goal_currency = Decimal(str(converted))
            else:
                allocated_in_goal_currency = allocated

            total += allocated_in_goal_currency

            account_info = LinkedAccountInfo(
                id=str(link.account.id),
                name=link.account.name,
                current_balance=link.account.current_balance,
                currency=link.account.currency,
                account_type=link.account.account_type
            )

        link_response = GoalAccountLinkResponse(
            id=str(link.id),
            goal_id=str(link.goal_id),
            account_id=str(link.account_id),
            allocation_type=link.allocation_type,
            allocation_percentage=link.allocation_percentage,
            allocation_amount=link.allocation_amount,
            allocated_amount=allocated,  # Keep original currency amount for display
            account=account_info,
            created_at=link.created_at
        )
        account_responses.append(link_response)

    return account_responses, total


async def enrich_goal_with_linked_accounts(
    db: AsyncSession,
    user_id: UUID,
    goal: Goal,
    update_progress: bool = True
) -> None:
    """
    Enrich a goal object with linked accounts data.
    Modifies the goal in-place by adding linked_accounts and linked_accounts_total attributes.
    If update_progress is True and auto_track_progress is enabled, also updates current_amount.
    """
    account_links, total = await get_goal_with_linked_accounts_total(db, user_id, goal)
    goal.linked_accounts = account_links
    goal.linked_accounts_total = total

    # Update current_amount from linked accounts if auto-tracking is enabled
    if update_progress and goal.auto_track_progress and account_links:
        goal.current_amount = total
        goal.progress_percentage = calculate_progress_percentage(total, goal.target_amount)
