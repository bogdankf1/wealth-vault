"""Buy/sell/dividend transaction recording and history."""
from datetime import datetime
from decimal import Decimal
from typing import Optional, Dict, Any
from uuid import UUID
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.portfolio.models import PortfolioTransaction, TransactionType
from app.modules.portfolio.schemas import (
    BuyAssetRequest, SellAssetRequest,
    RecordDividendRequest
)
from .common import _calculate_next_dividend_date, _create_account_deposit, _create_account_withdrawal, calculate_asset_metrics, logger
from .crud import get_asset

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
