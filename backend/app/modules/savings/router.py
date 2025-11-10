"""
Savings API router
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from uuid import UUID

from app.core.database import get_db
from app.core.permissions import get_current_user, require_feature, check_usage_limit
from app.core.exceptions import TierLimitException
from app.models.user import User
from app.modules.savings import service
from app.modules.savings.models import AccountType
from app.modules.savings.schemas import (
    SavingsAccountCreate,
    SavingsAccountUpdate,
    SavingsAccountResponse,
    SavingsAccountListResponse,
    BalanceHistoryCreate,
    BalanceHistoryResponse,
    BalanceHistoryListResponse,
    SavingsStats,
    SavingsAccountBatchDelete,
    SavingsAccountBatchDeleteResponse)
from app.modules.savings.service import convert_account_to_display_currency

router = APIRouter(prefix="/api/v1/savings", tags=["savings"])


# ============================================================================
# Savings Accounts Endpoints
# ============================================================================

@router.post("/accounts", response_model=SavingsAccountResponse, status_code=status.HTTP_201_CREATED)
@require_feature("savings_tracking")
async def create_account(
    account_data: SavingsAccountCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new savings account.

    Requires: savings_tracking feature
    Limits:
    - Starter tier: 3 accounts
    - Growth tier: 10 accounts
    - Wealth tier: unlimited
    """
    # Check current count
    from sqlalchemy import select, func
    from app.modules.savings.models import SavingsAccount

    count_query = select(func.count()).select_from(SavingsAccount).where(
        SavingsAccount.user_id == current_user.id
    )
    count_result = await db.execute(count_query)
    current_count = count_result.scalar_one()

    # Check tier limits
    has_capacity, limit = await check_usage_limit(
        current_user,
        "savings_tracking",
        current_count,
        db
    )

    if not has_capacity:
        tier_name = current_user.tier.name if current_user.tier else "free"
        raise TierLimitException(
            message=f"Savings account limit reached. Your {tier_name} tier allows {limit} accounts.",
            current_tier=tier_name,
            required_tier="growth" if tier_name == "starter" else "wealth"
        )

    account = await service.create_account(db, current_user.id, account_data)
    return account


@router.get("/accounts", response_model=SavingsAccountListResponse)
@require_feature("savings_tracking")
async def list_accounts(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    account_type: Optional[AccountType] = None,
    is_active: Optional[bool] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List savings accounts with pagination and filters"""
    skip = (page - 1) * page_size
    accounts, total = await service.list_accounts(
        db,
        current_user.id,
        skip=skip,
        limit=page_size,
        account_type=account_type,
        is_active=is_active
    )

    # Convert each account to display currency
    for account in accounts:
        await convert_account_to_display_currency(db, current_user.id, account)

    return SavingsAccountListResponse(
        items=accounts,
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/accounts/{account_id}", response_model=SavingsAccountResponse)
@require_feature("savings_tracking")
async def get_account(
    account_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a single savings account by ID"""
    account = await service.get_account(db, current_user.id, account_id)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Savings account not found"
        )

    # Convert to display currency
    await convert_account_to_display_currency(db, current_user.id, account)

    return account


@router.put("/accounts/{account_id}", response_model=SavingsAccountResponse)
@require_feature("savings_tracking")
async def update_account(
    account_id: UUID,
    account_data: SavingsAccountUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a savings account"""
    account = await service.update_account(db, current_user.id, account_id, account_data)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Savings account not found"
        )
    return account


@router.delete("/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
@require_feature("savings_tracking")
async def delete_account(
    account_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a savings account"""
    success = await service.delete_account(db, current_user.id, account_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Savings account not found"
        )
    return None


# ============================================================================
# Balance History Endpoints
# ============================================================================

@router.get("/accounts/{account_id}/history", response_model=BalanceHistoryListResponse)
@require_feature("savings_tracking")
async def get_balance_history(
    account_id: UUID,
    days: int = Query(30, ge=1, le=365, description="Number of days of history"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get balance history for an account"""
    history = await service.get_balance_history(db, current_user.id, account_id, days)
    return BalanceHistoryListResponse(
        items=history,
        total=len(history)
    )


@router.post("/accounts/{account_id}/history", response_model=BalanceHistoryResponse, status_code=status.HTTP_201_CREATED)
@require_feature("savings_tracking")
async def add_balance_history(
    account_id: UUID,
    history_data: BalanceHistoryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Add a balance history entry"""
    history = await service.add_balance_history(db, current_user.id, account_id, history_data)
    if not history:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Savings account not found"
        )
    return history


# ============================================================================
# Statistics Endpoints
# ============================================================================

@router.get("/stats", response_model=SavingsStats)
@require_feature("savings_tracking")
async def get_savings_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get savings statistics"""
    stats = await service.get_savings_stats(db, current_user.id)
    return stats


@router.post("/accounts/batch-delete", response_model=SavingsAccountBatchDeleteResponse)
async def batch_delete_savings(
    batch_data: SavingsAccountBatchDelete,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete multiple savings accounts in a single request.

    Returns the count of successfully deleted items and any IDs that failed to delete.
    """
    deleted_count = 0
    failed_ids = []

    for item_id in batch_data.ids:
        try:
            success = await service.delete_account(db, current_user.id, item_id)
            if success:
                deleted_count += 1
            else:
                failed_ids.append(item_id)
        except Exception:
            failed_ids.append(item_id)

    return SavingsAccountBatchDeleteResponse(
        deleted_count=deleted_count,
        failed_ids=failed_ids
    )
