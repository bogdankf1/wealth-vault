"""
Income module API endpoints.
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import get_current_user, require_feature
from app.core.exceptions import NotFoundException
from app.models.user import User
from app.modules.income.models import IncomeSource, IncomeTransaction
from app.modules.income.schemas import (
    IncomeSourceCreate,
    IncomeSourceUpdate,
    IncomeSourceResponse,
    IncomeSourceListResponse,
    IncomeTransactionCreate,
    IncomeTransactionResponse,
    IncomeTransactionListResponse,
    IncomeStatsResponse,
    IncomeHistoryResponse,
    IncomeSourceBatchDelete,
    IncomeSourceBatchDeleteResponse,
    IncomeDepositRequest,
    IncomeDepositResponse,
    IncomeDistributionRuleCreate,
    IncomeDistributionRuleUpdate,
    IncomeDistributionRuleResponse,
    IncomeDistributionRuleListResponse,
    IncomeDistributionPreviewResponse,
)
from app.modules.income import service
from app.modules.income.service import (
    get_income_history,
    IncomeService,
    IncomeDepositError,
)
from app.modules.income.distribution_service import (
    DistributionService,
    DistributionServiceError,
    RuleNotFoundError,
    InvalidRuleError,
)

router = APIRouter(prefix="/income", tags=["Income Tracking"])


# ============================================================================
# Income Sources Endpoints
# ============================================================================

@router.get("/sources", response_model=IncomeSourceListResponse)
@require_feature("income_tracking")
async def list_income_sources(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List user's income sources with pagination and filtering.

    Requires: income_tracking feature
    """
    return await service.list_income_sources(db, current_user, page, page_size, is_active)


@router.post("/sources", response_model=IncomeSourceResponse, status_code=status.HTTP_201_CREATED)
@require_feature("income_tracking")
async def create_income_source(
    source_data: IncomeSourceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new income source.

    Requires: income_tracking feature
    Limits:
    - Starter tier: 3 sources
    - Growth tier: 10 sources
    - Wealth tier: unlimited
    """
    return await service.create_income_source(db, current_user, source_data)


@router.get("/sources/{source_id}", response_model=IncomeSourceResponse)
@require_feature("income_tracking")
async def get_income_source(
    source_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get a single income source by ID.

    Requires: income_tracking feature
    """
    return await service.get_income_source(db, current_user, source_id)


@router.put("/sources/{source_id}", response_model=IncomeSourceResponse)
@require_feature("income_tracking")
async def update_income_source(
    source_id: UUID,
    source_data: IncomeSourceUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update an income source.

    If auto_deposit is enabled and target_account is set, backfills historical deposits
    for any dates that don't already have transactions.

    If sync_historical is True, deletes all existing income transactions and their
    account deposits, then recreates them with the new values.

    Requires: income_tracking feature
    """
    return await service.update_income_source(db, current_user, source_id, source_data)


@router.delete("/sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
@require_feature("income_tracking")
async def delete_income_source(
    source_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete an income source (soft delete).

    Requires: income_tracking feature
    """
    return await service.delete_income_source(db, current_user, source_id)


@router.post("/sources/batch-delete", response_model=IncomeSourceBatchDeleteResponse)
@require_feature("income_tracking")
async def batch_delete_income_sources(
    batch_data: IncomeSourceBatchDelete,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete multiple income sources in a single request (soft delete).

    Returns the count of successfully deleted sources and any IDs that failed to delete.

    Requires: income_tracking feature
    """
    return await service.batch_delete_income_sources(db, current_user, batch_data)


# ============================================================================
# Income Transactions Endpoints
# ============================================================================

@router.get("/transactions", response_model=IncomeTransactionListResponse)
@require_feature("income_tracking")
async def list_income_transactions(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
    source_id: Optional[UUID] = Query(None, description="Filter by income source"),
    start_date: Optional[datetime] = Query(None, description="Filter by start date"),
    end_date: Optional[datetime] = Query(None, description="Filter by end date"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List user's income transactions with pagination and filtering.

    Requires: income_tracking feature
    """
    return await service.list_income_transactions(db, current_user, page, page_size, source_id, start_date, end_date)


@router.post("/transactions", response_model=IncomeTransactionResponse, status_code=status.HTTP_201_CREATED)
@require_feature("income_tracking")
async def create_income_transaction(
    transaction_data: IncomeTransactionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new income transaction.

    Requires: income_tracking feature
    """
    # If source_id provided, verify it belongs to user
    if transaction_data.source_id:
        source_query = select(IncomeSource).where(
            IncomeSource.id == transaction_data.source_id,
            IncomeSource.user_id == current_user.id,
            IncomeSource.deleted_at.is_(None)
        )
        source_result = await db.execute(source_query)
        source = source_result.scalar_one_or_none()

        if not source:
            raise NotFoundException(message="Income source not found")

    # Create transaction
    transaction = IncomeTransaction(
        user_id=current_user.id,
        **transaction_data.model_dump()
    )

    db.add(transaction)
    await db.commit()
    await db.refresh(transaction)

    return IncomeTransactionResponse.model_validate(transaction)


# ============================================================================
# Statistics Endpoint
# ============================================================================

@router.get("/stats", response_model=IncomeStatsResponse)
@require_feature("income_tracking")
async def get_income_stats(
    start_date: Optional[datetime] = Query(None, description="Start date for filtering (ISO format)"),
    end_date: Optional[datetime] = Query(None, description="End date for filtering (ISO format)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get income statistics for the user, optionally filtered by date range.

    Query Parameters:
    - start_date: Start date for filtering (ISO format, optional)
    - end_date: End date for filtering (ISO format, optional)

    Requires: income_tracking feature
    """
    return await service.get_income_stats(db, current_user, start_date, end_date)


@router.get("/history", response_model=IncomeHistoryResponse)
@require_feature("income_tracking")
async def get_income_history_endpoint(
    start_date: Optional[datetime] = Query(None, description="Start date for filtering (ISO format)"),
    end_date: Optional[datetime] = Query(None, description="End date for filtering (ISO format)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get income history grouped by month.

    Returns monthly totals and counts of income sources, along with overall average.
    If start_date and end_date are provided, filters history to that range.

    Requires: income_tracking feature
    """
    history = await get_income_history(db, current_user.id, start_date, end_date)
    return history


# ============================================================================
# Income Deposit Endpoints
# ============================================================================

@router.post("/transactions/{transaction_id}/deposit", response_model=IncomeDepositResponse)
@require_feature("income_tracking")
async def deposit_income_to_account(
    transaction_id: UUID,
    deposit_data: IncomeDepositRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Deposit an income transaction to a savings account.

    This creates a deposit transaction in the target savings account
    and updates the income transaction status to 'deposited'.

    Requires: income_tracking feature
    """
    income_service = IncomeService(db)
    try:
        response = await income_service.deposit_income_to_account(
            income_transaction_id=transaction_id,
            user_id=current_user.id,
            account_id=deposit_data.account_id,
            description=deposit_data.description,
        )
        return response
    except IncomeDepositError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# ============================================================================
# Distribution Rules Endpoints
# ============================================================================

@router.get("/distribution-rules", response_model=IncomeDistributionRuleListResponse)
@require_feature("income_tracking")
async def list_distribution_rules(
    income_source_id: Optional[UUID] = Query(None, description="Filter by income source"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List user's income distribution rules.

    Requires: income_tracking feature
    """
    distribution_service = DistributionService(db)
    rules = await distribution_service.get_rules(
        user_id=current_user.id,
        income_source_id=income_source_id,
        is_active=is_active,
    )

    # Enrich rules with related entity names
    enriched_rules = []
    for rule in rules:
        enriched = await distribution_service.enrich_rule_response(rule)
        enriched_rules.append(enriched)

    return IncomeDistributionRuleListResponse(
        items=enriched_rules,
        total=len(enriched_rules),
    )


@router.post("/distribution-rules", response_model=IncomeDistributionRuleResponse, status_code=status.HTTP_201_CREATED)
@require_feature("income_tracking")
async def create_distribution_rule(
    rule_data: IncomeDistributionRuleCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new income distribution rule.

    Distribution rules define how income is automatically distributed
    to savings accounts and goals.

    Requires: income_tracking feature
    """
    distribution_service = DistributionService(db)
    try:
        rule = await distribution_service.create_rule(
            user_id=current_user.id,
            rule_data=rule_data,
        )
        return await distribution_service.enrich_rule_response(rule)
    except InvalidRuleError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/distribution-rules/{rule_id}", response_model=IncomeDistributionRuleResponse)
@require_feature("income_tracking")
async def get_distribution_rule(
    rule_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get a distribution rule by ID.

    Requires: income_tracking feature
    """
    distribution_service = DistributionService(db)
    try:
        rule = await distribution_service.get_rule(rule_id, current_user.id)
        return await distribution_service.enrich_rule_response(rule)
    except RuleNotFoundError:
        raise NotFoundException(message="Distribution rule not found")


@router.put("/distribution-rules/{rule_id}", response_model=IncomeDistributionRuleResponse)
@require_feature("income_tracking")
async def update_distribution_rule(
    rule_id: UUID,
    rule_data: IncomeDistributionRuleUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update a distribution rule.

    Requires: income_tracking feature
    """
    distribution_service = DistributionService(db)
    try:
        rule = await distribution_service.update_rule(
            rule_id=rule_id,
            user_id=current_user.id,
            rule_data=rule_data,
        )
        return await distribution_service.enrich_rule_response(rule)
    except RuleNotFoundError:
        raise NotFoundException(message="Distribution rule not found")
    except InvalidRuleError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/distribution-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
@require_feature("income_tracking")
async def delete_distribution_rule(
    rule_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete a distribution rule (soft delete).

    Requires: income_tracking feature
    """
    distribution_service = DistributionService(db)
    try:
        await distribution_service.delete_rule(rule_id, current_user.id)
        return None
    except RuleNotFoundError:
        raise NotFoundException(message="Distribution rule not found")


@router.post("/distribution-preview", response_model=IncomeDistributionPreviewResponse)
@require_feature("income_tracking")
async def preview_distribution(
    income_amount: Decimal = Query(..., description="Amount to distribute"),
    currency: str = Query("USD", description="Currency code"),
    income_source_id: Optional[UUID] = Query(None, description="Income source ID for source-specific rules"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Preview how income would be distributed based on active rules.

    This does not actually apply the distribution, just shows what would happen.

    Requires: income_tracking feature
    """
    distribution_service = DistributionService(db)
    preview = await distribution_service.preview_distribution(
        user_id=current_user.id,
        income_amount=income_amount,
        currency=currency,
        income_source_id=income_source_id,
    )
    return preview


@router.post("/transactions/{transaction_id}/distribute", response_model=dict)
@require_feature("income_tracking")
async def apply_distribution(
    transaction_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Apply distribution rules to an income transaction.

    This creates deposit transactions to the target accounts based on
    the user's distribution rules.

    Requires: income_tracking feature
    """
    distribution_service = DistributionService(db)
    try:
        created_deposits = await distribution_service.apply_distribution(
            user_id=current_user.id,
            income_transaction_id=transaction_id,
        )
        return {
            "message": f"Successfully distributed income to {len(created_deposits)} account(s)",
            "deposits": [
                {"account_transaction_id": str(txn_id), "amount": float(amount)}
                for txn_id, amount in created_deposits
            ]
        }
    except DistributionServiceError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
