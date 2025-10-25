"""
Debts module API router
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from uuid import UUID

from app.core.database import get_db
from app.core.permissions import get_current_user
from app.models.user import User
from app.modules.debts import service
from app.modules.debts.schemas import (
    DebtCreate,
    DebtUpdate,
    DebtResponse,
    DebtListResponse,
    DebtStats
)

router = APIRouter(prefix="/debts", tags=["debts"])


@router.post("", response_model=DebtResponse, status_code=201)
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
async def list_debts(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
    is_paid: Optional[bool] = Query(None, description="Filter by payment status"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all debts for the current user"""
    skip = (page - 1) * page_size
    debts, total = await service.get_debts(
        db,
        current_user.id,
        is_paid=is_paid,
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
async def get_debt_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get debt statistics"""
    return await service.get_debt_stats(db, current_user.id)


@router.get("/{debt_id}", response_model=DebtResponse)
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
