"""
Taxes module API router
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from uuid import UUID

from app.core.database import get_db
from app.core.permissions import get_current_user, require_feature
from app.models.user import User
from app.modules.taxes import service
from app.modules.taxes.schemas import (
    TaxCreate,
    TaxUpdate,
    TaxResponse,
    TaxListResponse,
    TaxStats,
    TaxRecordBatchDelete,
    TaxRecordBatchDeleteResponse)

router = APIRouter(prefix="/taxes", tags=["taxes"])


@router.post("", response_model=TaxResponse, status_code=201)
@require_feature("tax_tracking")
async def create_tax(
    tax_data: TaxCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new tax"""
    tax = await service.create_tax(db, current_user.id, tax_data)

    # Convert to display currency and calculate amount
    await service.convert_tax_to_display_currency(db, current_user.id, tax)

    return tax


@router.get("", response_model=TaxListResponse)
@require_feature("tax_tracking")
async def list_taxes(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all taxes for the current user"""
    skip = (page - 1) * page_size
    taxes, total = await service.get_taxes(
        db,
        current_user.id,
        is_active=is_active,
        skip=skip,
        limit=page_size
    )

    # Convert all taxes to display currency and calculate amounts
    for tax in taxes:
        await service.convert_tax_to_display_currency(db, current_user.id, tax)

    return TaxListResponse(
        items=taxes,
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/stats", response_model=TaxStats)
@require_feature("tax_tracking")
async def get_tax_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get tax statistics"""
    return await service.get_tax_stats(db, current_user.id)


@router.get("/{tax_id}", response_model=TaxResponse)
@require_feature("tax_tracking")
async def get_tax(
    tax_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific tax"""
    tax = await service.get_tax(db, tax_id, current_user.id)
    if not tax:
        raise HTTPException(status_code=404, detail="Tax not found")

    # Convert to display currency and calculate amount
    await service.convert_tax_to_display_currency(db, current_user.id, tax)

    return tax


@router.put("/{tax_id}", response_model=TaxResponse)
@require_feature("tax_tracking")
async def update_tax(
    tax_id: UUID,
    tax_data: TaxUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a tax"""
    tax = await service.update_tax(db, tax_id, current_user.id, tax_data)
    if not tax:
        raise HTTPException(status_code=404, detail="Tax not found")

    # Convert to display currency and calculate amount
    await service.convert_tax_to_display_currency(db, current_user.id, tax)

    return tax


@router.delete("/{tax_id}", status_code=204)
@require_feature("tax_tracking")
async def delete_tax(
    tax_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a tax"""
    success = await service.delete_tax(db, tax_id, current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail="Tax not found")
    return None


@router.post("/batch-delete", response_model=TaxRecordBatchDeleteResponse)
async def batch_delete_taxes(
    batch_data: TaxRecordBatchDelete,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete multiple taxes in a single request.

    Returns the count of successfully deleted items and any IDs that failed to delete.
    """
    deleted_count = 0
    failed_ids = []

    for item_id in batch_data.ids:
        try:
            success = await service.delete_tax(db, item_id, current_user.id)
            if success:
                deleted_count += 1
            else:
                failed_ids.append(item_id)
        except Exception:
            failed_ids.append(item_id)

    return TaxRecordBatchDeleteResponse(
        deleted_count=deleted_count,
        failed_ids=failed_ids
    )
