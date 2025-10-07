"""
Goals module API routes.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from uuid import UUID

from app.core.database import get_db
from app.core.permissions import get_current_user, require_feature
from app.models.user import User
from app.modules.goals import service
from app.modules.goals.schemas import (
    GoalCreate,
    GoalUpdate,
    GoalResponse,
    GoalListResponse,
    GoalStats
)

router = APIRouter(prefix="/api/v1/goals", tags=["goals"])


@router.post("", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
@require_feature("financial_goals")
async def create_goal(
    goal_data: GoalCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new financial goal"""
    # Check tier limits
    tier_limits = {
        "starter": 3,
        "growth": 15,
        "wealth": None  # Unlimited
    }

    tier_name = current_user.tier.name.lower() if current_user.tier else "starter"
    limit = tier_limits.get(tier_name, 3)

    if limit is not None:
        # Count existing goals
        goals, total = await service.list_goals(db, current_user.id, page_size=1000)
        if total >= limit:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Goal limit reached for {tier_name} tier. Upgrade to add more."
            )

    goal = await service.create_goal(db, current_user.id, goal_data)
    return goal


@router.get("", response_model=GoalListResponse)
@require_feature("financial_goals")
async def list_goals(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    category: Optional[str] = None,
    is_active: Optional[bool] = None,
    is_completed: Optional[bool] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List goals with pagination and filters"""
    goals, total = await service.list_goals(
        db,
        current_user.id,
        page=page,
        page_size=page_size,
        category=category,
        is_active=is_active,
        is_completed=is_completed
    )

    return GoalListResponse(
        items=goals,
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/stats", response_model=GoalStats)
@require_feature("financial_goals")
async def get_goal_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get goal statistics"""
    return await service.get_goal_stats(db, current_user.id)


@router.get("/{goal_id}", response_model=GoalResponse)
@require_feature("financial_goals")
async def get_goal(
    goal_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a single goal"""
    goal = await service.get_goal(db, current_user.id, goal_id)
    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal not found"
        )
    return goal


@router.put("/{goal_id}", response_model=GoalResponse)
@require_feature("financial_goals")
async def update_goal(
    goal_id: UUID,
    goal_data: GoalUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a goal"""
    goal = await service.update_goal(
        db,
        current_user.id,
        goal_id,
        goal_data
    )
    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal not found"
        )
    return goal


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
@require_feature("financial_goals")
async def delete_goal(
    goal_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a goal"""
    success = await service.delete_goal(db, current_user.id, goal_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal not found"
        )
    return None
