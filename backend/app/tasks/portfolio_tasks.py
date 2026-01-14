"""
Portfolio-related Celery tasks.

Tasks:
- Process dividend payments
- Update portfolio prices from yfinance
- Calculate portfolio performance
"""
import logging
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, Any

from sqlalchemy import select, and_

from app.core.celery_app import celery_app
from app.tasks.base import BaseTask, get_async_db_session

logger = logging.getLogger(__name__)


@celery_app.task(base=BaseTask, bind=True, name="tasks.portfolio.process_dividends")
def process_dividends(self) -> Dict[str, Any]:
    """
    Daily task to process dividend payments.

    For each portfolio asset with dividends:
    1. Check if dividend payment is due (based on next_dividend_date)
    2. Calculate dividend amount (shares * dividend_per_share)
    3. Record portfolio transaction
    4. Deposit to linked account if configured
    5. Update total_dividends_received
    6. Update next_dividend_date

    Returns:
        Dict with results
    """
    import asyncio

    async def _process():
        from app.modules.portfolio.models import PortfolioAsset, PortfolioTransaction, TransactionType
        from app.modules.savings.transaction_service import TransactionService
        from app.core.events import event_dispatcher, FinancialEvents

        async with get_async_db_session() as db:
            today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

            # Find dividend-paying assets with next_dividend_date <= today
            query = select(PortfolioAsset).where(
                and_(
                    PortfolioAsset.is_dividend_paying == True,
                    PortfolioAsset.is_active == True,
                    PortfolioAsset.next_dividend_date <= today,
                    PortfolioAsset.dividend_per_share.isnot(None)
                )
            )
            result = await db.execute(query)
            assets = list(result.scalars().all())

            dividends_processed = 0
            total_dividend_amount = Decimal('0')
            errors = []

            for asset in assets:
                try:
                    # Calculate dividend amount
                    dividend_amount = asset.quantity * asset.dividend_per_share

                    # Create portfolio transaction
                    transaction = PortfolioTransaction(
                        asset_id=asset.id,
                        user_id=asset.user_id,
                        type=TransactionType.DIVIDEND.value,
                        quantity=asset.quantity,
                        price_per_unit=asset.current_price,
                        total_amount=dividend_amount,
                        fees=Decimal('0'),
                        currency=asset.currency,
                        dividend_per_share=asset.dividend_per_share,
                        transaction_date=today,
                        shares_before=asset.quantity,
                        shares_after=asset.quantity,
                        status="completed",
                        notes=f"Automatic dividend payment"
                    )
                    db.add(transaction)

                    # Deposit to account if auto_deposit_dividends is enabled
                    if asset.auto_deposit_dividends and asset.dividend_account_id:
                        try:
                            tx_service = TransactionService(db)
                            account_tx = await tx_service.create_deposit(
                                account_id=asset.dividend_account_id,
                                amount=dividend_amount,
                                source_type="portfolio_dividend",
                                source_id=asset.id,
                                description=f"Dividend from {asset.symbol or asset.asset_name}",
                                user_id=asset.user_id
                            )
                            if account_tx:
                                transaction.account_transaction_id = account_tx.id
                        except Exception as e:
                            logger.error(f"Failed to deposit dividend for asset {asset.id}: {e}")

                    # Update asset dividend tracking
                    asset.total_dividends_received = (asset.total_dividends_received or Decimal('0')) + dividend_amount
                    asset.last_dividend_date = today

                    # Calculate next dividend date
                    if asset.dividend_frequency == "monthly":
                        asset.next_dividend_date = today + timedelta(days=30)
                    elif asset.dividend_frequency == "quarterly":
                        asset.next_dividend_date = today + timedelta(days=91)
                    elif asset.dividend_frequency == "semi_annually":
                        asset.next_dividend_date = today + timedelta(days=182)
                    elif asset.dividend_frequency == "annually":
                        asset.next_dividend_date = today + timedelta(days=365)
                    else:
                        asset.next_dividend_date = today + timedelta(days=91)  # Default quarterly

                    asset.updated_at = datetime.utcnow()

                    dividends_processed += 1
                    total_dividend_amount += dividend_amount

                    logger.info(f"Processed dividend for asset {asset.id}: {dividend_amount} {asset.currency}")

                except Exception as e:
                    errors.append({
                        "asset_id": str(asset.id),
                        "asset_name": asset.asset_name,
                        "error": str(e)
                    })
                    logger.error(f"Error processing dividend for asset {asset.id}: {e}")

            await db.commit()

            return {
                "assets_checked": len(assets),
                "dividends_processed": dividends_processed,
                "total_dividend_amount": float(total_dividend_amount),
                "errors": errors,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_process())


@celery_app.task(base=BaseTask, bind=True, name="tasks.portfolio.update_prices")
def update_portfolio_prices(self) -> Dict[str, Any]:
    """
    Daily/hourly task to update portfolio asset prices from yfinance.

    For each portfolio asset with dynamic pricing enabled:
    1. Fetch current price from yfinance API
    2. Update current_price
    3. Recalculate total_return and return_percentage

    Returns:
        Dict with results
    """
    import asyncio

    async def _update():
        from app.modules.portfolio.models import PortfolioAsset
        from app.services.price_service import PriceService

        async with get_async_db_session() as db:
            # Find assets with dynamic pricing enabled
            query = select(PortfolioAsset).where(
                and_(
                    PortfolioAsset.use_dynamic_pricing == True,
                    PortfolioAsset.ticker.isnot(None),
                    PortfolioAsset.is_active == True
                )
            )
            result = await db.execute(query)
            assets = list(result.scalars().all())

            if not assets:
                return {
                    "assets_updated": 0,
                    "prices_fetched": 0,
                    "errors": 0,
                    "timestamp": datetime.utcnow().isoformat()
                }

            # Group assets by ticker for bulk fetch
            ticker_to_assets = {}
            for asset in assets:
                if asset.ticker not in ticker_to_assets:
                    ticker_to_assets[asset.ticker] = []
                ticker_to_assets[asset.ticker].append(asset)

            # Bulk fetch prices
            tickers = list(ticker_to_assets.keys())
            prices = await PriceService.get_prices_bulk(tickers)

            assets_updated = 0
            errors = []

            for ticker, price_data in prices.items():
                if not price_data or not price_data.get("price"):
                    errors.append({"ticker": ticker, "error": "No price data"})
                    continue

                new_price = price_data["price"]

                for asset in ticker_to_assets.get(ticker, []):
                    try:
                        asset.current_price = new_price
                        asset.price_source = "yfinance"
                        asset.last_price_update = datetime.utcnow()

                        # Recalculate metrics
                        total_invested = asset.quantity * asset.purchase_price
                        current_value = asset.quantity * new_price
                        total_return = current_value - total_invested

                        if total_invested > 0:
                            return_percentage = (total_return / total_invested) * Decimal('100')
                        else:
                            return_percentage = Decimal('0')

                        asset.current_value = current_value
                        asset.total_return = total_return
                        asset.return_percentage = return_percentage
                        asset.updated_at = datetime.utcnow()

                        assets_updated += 1

                    except Exception as e:
                        errors.append({
                            "asset_id": str(asset.id),
                            "ticker": ticker,
                            "error": str(e)
                        })

            # Check for tickers without price data
            for ticker in tickers:
                if ticker not in prices:
                    errors.append({"ticker": ticker, "error": "Price not available"})

            await db.commit()

            logger.info(f"Updated {assets_updated} portfolio asset prices")

            return {
                "assets_updated": assets_updated,
                "prices_fetched": len(prices),
                "errors": len(errors),
                "error_details": errors[:10],  # Limit error details
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_update())


@celery_app.task(base=BaseTask, bind=True, name="tasks.portfolio.calculate_performance")
def calculate_portfolio_performance(self) -> Dict[str, Any]:
    """
    Weekly task to calculate portfolio performance metrics.

    For each user with portfolio assets:
    1. Calculate total portfolio value
    2. Calculate weekly/monthly/yearly returns
    3. Calculate asset allocation percentages
    4. Generate performance summary

    Returns:
        Dict with results
    """
    import asyncio

    async def _calculate():
        from app.modules.portfolio.models import PortfolioAsset
        from sqlalchemy import func

        async with get_async_db_session() as db:
            # Get all users with portfolio assets
            user_query = select(PortfolioAsset.user_id).where(
                PortfolioAsset.is_active == True
            ).distinct()
            result = await db.execute(user_query)
            user_ids = [row[0] for row in result.all()]

            summaries_generated = 0

            for user_id in user_ids:
                try:
                    # Get user's active assets
                    assets_query = select(PortfolioAsset).where(
                        and_(
                            PortfolioAsset.user_id == user_id,
                            PortfolioAsset.is_active == True
                        )
                    )
                    assets_result = await db.execute(assets_query)
                    assets = list(assets_result.scalars().all())

                    if not assets:
                        continue

                    # Calculate aggregates
                    total_invested = sum(asset.total_invested or Decimal('0') for asset in assets)
                    current_value = sum(asset.current_value or Decimal('0') for asset in assets)
                    total_return = current_value - total_invested
                    total_dividends = sum(asset.total_dividends_received or Decimal('0') for asset in assets)

                    # Calculate by asset type
                    by_asset_type = {}
                    for asset in assets:
                        asset_type = asset.asset_type or "Other"
                        if asset_type not in by_asset_type:
                            by_asset_type[asset_type] = Decimal('0')
                        by_asset_type[asset_type] += asset.current_value or Decimal('0')

                    # Log performance summary
                    logger.info(
                        f"User {user_id} portfolio: invested={total_invested}, "
                        f"value={current_value}, return={total_return}, dividends={total_dividends}"
                    )

                    summaries_generated += 1

                except Exception as e:
                    logger.error(f"Error calculating performance for user {user_id}: {e}")

            return {
                "users_processed": len(user_ids),
                "summaries_generated": summaries_generated,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_calculate())


@celery_app.task(base=BaseTask, bind=True, name="tasks.portfolio.send_dividend_reminders")
def send_dividend_reminders(self) -> Dict[str, Any]:
    """
    Daily task to send reminders for upcoming dividend payments.

    Sends notifications to users with assets that have dividends due in the next 3 days.

    Returns:
        Dict with results
    """
    import asyncio

    async def _send_reminders():
        from app.modules.portfolio.models import PortfolioAsset
        from app.modules.notifications.service import NotificationService

        async with get_async_db_session() as db:
            today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
            reminder_date = today + timedelta(days=3)

            # Find assets with dividends due in next 3 days
            query = select(PortfolioAsset).where(
                and_(
                    PortfolioAsset.is_dividend_paying == True,
                    PortfolioAsset.is_active == True,
                    PortfolioAsset.next_dividend_date >= today,
                    PortfolioAsset.next_dividend_date <= reminder_date
                )
            )
            result = await db.execute(query)
            assets = list(result.scalars().all())

            reminders_sent = 0

            for asset in assets:
                try:
                    # Calculate expected dividend
                    expected_amount = asset.quantity * (asset.dividend_per_share or Decimal('0'))

                    notification_service = NotificationService(db)
                    await notification_service.create_notification(
                        user_id=asset.user_id,
                        type="reminder",
                        category="portfolio",
                        title=f"Dividend Payment Coming",
                        message=f"You have a dividend payment of {expected_amount:.2f} {asset.currency} expected from {asset.symbol or asset.asset_name} on {asset.next_dividend_date.strftime('%Y-%m-%d')}.",
                        priority=2,
                        action_url=f"/dashboard/portfolio/{asset.id}",
                        metadata={
                            "asset_id": str(asset.id),
                            "asset_name": asset.asset_name,
                            "expected_amount": float(expected_amount),
                            "dividend_date": asset.next_dividend_date.isoformat()
                        }
                    )
                    reminders_sent += 1

                except Exception as e:
                    logger.error(f"Error sending dividend reminder for asset {asset.id}: {e}")

            await db.commit()

            return {
                "assets_checked": len(assets),
                "reminders_sent": reminders_sent,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_send_reminders())
