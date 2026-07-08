"""
Subscriptions module API routes
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
from app.modules.subscriptions import service
from app.modules.subscriptions.schemas import (
    SubscriptionCreate,
    SubscriptionUpdate,
    SubscriptionResponse,
    SubscriptionListResponse,
    SubscriptionStats,
    SubscriptionHistoryResponse,
    SubscriptionBatchDelete,
    SubscriptionBatchDeleteResponse,
    SubscriptionPaymentCreate,
    SubscriptionPaymentResponse,
    SubscriptionPaymentListResponse,
    SubscriptionPauseRequest,
)
from app.modules.subscriptions.service import (
    convert_subscription_to_display_currency,
    get_user_display_currency,
    get_subscription_history,
    pause_subscription,
    resume_subscription,
    cancel_subscription,
    get_subscription_payments,
    process_subscription_payment,
    get_due_subscriptions,
)

router = APIRouter(prefix="/api/v1/subscriptions", tags=["subscriptions"])


@router.post("", response_model=SubscriptionResponse, status_code=status.HTTP_201_CREATED)
@require_feature("subscription_tracking")
async def create_subscription(
    subscription_data: SubscriptionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new subscription"""
    # Check tier limits
    tier_limits = {
        "starter": 10,
        "growth": 50,
        "wealth": None  # Unlimited
    }

    # Get current count
    subscriptions, total = await service.list_subscriptions(
        db,
        current_user.id,
        skip=0,
        limit=1
    )

    # Check if limit exceeded
    limit = tier_limits.get(current_user.tier)
    if limit is not None and total >= limit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Subscription limit reached for {current_user.tier} tier ({limit} subscriptions)"
        )

    subscription = await service.create_subscription(db, current_user.id, subscription_data)
    return subscription


@router.get("", response_model=SubscriptionListResponse)
@require_feature("subscription_tracking")
async def list_subscriptions(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    category: Optional[str] = None,
    frequency: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all subscriptions with pagination and filters"""
    skip = (page - 1) * page_size
    subscriptions, total = await service.list_subscriptions(
        db,
        current_user.id,
        skip=skip,
        limit=page_size,
        category=category,
        frequency=frequency,
        is_active=is_active
    )

    # Convert each subscription to display currency
    subscription_dicts = []
    for subscription in subscriptions:
        await convert_subscription_to_display_currency(db, current_user.id, subscription)

        subscription_dict = {
            "id": str(subscription.id),
            "user_id": str(subscription.user_id),
            "name": subscription.name,
            "description": subscription.description,
            "category": subscription.category,
            "amount": float(subscription.amount) if subscription.amount else 0,
            "currency": subscription.currency,
            "frequency": subscription.frequency,
            "start_date": subscription.start_date.isoformat() if subscription.start_date else None,
            "end_date": subscription.end_date.isoformat() if subscription.end_date else None,
            "is_active": subscription.is_active,
            "status": subscription.status or "active",
            "created_at": subscription.created_at,
            "updated_at": subscription.updated_at,
            # Payment integration fields
            "payment_account_id": str(subscription.payment_account_id) if subscription.payment_account_id else None,
            "auto_pay": subscription.auto_pay,
            "next_payment_date": subscription.next_payment_date.isoformat() if subscription.next_payment_date else None,
            "last_payment_date": subscription.last_payment_date.isoformat() if subscription.last_payment_date else None,
            "reminder_days_before": subscription.reminder_days_before,
            "paused_at": subscription.paused_at.isoformat() if subscription.paused_at else None,
            "resume_date": subscription.resume_date.isoformat() if subscription.resume_date else None,
            # Display values
            "display_amount": float(subscription.display_amount) if hasattr(subscription, 'display_amount') and subscription.display_amount is not None else None,
            "display_currency": subscription.display_currency if hasattr(subscription, 'display_currency') and subscription.display_currency is not None else None,
            "display_monthly_equivalent": float(subscription.display_monthly_equivalent) if hasattr(subscription, 'display_monthly_equivalent') and subscription.display_monthly_equivalent is not None else None,
        }
        subscription_dicts.append(subscription_dict)

    return SubscriptionListResponse(
        items=subscription_dicts,
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/stats", response_model=SubscriptionStats)
@require_feature("subscription_tracking")
async def get_subscription_stats(
    start_date: Optional[datetime] = Query(None, description="Start date for filtering (ISO format)"),
    end_date: Optional[datetime] = Query(None, description="End date for filtering (ISO format)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get subscription statistics, optionally filtered by date range."""
    stats = await service.get_subscription_stats(db, current_user.id, start_date, end_date)
    # Update currency to user's display currency
    display_currency = await get_user_display_currency(db, current_user.id)
    stats.currency = display_currency
    return stats


@router.get("/history", response_model=SubscriptionHistoryResponse)
@require_feature("subscription_tracking")
async def get_subscription_history_endpoint(
    start_date: Optional[datetime] = Query(None, description="Start date for filtering (ISO format)"),
    end_date: Optional[datetime] = Query(None, description="End date for filtering (ISO format)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get subscription cost history grouped by month.

    Returns monthly totals and counts of subscriptions, along with overall average.
    If start_date and end_date are provided, filters history to that range.

    Requires: subscription_tracking feature
    """
    history = await get_subscription_history(db, current_user.id, start_date, end_date)
    return history


@router.get("/{subscription_id}", response_model=SubscriptionResponse)
@require_feature("subscription_tracking")
async def get_subscription(
    subscription_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific subscription"""
    subscription = await get_owned_or_404(
        service.get_subscription, db, current_user.id, subscription_id, detail="Subscription not found"
    )

    # Convert to display currency
    await convert_subscription_to_display_currency(db, current_user.id, subscription)

    subscription_dict = {
        "id": str(subscription.id),
        "user_id": str(subscription.user_id),
        "name": subscription.name,
        "description": subscription.description,
        "category": subscription.category,
        "amount": float(subscription.amount) if subscription.amount else 0,
        "currency": subscription.currency,
        "frequency": subscription.frequency,
        "start_date": subscription.start_date.isoformat() if subscription.start_date else None,
        "end_date": subscription.end_date.isoformat() if subscription.end_date else None,
        "is_active": subscription.is_active,
        "status": subscription.status or "active",
        "created_at": subscription.created_at,
        "updated_at": subscription.updated_at,
        # Payment integration fields
        "payment_account_id": str(subscription.payment_account_id) if subscription.payment_account_id else None,
        "auto_pay": subscription.auto_pay,
        "next_payment_date": subscription.next_payment_date.isoformat() if subscription.next_payment_date else None,
        "last_payment_date": subscription.last_payment_date.isoformat() if subscription.last_payment_date else None,
        "reminder_days_before": subscription.reminder_days_before,
        "paused_at": subscription.paused_at.isoformat() if subscription.paused_at else None,
        "resume_date": subscription.resume_date.isoformat() if subscription.resume_date else None,
        # Display values
        "display_amount": float(subscription.display_amount) if hasattr(subscription, 'display_amount') and subscription.display_amount is not None else None,
        "display_currency": subscription.display_currency if hasattr(subscription, 'display_currency') and subscription.display_currency is not None else None,
        "display_monthly_equivalent": float(subscription.display_monthly_equivalent) if hasattr(subscription, 'display_monthly_equivalent') and subscription.display_monthly_equivalent is not None else None,
    }

    return subscription_dict


@router.put("/{subscription_id}", response_model=SubscriptionResponse)
@require_feature("subscription_tracking")
async def update_subscription(
    subscription_id: UUID,
    subscription_data: SubscriptionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a subscription"""
    subscription = await service.update_subscription(
        db,
        current_user.id,
        subscription_id,
        subscription_data
    )
    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subscription not found"
        )
    return subscription


@router.delete("/{subscription_id}", status_code=status.HTTP_204_NO_CONTENT)
@require_feature("subscription_tracking")
async def delete_subscription(
    subscription_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a subscription"""
    deleted = await service.delete_subscription(db, current_user.id, subscription_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subscription not found"
        )


@router.post("/batch-delete", response_model=SubscriptionBatchDeleteResponse)
async def batch_delete_subscriptions(
    batch_data: SubscriptionBatchDelete,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete multiple subscriptions in a single request.

    Returns the count of successfully deleted items and any IDs that failed to delete.
    """
    deleted_count = 0
    failed_ids = []

    for item_id in batch_data.ids:
        try:
            success = await service.delete_subscription(db, current_user.id, item_id)
            if success:
                deleted_count += 1
            else:
                failed_ids.append(item_id)
        except Exception:
            failed_ids.append(item_id)

    return SubscriptionBatchDeleteResponse(
        deleted_count=deleted_count,
        failed_ids=failed_ids
    )


# ============== Payment Integration Endpoints ==============

@router.post("/{subscription_id}/pause", response_model=SubscriptionResponse)
@require_feature("subscription_tracking")
async def pause_subscription_endpoint(
    subscription_id: UUID,
    pause_data: SubscriptionPauseRequest = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Pause a subscription, optionally with a resume date"""
    subscription = await get_owned_or_404(
        service.get_subscription, db, current_user.id, subscription_id, detail="Subscription not found"
    )

    if subscription.status == "paused":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subscription is already paused"
        )

    resume_date = pause_data.resume_date if pause_data else None
    subscription = await pause_subscription(db, subscription, resume_date)

    return subscription


@router.post("/{subscription_id}/resume", response_model=SubscriptionResponse)
@require_feature("subscription_tracking")
async def resume_subscription_endpoint(
    subscription_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Resume a paused subscription"""
    subscription = await get_owned_or_404(
        service.get_subscription, db, current_user.id, subscription_id, detail="Subscription not found"
    )

    if subscription.status != "paused":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subscription is not paused"
        )

    subscription = await resume_subscription(db, subscription)

    return subscription


@router.post("/{subscription_id}/cancel", response_model=SubscriptionResponse)
@require_feature("subscription_tracking")
async def cancel_subscription_endpoint(
    subscription_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Cancel a subscription"""
    subscription = await get_owned_or_404(
        service.get_subscription, db, current_user.id, subscription_id, detail="Subscription not found"
    )

    if subscription.status == "cancelled":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subscription is already cancelled"
        )

    subscription = await cancel_subscription(db, subscription)

    return subscription


@router.get("/{subscription_id}/payments", response_model=SubscriptionPaymentListResponse)
@require_feature("subscription_tracking")
async def get_subscription_payments_endpoint(
    subscription_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get payment history for a subscription"""
    # Verify subscription exists and belongs to user
    subscription = await get_owned_or_404(
        service.get_subscription, db, current_user.id, subscription_id, detail="Subscription not found"
    )

    skip = (page - 1) * page_size
    payments, total = await get_subscription_payments(
        db, subscription_id, current_user.id, skip, page_size
    )

    payment_dicts = []
    for payment in payments:
        payment_dict = {
            "id": str(payment.id),
            "subscription_id": str(payment.subscription_id),
            "user_id": str(payment.user_id),
            "amount": float(payment.amount) if payment.amount else 0,
            "currency": payment.currency,
            "payment_date": payment.payment_date.isoformat() if payment.payment_date else None,
            "period_start": payment.period_start.isoformat() if payment.period_start else None,
            "period_end": payment.period_end.isoformat() if payment.period_end else None,
            "expense_id": str(payment.expense_id) if payment.expense_id else None,
            "account_transaction_id": str(payment.account_transaction_id) if payment.account_transaction_id else None,
            "status": payment.status,
            "notes": payment.notes,
            "created_at": payment.created_at,
        }
        payment_dicts.append(payment_dict)

    return SubscriptionPaymentListResponse(
        items=payment_dicts,
        total=total
    )


@router.post("/{subscription_id}/pay", response_model=SubscriptionPaymentResponse)
@require_feature("subscription_tracking")
async def record_subscription_payment(
    subscription_id: UUID,
    payment_data: SubscriptionPaymentCreate = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Manually record a subscription payment"""
    subscription = await get_owned_or_404(
        service.get_subscription, db, current_user.id, subscription_id, detail="Subscription not found"
    )

    payment_date = payment_data.payment_date if payment_data and payment_data.payment_date else None
    notes = payment_data.notes if payment_data else None

    try:
        payment = await process_subscription_payment(
            db, subscription, payment_date, notes
        )
        await db.commit()

        return {
            "id": str(payment.id),
            "subscription_id": str(payment.subscription_id),
            "user_id": str(payment.user_id),
            "amount": float(payment.amount) if payment.amount else 0,
            "currency": payment.currency,
            "payment_date": payment.payment_date.isoformat() if payment.payment_date else None,
            "period_start": payment.period_start.isoformat() if payment.period_start else None,
            "period_end": payment.period_end.isoformat() if payment.period_end else None,
            "expense_id": str(payment.expense_id) if payment.expense_id else None,
            "account_transaction_id": str(payment.account_transaction_id) if payment.account_transaction_id else None,
            "status": payment.status,
            "notes": payment.notes,
            "created_at": payment.created_at,
        }
    except InsufficientFundsError:
        # Get account details for detailed error response
        account_id = subscription.payment_account_id
        account_name = "Unknown"
        current_balance = None
        currency = subscription.currency or "USD"

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

        required_amount = float(subscription.amount) if subscription.amount else 0

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
@require_feature("subscription_tracking")
async def process_due_payments_endpoint(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Process all due subscription payments for the current user.

    This endpoint simulates what the Celery scheduled task does,
    but only for the current user's subscriptions. Useful for:
    - Local development without Celery
    - Manual processing of missed payments
    - Testing auto-pay functionality

    For each due subscription:
    1. Creates an expense record
    2. If auto_pay is enabled, deducts from linked account
    3. Records payment in subscription_payments table
    4. Updates next_payment_date
    """
    from datetime import timezone
    from app.modules.notifications.service import NotificationService
    from app.core.events import event_dispatcher, SubscriptionEvents

    now = datetime.now(timezone.utc)

    # Get all due subscriptions for this user
    all_due = await get_due_subscriptions(db, now)
    user_due = [s for s in all_due if s.user_id == current_user.id]

    processed = 0
    auto_paid = 0
    failed_payments = []
    errors = []

    for subscription in user_due:
        try:
            payment = await process_subscription_payment(
                db=db,
                subscription=subscription,
                payment_date=now.replace(tzinfo=None),
                notes="Auto-processed subscription payment (manual trigger)"
            )

            if payment:
                processed += 1

                if payment.account_transaction_id:
                    auto_paid += 1

                await event_dispatcher.dispatch(
                    SubscriptionEvents.RENEWAL_PROCESSED,
                    user_id=subscription.user_id,
                    subscription_id=str(subscription.id),
                    subscription_name=subscription.name,
                    amount=float(payment.amount),
                    currency=subscription.currency,
                    next_payment_date=subscription.next_payment_date.isoformat() if subscription.next_payment_date else None,
                    auto_paid=payment.account_transaction_id is not None,
                )

        except InsufficientFundsError:
            failed_payments.append({
                "subscription_id": str(subscription.id),
                "subscription_name": subscription.name,
                "reason": "insufficient_funds",
                "amount": float(subscription.amount),
                "currency": subscription.currency
            })

            # Get account details for notification
            account_result = await db.execute(
                select(SavingsAccount).where(SavingsAccount.id == subscription.payment_account_id)
            )
            account = account_result.scalar_one_or_none()
            account_name = account.name if account else "Unknown"
            current_balance = float(account.current_balance) if account else None

            notification_service = NotificationService(db)
            await notification_service.create_payment_failed_notification(
                user_id=subscription.user_id,
                payment_type="subscription",
                amount=subscription.amount,
                currency=subscription.currency,
                account_name=account_name,
                item_name=subscription.name,
                current_balance=current_balance
            )

        except Exception as e:
            errors.append({
                "subscription_id": str(subscription.id),
                "subscription_name": subscription.name,
                "error": str(e)
            })

    await db.commit()

    return {
        "status": "success",
        "due_count": len(user_due),
        "processed": processed,
        "auto_paid": auto_paid,
        "failed_payments": failed_payments,
        "errors": errors,
        "timestamp": now.isoformat()
    }
