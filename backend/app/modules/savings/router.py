"""
Savings API router
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
    SavingsAccountBatchDeleteResponse,
    # Transaction schemas
    DepositCreate,
    WithdrawalCreate,
    TransactionResponse,
    TransactionListResponse,
    # Transfer schemas
    TransferCreate,
    TransferResponse,
    TransferListResponse,
    # Interest schemas
    InterestCalculation,
    PostInterestResponse,
)
from app.modules.savings.service import convert_account_to_display_currency
from app.modules.savings.transaction_service import (
    TransactionService,
    InsufficientFundsError,
    AccountNotFoundError,
    InvalidTransactionError,
)

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
    account = await get_owned_or_404(
        service.get_account, db, current_user.id, account_id, detail="Savings account not found"
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


# ============================================================================
# Transaction Endpoints
# ============================================================================

@router.post("/accounts/{account_id}/deposit", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
@require_feature("savings_tracking")
async def create_deposit(
    account_id: UUID,
    deposit_data: DepositCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a deposit transaction for an account.
    """
    try:
        txn_service = TransactionService(db)
        transaction = await txn_service.create_deposit(
            account_id=account_id,
            user_id=current_user.id,
            amount=deposit_data.amount,
            description=deposit_data.description,
            source_type=deposit_data.source_type,
            source_id=deposit_data.source_id,
            transaction_date=deposit_data.transaction_date,
            category=deposit_data.category,
            reference_number=deposit_data.reference_number,
            source_currency=deposit_data.source_currency,
            exchange_rate=deposit_data.exchange_rate,
        )
        return transaction
    except AccountNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )
    except InvalidTransactionError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/accounts/{account_id}/withdraw", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
@require_feature("savings_tracking")
async def create_withdrawal(
    account_id: UUID,
    withdrawal_data: WithdrawalCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a withdrawal transaction for an account.
    """
    try:
        txn_service = TransactionService(db)
        transaction = await txn_service.create_withdrawal(
            account_id=account_id,
            user_id=current_user.id,
            amount=withdrawal_data.amount,
            description=withdrawal_data.description,
            source_type=withdrawal_data.source_type,
            source_id=withdrawal_data.source_id,
            transaction_date=withdrawal_data.transaction_date,
            category=withdrawal_data.category,
            reference_number=withdrawal_data.reference_number,
            source_currency=withdrawal_data.source_currency,
            exchange_rate=withdrawal_data.exchange_rate,
        )
        return transaction
    except AccountNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )
    except InsufficientFundsError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except InvalidTransactionError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/accounts/{account_id}/transactions", response_model=TransactionListResponse)
@require_feature("savings_tracking")
async def list_transactions(
    account_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    transaction_type: Optional[str] = Query(None, description="Filter by type: deposit, withdrawal, etc."),
    source_type: Optional[str] = Query(None, description="Filter by source: subscription, installment, etc."),
    search: Optional[str] = Query(None, description="Search in description"),
    start_date: Optional[datetime] = Query(None, description="Start date filter"),
    end_date: Optional[datetime] = Query(None, description="End date filter"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    List transactions for an account with pagination and filters.
    """
    try:
        txn_service = TransactionService(db)
        transactions, total = await txn_service.get_transactions(
            account_id=account_id,
            user_id=current_user.id,
            page=page,
            page_size=page_size,
            transaction_type=transaction_type,
            source_type=source_type,
            search=search,
            start_date=start_date,
            end_date=end_date,
        )
        return TransactionListResponse(
            items=transactions,
            total=total,
            page=page,
            page_size=page_size
        )
    except AccountNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )


# ============================================================================
# Transfer Endpoints
# ============================================================================

@router.post("/transfers", response_model=TransferResponse, status_code=status.HTTP_201_CREATED)
@require_feature("savings_tracking")
async def create_transfer(
    transfer_data: TransferCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Transfer funds between two accounts.
    Supports cross-currency transfers with exchange rate.
    """
    try:
        txn_service = TransactionService(db)
        transfer = await txn_service.create_transfer(
            from_account_id=transfer_data.from_account_id,
            to_account_id=transfer_data.to_account_id,
            user_id=current_user.id,
            amount=transfer_data.amount,
            description=transfer_data.description,
            exchange_rate=transfer_data.exchange_rate,
            transfer_date=transfer_data.transfer_date,
        )

        # Get account names for response
        from_account = await service.get_account(db, current_user.id, transfer_data.from_account_id)
        to_account = await service.get_account(db, current_user.id, transfer_data.to_account_id)

        # Create response with account names
        response = TransferResponse.model_validate(transfer)
        response.from_account_name = from_account.name if from_account else None
        response.to_account_name = to_account.name if to_account else None

        return response
    except AccountNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="One or both accounts not found"
        )
    except InsufficientFundsError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except InvalidTransactionError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/transfers", response_model=TransferListResponse)
@require_feature("savings_tracking")
async def list_transfers(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    account_id: Optional[UUID] = Query(None, description="Filter by account (from or to)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    List transfers with pagination. Optionally filter by account.
    """
    txn_service = TransactionService(db)
    transfers, total = await txn_service.get_transfers(
        user_id=current_user.id,
        account_id=account_id,
        page=page,
        page_size=page_size,
    )

    # Enrich with account names
    items = []
    for transfer in transfers:
        response = TransferResponse.model_validate(transfer)
        from_account = await service.get_account(db, current_user.id, transfer.from_account_id)
        to_account = await service.get_account(db, current_user.id, transfer.to_account_id)
        response.from_account_name = from_account.name if from_account else None
        response.to_account_name = to_account.name if to_account else None
        items.append(response)

    return TransferListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size
    )


# ============================================================================
# Interest Endpoints
# ============================================================================

@router.get("/accounts/{account_id}/interest", response_model=InterestCalculation)
@require_feature("savings_tracking")
async def calculate_interest(
    account_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Calculate pending interest for an account without posting it.
    Returns current accrued interest and pending interest since last calculation.
    """
    try:
        txn_service = TransactionService(db)
        calculation = await txn_service.calculate_interest(account_id, current_user.id)
        return calculation
    except AccountNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )


@router.post("/accounts/{account_id}/interest/accrue", response_model=InterestCalculation)
@require_feature("savings_tracking")
async def accrue_interest(
    account_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Accrue interest for an account (add to pending, don't post to balance yet).
    This is typically run daily by a scheduled task.
    """
    try:
        txn_service = TransactionService(db)
        calculation = await txn_service.accrue_interest(account_id, current_user.id)
        return calculation
    except AccountNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )


@router.post("/accounts/{account_id}/interest/post", response_model=PostInterestResponse)
@require_feature("savings_tracking")
async def post_interest(
    account_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Post accrued interest to account balance as a transaction.
    This is typically run monthly by a scheduled task.
    """
    try:
        txn_service = TransactionService(db)
        transaction = await txn_service.post_interest(account_id, current_user.id)

        if transaction:
            return PostInterestResponse(
                success=True,
                transaction=TransactionResponse.model_validate(transaction),
                message=f"Posted {transaction.amount} interest to account"
            )
        else:
            return PostInterestResponse(
                success=False,
                transaction=None,
                message="No accrued interest to post"
            )
    except AccountNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )
