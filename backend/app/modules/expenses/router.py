"""
Expenses API router
"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from uuid import UUID

from app.core.database import get_db
from app.core.permissions import get_current_user, require_feature, check_usage_limit
from app.core.exceptions import TierLimitException, NotFoundException
from app.models.user import User
from app.modules.expenses import service
from app.modules.expenses.schemas import (
    ExpenseCreate,
    ExpenseUpdate,
    Expense,
    ExpenseListResponse,
    ExpenseStats,
    ExpenseBatchDelete,
    ExpenseBatchDeleteResponse
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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List expenses with pagination and filters"""
    skip = (page - 1) * page_size
    expenses, total = await service.list_expenses(
        db,
        current_user.id,
        skip=skip,
        limit=page_size,
        category=category,
        is_active=is_active
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


@router.get("/{expense_id}", response_model=Expense)
@require_feature("expense_tracking")
async def get_expense(
    expense_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a single expense by ID"""
    expense = await service.get_expense(db, current_user.id, expense_id)
    if not expense:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Expense not found"
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
