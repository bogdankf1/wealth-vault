"""Linked-account management and progress tracking from accounts."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from typing import Optional, Tuple
from uuid import UUID
from decimal import Decimal
from datetime import datetime
from app.modules.goals.models import Goal, GoalAccountLink, GoalProgressHistory
from app.modules.goals.schemas import (
    GoalAccountLinkCreate,
    GoalAccountLinkUpdate,
    GoalAccountLinkResponse,
    LinkedAccountInfo
)
from app.modules.savings.models import SavingsAccount
from app.services.currency_service import CurrencyService
from .common import calculate_progress_percentage
from .crud import get_goal

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
