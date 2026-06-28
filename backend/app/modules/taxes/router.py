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
    PayTaxRequest,
    PayTaxResponse,
    ProcessDuePaymentsResponse,
    FailedTaxPaymentInfo,
    TaxPaymentError)

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
    from app.modules.savings.models import SavingsAccount
    from sqlalchemy import select

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
        error_str = str(e)
        # Check if this is an insufficient funds error
        if "Insufficient balance" in error_str:
            # Get tax and account details for detailed error response
            tax = await service.get_tax(db, tax_id, current_user.id)
            account_id = request.account_id if request and request.account_id else (tax.payment_account_id if tax else None)

            account_name = "Unknown"
            current_balance = None
            currency = "USD"
            required_amount = None

            if account_id:
                account_result = await db.execute(
                    select(SavingsAccount).where(
                        SavingsAccount.id == account_id,
                        SavingsAccount.user_id == current_user.id
                    )
                )
                account = account_result.scalar_one_or_none()
                if account:
                    account_name = account.name
                    current_balance = float(account.current_balance)
                    currency = account.currency

            # Try to extract required amount from error message
            import re
            match = re.search(r"Required: ([\d.]+)", error_str)
            if match:
                required_amount = float(match.group(1))

            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Insufficient funds",
                    "error_code": "INSUFFICIENT_FUNDS",
                    "account_name": account_name,
                    "current_balance": current_balance,
                    "required_amount": required_amount,
                    "currency": currency
                }
            )
        raise HTTPException(status_code=400, detail=error_str)


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


# ============================================================================
# Process Due Payments
# ============================================================================

@router.post("/process-due-payments", response_model=ProcessDuePaymentsResponse)
@require_feature("tax_tracking")
async def process_due_payments(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Process all due tax payments for the current user.

    This endpoint manually triggers processing of due tax payments.
    It checks for taxes with:
    - is_active = True
    - payment_account_id set
    - Not yet paid for the current period

    Returns a summary of processed payments, including any failures.
    """
    from datetime import datetime
    from decimal import Decimal

    now = datetime.utcnow()
    processed = 0
    auto_paid = 0
    failed_payments = []
    errors = []
    skipped_already_paid = 0

    # Get all active taxes with a payment account for this user
    from sqlalchemy import select, and_
    from sqlalchemy.orm import selectinload
    from app.modules.taxes.models import Tax
    from app.modules.taxes.service import get_tax_payment_status

    query = (
        select(Tax)
        .options(
            selectinload(Tax.income_source),
            selectinload(Tax.payment_account)
        )
        .where(
            and_(
                Tax.user_id == current_user.id,
                Tax.is_active == True,
                Tax.deleted_at.is_(None),
                Tax.payment_account_id.isnot(None)
            )
        )
    )
    result = await db.execute(query)
    candidate_taxes = list(result.scalars().all())

    # Filter to only taxes that are not paid for the current period
    due_taxes = []
    for tax in candidate_taxes:
        payment_status = await get_tax_payment_status(db, tax)
        if not payment_status["is_paid"]:
            due_taxes.append(tax)
        else:
            skipped_already_paid += 1

    for tax in due_taxes:
        try:
            # Convert tax to display currency to get calculated amount
            await service.convert_tax_to_display_currency(db, current_user.id, tax)

            # Get payment amount (use calculated_amount for percentage taxes, fixed_amount for fixed)
            payment_amount = Decimal("0")
            currency = tax.currency

            if tax.tax_type == "fixed" and tax.fixed_amount:
                payment_amount = tax.fixed_amount
            elif tax.calculated_amount:
                payment_amount = tax.calculated_amount
                currency = tax.display_currency or tax.currency

            if payment_amount <= 0:
                errors.append(TaxPaymentError(
                    tax_id=tax.id,
                    tax_name=tax.name,
                    error="Could not calculate tax amount"
                ))
                continue

            # Attempt to pay (is_auto_pay=False since this is manual processing)
            payment, transaction_id = await service.pay_tax(
                db=db,
                user_id=current_user.id,
                tax_id=tax.id,
                request=None,
                is_auto_pay=False
            )

            processed += 1

        except ValueError as e:
            error_str = str(e)
            if "Insufficient balance" in error_str:
                # Get payment amount for the failure info
                payment_amount = tax.calculated_amount or tax.fixed_amount or Decimal("0")
                currency = tax.display_currency or tax.currency

                failed_payments.append(FailedTaxPaymentInfo(
                    tax_id=tax.id,
                    tax_name=tax.name,
                    reason="Insufficient funds in payment account",
                    amount=payment_amount,
                    currency=currency
                ))
            else:
                errors.append(TaxPaymentError(
                    tax_id=tax.id,
                    tax_name=tax.name,
                    error=error_str
                ))

        except Exception as e:
            errors.append(TaxPaymentError(
                tax_id=tax.id,
                tax_name=tax.name,
                error=str(e)
            ))

    return ProcessDuePaymentsResponse(
        status="completed",
        due_count=len(due_taxes),
        processed=processed,
        auto_paid=auto_paid,
        failed_payments=failed_payments,
        errors=errors,
        timestamp=now
    )
