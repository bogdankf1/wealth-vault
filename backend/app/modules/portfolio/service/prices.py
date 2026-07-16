"""Manual and API-based price updates."""
from datetime import datetime
from decimal import Decimal
from typing import Optional, Dict, Any
from uuid import UUID
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.portfolio.models import PortfolioAsset
from app.modules.portfolio.schemas import (
    PriceUpdateResponse
)
from .common import calculate_asset_metrics, logger
from .crud import get_asset

async def update_price_manual(
    db: AsyncSession,
    user_id: UUID,
    asset_id: UUID,
    new_price: Decimal
) -> Optional[PriceUpdateResponse]:
    """Manually update asset price."""
    asset = await get_asset(db, user_id, asset_id)
    if not asset:
        return None

    old_price = asset.current_price
    asset.current_price = new_price
    asset.price_source = "manual"
    asset.last_price_update = datetime.utcnow()

    # Recalculate metrics
    total_invested, current_value, total_return, return_percentage = calculate_asset_metrics(
        asset.quantity, asset.purchase_price, new_price
    )
    asset.current_value = current_value
    asset.total_return = total_return
    asset.return_percentage = return_percentage
    asset.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(asset)

    return PriceUpdateResponse(
        asset_id=asset.id,
        ticker=asset.ticker,
        old_price=old_price,
        new_price=new_price,
        price_source="manual",
        updated_at=asset.last_price_update,
        current_value=current_value,
        total_return=total_return,
        return_percentage=return_percentage
    )

async def update_price_from_api(
    db: AsyncSession,
    user_id: UUID,
    asset_id: UUID
) -> Optional[PriceUpdateResponse]:
    """Update asset price from yfinance API."""
    from app.services.price_service import PriceService

    asset = await get_asset(db, user_id, asset_id)
    if not asset or not asset.ticker:
        return None

    # Fetch price from API
    price_data = await PriceService.get_price(asset.ticker)
    if not price_data or not price_data.get("price"):
        logger.warning(f"Could not fetch price for ticker: {asset.ticker}")
        return None

    new_price = price_data["price"]
    old_price = asset.current_price

    asset.current_price = new_price
    asset.price_source = "yfinance"
    asset.last_price_update = datetime.utcnow()

    # Recalculate metrics
    total_invested, current_value, total_return, return_percentage = calculate_asset_metrics(
        asset.quantity, asset.purchase_price, new_price
    )
    asset.current_value = current_value
    asset.total_return = total_return
    asset.return_percentage = return_percentage
    asset.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(asset)

    return PriceUpdateResponse(
        asset_id=asset.id,
        ticker=asset.ticker,
        old_price=old_price,
        new_price=new_price,
        price_source="yfinance",
        updated_at=asset.last_price_update,
        current_value=current_value,
        total_return=total_return,
        return_percentage=return_percentage
    )

async def update_all_prices(
    db: AsyncSession,
    user_id: UUID
) -> Dict[str, Any]:
    """Update prices for all assets with dynamic pricing enabled."""
    from app.services.price_service import PriceService

    # Get all assets with dynamic pricing
    query = select(PortfolioAsset).where(
        and_(
            PortfolioAsset.user_id == user_id,
            PortfolioAsset.use_dynamic_pricing == True,
            PortfolioAsset.ticker.isnot(None),
            PortfolioAsset.is_active == True
        )
    )
    result = await db.execute(query)
    assets = list(result.scalars().all())

    if not assets:
        return {"updated_count": 0, "failed_count": 0, "updates": [], "errors": []}

    # Get all tickers
    tickers = [a.ticker for a in assets if a.ticker]
    ticker_to_asset = {a.ticker: a for a in assets if a.ticker}

    # Bulk fetch prices
    prices = await PriceService.get_prices_bulk(tickers)

    updates = []
    errors = []

    for ticker, asset in ticker_to_asset.items():
        try:
            if ticker in prices and prices[ticker].get("price"):
                new_price = prices[ticker]["price"]
                old_price = asset.current_price

                asset.current_price = new_price
                asset.price_source = "yfinance"
                asset.last_price_update = datetime.utcnow()

                # Recalculate metrics
                _, current_value, total_return, return_percentage = calculate_asset_metrics(
                    asset.quantity, asset.purchase_price, new_price
                )
                asset.current_value = current_value
                asset.total_return = total_return
                asset.return_percentage = return_percentage
                asset.updated_at = datetime.utcnow()

                updates.append(PriceUpdateResponse(
                    asset_id=asset.id,
                    ticker=ticker,
                    old_price=old_price,
                    new_price=new_price,
                    price_source="yfinance",
                    updated_at=asset.last_price_update,
                    current_value=current_value,
                    total_return=total_return,
                    return_percentage=return_percentage
                ))
            else:
                errors.append({"ticker": ticker, "error": "Price not available"})
        except Exception as e:
            errors.append({"ticker": ticker, "error": str(e)})

    await db.commit()

    return {
        "updated_count": len(updates),
        "failed_count": len(errors),
        "updates": updates,
        "errors": errors
    }
