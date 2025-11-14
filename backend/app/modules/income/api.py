"""
Income module API endpoints.
"""
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, and_, or_, extract, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import get_current_user, require_feature, check_usage_limit
from app.core.exceptions import TierLimitException, NotFoundException
from app.models.user import User
from app.modules.income.models import IncomeSource, IncomeTransaction, IncomeFrequency
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
)
from app.modules.income.service import convert_income_to_display_currency, get_user_display_currency, get_income_history

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

    # Apply pagination and ordering
    # Sort by the actual income date (date for one-time, start_date for recurring)
    query = query.order_by(
        func.coalesce(IncomeSource.date, IncomeSource.start_date).desc(),
        IncomeSource.created_at.desc()
    )
    query = query.offset((page - 1) * page_size).limit(page_size)

    # Execute query
    result = await db.execute(query)
    sources = result.scalars().all()

    # Convert all income sources to display currency and add monthly equivalent
    response_items = []
    for source in sources:
        # Convert to display currency
        await convert_income_to_display_currency(db, current_user.id, source)

        # Build response dict with all fields
        source_dict = {
            "id": str(source.id),
            "user_id": str(source.user_id),
            "name": source.name,
            "description": source.description,
            "category": source.category,
            "amount": float(source.amount) if source.amount else 0,
            "currency": source.currency,
            "frequency": source.frequency,
            "is_active": source.is_active,
            "date": source.date.isoformat() if source.date else None,
            "start_date": source.start_date.isoformat() if source.start_date else None,
            "end_date": source.end_date.isoformat() if source.end_date else None,
            "created_at": source.created_at.isoformat(),
            "updated_at": source.updated_at.isoformat(),
            "monthly_equivalent": float(source.calculate_monthly_amount()) if source.calculate_monthly_amount() else None,
            "display_amount": float(source.display_amount) if hasattr(source, 'display_amount') and source.display_amount is not None else None,
            "display_currency": source.display_currency if hasattr(source, 'display_currency') and source.display_currency is not None else None,
            "display_monthly_equivalent": float(source.display_monthly_equivalent) if hasattr(source, 'display_monthly_equivalent') and source.display_monthly_equivalent is not None else None,
        }
        response_items.append(source_dict)

    return {
        "items": response_items,
        "total": total,
        "page": page,
        "page_size": page_size
    }


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

    # Convert to display currency
    await convert_income_to_display_currency(db, current_user.id, source)

    # Prepare response with monthly equivalent and display fields
    response_dict = {
        "id": str(source.id),
        "user_id": str(source.user_id),
        "name": source.name,
        "description": source.description,
        "category": source.category,
        "amount": float(source.amount) if source.amount else 0,
        "currency": source.currency,
        "frequency": source.frequency,
        "is_active": source.is_active,
        "date": source.date.isoformat() if source.date else None,
        "start_date": source.start_date.isoformat() if source.start_date else None,
        "end_date": source.end_date.isoformat() if source.end_date else None,
        "created_at": source.created_at.isoformat(),
        "updated_at": source.updated_at.isoformat(),
        "monthly_equivalent": float(source.calculate_monthly_amount()) if source.calculate_monthly_amount() else None,
        "display_amount": float(source.display_amount) if hasattr(source, 'display_amount') and source.display_amount is not None else None,
        "display_currency": source.display_currency if hasattr(source, 'display_currency') and source.display_currency is not None else None,
        "display_monthly_equivalent": float(source.display_monthly_equivalent) if hasattr(source, 'display_monthly_equivalent') and source.display_monthly_equivalent is not None else None,
    }

    return response_dict


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
    deleted_count = 0
    failed_ids = []

    for source_id in batch_data.source_ids:
        try:
            query = select(IncomeSource).where(
                IncomeSource.id == source_id,
                IncomeSource.user_id == current_user.id,
                IncomeSource.deleted_at.is_(None)
            )

            result = await db.execute(query)
            source = result.scalar_one_or_none()

            if source:
                source.soft_delete()
                deleted_count += 1
            else:
                failed_ids.append(source_id)
        except Exception:
            failed_ids.append(source_id)

    await db.commit()

    return IncomeSourceBatchDeleteResponse(
        deleted_count=deleted_count,
        failed_ids=failed_ids
    )


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
    # Apply date filtering if date range is provided
    if start_date and end_date:
        # Remove timezone info for comparison
        filter_start = start_date.replace(tzinfo=None)
        filter_end = end_date.replace(tzinfo=None)

        active_sources_query = select(IncomeSource).where(
            and_(
                IncomeSource.user_id == current_user.id,
                IncomeSource.is_active == True,
                IncomeSource.deleted_at.is_(None),
                or_(
                    # For one-time: date must fall within period
                    and_(
                        IncomeSource.frequency == IncomeFrequency.ONE_TIME,
                        IncomeSource.date.isnot(None),
                        IncomeSource.date >= filter_start,
                        IncomeSource.date <= filter_end
                    ),
                    # For recurring: start_date <= period_end AND (end_date is NULL OR end_date >= period_start)
                    and_(
                        IncomeSource.frequency != IncomeFrequency.ONE_TIME,
                        IncomeSource.start_date.isnot(None),
                        IncomeSource.start_date <= filter_end,
                        or_(
                            IncomeSource.end_date.is_(None),
                            IncomeSource.end_date >= filter_start
                        )
                    )
                )
            )
        )
    else:
        active_sources_query = select(IncomeSource).where(
            IncomeSource.user_id == current_user.id,
            IncomeSource.is_active == True,
            IncomeSource.deleted_at.is_(None)
        )

    active_sources_result = await db.execute(active_sources_query)
    active_sources = active_sources_result.scalars().all()

    # Get user's display currency first
    display_currency = await get_user_display_currency(db, current_user.id)

    # Convert all sources to display currency and calculate total monthly income
    from app.services.currency_service import CurrencyService
    currency_service = CurrencyService(db)

    total_monthly = Decimal("0")
    for source in active_sources:
        monthly_amount = source.calculate_monthly_amount()
        if monthly_amount:
            # Convert to display currency if needed
            if source.currency != display_currency:
                converted_amount = await currency_service.convert_amount(
                    monthly_amount,
                    source.currency,
                    display_currency
                )
                if converted_amount:
                    total_monthly += converted_amount
                else:
                    # Fallback to original if conversion fails
                    total_monthly += monthly_amount
            else:
                total_monthly += monthly_amount

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
        currency=display_currency
    )


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
