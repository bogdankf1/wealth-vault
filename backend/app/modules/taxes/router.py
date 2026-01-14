"""
Taxes module API router
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
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
    TaxRecordBatchDeleteResponse,
    TaxPaymentCreate,
    TaxPaymentResponse,
    TaxPaymentListResponse,
    LinkedIncomeSourceInfo,
    PayTaxRequest,
    PayTaxResponse)

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
    income_source_id: Optional[UUID] = Query(None, description="Filter by income source"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all taxes for the current user"""
    skip = (page - 1) * page_size
    taxes, total = await service.get_taxes(
        db,
        current_user.id,
        is_active=is_active,
        income_source_id=income_source_id,
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


# ============================================================================
# Pay Tax
# ============================================================================

@router.post("/{tax_id}/pay", response_model=PayTaxResponse)
@require_feature("tax_tracking")
async def pay_tax(
    tax_id: UUID,
    request: PayTaxRequest = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Pay a tax manually.

    This will:
    1. Create a withdrawal transaction from the payment account
    2. Create a tax payment record
    3. Update the next_payment_date if auto_pay is enabled

    You can optionally specify:
    - account_id: Override the tax's default payment account
    - amount: Override the calculated amount
    - notes: Add notes to the payment
    """
    try:
        payment, transaction_id = await service.pay_tax(
            db=db,
            user_id=current_user.id,
            tax_id=tax_id,
            request=request,
            is_auto_pay=False
        )
        return PayTaxResponse(
            payment=payment,
            transaction_id=transaction_id,
            message="Tax payment processed successfully"
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============================================================================
# Income-Tax Summary
# ============================================================================

@router.get("/income-summary", response_model=List[dict])
@require_feature("tax_tracking")
async def get_income_tax_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get a summary of all income sources with their applicable taxes.
    Shows each income source with its specific and global taxes applied.
    """
    return await service.get_income_tax_summary(db, current_user.id)


# ============================================================================
# Tax Payments
# ============================================================================

@router.post("/payments", response_model=TaxPaymentResponse, status_code=201)
@require_feature("tax_tracking")
async def create_tax_payment(
    payment_data: TaxPaymentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Record a tax payment"""
    try:
        payment = await service.create_tax_payment(db, current_user.id, payment_data)
        return payment
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/payments", response_model=TaxPaymentListResponse)
@require_feature("tax_tracking")
async def list_tax_payments(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
    tax_id: Optional[UUID] = Query(None, description="Filter by tax ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all tax payments for the current user"""
    skip = (page - 1) * page_size
    payments, total = await service.get_tax_payments(
        db,
        current_user.id,
        tax_id=tax_id,
        skip=skip,
        limit=page_size
    )

    return TaxPaymentListResponse(
        items=payments,
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/payments/{payment_id}", response_model=TaxPaymentResponse)
@require_feature("tax_tracking")
async def get_tax_payment(
    payment_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific tax payment"""
    payment = await service.get_tax_payment(db, payment_id, current_user.id)
    if not payment:
        raise HTTPException(status_code=404, detail="Tax payment not found")
    return payment


@router.delete("/payments/{payment_id}", status_code=204)
@require_feature("tax_tracking")
async def delete_tax_payment(
    payment_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a tax payment"""
    success = await service.delete_tax_payment(db, payment_id, current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail="Tax payment not found")
    return None


@router.get("/{tax_id}/payments", response_model=TaxPaymentListResponse)
@require_feature("tax_tracking")
async def list_payments_for_tax(
    tax_id: UUID,
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all payments for a specific tax"""
    # Verify tax exists and belongs to user
    tax = await service.get_tax(db, tax_id, current_user.id)
    if not tax:
        raise HTTPException(status_code=404, detail="Tax not found")

    skip = (page - 1) * page_size
    payments, total = await service.get_tax_payments(
        db,
        current_user.id,
        tax_id=tax_id,
        skip=skip,
        limit=page_size
    )

    return TaxPaymentListResponse(
        items=payments,
        total=total,
        page=page,
        page_size=page_size
    )
