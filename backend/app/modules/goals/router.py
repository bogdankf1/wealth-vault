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
    GoalStats,
    GoalBatchDelete,
    GoalBatchDeleteResponse,
    GoalAccountLinkCreate,
    GoalAccountLinkUpdate,
    GoalAccountLinkResponse,
    GoalProgressHistoryResponse,
    GoalProgressHistoryListResponse,
    RecordProgressRequest
)
from app.modules.goals.service import convert_goal_to_display_currency, enrich_goal_with_linked_accounts

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

    # Convert each goal to display currency
    for goal in goals:
        await convert_goal_to_display_currency(db, current_user.id, goal)

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
    """Get a single goal with linked accounts"""
    goal = await service.get_goal(db, current_user.id, goal_id)
    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal not found"
        )

    # Convert to display currency
    await convert_goal_to_display_currency(db, current_user.id, goal)

    # Enrich with linked accounts data
    await enrich_goal_with_linked_accounts(db, current_user.id, goal)

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


@router.post("/batch-delete", response_model=GoalBatchDeleteResponse)
async def batch_delete_goals(
    batch_data: GoalBatchDelete,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete multiple goals in a single request.

    Returns the count of successfully deleted items and any IDs that failed to delete.
    """
    deleted_count = 0
    failed_ids = []

    for item_id in batch_data.ids:
        try:
            success = await service.delete_goal(db, current_user.id, item_id)
            if success:
                deleted_count += 1
            else:
                failed_ids.append(item_id)
        except Exception:
            failed_ids.append(item_id)

    return GoalBatchDeleteResponse(
        deleted_count=deleted_count,
        failed_ids=failed_ids
    )


# ============================================
# Account Linking Endpoints
# ============================================

@router.post("/{goal_id}/link-account", response_model=GoalAccountLinkResponse, status_code=status.HTTP_201_CREATED)
@require_feature("financial_goals")
async def link_account_to_goal(
    goal_id: UUID,
    link_data: GoalAccountLinkCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Link a savings account to a goal for auto progress tracking"""
    link = await service.link_account_to_goal(db, current_user.id, goal_id, link_data)
    if not link:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not link account. Goal or account not found, or link already exists."
        )
    return link


@router.get("/{goal_id}/linked-accounts", response_model=list[GoalAccountLinkResponse])
@require_feature("financial_goals")
async def get_linked_accounts(
    goal_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all linked accounts for a goal"""
    # Verify goal exists
    goal = await service.get_goal(db, current_user.id, goal_id, include_links=False)
    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal not found"
        )

    links, _ = await service.get_goal_with_linked_accounts_total(db, current_user.id, goal)
    return links


@router.put("/{goal_id}/link-account/{account_id}", response_model=GoalAccountLinkResponse)
@require_feature("financial_goals")
async def update_account_link(
    goal_id: UUID,
    account_id: UUID,
    update_data: GoalAccountLinkUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update an account link's allocation settings"""
    link = await service.update_account_link(db, current_user.id, goal_id, account_id, update_data)
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account link not found"
        )
    return link


@router.delete("/{goal_id}/unlink-account/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
@require_feature("financial_goals")
async def unlink_account_from_goal(
    goal_id: UUID,
    account_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Remove an account link from a goal"""
    success = await service.unlink_account_from_goal(db, current_user.id, goal_id, account_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account link not found"
        )
    return None


# ============================================
# Progress Tracking Endpoints
# ============================================

@router.post("/{goal_id}/refresh-progress", response_model=GoalResponse)
@require_feature("financial_goals")
async def refresh_goal_progress(
    goal_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Refresh goal progress from linked accounts and record a snapshot"""
    goal = await service.update_goal_progress_from_accounts(
        db, current_user.id, goal_id,
        trigger_type="manual",
        notes="Manual refresh"
    )
    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal not found"
        )

    # Convert to display currency and enrich with linked accounts
    await convert_goal_to_display_currency(db, current_user.id, goal)
    await enrich_goal_with_linked_accounts(db, current_user.id, goal)

    return goal


@router.post("/{goal_id}/record-progress", response_model=GoalProgressHistoryResponse)
@require_feature("financial_goals")
async def record_manual_progress(
    goal_id: UUID,
    progress_data: RecordProgressRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Manually record progress for a goal (for goals without auto-tracking)"""
    # Verify goal exists
    goal = await service.get_goal(db, current_user.id, goal_id, include_links=False)
    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal not found"
        )

    # Update the goal's current amount if not auto-tracking
    if not goal.auto_track_progress:
        from app.modules.goals.schemas import GoalUpdate
        await service.update_goal(
            db, current_user.id, goal_id,
            GoalUpdate(current_amount=progress_data.current_amount)
        )

    # Record the snapshot
    snapshot = await service.record_progress_snapshot(
        db, current_user.id, goal_id,
        current_amount=progress_data.current_amount,
        trigger_type="manual",
        notes=progress_data.notes
    )

    return snapshot


@router.get("/{goal_id}/progress-history", response_model=GoalProgressHistoryListResponse)
@require_feature("financial_goals")
async def get_progress_history(
    goal_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get progress history for a goal"""
    # Verify goal exists
    goal = await service.get_goal(db, current_user.id, goal_id, include_links=False)
    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal not found"
        )

    history, total = await service.get_progress_history(
        db, current_user.id, goal_id,
        page=page,
        page_size=page_size
    )

    return GoalProgressHistoryListResponse(
        items=history,
        total=total,
        page=page,
        page_size=page_size
    )
