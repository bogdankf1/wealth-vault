"""Shared helpers: currency conversion, asset metrics, account transaction helpers."""
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional, Dict, Any
from uuid import UUID
import logging
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.portfolio.models import PortfolioAsset, PortfolioTransaction, TransactionType
from app.services.currency_service import CurrencyService

logger = logging.getLogger("app.modules.portfolio.service")

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

async def _create_account_withdrawal(
    db: AsyncSession,
    user_id: UUID,
    account_id: UUID,
    amount: Decimal,
    currency: str,
    description: str,
    transaction_date: datetime
) -> Optional[UUID]:
    """Create a withdrawal transaction in a savings account with currency conversion if needed."""
    from app.modules.savings.transaction_service import TransactionService
    from app.modules.savings.models import SavingsAccount
    from app.services.currency_service import CurrencyService
    from sqlalchemy import select

    # Get account to check currency
    account_result = await db.execute(
        select(SavingsAccount).where(SavingsAccount.id == account_id)
    )
    account = account_result.scalar_one_or_none()
    if not account:
        return None

    # Handle currency conversion if needed
    source_currency = None
    exchange_rate = None
    if currency and currency != account.currency:
        source_currency = currency
        currency_service = CurrencyService(db)
        exchange_rate = await currency_service.get_exchange_rate(currency, account.currency)
        if not exchange_rate:
            logger.warning(
                f"Could not get exchange rate from {currency} to {account.currency} "
                f"for portfolio withdrawal, using 1:1"
            )
            exchange_rate = Decimal("1")

    tx_service = TransactionService(db)
    transaction = await tx_service.create_withdrawal(
        account_id=account_id,
        amount=amount,
        source_type="portfolio",
        source_id=None,
        description=description,
        user_id=user_id,
        source_currency=source_currency,
        exchange_rate=exchange_rate,
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
    """Create a deposit transaction in a savings account with currency conversion if needed."""
    from app.modules.savings.transaction_service import TransactionService
    from app.modules.savings.models import SavingsAccount
    from app.services.currency_service import CurrencyService
    from sqlalchemy import select

    # Get account to check currency
    account_result = await db.execute(
        select(SavingsAccount).where(SavingsAccount.id == account_id)
    )
    account = account_result.scalar_one_or_none()
    if not account:
        return None

    # Handle currency conversion if needed
    source_currency = None
    exchange_rate = None
    if currency and currency != account.currency:
        source_currency = currency
        currency_service = CurrencyService(db)
        exchange_rate = await currency_service.get_exchange_rate(currency, account.currency)
        if not exchange_rate:
            logger.warning(
                f"Could not get exchange rate from {currency} to {account.currency} "
                f"for portfolio deposit, using 1:1"
            )
            exchange_rate = Decimal("1")

    tx_service = TransactionService(db)
    transaction = await tx_service.create_deposit(
        account_id=account_id,
        amount=amount,
        source_type="portfolio",
        source_id=None,
        description=description,
        user_id=user_id,
        source_currency=source_currency,
        exchange_rate=exchange_rate,
    )
    return transaction.id if transaction else None

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
