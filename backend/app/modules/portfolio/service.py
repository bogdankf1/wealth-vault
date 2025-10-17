"""
Portfolio business logic and database operations.
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.portfolio.models import PortfolioAsset
from app.modules.portfolio.schemas import PortfolioAssetCreate, PortfolioAssetUpdate, PortfolioStats
from app.services.currency_service import CurrencyService


async def get_user_display_currency(db: AsyncSession, user_id: UUID) -> str:
    """Get user's preferred display currency"""
    from app.models.user_preferences import UserPreferences
    prefs_result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user_id)
    )
    user_prefs = prefs_result.scalar_one_or_none()
    return user_prefs.display_currency if user_prefs and user_prefs.display_currency else "USD"


async def convert_asset_to_display_currency(db: AsyncSession, user_id: UUID, asset: PortfolioAsset) -> None:
    """
    Convert asset amounts to user's display currency.
    Modifies the asset object in-place, adding display_* attributes.
    """
    display_currency = await get_user_display_currency(db, user_id)

    # If asset is already in display currency, no conversion needed
    if asset.currency == display_currency:
        asset.display_purchase_price = asset.purchase_price
        asset.display_current_price = asset.current_price
        asset.display_total_invested = asset.total_invested
        asset.display_current_value = asset.current_value
        asset.display_total_return = asset.total_return
        asset.display_currency = display_currency
        return

    # Convert using currency service
    currency_service = CurrencyService(db)

    # Convert prices and values
    converted_purchase = await currency_service.convert_amount(asset.purchase_price, asset.currency, display_currency)
    converted_current = await currency_service.convert_amount(asset.current_price, asset.currency, display_currency)
    converted_invested = await currency_service.convert_amount(asset.total_invested, asset.currency, display_currency) if asset.total_invested else None
    converted_value = await currency_service.convert_amount(asset.current_value, asset.currency, display_currency) if asset.current_value else None
    converted_return = await currency_service.convert_amount(asset.total_return, asset.currency, display_currency) if asset.total_return else None

    # Set converted values as display values
    if all(v is not None for v in [converted_purchase, converted_current]):
        asset.display_purchase_price = converted_purchase
        asset.display_current_price = converted_current
        asset.display_total_invested = converted_invested
        asset.display_current_value = converted_value
        asset.display_total_return = converted_return
        asset.display_currency = display_currency
    else:
        # Fallback to original values if conversion fails
        asset.display_purchase_price = asset.purchase_price
        asset.display_current_price = asset.current_price
        asset.display_total_invested = asset.total_invested
        asset.display_current_value = asset.current_value
        asset.display_total_return = asset.total_return
        asset.display_currency = asset.currency


def calculate_asset_metrics(
    quantity: Decimal,
    purchase_price: Decimal,
    current_price: Decimal
) -> tuple[Decimal, Decimal, Decimal, Decimal]:
    """
    Calculate investment metrics for an asset.

    Returns:
        tuple: (total_invested, current_value, total_return, return_percentage)
    """
    total_invested = quantity * purchase_price
    current_value = quantity * current_price
    total_return = current_value - total_invested

    if total_invested > 0:
        return_percentage = (total_return / total_invested) * Decimal('100')
    else:
        return_percentage = Decimal('0')

    return total_invested, current_value, total_return, return_percentage


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
        is_active=asset_data.is_active
    )

    db.add(asset)
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
    update_data = asset_data.model_dump(exclude_unset=True)
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


async def get_portfolio_stats(
    db: AsyncSession,
    user_id: UUID
) -> PortfolioStats:
    """Get comprehensive portfolio statistics."""
    # Get display currency
    display_currency = await get_user_display_currency(db, user_id)
    currency_service = CurrencyService(db)

    # Get all active assets
    query = select(PortfolioAsset).where(
        and_(
            PortfolioAsset.user_id == user_id,
            PortfolioAsset.is_active == True
        )
    )
    result = await db.execute(query)
    assets = list(result.scalars().all())

    total_assets = len(assets)

    if total_assets == 0:
        return PortfolioStats(
            total_assets=0,
            active_assets=0,
            total_invested=Decimal('0'),
            current_value=Decimal('0'),
            total_return=Decimal('0'),
            total_return_percentage=Decimal('0'),
            currency=display_currency,
            best_performer=None,
            worst_performer=None,
            by_asset_type={},
            winners=0,
            losers=0
        )

    # Calculate aggregates in display currency
    total_invested = Decimal('0')
    current_value = Decimal('0')
    by_asset_type = {}

    for asset in assets:
        # Convert to display currency
        invested_display = asset.total_invested or Decimal('0')
        value_display = asset.current_value or Decimal('0')

        if asset.currency != display_currency:
            converted_invested = await currency_service.convert_amount(asset.total_invested, asset.currency, display_currency) if asset.total_invested else None
            converted_value = await currency_service.convert_amount(asset.current_value, asset.currency, display_currency) if asset.current_value else None

            if converted_invested is not None:
                invested_display = converted_invested
            if converted_value is not None:
                value_display = converted_value

        total_invested += invested_display
        current_value += value_display

        # Group by asset type in display currency
        asset_type = asset.asset_type or "Other"
        if asset_type not in by_asset_type:
            by_asset_type[asset_type] = Decimal('0')
        by_asset_type[asset_type] += value_display

    total_return = current_value - total_invested
    total_return_percentage = (total_return / total_invested * Decimal('100')) if total_invested > 0 else Decimal('0')

    # Find best and worst performers
    sorted_by_return = sorted(
        [a for a in assets if a.return_percentage is not None],
        key=lambda x: x.return_percentage or Decimal('0'),
        reverse=True
    )

    best_performer = None
    worst_performer = None

    if sorted_by_return:
        best = sorted_by_return[0]
        best_performer = {
            "asset_name": best.asset_name,
            "symbol": best.symbol,
            "return_percentage": float(best.return_percentage or 0)
        }

        worst = sorted_by_return[-1]
        worst_performer = {
            "asset_name": worst.asset_name,
            "symbol": worst.symbol,
            "return_percentage": float(worst.return_percentage or 0)
        }

    # Count winners and losers
    winners = sum(1 for asset in assets if (asset.total_return or Decimal('0')) > 0)
    losers = sum(1 for asset in assets if (asset.total_return or Decimal('0')) < 0)

    return PortfolioStats(
        total_assets=total_assets,
        active_assets=total_assets,
        total_invested=total_invested,
        current_value=current_value,
        total_return=total_return,
        total_return_percentage=total_return_percentage,
        currency=display_currency,
        best_performer=best_performer,
        worst_performer=worst_performer,
        by_asset_type=by_asset_type,
        winners=winners,
        losers=losers
    )
