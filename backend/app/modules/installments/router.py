"""
Installments module API routes.
"""
from datetime import datetime
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
    InstallmentStats,
    InstallmentBatchDelete,
    InstallmentBatchDeleteResponse)
from app.modules.installments.service import (
    convert_installment_to_display_currency,
    get_user_display_currency
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

    # Convert each installment to display currency
    installment_dicts = []
    for installment in installments:
        await convert_installment_to_display_currency(db, current_user.id, installment)

        installment_dict = {
            "id": str(installment.id),
            "user_id": str(installment.user_id),
            "name": installment.name,
            "description": installment.description,
            "category": installment.category,
            "total_amount": float(installment.total_amount) if installment.total_amount else 0,
            "amount_per_payment": float(installment.amount_per_payment) if installment.amount_per_payment else 0,
            "currency": installment.currency,
            "interest_rate": float(installment.interest_rate) if installment.interest_rate else None,
            "frequency": installment.frequency,
            "number_of_payments": installment.number_of_payments,
            "payments_made": installment.payments_made,
            "start_date": installment.start_date.isoformat() if installment.start_date else None,
            "first_payment_date": installment.first_payment_date.isoformat() if installment.first_payment_date else None,
            "end_date": installment.end_date.isoformat() if installment.end_date else None,
            "is_active": installment.is_active,
            "remaining_balance": float(installment.remaining_balance) if installment.remaining_balance is not None else None,
            "created_at": installment.created_at,
            "updated_at": installment.updated_at,
            "display_total_amount": float(installment.display_total_amount) if hasattr(installment, 'display_total_amount') and installment.display_total_amount is not None else None,
            "display_amount_per_payment": float(installment.display_amount_per_payment) if hasattr(installment, 'display_amount_per_payment') and installment.display_amount_per_payment is not None else None,
            "display_remaining_balance": float(installment.display_remaining_balance) if hasattr(installment, 'display_remaining_balance') and installment.display_remaining_balance is not None else None,
            "display_currency": installment.display_currency if hasattr(installment, 'display_currency') and installment.display_currency is not None else None,
        }
        installment_dicts.append(installment_dict)

    return InstallmentListResponse(
        items=installment_dicts,
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/stats", response_model=InstallmentStats)
@require_feature("installment_tracking")
async def get_installment_stats(
    start_date: Optional[datetime] = Query(None, description="Start date for filtering (ISO format)"),
    end_date: Optional[datetime] = Query(None, description="End date for filtering (ISO format)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get installment statistics, optionally filtered by date range."""
    stats = await service.get_installment_stats(db, current_user.id, start_date, end_date)
    # Update currency to user's display currency
    display_currency = await get_user_display_currency(db, current_user.id)
    stats.currency = display_currency
    return stats


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

    # Convert to display currency
    await convert_installment_to_display_currency(db, current_user.id, installment)

    installment_dict = {
        "id": str(installment.id),
        "user_id": str(installment.user_id),
        "name": installment.name,
        "description": installment.description,
        "category": installment.category,
        "total_amount": float(installment.total_amount) if installment.total_amount else 0,
        "amount_per_payment": float(installment.amount_per_payment) if installment.amount_per_payment else 0,
        "currency": installment.currency,
        "interest_rate": float(installment.interest_rate) if installment.interest_rate else None,
        "frequency": installment.frequency,
        "number_of_payments": installment.number_of_payments,
        "payments_made": installment.payments_made,
        "start_date": installment.start_date.isoformat() if installment.start_date else None,
        "first_payment_date": installment.first_payment_date.isoformat() if installment.first_payment_date else None,
        "end_date": installment.end_date.isoformat() if installment.end_date else None,
        "is_active": installment.is_active,
        "remaining_balance": float(installment.remaining_balance) if installment.remaining_balance is not None else None,
        "created_at": installment.created_at,
        "updated_at": installment.updated_at,
        "display_total_amount": float(installment.display_total_amount) if hasattr(installment, 'display_total_amount') and installment.display_total_amount is not None else None,
        "display_amount_per_payment": float(installment.display_amount_per_payment) if hasattr(installment, 'display_amount_per_payment') and installment.display_amount_per_payment is not None else None,
        "display_remaining_balance": float(installment.display_remaining_balance) if hasattr(installment, 'display_remaining_balance') and installment.display_remaining_balance is not None else None,
        "display_currency": installment.display_currency if hasattr(installment, 'display_currency') and installment.display_currency is not None else None,
    }

    return installment_dict


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


@router.post("/batch-delete", response_model=InstallmentBatchDeleteResponse)
async def batch_delete_installments(
    batch_data: InstallmentBatchDelete,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete multiple installments in a single request.

    Returns the count of successfully deleted items and any IDs that failed to delete.
    """
    deleted_count = 0
    failed_ids = []

    for item_id in batch_data.ids:
        try:
            success = await service.delete_installment(db, current_user.id, item_id)
            if success:
                deleted_count += 1
            else:
                failed_ids.append(item_id)
        except Exception:
            failed_ids.append(item_id)

    return InstallmentBatchDeleteResponse(
        deleted_count=deleted_count,
        failed_ids=failed_ids
    )
