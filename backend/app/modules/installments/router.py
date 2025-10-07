"""
Installments module API routes.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from uuid import UUID

from app.core.database import get_db
from app.core.permissions import get_current_user, require_feature, check_usage_limit
from app.models.user import User
from app.modules.installments import service
from app.modules.installments.schemas import (
    InstallmentCreate,
    InstallmentUpdate,
    InstallmentResponse,
    InstallmentListResponse,
    InstallmentStats
)

router = APIRouter(prefix="/api/v1/installments", tags=["installments"])


@router.post("", response_model=InstallmentResponse, status_code=status.HTTP_201_CREATED)
@require_feature("installment_tracking")
async def create_installment(
    installment_data: InstallmentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new installment/loan"""
    # Check tier limits
    tier_limits = {
        "starter": 2,
        "growth": 10,
        "wealth": None  # Unlimited
    }

    tier_name = current_user.tier.name.lower() if current_user.tier else "starter"
    limit = tier_limits.get(tier_name, 2)

    if limit is not None:
        # Count existing installments
        installments, total = await service.list_installments(db, current_user.id, page_size=1000)
        if total >= limit:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Installment limit reached for {tier_name} tier. Upgrade to add more."
            )

    installment = await service.create_installment(db, current_user.id, installment_data)
    return installment


@router.get("", response_model=InstallmentListResponse)
@require_feature("installment_tracking")
async def list_installments(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    category: Optional[str] = None,
    frequency: Optional[str] = None,
    is_active: Optional[bool] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List installments with pagination and filters"""
    installments, total = await service.list_installments(
        db,
        current_user.id,
        page=page,
        page_size=page_size,
        category=category,
        frequency=frequency,
        is_active=is_active
    )

    return InstallmentListResponse(
        items=installments,
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/stats", response_model=InstallmentStats)
@require_feature("installment_tracking")
async def get_installment_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get installment statistics"""
    return await service.get_installment_stats(db, current_user.id)


@router.get("/{installment_id}", response_model=InstallmentResponse)
@require_feature("installment_tracking")
async def get_installment(
    installment_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a single installment"""
    installment = await service.get_installment(db, current_user.id, installment_id)
    if not installment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Installment not found"
        )
    return installment


@router.put("/{installment_id}", response_model=InstallmentResponse)
@require_feature("installment_tracking")
async def update_installment(
    installment_id: UUID,
    installment_data: InstallmentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update an installment"""
    installment = await service.update_installment(
        db,
        current_user.id,
        installment_id,
        installment_data
    )
    if not installment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Installment not found"
        )
    return installment


@router.delete("/{installment_id}", status_code=status.HTTP_204_NO_CONTENT)
@require_feature("installment_tracking")
async def delete_installment(
    installment_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete an installment"""
    success = await service.delete_installment(db, current_user.id, installment_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Installment not found"
        )
    return None
