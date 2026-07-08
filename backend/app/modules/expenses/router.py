"""
Expenses API router
"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from uuid import UUID

from app.core.database import get_db
from app.core.ownership import get_owned_or_404
from app.core.permissions import get_current_user, require_feature, check_usage_limit
from app.core.exceptions import TierLimitException
from app.models.user import User
from app.modules.expenses import service
from app.modules.expenses.schemas import (
    ExpenseCreate,
    ExpenseUpdate,
    Expense,
    ExpenseListResponse,
    ExpenseStats,
    ExpenseBatchDelete,
    ExpenseBatchDeleteResponse,
    ExpenseBatchCreate,
    ExpenseBatchCreateResponse,
    ExpenseBatchCreateError,
    ExpenseHistoryResponse,
    PayExpenseRequest,
    PayExpenseResponse,
    ExpensePaymentSummary
)

router = APIRouter(prefix="/api/v1/expenses", tags=["expenses"])


@router.post("", response_model=Expense, status_code=status.HTTP_201_CREATED)
@require_feature("expense_tracking")
async def create_expense(
    expense_data: ExpenseCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new expense.

    Requires: expense_tracking feature
    Limits:
    - Starter tier: 10 expenses
    - Growth tier: 100 expenses
    - Wealth tier: unlimited
    """
    # Check current count
    from sqlalchemy import select, func
    from app.modules.expenses.models import Expense as ExpenseModel

    count_query = select(func.count()).select_from(ExpenseModel).where(
        ExpenseModel.user_id == current_user.id
    )
    count_result = await db.execute(count_query)
    current_count = count_result.scalar_one()

    # Check tier limits
    has_capacity, limit = await check_usage_limit(
        current_user,
        "expense_tracking",
        current_count,
        db
    )

    if not has_capacity:
        tier_name = current_user.tier.name if current_user.tier else "free"
        raise TierLimitException(
            message=f"Expense limit reached. Your {tier_name} tier allows {limit} expenses.",
            current_tier=tier_name,
            required_tier="growth" if tier_name == "starter" else "wealth"
        )

    expense = await service.create_expense(db, current_user.id, expense_data)
    return expense


@router.get("")
@require_feature("expense_tracking")
async def list_expenses(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    category: Optional[str] = None,
    is_active: Optional[bool] = None,
    expense_status: Optional[str] = Query(None, alias="status"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List expenses with pagination and filters"""
    skip = (page - 1) * page_size
    expenses, total = await service.list_expenses_with_account_names(
        db,
        current_user.id,
        skip=skip,
        limit=page_size,
        category=category,
        is_active=is_active,
        status=expense_status
    )

    # Convert to dict and include display fields
    expense_dicts = []
    for expense in expenses:
        expense_dict = {
            "id": str(expense.id),
            "user_id": str(expense.user_id),
            "name": expense.name,
            "description": expense.description,
            "category": expense.category,
            "amount": float(expense.amount) if expense.amount else 0,
            "currency": expense.currency,
            "frequency": expense.frequency,
            "date": expense.date.isoformat() if expense.date else None,
            "start_date": expense.start_date.isoformat() if expense.start_date else None,
            "end_date": expense.end_date.isoformat() if expense.end_date else None,
            "is_active": expense.is_active,
            "tags": expense.tags,
            "monthly_equivalent": float(expense.monthly_equivalent) if expense.monthly_equivalent else None,
            "created_at": expense.created_at.isoformat(),
            "updated_at": expense.updated_at.isoformat(),
            "display_amount": float(expense.display_amount) if hasattr(expense, 'display_amount') and expense.display_amount is not None else None,
            "display_currency": expense.display_currency if hasattr(expense, 'display_currency') and expense.display_currency is not None else None,
            "display_monthly_equivalent": float(expense.display_monthly_equivalent) if hasattr(expense, 'display_monthly_equivalent') and expense.display_monthly_equivalent is not None else None,
            # Payment integration fields
            "payment_account_id": str(expense.payment_account_id) if expense.payment_account_id else None,
            "payment_method": expense.payment_method,
            "status": expense.status,
            "paid_date": expense.paid_date.isoformat() if expense.paid_date else None,
            "paid_amount": float(expense.paid_amount) if expense.paid_amount else None,
            "account_transaction_id": str(expense.account_transaction_id) if expense.account_transaction_id else None,
            "receipt_url": expense.receipt_url,
            "payment_account_name": expense.payment_account_name if hasattr(expense, 'payment_account_name') else None,
            "auto_pay": expense.auto_pay if hasattr(expense, 'auto_pay') else False,
        }
        expense_dicts.append(expense_dict)

    return {
        "items": expense_dicts,
        "total": total,
        "page": page,
        "page_size": page_size
    }


@router.get("/stats", response_model=ExpenseStats)
@require_feature("expense_tracking")
async def get_expense_stats(
    start_date: Optional[datetime] = Query(None, description="Start date for filtering (ISO format)"),
    end_date: Optional[datetime] = Query(None, description="End date for filtering (ISO format)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get expense statistics.

    If start_date and end_date are provided, calculates expenses for that period.
    Otherwise, returns statistics for all active expenses using monthly equivalents.
    """
    stats = await service.get_expense_stats(db, current_user.id, start_date, end_date)
    return stats


@router.get("/history", response_model=ExpenseHistoryResponse)
@require_feature("expense_tracking")
async def get_expense_history(
    start_date: Optional[datetime] = Query(None, description="Start date for filtering (ISO format)"),
    end_date: Optional[datetime] = Query(None, description="End date for filtering (ISO format)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get expense history grouped by month.

    Returns monthly totals and counts of expenses, along with overall average.
    If start_date and end_date are provided, filters history to that range.
    """
    history = await service.get_expense_history(db, current_user.id, start_date, end_date)
    return history


@router.get("/{expense_id}", response_model=Expense)
@require_feature("expense_tracking")
async def get_expense(
    expense_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a single expense by ID"""
    expense = await get_owned_or_404(
        service.get_expense, db, current_user.id, expense_id, detail="Expense not found"
    )
    return expense


@router.put("/{expense_id}", response_model=Expense)
@require_feature("expense_tracking")
async def update_expense(
    expense_id: UUID,
    expense_data: ExpenseUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update an expense"""
    expense = await service.update_expense(db, current_user.id, expense_id, expense_data)
    if not expense:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Expense not found"
        )
    return expense


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
@require_feature("expense_tracking")
async def delete_expense(
    expense_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete an expense"""
    success = await service.delete_expense(db, current_user.id, expense_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Expense not found"
        )
    return None


@router.post("/batch-create", response_model=ExpenseBatchCreateResponse, status_code=status.HTTP_201_CREATED)
@require_feature("batch_operations")
async def batch_create_expenses(
    batch_data: ExpenseBatchCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Create multiple expenses in a single request.

    Requires: batch_operations feature (Growth/Wealth tier)

    Returns the count of successfully created expenses and any errors for failed ones.
    """
    # Check current count
    from sqlalchemy import select, func
    from app.modules.expenses.models import Expense as ExpenseModel

    count_query = select(func.count()).select_from(ExpenseModel).where(
        ExpenseModel.user_id == current_user.id
    )
    count_result = await db.execute(count_query)
    current_count = count_result.scalar_one()

    # Check if user has capacity for all expenses
    total_needed = current_count + len(batch_data.expenses)
    has_capacity, limit = await check_usage_limit(
        current_user,
        "expense_tracking",
        total_needed - 1,  # -1 because check_usage_limit checks if current+1 exceeds limit
        db
    )

    if not has_capacity:
        tier_name = current_user.tier.name if current_user.tier else "free"
        raise TierLimitException(
            message=f"Cannot create {len(batch_data.expenses)} expenses. Your {tier_name} tier allows {limit} expenses and you currently have {current_count}.",
            current_tier=tier_name,
            required_tier="growth" if tier_name == "starter" else "wealth"
        )

    created_expenses = []
    errors = []

    for index, expense_data in enumerate(batch_data.expenses):
        try:
            expense = await service.create_expense(db, current_user.id, expense_data)
            created_expenses.append(expense)
        except Exception as e:
            errors.append(ExpenseBatchCreateError(
                index=index,
                error=str(e)
            ))

    return ExpenseBatchCreateResponse(
        created_count=len(created_expenses),
        created_expenses=created_expenses,
        failed_count=len(errors),
        errors=errors
    )


@router.post("/batch-delete", response_model=ExpenseBatchDeleteResponse)
@require_feature("expense_tracking")
async def batch_delete_expenses(
    batch_data: ExpenseBatchDelete,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Delete multiple expenses in a single request.

    Returns the count of successfully deleted expenses and any IDs that failed to delete.
    """
    deleted_count = 0
    failed_ids = []

    for expense_id in batch_data.expense_ids:
        try:
            success = await service.delete_expense(db, current_user.id, expense_id)
            if success:
                deleted_count += 1
            else:
                failed_ids.append(expense_id)
        except Exception:
            failed_ids.append(expense_id)

    return ExpenseBatchDeleteResponse(
        deleted_count=deleted_count,
        failed_ids=failed_ids
    )


# ============================================================================
# Payment Integration Endpoints (Phase 3)
# ============================================================================

@router.get("/pending", response_model=ExpenseListResponse)
@require_feature("expense_tracking")
async def list_pending_expenses(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all pending expenses for the current user."""
    skip = (page - 1) * page_size
    expenses, total = await service.get_pending_expenses(
        db,
        current_user.id,
        skip=skip,
        limit=page_size
    )

    return ExpenseListResponse(
        items=expenses,
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/overdue", response_model=ExpenseListResponse)
@require_feature("expense_tracking")
async def list_overdue_expenses(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all overdue expenses for the current user."""
    skip = (page - 1) * page_size
    expenses, total = await service.get_overdue_expenses(
        db,
        current_user.id,
        skip=skip,
        limit=page_size
    )

    return ExpenseListResponse(
        items=expenses,
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/payment-summary", response_model=ExpensePaymentSummary)
@require_feature("expense_tracking")
async def get_payment_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get expense payment summary for the current user."""
    summary = await service.get_expense_payment_summary(db, current_user.id)
    return summary


@router.post("/{expense_id}/pay", response_model=PayExpenseResponse)
@require_feature("expense_tracking")
async def pay_expense(
    expense_id: UUID,
    pay_request: PayExpenseRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Mark an expense as paid and optionally deduct from a linked account.

    If account_id is provided (or expense has payment_account_id),
    the amount will be deducted from that account as a withdrawal.
    """
    from app.modules.savings.transaction_service import InsufficientFundsError
    from app.modules.savings.models import SavingsAccount
    from app.modules.expenses.models import Expense as ExpenseModel
    from sqlalchemy import select

    try:
        response = await service.pay_expense(
            db,
            current_user.id,
            expense_id,
            pay_request
        )
        return response
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except InsufficientFundsError:
        # Get expense and account details for detailed error response
        expense_result = await db.execute(
            select(ExpenseModel).where(
                ExpenseModel.id == expense_id,
                ExpenseModel.user_id == current_user.id
            )
        )
        expense = expense_result.scalar_one_or_none()

        account_id = pay_request.account_id or (expense.payment_account_id if expense else None)
        account_name = "Unknown"
        current_balance = None
        currency = "USD"

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

        required_amount = float(pay_request.amount or (expense.amount if expense else 0))

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


@router.post("/{expense_id}/cancel", response_model=Expense)
@require_feature("expense_tracking")
async def cancel_expense(
    expense_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Cancel an expense (set status to cancelled)."""
    expense = await service.cancel_expense(db, current_user.id, expense_id)
    if not expense:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Expense not found"
        )
    return expense


@router.post("/process-due-payments", status_code=status.HTTP_200_OK)
@require_feature("expense_tracking")
async def process_due_payments_endpoint(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Process all due recurring expense payments for the current user.

    This endpoint simulates what the Celery scheduled task does,
    but only for the current user's expenses. Useful for:
    - Local development without Celery
    - Manual processing of missed payments
    - Testing auto-pay functionality

    For each due recurring expense with auto_pay enabled:
    1. Checks if payment is due today based on frequency
    2. If auto_pay is enabled, deducts from linked account
    3. Marks expense as paid
    """
    from datetime import timezone
    from sqlalchemy import select, and_
    from app.modules.expenses.models import Expense as ExpenseModel, ExpenseFrequency, ExpenseStatus
    from app.modules.savings.transaction_service import InsufficientFundsError
    from app.modules.savings.models import SavingsAccount
    from app.modules.notifications.service import NotificationService

    def is_expense_due_today(frequency: str, start_date: datetime) -> bool:
        """Check if an expense is due today based on its frequency and start date."""
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        start = start_date.replace(hour=0, minute=0, second=0, microsecond=0)

        if start > today:
            return False

        days_since_start = (today - start).days

        if frequency == 'daily':
            return True
        elif frequency == 'weekly':
            return days_since_start % 7 == 0
        elif frequency == 'biweekly':
            return days_since_start % 14 == 0
        elif frequency == 'monthly':
            return today.day == start.day
        elif frequency == 'quarterly':
            months_diff = (today.year - start.year) * 12 + (today.month - start.month)
            return months_diff % 3 == 0 and today.day == start.day
        elif frequency == 'annually':
            return today.month == start.month and today.day == start.day
        return False

    now = datetime.now(timezone.utc)

    # Get all active recurring expenses with payment account for this user (manual processing doesn't require auto_pay)
    result = await db.execute(
        select(ExpenseModel).where(
            and_(
                ExpenseModel.user_id == current_user.id,
                ExpenseModel.is_active == True,
                ExpenseModel.deleted_at.is_(None),
                ExpenseModel.payment_account_id.isnot(None),
                ExpenseModel.frequency != ExpenseFrequency.ONE_TIME.value,
                ExpenseModel.start_date.isnot(None)
            )
        )
    )
    expenses = list(result.scalars().all())

    due_count = 0
    processed = 0
    auto_paid = 0
    failed_payments = []
    errors = []

    for expense in expenses:
        try:
            # Skip if not due today
            freq_value = expense.frequency.value if hasattr(expense.frequency, 'value') else expense.frequency
            if not is_expense_due_today(freq_value, expense.start_date):
                continue

            # Skip if already paid today
            if expense.paid_date and expense.paid_date.date() == datetime.utcnow().date():
                continue

            due_count += 1

            # Reset status to pending
            expense.status = ExpenseStatus.PENDING.value

            # Try to pay from linked account
            try:
                pay_request = PayExpenseRequest(
                    account_id=expense.payment_account_id,
                    description=f"Auto-payment for recurring expense: {expense.name} (manual trigger)"
                )
                await service.pay_expense(db, current_user.id, expense.id, pay_request)
                auto_paid += 1
                processed += 1
            except InsufficientFundsError:
                expense.status = ExpenseStatus.PAYMENT_FAILED.value
                failed_payments.append({
                    "expense_id": str(expense.id),
                    "expense_name": expense.name,
                    "reason": "insufficient_funds",
                    "amount": float(expense.amount),
                    "currency": expense.currency
                })

                # Get account details for notification
                account_result = await db.execute(
                    select(SavingsAccount).where(SavingsAccount.id == expense.payment_account_id)
                )
                account = account_result.scalar_one_or_none()
                account_name = account.name if account else "Unknown"
                current_balance = float(account.current_balance) if account else None

                notification_service = NotificationService(db)
                await notification_service.create_payment_failed_notification(
                    user_id=expense.user_id,
                    payment_type="expense",
                    amount=expense.amount,
                    currency=expense.currency,
                    account_name=account_name,
                    item_name=expense.name,
                    current_balance=current_balance
                )

        except Exception as e:
            errors.append({
                "expense_id": str(expense.id),
                "expense_name": expense.name,
                "error": str(e)
            })

    await db.commit()

    return {
        "status": "success",
        "due_count": due_count,
        "processed": processed,
        "auto_paid": auto_paid,
        "failed_payments": failed_payments,
        "errors": errors,
        "timestamp": now.isoformat()
    }
