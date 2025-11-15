"""
Debts module API router
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from uuid import UUID

from app.core.database import get_db
from app.core.permissions import get_current_user, require_feature
from app.models.user import User
from app.modules.debts import service
from app.modules.debts.schemas import (
    DebtCreate,
    DebtUpdate,
    DebtResponse,
    DebtListResponse,
    DebtStats,
    DebtBatchDelete,
    DebtBatchDeleteResponse)

router = APIRouter(prefix="/debts", tags=["debts"])


@router.post("", response_model=DebtResponse, status_code=201)
@require_feature("debt_tracking")
async def create_debt(
    debt_data: DebtCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new debt"""
    debt = await service.create_debt(db, current_user.id, debt_data)

    # Convert to display currency
    await service.convert_debt_to_display_currency(db, current_user.id, debt)

    return debt


@router.get("", response_model=DebtListResponse)
@require_feature("debt_tracking")
async def list_debts(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
    is_paid: Optional[bool] = Query(None, description="Filter by payment status"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all debts for the current user"""
    skip = (page - 1) * page_size
    debts, total = await service.get_debts(
        db,
        current_user.id,
        is_paid=is_paid,
        is_active=is_active,
        skip=skip,
        limit=page_size
    )

    # Convert all debts to display currency
    for debt in debts:
        await service.convert_debt_to_display_currency(db, current_user.id, debt)

    return DebtListResponse(
        items=debts,
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/stats", response_model=DebtStats)
@require_feature("debt_tracking")
async def get_debt_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get debt statistics"""
    return await service.get_debt_stats(db, current_user.id)


@router.get("/{debt_id}", response_model=DebtResponse)
@require_feature("debt_tracking")
async def get_debt(
    debt_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific debt"""
    debt = await service.get_debt(db, debt_id, current_user.id)
    if not debt:
        raise HTTPException(status_code=404, detail="Debt not found")

    # Convert to display currency
    await service.convert_debt_to_display_currency(db, current_user.id, debt)

    return debt


@router.put("/{debt_id}", response_model=DebtResponse)
@require_feature("debt_tracking")
async def update_debt(
    debt_id: UUID,
    debt_data: DebtUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a debt"""
    debt = await service.update_debt(db, debt_id, current_user.id, debt_data)
    if not debt:
        raise HTTPException(status_code=404, detail="Debt not found")

    # Convert to display currency
    await service.convert_debt_to_display_currency(db, current_user.id, debt)

    return debt


@router.delete("/{debt_id}", status_code=204)
@require_feature("debt_tracking")
async def delete_debt(
    debt_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a debt"""
    success = await service.delete_debt(db, debt_id, current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail="Debt not found")
    return None


@router.post("/batch-delete", response_model=DebtBatchDeleteResponse)
async def batch_delete_debts(
    batch_data: DebtBatchDelete,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete multiple debts in a single request.

    Returns the count of successfully deleted items and any IDs that failed to delete.
    """
    deleted_count = 0
    failed_ids = []

    for item_id in batch_data.ids:
        try:
            success = await service.delete_debt(db, item_id, current_user.id)
            if success:
                deleted_count += 1
            else:
                failed_ids.append(item_id)
        except Exception:
            failed_ids.append(item_id)

    return DebtBatchDeleteResponse(
        deleted_count=deleted_count,
        failed_ids=failed_ids
    )
