"""Asset CRUD operations."""
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.portfolio.models import PortfolioAsset, PortfolioTransaction, TransactionType
from app.modules.portfolio.schemas import (
    PortfolioAssetCreate, PortfolioAssetUpdate
)
from app.modules.savings.transaction_service import InsufficientFundsError
from .common import _calculate_next_dividend_date, _create_account_withdrawal, calculate_asset_metrics, logger

async def create_asset(
    db: AsyncSession,
    user_id: UUID,
    asset_data: PortfolioAssetCreate
) -> PortfolioAsset:
    """Create a new portfolio asset."""
    # Calculate metrics
    total_invested, current_value, total_return, return_percentage = calculate_asset_metrics(
        asset_data.quantity,
        asset_data.purchase_price,
        asset_data.current_price
    )

    # Calculate cost basis (purchase price * quantity + any fees would be added on buy)
    cost_basis = total_invested

    # Auto-calculate next_dividend_date if dividend tracking is enabled but date not provided
    next_dividend_date = asset_data.next_dividend_date
    if (asset_data.is_dividend_paying and
        asset_data.dividend_frequency and
        not next_dividend_date):
        # Calculate from today based on frequency
        next_dividend_date = _calculate_next_dividend_date(
            datetime.utcnow(),
            asset_data.dividend_frequency
        )

    asset = PortfolioAsset(
        user_id=user_id,
        asset_name=asset_data.asset_name,
        asset_type=asset_data.asset_type,
        symbol=asset_data.symbol,
        description=asset_data.description,
        quantity=asset_data.quantity,
        purchase_price=asset_data.purchase_price,
        current_price=asset_data.current_price,
        currency=asset_data.currency,
        purchase_date=asset_data.purchase_date,
        total_invested=total_invested,
        current_value=current_value,
        total_return=total_return,
        return_percentage=return_percentage,
        is_active=asset_data.is_active,
        # Payment account integration
        payment_account_id=asset_data.payment_account_id,
        auto_transact=asset_data.auto_transact,
        # Dynamic pricing
        ticker=asset_data.ticker,
        use_dynamic_pricing=asset_data.use_dynamic_pricing,
        price_source="manual",
        # Dividend tracking
        is_dividend_paying=asset_data.is_dividend_paying,
        dividend_yield=asset_data.dividend_yield,
        dividend_per_share=asset_data.dividend_per_share,
        dividend_frequency=asset_data.dividend_frequency,
        next_dividend_date=next_dividend_date,
        total_dividends_received=Decimal('0'),
        # Dividend account
        dividend_account_id=asset_data.dividend_account_id,
        auto_deposit_dividends=asset_data.auto_deposit_dividends,
        # Cost basis
        cost_basis=cost_basis,
        cost_basis_method=asset_data.cost_basis_method or "average"
    )

    db.add(asset)
    await db.commit()
    await db.refresh(asset)

    # Create initial buy transaction
    initial_transaction = PortfolioTransaction(
        asset_id=asset.id,
        user_id=user_id,
        type=TransactionType.BUY.value,
        quantity=asset_data.quantity,
        price_per_unit=asset_data.purchase_price,
        total_amount=total_invested,
        fees=Decimal('0'),
        currency=asset_data.currency,
        transaction_date=asset_data.purchase_date,
        shares_before=Decimal('0'),
        shares_after=asset_data.quantity,
        status="completed",
        notes="Initial purchase"
    )
    db.add(initial_transaction)

    # If auto_transact is enabled and payment account is linked, create withdrawal
    if asset_data.auto_transact and asset_data.payment_account_id and asset_data.sync_historical:
        try:
            account_tx_id = await _create_account_withdrawal(
                db, user_id, asset_data.payment_account_id,
                total_invested, asset_data.currency,
                f"Buy {asset_data.quantity} {asset_data.symbol or asset_data.asset_name}",
                asset_data.purchase_date
            )
            initial_transaction.account_transaction_id = account_tx_id
        except InsufficientFundsError:
            # Re-raise insufficient funds error so the router can handle it
            raise
        except Exception as e:
            logger.error(f"Failed to create account withdrawal for asset purchase: {e}")

    await db.commit()
    await db.refresh(asset)

    return asset

async def list_assets(
    db: AsyncSession,
    user_id: UUID,
    page: int = 1,
    page_size: int = 50,
    asset_type: Optional[str] = None,
    is_active: Optional[bool] = None
) -> tuple[list[PortfolioAsset], int]:
    """List portfolio assets with pagination and filters."""
    # Build query
    query = select(PortfolioAsset).where(PortfolioAsset.user_id == user_id)

    if asset_type:
        query = query.where(PortfolioAsset.asset_type == asset_type)

    if is_active is not None:
        query = query.where(PortfolioAsset.is_active == is_active)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query) or 0

    # Apply pagination and ordering
    query = query.order_by(PortfolioAsset.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    assets = list(result.scalars().all())

    return assets, total

async def get_asset(
    db: AsyncSession,
    user_id: UUID,
    asset_id: UUID
) -> Optional[PortfolioAsset]:
    """Get a single portfolio asset by ID."""
    query = select(PortfolioAsset).where(
        and_(
            PortfolioAsset.id == asset_id,
            PortfolioAsset.user_id == user_id
        )
    )
    result = await db.execute(query)
    return result.scalar_one_or_none()

async def update_asset(
    db: AsyncSession,
    user_id: UUID,
    asset_id: UUID,
    asset_data: PortfolioAssetUpdate
) -> Optional[PortfolioAsset]:
    """Update a portfolio asset."""
    asset = await get_asset(db, user_id, asset_id)
    if not asset:
        return None

    # Update fields
    update_data = asset_data.model_dump(exclude_unset=True, exclude={'sync_historical'})
    for field, value in update_data.items():
        setattr(asset, field, value)

    # Recalculate metrics if relevant fields changed
    if any(field in update_data for field in ['quantity', 'purchase_price', 'current_price']):
        total_invested, current_value, total_return, return_percentage = calculate_asset_metrics(
            asset.quantity,
            asset.purchase_price,
            asset.current_price
        )
        asset.total_invested = total_invested
        asset.current_value = current_value
        asset.total_return = total_return
        asset.return_percentage = return_percentage

    # Auto-calculate next_dividend_date if dividend tracking is enabled but date not set
    if (asset.is_dividend_paying and
        asset.dividend_frequency and
        not asset.next_dividend_date):
        asset.next_dividend_date = _calculate_next_dividend_date(
            datetime.utcnow(),
            asset.dividend_frequency
        )

    asset.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(asset)

    return asset

async def delete_asset(
    db: AsyncSession,
    user_id: UUID,
    asset_id: UUID
) -> bool:
    """Delete a portfolio asset."""
    asset = await get_asset(db, user_id, asset_id)
    if not asset:
        return False

    await db.delete(asset)
    await db.commit()

    return True
