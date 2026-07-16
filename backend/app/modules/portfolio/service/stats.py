"""Portfolio statistics."""
from decimal import Decimal
from uuid import UUID
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.portfolio.models import PortfolioAsset
from app.modules.portfolio.schemas import (
    PortfolioStats
)
from app.services.currency_service import CurrencyService
from .common import get_user_display_currency

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
            losers=0,
            total_dividends_received=Decimal('0'),
            dividend_paying_assets=0
        )

    # Calculate aggregates in display currency
    total_invested = Decimal('0')
    current_value = Decimal('0')
    total_dividends = Decimal('0')
    dividend_paying_count = 0
    by_asset_type = {}

    for asset in assets:
        # Convert to display currency
        invested_display = asset.total_invested or Decimal('0')
        value_display = asset.current_value or Decimal('0')
        dividends_display = asset.total_dividends_received or Decimal('0')

        if asset.currency != display_currency:
            converted_invested = await currency_service.convert_amount(asset.total_invested, asset.currency, display_currency) if asset.total_invested else None
            converted_value = await currency_service.convert_amount(asset.current_value, asset.currency, display_currency) if asset.current_value else None
            converted_dividends = await currency_service.convert_amount(asset.total_dividends_received, asset.currency, display_currency) if asset.total_dividends_received else None

            if converted_invested is not None:
                invested_display = converted_invested
            if converted_value is not None:
                value_display = converted_value
            if converted_dividends is not None:
                dividends_display = converted_dividends

        total_invested += invested_display
        current_value += value_display
        total_dividends += dividends_display

        if asset.is_dividend_paying:
            dividend_paying_count += 1

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
        losers=losers,
        total_dividends_received=total_dividends,
        dividend_paying_assets=dividend_paying_count
    )
