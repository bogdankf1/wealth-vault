"""Goal CRUD operations."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from typing import Optional, Tuple
from uuid import UUID
from datetime import datetime
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
from .common import calculate_progress_percentage

async def create_goal(
    db: AsyncSession,
    user_id: UUID,
    goal_data: GoalCreate,
    commit: bool = True,
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
    if commit:
        await db.commit()
    else:
        await db.flush()
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
