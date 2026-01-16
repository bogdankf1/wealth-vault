"""
Portfolio business logic and database operations.
"""
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional, List, Dict, Any
from uuid import UUID
import logging

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.portfolio.models import PortfolioAsset, PortfolioTransaction, TransactionType
from app.modules.portfolio.schemas import (
    PortfolioAssetCreate, PortfolioAssetUpdate, PortfolioStats,
    PortfolioTransactionCreate, BuyAssetRequest, SellAssetRequest,
    RecordDividendRequest, PriceUpdateResponse
)
from app.services.currency_service import CurrencyService
from app.modules.savings.transaction_service import InsufficientFundsError

logger = logging.getLogger(__name__)


# ==================== Helper Functions ====================

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
        logger.warning(
            f"Currency conversion failed for portfolio asset {asset.id}: "
            f"could not convert {asset.currency} to {display_currency}. "
            f"Using original currency values."
        )
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


# ==================== Asset CRUD Operations ====================

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
        next_dividend_date=asset_data.next_dividend_date,
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


# ==================== Transaction Operations ====================

async def _create_account_withdrawal(
    db: AsyncSession,
    user_id: UUID,
    account_id: UUID,
    amount: Decimal,
    currency: str,
    description: str,
    transaction_date: datetime
) -> Optional[UUID]:
    """Create a withdrawal transaction in a savings account."""
    from app.modules.savings.transaction_service import TransactionService

    tx_service = TransactionService(db)
    transaction = await tx_service.create_withdrawal(
        account_id=account_id,
        amount=amount,
        source_type="portfolio",
        source_id=None,
        description=description,
        user_id=user_id
    )
    return transaction.id if transaction else None


async def _create_account_deposit(
    db: AsyncSession,
    user_id: UUID,
    account_id: UUID,
    amount: Decimal,
    currency: str,
    description: str,
    transaction_date: datetime
) -> Optional[UUID]:
    """Create a deposit transaction in a savings account."""
    from app.modules.savings.transaction_service import TransactionService

    tx_service = TransactionService(db)
    transaction = await tx_service.create_deposit(
        account_id=account_id,
        amount=amount,
        source_type="portfolio",
        source_id=None,
        description=description,
        user_id=user_id
    )
    return transaction.id if transaction else None


async def record_buy(
    db: AsyncSession,
    user_id: UUID,
    asset_id: UUID,
    buy_data: BuyAssetRequest
) -> Optional[PortfolioTransaction]:
    """Record a buy transaction for an existing asset."""
    asset = await get_asset(db, user_id, asset_id)
    if not asset:
        return None

    shares_before = asset.quantity
    shares_after = shares_before + buy_data.quantity
    total_amount = buy_data.quantity * buy_data.price_per_unit + buy_data.fees

    # Create transaction record
    transaction = PortfolioTransaction(
        asset_id=asset_id,
        user_id=user_id,
        type=TransactionType.BUY.value,
        quantity=buy_data.quantity,
        price_per_unit=buy_data.price_per_unit,
        total_amount=total_amount,
        fees=buy_data.fees,
        currency=asset.currency,
        transaction_date=buy_data.transaction_date,
        shares_before=shares_before,
        shares_after=shares_after,
        status="completed",
        notes=buy_data.notes
    )
    db.add(transaction)

    # Update asset quantity and recalculate average purchase price
    old_cost = asset.quantity * asset.purchase_price
    new_cost = buy_data.quantity * buy_data.price_per_unit
    asset.quantity = shares_after
    asset.purchase_price = (old_cost + new_cost) / shares_after

    # Update cost basis
    asset.cost_basis = (asset.cost_basis or Decimal('0')) + total_amount

    # Recalculate metrics
    total_invested, current_value, total_return, return_percentage = calculate_asset_metrics(
        asset.quantity, asset.purchase_price, asset.current_price
    )
    asset.total_invested = total_invested
    asset.current_value = current_value
    asset.total_return = total_return
    asset.return_percentage = return_percentage
    asset.updated_at = datetime.utcnow()

    # Create account withdrawal if requested
    if buy_data.withdraw_from_account and asset.payment_account_id:
        from app.modules.savings.transaction_service import InsufficientFundsError
        try:
            account_tx_id = await _create_account_withdrawal(
                db, user_id, asset.payment_account_id,
                total_amount, asset.currency,
                f"Buy {buy_data.quantity} {asset.symbol or asset.asset_name}",
                buy_data.transaction_date
            )
            transaction.account_transaction_id = account_tx_id
        except InsufficientFundsError:
            # Re-raise InsufficientFundsError for proper handling by the caller
            raise
        except Exception as e:
            logger.error(f"Failed to create account withdrawal: {e}")

    await db.commit()
    await db.refresh(transaction)

    return transaction


async def record_sell(
    db: AsyncSession,
    user_id: UUID,
    asset_id: UUID,
    sell_data: SellAssetRequest
) -> Optional[Dict[str, Any]]:
    """Record a sell transaction for an existing asset."""
    asset = await get_asset(db, user_id, asset_id)
    if not asset:
        return None

    if sell_data.quantity > asset.quantity:
        raise ValueError("Cannot sell more shares than owned")

    shares_before = asset.quantity
    shares_after = shares_before - sell_data.quantity
    proceeds = sell_data.quantity * sell_data.price_per_unit - sell_data.fees

    # Calculate cost basis for sold shares (using average method)
    cost_basis_sold = sell_data.quantity * asset.purchase_price
    realized_gain_loss = proceeds - cost_basis_sold

    # Create transaction record
    transaction = PortfolioTransaction(
        asset_id=asset_id,
        user_id=user_id,
        type=TransactionType.SELL.value,
        quantity=sell_data.quantity,
        price_per_unit=sell_data.price_per_unit,
        total_amount=proceeds,
        fees=sell_data.fees,
        currency=asset.currency,
        transaction_date=sell_data.transaction_date,
        shares_before=shares_before,
        shares_after=shares_after,
        status="completed",
        notes=sell_data.notes
    )
    db.add(transaction)

    # Update asset quantity
    asset.quantity = shares_after

    # Update cost basis
    if asset.cost_basis and shares_before > 0:
        cost_basis_per_share = asset.cost_basis / shares_before
        asset.cost_basis = cost_basis_per_share * shares_after

    # Recalculate metrics
    if shares_after > 0:
        total_invested, current_value, total_return, return_percentage = calculate_asset_metrics(
            asset.quantity, asset.purchase_price, asset.current_price
        )
        asset.total_invested = total_invested
        asset.current_value = current_value
        asset.total_return = total_return
        asset.return_percentage = return_percentage
    else:
        # All shares sold
        asset.is_active = False
        asset.total_invested = Decimal('0')
        asset.current_value = Decimal('0')
        asset.total_return = Decimal('0')
        asset.return_percentage = Decimal('0')

    asset.updated_at = datetime.utcnow()

    # Create account deposit if requested
    if sell_data.deposit_to_account and asset.payment_account_id:
        try:
            account_tx_id = await _create_account_deposit(
                db, user_id, asset.payment_account_id,
                proceeds, asset.currency,
                f"Sell {sell_data.quantity} {asset.symbol or asset.asset_name}",
                sell_data.transaction_date
            )
            transaction.account_transaction_id = account_tx_id
        except Exception as e:
            logger.error(f"Failed to create account deposit: {e}")

    await db.commit()
    await db.refresh(transaction)

    return {
        "transaction": transaction,
        "proceeds": proceeds,
        "cost_basis_sold": cost_basis_sold,
        "realized_gain_loss": realized_gain_loss,
        "is_gain": realized_gain_loss > 0
    }


async def record_dividend(
    db: AsyncSession,
    user_id: UUID,
    asset_id: UUID,
    dividend_data: RecordDividendRequest
) -> Optional[PortfolioTransaction]:
    """Record a dividend payment for an asset."""
    asset = await get_asset(db, user_id, asset_id)
    if not asset:
        return None

    # Calculate dividend per share if not provided
    dividend_per_share = dividend_data.dividend_per_share
    if dividend_per_share is None and asset.quantity > 0:
        dividend_per_share = dividend_data.amount / asset.quantity

    # Create transaction record
    transaction = PortfolioTransaction(
        asset_id=asset_id,
        user_id=user_id,
        type=TransactionType.DIVIDEND.value,
        quantity=asset.quantity,  # Shares held at time of dividend
        price_per_unit=asset.current_price,
        total_amount=dividend_data.amount,
        fees=Decimal('0'),
        currency=asset.currency,
        dividend_per_share=dividend_per_share,
        transaction_date=dividend_data.payment_date,
        shares_before=asset.quantity,
        shares_after=asset.quantity,
        status="completed",
        notes=dividend_data.notes
    )
    db.add(transaction)

    # Update asset dividend tracking
    asset.total_dividends_received = (asset.total_dividends_received or Decimal('0')) + dividend_data.amount
    asset.last_dividend_date = dividend_data.payment_date

    # Calculate next dividend date if frequency is set
    if asset.dividend_frequency:
        asset.next_dividend_date = _calculate_next_dividend_date(
            dividend_data.payment_date, asset.dividend_frequency
        )

    asset.updated_at = datetime.utcnow()

    # Create account deposit if requested
    if dividend_data.deposit_to_account and asset.dividend_account_id:
        try:
            account_tx_id = await _create_account_deposit(
                db, user_id, asset.dividend_account_id,
                dividend_data.amount, asset.currency,
                f"Dividend from {asset.symbol or asset.asset_name}",
                dividend_data.payment_date
            )
            transaction.account_transaction_id = account_tx_id
        except Exception as e:
            logger.error(f"Failed to create account deposit for dividend: {e}")

    await db.commit()
    await db.refresh(transaction)

    return transaction


def _calculate_next_dividend_date(last_date: datetime, frequency: str) -> datetime:
    """Calculate next dividend date based on frequency."""
    if frequency == "monthly":
        return last_date + timedelta(days=30)
    elif frequency == "quarterly":
        return last_date + timedelta(days=91)
    elif frequency == "semi_annually":
        return last_date + timedelta(days=182)
    elif frequency == "annually":
        return last_date + timedelta(days=365)
    else:
        return last_date + timedelta(days=91)  # Default to quarterly


async def get_transactions(
    db: AsyncSession,
    user_id: UUID,
    asset_id: UUID,
    page: int = 1,
    page_size: int = 50,
    transaction_type: Optional[str] = None
) -> tuple[list[PortfolioTransaction], int]:
    """Get transactions for an asset."""
    query = select(PortfolioTransaction).where(
        and_(
            PortfolioTransaction.asset_id == asset_id,
            PortfolioTransaction.user_id == user_id
        )
    )

    if transaction_type:
        query = query.where(PortfolioTransaction.type == transaction_type)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query) or 0

    # Apply pagination and ordering
    query = query.order_by(PortfolioTransaction.transaction_date.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    transactions = list(result.scalars().all())

    return transactions, total


# ==================== Price Update Operations ====================

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


# ==================== Statistics ====================

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
