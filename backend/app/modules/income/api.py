"""
Income module API endpoints.
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, and_, or_, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import get_current_user, require_feature, check_usage_limit
from app.core.exceptions import TierLimitException, NotFoundException
from app.models.user import User
from app.modules.income.models import IncomeSource, IncomeTransaction, IncomeFrequency, IncomeTransactionStatus
from app.modules.savings.transaction_service import TransactionService
import logging

logger = logging.getLogger(__name__)
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
from app.modules.income.service import (
    convert_income_to_display_currency,
    get_user_display_currency,
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
            # Account integration fields
            "target_account_id": str(source.target_account_id) if source.target_account_id else None,
            "auto_deposit": source.auto_deposit,
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

    # Auto-deposit: If auto_deposit is enabled and target account is set, create deposits
    # For recurring income, backfill all historical deposits from start_date to today
    if income_source.auto_deposit and income_source.target_account_id:
        try:
            from dateutil.relativedelta import relativedelta

            today = datetime.utcnow().date()
            transaction_service = TransactionService(db)
            deposits_created = 0

            if income_source.frequency == IncomeFrequency.ONE_TIME:
                # One-time income: create single deposit if date is today or in the past
                income_date = income_source.date or datetime.utcnow()
                if income_date.date() <= today:
                    income_txn = IncomeTransaction(
                        user_id=current_user.id,
                        source_id=income_source.id,
                        amount=income_source.amount,
                        currency=income_source.currency,
                        date=income_date,
                        description=f"Income: {income_source.name}",
                        category=income_source.category,
                        status=IncomeTransactionStatus.RECEIVED,
                    )
                    db.add(income_txn)
                    await db.flush()

                    account_txn = await transaction_service.create_deposit(
                        account_id=income_source.target_account_id,
                        user_id=current_user.id,
                        amount=income_source.amount,
                        source_type="income",
                        source_id=income_txn.id,
                        description=f"Income: {income_source.name}",
                        transaction_date=income_date,
                        category=income_source.category or "income",
                    )

                    income_txn.status = IncomeTransactionStatus.DEPOSITED
                    income_txn.deposited_to_account_id = income_source.target_account_id
                    income_txn.account_transaction_id = account_txn.id
                    deposits_created = 1
            else:
                # Recurring income: backfill all past deposits
                start_date = income_source.start_date
                if start_date and start_date.date() <= today:
                    # Calculate all due dates from start_date to today
                    current_date = start_date
                    end_date = income_source.end_date.date() if income_source.end_date else None

                    # Determine the interval based on frequency
                    if income_source.frequency == IncomeFrequency.WEEKLY:
                        interval = relativedelta(weeks=1)
                    elif income_source.frequency == IncomeFrequency.BIWEEKLY:
                        interval = relativedelta(weeks=2)
                    elif income_source.frequency == IncomeFrequency.MONTHLY:
                        interval = relativedelta(months=1)
                    elif income_source.frequency == IncomeFrequency.QUARTERLY:
                        interval = relativedelta(months=3)
                    elif income_source.frequency == IncomeFrequency.ANNUALLY:
                        interval = relativedelta(years=1)
                    else:
                        interval = relativedelta(months=1)  # Default to monthly

                    # Create deposits for each due date
                    while current_date.date() <= today:
                        # Check end_date if set
                        if end_date and current_date.date() > end_date:
                            break

                        # Create income transaction for this date
                        income_txn = IncomeTransaction(
                            user_id=current_user.id,
                            source_id=income_source.id,
                            amount=income_source.amount,
                            currency=income_source.currency,
                            date=current_date,
                            description=f"Income: {income_source.name}",
                            category=income_source.category,
                            status=IncomeTransactionStatus.RECEIVED,
                        )
                        db.add(income_txn)
                        await db.flush()

                        # Create deposit to savings account with the historical date
                        account_txn = await transaction_service.create_deposit(
                            account_id=income_source.target_account_id,
                            user_id=current_user.id,
                            amount=income_source.amount,
                            source_type="income",
                            source_id=income_txn.id,
                            description=f"Income: {income_source.name}",
                            transaction_date=current_date,
                            category=income_source.category or "income",
                        )

                        # Update income transaction with deposit info
                        income_txn.status = IncomeTransactionStatus.DEPOSITED
                        income_txn.deposited_to_account_id = income_source.target_account_id
                        income_txn.account_transaction_id = account_txn.id

                        deposits_created += 1
                        current_date = current_date + interval

            if deposits_created > 0:
                await db.commit()
                logger.info(f"Auto-deposited {deposits_created} transactions for income source {income_source.id} to account {income_source.target_account_id}")
        except Exception as e:
            logger.error(f"Failed to auto-deposit income source {income_source.id}: {e}")
            await db.rollback()
            # Don't fail the income source creation, just log the error

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
        # Account integration fields
        "target_account_id": str(source.target_account_id) if source.target_account_id else None,
        "auto_deposit": source.auto_deposit,
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

    If auto_deposit is enabled and target_account is set, backfills historical deposits
    for any dates that don't already have transactions.

    If sync_historical is True, deletes all existing income transactions and their
    account deposits, then recreates them with the new values.

    Requires: income_tracking feature
    """
    from dateutil.relativedelta import relativedelta

    query = select(IncomeSource).where(
        IncomeSource.id == source_id,
        IncomeSource.user_id == current_user.id,
        IncomeSource.deleted_at.is_(None)
    )

    result = await db.execute(query)
    source = result.scalar_one_or_none()

    if not source:
        raise NotFoundException(message="Income source not found")

    # Track previous auto_deposit state to detect if it's being enabled
    was_auto_deposit_enabled = source.auto_deposit and source.target_account_id

    # Extract sync_historical before updating fields
    sync_historical = source_data.sync_historical

    # Update fields (excluding sync_historical which is not a model field)
    update_data = source_data.model_dump(exclude_unset=True, exclude={'sync_historical'})
    for field, value in update_data.items():
        setattr(source, field, value)

    await db.commit()
    await db.refresh(source)

    # Check if auto_deposit is now enabled
    is_auto_deposit_enabled = source.auto_deposit and source.target_account_id

    # Helper function to get frequency interval
    def get_frequency_interval(frequency: IncomeFrequency):
        if frequency == IncomeFrequency.WEEKLY:
            return relativedelta(weeks=1)
        elif frequency == IncomeFrequency.BIWEEKLY:
            return relativedelta(weeks=2)
        elif frequency == IncomeFrequency.MONTHLY:
            return relativedelta(months=1)
        elif frequency == IncomeFrequency.QUARTERLY:
            return relativedelta(months=3)
        elif frequency == IncomeFrequency.ANNUALLY:
            return relativedelta(years=1)
        return relativedelta(months=1)

    # Helper function to create deposits for date range
    async def create_historical_deposits(transaction_service, start_dt, end_dt, interval, existing_dates=None):
        deposits_created = 0
        today = datetime.utcnow().date()
        current_date = start_dt

        while current_date.date() <= today:
            if end_dt and current_date.date() > end_dt:
                break

            # Skip if transaction already exists for this date (when not syncing)
            if existing_dates and current_date.date() in existing_dates:
                current_date = current_date + interval
                continue

            income_txn = IncomeTransaction(
                user_id=current_user.id,
                source_id=source.id,
                amount=source.amount,
                currency=source.currency,
                date=current_date,
                description=f"Income: {source.name}",
                category=source.category,
                status=IncomeTransactionStatus.RECEIVED,
            )
            db.add(income_txn)
            await db.flush()

            account_txn = await transaction_service.create_deposit(
                account_id=source.target_account_id,
                user_id=current_user.id,
                amount=source.amount,
                source_type="income",
                source_id=income_txn.id,
                description=f"Income: {source.name}",
                transaction_date=current_date,
                category=source.category or "income",
            )

            income_txn.status = IncomeTransactionStatus.DEPOSITED
            income_txn.deposited_to_account_id = source.target_account_id
            income_txn.account_transaction_id = account_txn.id

            deposits_created += 1
            current_date = current_date + interval

        return deposits_created

    # Handle sync_historical - delete existing and recreate
    if sync_historical and is_auto_deposit_enabled:
        try:
            transaction_service = TransactionService(db)

            # Get all existing income transactions for this source
            existing_txns_query = select(IncomeTransaction).where(
                IncomeTransaction.source_id == source.id,
                IncomeTransaction.deleted_at.is_(None)
            )
            existing_result = await db.execute(existing_txns_query)
            existing_txns = existing_result.scalars().all()

            # Reverse the account deposits and delete income transactions
            reversed_count = 0
            for income_txn in existing_txns:
                # Reverse the account transaction if it exists
                if income_txn.account_transaction_id and income_txn.deposited_to_account_id:
                    try:
                        await transaction_service.reverse_transaction(
                            transaction_id=income_txn.account_transaction_id,
                            user_id=current_user.id,
                            reason="Sync historical: Income source updated",
                        )
                        reversed_count += 1
                    except Exception as e:
                        logger.warning(f"Could not reverse transaction {income_txn.account_transaction_id}: {e}")

                # Soft delete the income transaction
                income_txn.deleted_at = datetime.utcnow()

            await db.commit()
            logger.info(f"Reversed {reversed_count} account transactions for income source {source.id}")

            # Recreate all transactions with new values
            deposits_created = 0
            today = datetime.utcnow().date()

            if source.frequency == IncomeFrequency.ONE_TIME:
                income_date = source.date or datetime.utcnow()
                if income_date.date() <= today:
                    income_txn = IncomeTransaction(
                        user_id=current_user.id,
                        source_id=source.id,
                        amount=source.amount,
                        currency=source.currency,
                        date=income_date,
                        description=f"Income: {source.name}",
                        category=source.category,
                        status=IncomeTransactionStatus.RECEIVED,
                    )
                    db.add(income_txn)
                    await db.flush()

                    account_txn = await transaction_service.create_deposit(
                        account_id=source.target_account_id,
                        user_id=current_user.id,
                        amount=source.amount,
                        source_type="income",
                        source_id=income_txn.id,
                        description=f"Income: {source.name}",
                        transaction_date=income_date,
                        category=source.category or "income",
                    )

                    income_txn.status = IncomeTransactionStatus.DEPOSITED
                    income_txn.deposited_to_account_id = source.target_account_id
                    income_txn.account_transaction_id = account_txn.id
                    deposits_created = 1
            else:
                start_date = source.start_date
                if start_date and start_date.date() <= today:
                    end_date = source.end_date.date() if source.end_date else None
                    interval = get_frequency_interval(source.frequency)
                    deposits_created = await create_historical_deposits(
                        transaction_service, start_date, end_date, interval
                    )

            if deposits_created > 0:
                await db.commit()
                logger.info(f"Recreated {deposits_created} deposits for income source {source.id}")

        except Exception as e:
            logger.error(f"Failed to sync historical deposits for income source {source.id}: {e}")
            await db.rollback()

    # Backfill historical deposits if auto_deposit was just enabled (without sync)
    elif is_auto_deposit_enabled and not was_auto_deposit_enabled:
        try:
            today = datetime.utcnow().date()
            transaction_service = TransactionService(db)

            # Get existing income transactions for this source to avoid duplicates
            existing_txns_query = select(IncomeTransaction.date).where(
                IncomeTransaction.source_id == source.id,
                IncomeTransaction.deleted_at.is_(None)
            )
            existing_result = await db.execute(existing_txns_query)
            existing_dates = {txn_date.date() for txn_date in existing_result.scalars().all()}

            deposits_created = 0

            if source.frequency == IncomeFrequency.ONE_TIME:
                income_date = source.date or datetime.utcnow()
                if income_date.date() <= today and income_date.date() not in existing_dates:
                    income_txn = IncomeTransaction(
                        user_id=current_user.id,
                        source_id=source.id,
                        amount=source.amount,
                        currency=source.currency,
                        date=income_date,
                        description=f"Income: {source.name}",
                        category=source.category,
                        status=IncomeTransactionStatus.RECEIVED,
                    )
                    db.add(income_txn)
                    await db.flush()

                    account_txn = await transaction_service.create_deposit(
                        account_id=source.target_account_id,
                        user_id=current_user.id,
                        amount=source.amount,
                        source_type="income",
                        source_id=income_txn.id,
                        description=f"Income: {source.name}",
                        transaction_date=income_date,
                        category=source.category or "income",
                    )

                    income_txn.status = IncomeTransactionStatus.DEPOSITED
                    income_txn.deposited_to_account_id = source.target_account_id
                    income_txn.account_transaction_id = account_txn.id
                    deposits_created = 1
            else:
                start_date = source.start_date
                if start_date and start_date.date() <= today:
                    end_date = source.end_date.date() if source.end_date else None
                    interval = get_frequency_interval(source.frequency)
                    deposits_created = await create_historical_deposits(
                        transaction_service, start_date, end_date, interval, existing_dates
                    )

            if deposits_created > 0:
                await db.commit()
                logger.info(f"Backfilled {deposits_created} deposits for income source {source.id}")

        except Exception as e:
            logger.error(f"Failed to backfill deposits for income source {source.id}: {e}")
            await db.rollback()

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

    # Calculate source counts based on whether date filtering is applied
    if start_date and end_date:
        # When date range is provided, count only active sources in range
        total_sources_count = len(active_sources)
        active_sources_count = len(active_sources)
    else:
        # When no date range, count all sources and active sources separately
        all_sources_query = select(
            func.count(IncomeSource.id).label("total"),
            func.sum(
                case((IncomeSource.is_active == True, 1), else_=0)
            ).label("active")
        ).where(
            IncomeSource.user_id == current_user.id,
            IncomeSource.deleted_at.is_(None)
        )
        all_sources_result = await db.execute(all_sources_query)
        all_sources_stats = all_sources_result.one()
        total_sources_count = all_sources_stats.total or 0
        active_sources_count = all_sources_stats.active or 0

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

    # Calculate all-time transaction stats from all active sources
    # Get all active sources (not just from the filtered period)
    all_active_sources_query = select(IncomeSource).where(
        IncomeSource.user_id == current_user.id,
        IncomeSource.is_active == True,
        IncomeSource.deleted_at.is_(None)
    )
    all_active_sources_result = await db.execute(all_active_sources_query)
    all_active_sources = all_active_sources_result.scalars().all()

    # Calculate total amount from all active sources
    total_transactions_amount = Decimal("0")
    for source in all_active_sources:
        if source.frequency == IncomeFrequency.ONE_TIME:
            # One-time: use full amount
            source_amount = source.amount
        else:
            # Recurring: calculate monthly amount
            source_amount = source.calculate_monthly_amount() or Decimal("0")

        # Convert to display currency if needed
        if source.currency != display_currency:
            converted_amount = await currency_service.convert_amount(
                source_amount,
                source.currency,
                display_currency
            )
            if converted_amount:
                total_transactions_amount += converted_amount
            else:
                total_transactions_amount += source_amount
        else:
            total_transactions_amount += source_amount

    # Get current month stats (including active sources)
    now = datetime.utcnow()
    current_month_start = datetime(now.year, now.month, 1)
    # Calculate next month start for end boundary
    if now.month == 12:
        current_month_end = datetime(now.year + 1, 1, 1)
    else:
        current_month_end = datetime(now.year, now.month + 1, 1)

    # Get active sources for current month
    current_month_sources_query = select(IncomeSource).where(
        and_(
            IncomeSource.user_id == current_user.id,
            IncomeSource.is_active == True,
            IncomeSource.deleted_at.is_(None),
            or_(
                # One-time sources that fall in current month
                and_(
                    IncomeSource.frequency == IncomeFrequency.ONE_TIME,
                    IncomeSource.date.isnot(None),
                    IncomeSource.date >= current_month_start,
                    IncomeSource.date < current_month_end
                ),
                # Recurring sources active during current month
                and_(
                    IncomeSource.frequency != IncomeFrequency.ONE_TIME,
                    IncomeSource.start_date.isnot(None),
                    IncomeSource.start_date < current_month_end,
                    or_(
                        IncomeSource.end_date.is_(None),
                        IncomeSource.end_date >= current_month_start
                    )
                )
            )
        )
    )

    current_month_sources_result = await db.execute(current_month_sources_query)
    current_month_sources = current_month_sources_result.scalars().all()

    # Calculate total for current month from sources
    current_month_amount = Decimal("0")
    for source in current_month_sources:
        amount = source.amount
        if source.frequency == IncomeFrequency.ONE_TIME:
            # One-time: use full amount
            source_amount = amount
        else:
            # Recurring: calculate monthly amount
            source_amount = source.calculate_monthly_amount() or Decimal("0")

        # Convert to display currency if needed
        if source.currency != display_currency:
            converted_amount = await currency_service.convert_amount(
                source_amount,
                source.currency,
                display_currency
            )
            if converted_amount:
                current_month_amount += converted_amount
            else:
                current_month_amount += source_amount
        else:
            current_month_amount += source_amount

    # Get last month stats
    if now.month == 1:
        last_month_start = datetime(now.year - 1, 12, 1)
        last_month_end = datetime(now.year, 1, 1)
    else:
        last_month_start = datetime(now.year, now.month - 1, 1)
        last_month_end = datetime(now.year, now.month, 1)

    # Get active sources for last month
    last_month_sources_query = select(IncomeSource).where(
        and_(
            IncomeSource.user_id == current_user.id,
            IncomeSource.is_active == True,
            IncomeSource.deleted_at.is_(None),
            or_(
                # One-time sources that fall in last month
                and_(
                    IncomeSource.frequency == IncomeFrequency.ONE_TIME,
                    IncomeSource.date.isnot(None),
                    IncomeSource.date >= last_month_start,
                    IncomeSource.date < last_month_end
                ),
                # Recurring sources active during last month
                and_(
                    IncomeSource.frequency != IncomeFrequency.ONE_TIME,
                    IncomeSource.start_date.isnot(None),
                    IncomeSource.start_date < last_month_end,
                    or_(
                        IncomeSource.end_date.is_(None),
                        IncomeSource.end_date >= last_month_start
                    )
                )
            )
        )
    )

    last_month_sources_result = await db.execute(last_month_sources_query)
    last_month_sources = last_month_sources_result.scalars().all()

    # Calculate total for last month from sources
    last_month_amount = Decimal("0")
    for source in last_month_sources:
        amount = source.amount
        if source.frequency == IncomeFrequency.ONE_TIME:
            # One-time: use full amount
            source_amount = amount
        else:
            # Recurring: calculate monthly amount
            source_amount = source.calculate_monthly_amount() or Decimal("0")

        # Convert to display currency if needed
        if source.currency != display_currency:
            converted_amount = await currency_service.convert_amount(
                source_amount,
                source.currency,
                display_currency
            )
            if converted_amount:
                last_month_amount += converted_amount
            else:
                last_month_amount += source_amount
        else:
            last_month_amount += source_amount

    return IncomeStatsResponse(
        total_sources=total_sources_count,
        active_sources=active_sources_count,
        total_monthly_income=total_monthly,
        total_annual_income=total_annual,
        total_transactions=len(all_active_sources),
        total_transactions_amount=total_transactions_amount,
        transactions_current_month=len(current_month_sources),
        transactions_current_month_amount=current_month_amount,
        transactions_last_month=len(last_month_sources),
        transactions_last_month_amount=last_month_amount,
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
