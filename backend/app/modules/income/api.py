"""
Income module API endpoints.
"""
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, and_, extract, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import get_current_user, require_feature, check_usage_limit
from app.core.exceptions import TierLimitException, NotFoundException
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
    # Build query
    query = select(IncomeSource).where(
        IncomeSource.user_id == current_user.id,
        IncomeSource.deleted_at.is_(None)
    )

    # Apply filters
    if is_active is not None:
        query = query.where(IncomeSource.is_active == is_active)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    # Apply pagination
    query = query.order_by(IncomeSource.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    # Execute query
    result = await db.execute(query)
    sources = result.scalars().all()

    # Add monthly equivalent to each source
    response_items = []
    for source in sources:
        source_dict = IncomeSourceResponse.model_validate(source).model_dump()
        source_dict["monthly_equivalent"] = source.calculate_monthly_amount()
        response_items.append(IncomeSourceResponse(**source_dict))

    return IncomeSourceListResponse(
        items=response_items,
        total=total,
        page=page,
        page_size=page_size
    )


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
    # Check current count
    count_query = select(func.count()).select_from(IncomeSource).where(
        IncomeSource.user_id == current_user.id,
        IncomeSource.deleted_at.is_(None)
    )
    count_result = await db.execute(count_query)
    current_count = count_result.scalar_one()

    # Check tier limits
    has_capacity, limit = await check_usage_limit(
        current_user,
        "income_tracking",
        current_count,
        db
    )

    if not has_capacity:
        tier_name = current_user.tier.name if current_user.tier else "free"
        raise TierLimitException(
            message=f"Income source limit reached. Your {tier_name} tier allows {limit} sources.",
            current_tier=tier_name,
            required_tier="growth" if tier_name == "starter" else "wealth"
        )

    # Create income source
    income_source = IncomeSource(
        user_id=current_user.id,
        **source_data.model_dump()
    )

    db.add(income_source)
    await db.commit()
    await db.refresh(income_source)

    # Prepare response with monthly equivalent
    response_dict = IncomeSourceResponse.model_validate(income_source).model_dump()
    response_dict["monthly_equivalent"] = income_source.calculate_monthly_amount()

    return IncomeSourceResponse(**response_dict)


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
    query = select(IncomeSource).where(
        IncomeSource.id == source_id,
        IncomeSource.user_id == current_user.id,
        IncomeSource.deleted_at.is_(None)
    )

    result = await db.execute(query)
    source = result.scalar_one_or_none()

    if not source:
        raise NotFoundException(message="Income source not found")

    # Prepare response with monthly equivalent
    response_dict = IncomeSourceResponse.model_validate(source).model_dump()
    response_dict["monthly_equivalent"] = source.calculate_monthly_amount()

    return IncomeSourceResponse(**response_dict)


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

    Requires: income_tracking feature
    """
    query = select(IncomeSource).where(
        IncomeSource.id == source_id,
        IncomeSource.user_id == current_user.id,
        IncomeSource.deleted_at.is_(None)
    )

    result = await db.execute(query)
    source = result.scalar_one_or_none()

    if not source:
        raise NotFoundException(message="Income source not found")

    # Update fields
    update_data = source_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(source, field, value)

    await db.commit()
    await db.refresh(source)

    # Prepare response with monthly equivalent
    response_dict = IncomeSourceResponse.model_validate(source).model_dump()
    response_dict["monthly_equivalent"] = source.calculate_monthly_amount()

    return IncomeSourceResponse(**response_dict)


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
    query = select(IncomeSource).where(
        IncomeSource.id == source_id,
        IncomeSource.user_id == current_user.id,
        IncomeSource.deleted_at.is_(None)
    )

    result = await db.execute(query)
    source = result.scalar_one_or_none()

    if not source:
        raise NotFoundException(message="Income source not found")

    # Soft delete
    source.soft_delete()
    await db.commit()

    return None


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
    # Build query
    query = select(IncomeTransaction).where(
        IncomeTransaction.user_id == current_user.id,
        IncomeTransaction.deleted_at.is_(None)
    )

    # Apply filters
    if source_id:
        query = query.where(IncomeTransaction.source_id == source_id)
    if start_date:
        query = query.where(IncomeTransaction.date >= start_date)
    if end_date:
        query = query.where(IncomeTransaction.date <= end_date)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    # Apply pagination
    query = query.order_by(IncomeTransaction.date.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    # Execute query
    result = await db.execute(query)
    transactions = result.scalars().all()

    return IncomeTransactionListResponse(
        items=[IncomeTransactionResponse.model_validate(t) for t in transactions],
        total=total,
        page=page,
        page_size=page_size
    )


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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get income statistics for the user.

    Requires: income_tracking feature
    """
    # Get income sources stats
    sources_query = select(
        func.count(IncomeSource.id).label("total"),
        func.sum(
            case((IncomeSource.is_active == True, 1), else_=0)
        ).label("active")
    ).where(
        IncomeSource.user_id == current_user.id,
        IncomeSource.deleted_at.is_(None)
    )

    sources_result = await db.execute(sources_query)
    sources_stats = sources_result.one()

    # Get active sources for monthly/annual calculation
    active_sources_query = select(IncomeSource).where(
        IncomeSource.user_id == current_user.id,
        IncomeSource.is_active == True,
        IncomeSource.deleted_at.is_(None)
    )

    active_sources_result = await db.execute(active_sources_query)
    active_sources = active_sources_result.scalars().all()

    # Calculate monthly and annual income
    total_monthly = sum(source.calculate_monthly_amount() for source in active_sources)
    total_annual = total_monthly * 12

    # Get transaction stats
    transactions_query = select(
        func.count(IncomeTransaction.id).label("total"),
        func.coalesce(func.sum(IncomeTransaction.amount), Decimal("0")).label("total_amount")
    ).where(
        IncomeTransaction.user_id == current_user.id,
        IncomeTransaction.deleted_at.is_(None)
    )

    transactions_result = await db.execute(transactions_query)
    transactions_stats = transactions_result.one()

    # Get current month stats
    now = datetime.utcnow()
    current_month_start = datetime(now.year, now.month, 1)

    current_month_query = select(
        func.count(IncomeTransaction.id).label("count"),
        func.coalesce(func.sum(IncomeTransaction.amount), Decimal("0")).label("amount")
    ).where(
        IncomeTransaction.user_id == current_user.id,
        IncomeTransaction.date >= current_month_start,
        IncomeTransaction.deleted_at.is_(None)
    )

    current_month_result = await db.execute(current_month_query)
    current_month_stats = current_month_result.one()

    # Get last month stats
    if now.month == 1:
        last_month_start = datetime(now.year - 1, 12, 1)
        last_month_end = datetime(now.year, 1, 1)
    else:
        last_month_start = datetime(now.year, now.month - 1, 1)
        last_month_end = datetime(now.year, now.month, 1)

    last_month_query = select(
        func.count(IncomeTransaction.id).label("count"),
        func.coalesce(func.sum(IncomeTransaction.amount), Decimal("0")).label("amount")
    ).where(
        IncomeTransaction.user_id == current_user.id,
        IncomeTransaction.date >= last_month_start,
        IncomeTransaction.date < last_month_end,
        IncomeTransaction.deleted_at.is_(None)
    )

    last_month_result = await db.execute(last_month_query)
    last_month_stats = last_month_result.one()

    return IncomeStatsResponse(
        total_sources=sources_stats.total or 0,
        active_sources=sources_stats.active or 0,
        total_monthly_income=total_monthly,
        total_annual_income=total_annual,
        total_transactions=transactions_stats.total or 0,
        total_transactions_amount=transactions_stats.total_amount,
        transactions_current_month=current_month_stats.count or 0,
        transactions_current_month_amount=current_month_stats.amount,
        transactions_last_month=last_month_stats.count or 0,
        transactions_last_month_amount=last_month_stats.amount,
        currency="USD"
    )
