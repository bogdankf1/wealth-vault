"""
Installments module API routes.
"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from uuid import UUID

from sqlalchemy import select

from app.core.database import get_db
from app.core.ownership import get_owned_or_404
from app.core.permissions import get_current_user, require_feature
from app.models.user import User
from app.modules.savings.transaction_service import InsufficientFundsError
from app.modules.savings.models import SavingsAccount
from app.modules.installments import service
from app.modules.installments.schemas import (
    InstallmentCreate,
    InstallmentUpdate,
    InstallmentResponse,
    InstallmentListResponse,
    InstallmentStats,
    InstallmentHistoryResponse,
    InstallmentBatchDelete,
    InstallmentBatchDeleteResponse,
    InstallmentPaymentCreate,
    InstallmentPaymentResponse,
    InstallmentPaymentListResponse,
    InstallmentMarkDefaultedRequest,
)
from app.modules.installments.service import (
    convert_installment_to_display_currency,
    get_user_display_currency,
    get_installment_history,
    mark_installment_completed,
    mark_installment_defaulted,
    reactivate_installment,
    get_installment_payments,
    process_installment_payment,
    get_due_installments,
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
            "status": getattr(installment, 'status', 'active') or 'active',
            "remaining_balance": float(installment.remaining_balance) if installment.remaining_balance is not None else None,
            "created_at": installment.created_at,
            "updated_at": installment.updated_at,
            # Payment integration fields
            "payment_account_id": str(installment.payment_account_id) if installment.payment_account_id else None,
            "auto_pay": getattr(installment, 'auto_pay', False),
            "next_payment_date": installment.next_payment_date.isoformat() if getattr(installment, 'next_payment_date', None) else None,
            "last_payment_date": installment.last_payment_date.isoformat() if getattr(installment, 'last_payment_date', None) else None,
            "reminder_days_before": getattr(installment, 'reminder_days_before', 3),
            # Display values
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


@router.get("/history", response_model=InstallmentHistoryResponse)
@require_feature("installment_tracking")
async def get_installment_history_endpoint(
    start_date: Optional[datetime] = Query(None, description="Start date for filtering (ISO format)"),
    end_date: Optional[datetime] = Query(None, description="End date for filtering (ISO format)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get installment payment history grouped by month.

    Returns monthly totals and counts of installments, along with overall average.
    If start_date and end_date are provided, filters history to that range.

    Requires: installment_tracking feature
    """
    history = await get_installment_history(db, current_user.id, start_date, end_date)
    return history


@router.get("/{installment_id}", response_model=InstallmentResponse)
@require_feature("installment_tracking")
async def get_installment(
    installment_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a single installment"""
    installment = await get_owned_or_404(
        service.get_installment, db, current_user.id, installment_id, detail="Installment not found"
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
        "status": getattr(installment, 'status', 'active') or 'active',
        "remaining_balance": float(installment.remaining_balance) if installment.remaining_balance is not None else None,
        "created_at": installment.created_at,
        "updated_at": installment.updated_at,
        # Payment integration fields
        "payment_account_id": str(installment.payment_account_id) if installment.payment_account_id else None,
        "auto_pay": getattr(installment, 'auto_pay', False),
        "next_payment_date": installment.next_payment_date.isoformat() if getattr(installment, 'next_payment_date', None) else None,
        "last_payment_date": installment.last_payment_date.isoformat() if getattr(installment, 'last_payment_date', None) else None,
        "reminder_days_before": getattr(installment, 'reminder_days_before', 3),
        # Display values
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


# ============== Payment Integration Endpoints ==============

@router.post("/{installment_id}/complete", response_model=InstallmentResponse)
@require_feature("installment_tracking")
async def complete_installment_endpoint(
    installment_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark an installment as completed (all payments made)"""
    installment = await get_owned_or_404(
        service.get_installment, db, current_user.id, installment_id, detail="Installment not found"
    )

    if getattr(installment, 'status', 'active') == "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Installment is already completed"
        )

    installment = await mark_installment_completed(db, installment)
    return installment


@router.post("/{installment_id}/default", response_model=InstallmentResponse)
@require_feature("installment_tracking")
async def default_installment_endpoint(
    installment_id: UUID,
    default_data: InstallmentMarkDefaultedRequest = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark an installment as defaulted"""
    installment = await get_owned_or_404(
        service.get_installment, db, current_user.id, installment_id, detail="Installment not found"
    )

    if getattr(installment, 'status', 'active') == "defaulted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Installment is already defaulted"
        )

    reason = default_data.reason if default_data else None
    installment = await mark_installment_defaulted(db, installment, reason)
    return installment


@router.post("/{installment_id}/reactivate", response_model=InstallmentResponse)
@require_feature("installment_tracking")
async def reactivate_installment_endpoint(
    installment_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Reactivate a completed or defaulted installment"""
    installment = await get_owned_or_404(
        service.get_installment, db, current_user.id, installment_id, detail="Installment not found"
    )

    if getattr(installment, 'status', 'active') == "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Installment is already active"
        )

    installment = await reactivate_installment(db, installment)
    return installment


@router.get("/{installment_id}/payments", response_model=InstallmentPaymentListResponse)
@require_feature("installment_tracking")
async def get_installment_payments_endpoint(
    installment_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get payment history for an installment"""
    # Verify installment exists and belongs to user
    installment = await get_owned_or_404(
        service.get_installment, db, current_user.id, installment_id, detail="Installment not found"
    )

    skip = (page - 1) * page_size
    payments, total = await get_installment_payments(
        db, installment_id, current_user.id, skip, page_size
    )

    payment_dicts = []
    for payment in payments:
        payment_dict = {
            "id": str(payment.id),
            "installment_id": str(payment.installment_id),
            "user_id": str(payment.user_id),
            "payment_number": payment.payment_number,
            "scheduled_date": payment.scheduled_date.isoformat() if payment.scheduled_date else None,
            "actual_payment_date": payment.actual_payment_date.isoformat() if payment.actual_payment_date else None,
            "scheduled_amount": float(payment.scheduled_amount) if payment.scheduled_amount else 0,
            "actual_amount": float(payment.actual_amount) if payment.actual_amount else None,
            "principal_amount": float(payment.principal_amount) if payment.principal_amount else None,
            "interest_amount": float(payment.interest_amount) if payment.interest_amount else None,
            "currency": payment.currency,
            "expense_id": str(payment.expense_id) if payment.expense_id else None,
            "account_transaction_id": str(payment.account_transaction_id) if payment.account_transaction_id else None,
            "status": payment.status,
            "is_late": payment.is_late,
            "days_late": payment.days_late,
            "notes": payment.notes,
            "created_at": payment.created_at,
        }
        payment_dicts.append(payment_dict)

    return InstallmentPaymentListResponse(
        items=payment_dicts,
        total=total
    )


@router.post("/{installment_id}/pay", response_model=InstallmentPaymentResponse)
@require_feature("installment_tracking")
async def record_installment_payment(
    installment_id: UUID,
    payment_data: InstallmentPaymentCreate = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Manually record an installment payment"""
    installment = await get_owned_or_404(
        service.get_installment, db, current_user.id, installment_id, detail="Installment not found"
    )

    if getattr(installment, 'status', 'active') == "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Installment is already completed"
        )

    payment_date = payment_data.payment_date if payment_data and payment_data.payment_date else None
    amount = payment_data.amount if payment_data and payment_data.amount else None
    payment_number = payment_data.payment_number if payment_data and payment_data.payment_number else None
    notes = payment_data.notes if payment_data else None

    try:
        payment = await process_installment_payment(
            db, installment, payment_number, payment_date, amount, notes
        )
        await db.commit()

        return {
            "id": str(payment.id),
            "installment_id": str(payment.installment_id),
            "user_id": str(payment.user_id),
            "payment_number": payment.payment_number,
            "scheduled_date": payment.scheduled_date.isoformat() if payment.scheduled_date else None,
            "actual_payment_date": payment.actual_payment_date.isoformat() if payment.actual_payment_date else None,
            "scheduled_amount": float(payment.scheduled_amount) if payment.scheduled_amount else 0,
            "actual_amount": float(payment.actual_amount) if payment.actual_amount else None,
            "principal_amount": float(payment.principal_amount) if payment.principal_amount else None,
            "interest_amount": float(payment.interest_amount) if payment.interest_amount else None,
            "currency": payment.currency,
            "expense_id": str(payment.expense_id) if payment.expense_id else None,
            "account_transaction_id": str(payment.account_transaction_id) if payment.account_transaction_id else None,
            "status": payment.status,
            "is_late": payment.is_late,
            "days_late": payment.days_late,
            "notes": payment.notes,
            "created_at": payment.created_at,
        }
    except InsufficientFundsError:
        # Get account details for detailed error response
        account_id = installment.payment_account_id
        account_name = "Unknown"
        current_balance = None
        currency = installment.currency or "USD"

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

        required_amount = float(installment.amount_per_payment) if installment.amount_per_payment else 0

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Insufficient funds",
                "error_code": "INSUFFICIENT_FUNDS",
                "account_name": account_name,
                "current_balance": current_balance,
                "required_amount": required_amount,
                "currency": currency
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process payment: {str(e)}"
        )


@router.post("/process-due-payments", status_code=status.HTTP_200_OK)
@require_feature("installment_tracking")
async def process_due_payments_endpoint(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Process all due installment payments for the current user.

    This endpoint simulates what the Celery scheduled task does,
    but only for the current user's installments. Useful for:
    - Local development without Celery
    - Manual processing of missed payments
    - Testing auto-pay functionality

    For each due installment:
    1. Creates an expense record
    2. If auto_pay is enabled, deducts from linked account
    3. Records payment in installment_payments table
    4. Updates next_payment_date and payments_made
    """
    from datetime import timezone
    from app.modules.notifications.service import NotificationService
    from app.core.events import event_dispatcher, InstallmentEvents

    now = datetime.now(timezone.utc)

    # Get all due installments for this user
    all_due = await get_due_installments(db, now)
    user_due = [i for i in all_due if i.user_id == current_user.id]

    processed = 0
    auto_paid = 0
    completed = 0
    failed_payments = []
    errors = []

    for installment in user_due:
        try:
            payment = await process_installment_payment(
                db=db,
                installment=installment,
                payment_date=now.replace(tzinfo=None),
                notes="Auto-processed installment payment (manual trigger)"
            )

            if payment:
                processed += 1

                if payment.account_transaction_id:
                    auto_paid += 1

                if installment.status == "completed":
                    completed += 1
                    await event_dispatcher.dispatch(
                        InstallmentEvents.COMPLETED,
                        user_id=installment.user_id,
                        installment_id=str(installment.id),
                        installment_name=installment.name,
                        total_paid=float(installment.total_amount),
                        currency=installment.currency,
                    )
                else:
                    await event_dispatcher.dispatch(
                        InstallmentEvents.PAYMENT_PROCESSED,
                        user_id=installment.user_id,
                        installment_id=str(installment.id),
                        installment_name=installment.name,
                        payment_number=payment.payment_number,
                        amount=float(payment.actual_amount or payment.scheduled_amount),
                        currency=installment.currency,
                        next_payment_date=installment.next_payment_date.isoformat() if installment.next_payment_date else None,
                        auto_paid=payment.account_transaction_id is not None,
                        payments_remaining=installment.number_of_payments - installment.payments_made,
                    )

        except InsufficientFundsError:
            failed_payments.append({
                "installment_id": str(installment.id),
                "installment_name": installment.name,
                "reason": "insufficient_funds",
                "amount": float(installment.amount_per_payment),
                "currency": installment.currency
            })

            # Get account details for notification
            account_result = await db.execute(
                select(SavingsAccount).where(SavingsAccount.id == installment.payment_account_id)
            )
            account = account_result.scalar_one_or_none()
            account_name = account.name if account else "Unknown"
            current_balance = float(account.current_balance) if account else None

            notification_service = NotificationService(db)
            await notification_service.create_payment_failed_notification(
                user_id=installment.user_id,
                payment_type="installment",
                amount=installment.amount_per_payment,
                currency=installment.currency,
                account_name=account_name,
                item_name=installment.name,
                current_balance=current_balance
            )

        except Exception as e:
            errors.append({
                "installment_id": str(installment.id),
                "installment_name": installment.name,
                "error": str(e)
            })

    await db.commit()

    return {
        "status": "success",
        "due_count": len(user_due),
        "processed": processed,
        "auto_paid": auto_paid,
        "completed": completed,
        "failed_payments": failed_payments,
        "errors": errors,
        "timestamp": now.isoformat()
    }
