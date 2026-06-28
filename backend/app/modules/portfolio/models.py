"""
Portfolio database models.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class DividendFrequency(str, enum.Enum):
    """Dividend payment frequencies"""
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    SEMI_ANNUALLY = "semi_annually"
    ANNUALLY = "annually"


class TransactionType(str, enum.Enum):
    """Portfolio transaction types"""
    BUY = "buy"
    SELL = "sell"
    DIVIDEND = "dividend"
    SPLIT = "split"
    TRANSFER_IN = "transfer_in"
    TRANSFER_OUT = "transfer_out"


class PortfolioAsset(Base):
    """Portfolio asset model for tracking investments."""

    __tablename__ = "portfolio_assets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Asset information
    asset_name = Column(String(100), nullable=False)
    asset_type = Column(String(50), nullable=True, index=True)  # Stocks, Bonds, ETFs, Crypto, Real Estate, etc.
    symbol = Column(String(20), nullable=True)  # Ticker symbol or identifier
    description = Column(String(500), nullable=True)

    # Investment details
    quantity = Column(Numeric(18, 8), nullable=False)  # Support crypto decimals
    purchase_price = Column(Numeric(12, 2), nullable=False)  # Price per unit at purchase
    current_price = Column(Numeric(12, 2), nullable=False)  # Current price per unit
    currency = Column(String(3), nullable=False, default="USD")

    # Dates
    purchase_date = Column(DateTime, nullable=False)

    # Calculated fields (stored for performance)
    total_invested = Column(Numeric(18, 2), nullable=True)  # quantity * purchase_price
    current_value = Column(Numeric(18, 2), nullable=True)  # quantity * current_price
    total_return = Column(Numeric(18, 2), nullable=True)  # current_value - total_invested
    return_percentage = Column(Numeric(10, 4), nullable=True)  # (total_return / total_invested) * 100

    # Status
    is_active = Column(Boolean, nullable=False, default=True)

    # Payment account integration (for buy/sell transactions)
    payment_account_id = Column(UUID(as_uuid=True), ForeignKey("savings_accounts.id", ondelete="SET NULL"), nullable=True, index=True)
    auto_transact = Column(Boolean, nullable=False, default=False)  # Auto-record buy/sell to account

    # Dynamic pricing (yfinance integration)
    ticker = Column(String(20), nullable=True, index=True)  # Ticker for API lookup (e.g., AAPL, MSFT)
    use_dynamic_pricing = Column(Boolean, nullable=False, default=False)  # Use API for current price
    last_price_update = Column(DateTime, nullable=True)  # Last time price was fetched from API
    price_source = Column(String(50), nullable=True)  # Source of price data (e.g., "yfinance", "manual")

    # Dividend tracking
    is_dividend_paying = Column(Boolean, nullable=False, default=False)
    dividend_yield = Column(Numeric(6, 4), nullable=True)  # Annual yield as decimal (0.0350 = 3.5%)
    dividend_per_share = Column(Numeric(12, 4), nullable=True)  # Amount per share per payment
    dividend_frequency = Column(String(20), nullable=True)  # monthly, quarterly, semi_annually, annually
    next_dividend_date = Column(DateTime, nullable=True, index=True)
    last_dividend_date = Column(DateTime, nullable=True)
    total_dividends_received = Column(Numeric(18, 2), nullable=False, default=0)

    # Dividend deposit account (where dividends are deposited)
    dividend_account_id = Column(UUID(as_uuid=True), ForeignKey("savings_accounts.id", ondelete="SET NULL"), nullable=True)
    auto_deposit_dividends = Column(Boolean, nullable=False, default=False)

    # Cost basis tracking for tax purposes
    cost_basis = Column(Numeric(18, 2), nullable=True)  # Total cost basis including fees
    cost_basis_method = Column(String(20), nullable=True)  # FIFO, LIFO, average

    # Timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="portfolio_assets")
    payment_account = relationship("SavingsAccount", foreign_keys=[payment_account_id])
    dividend_account = relationship("SavingsAccount", foreign_keys=[dividend_account_id])
    transactions = relationship("PortfolioTransaction", back_populates="asset", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<PortfolioAsset {self.asset_name} ({self.symbol or 'N/A'})>"


class PortfolioTransaction(Base):
    """Track portfolio transactions (buy, sell, dividend, split)."""

    __tablename__ = "portfolio_transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id = Column(UUID(as_uuid=True), ForeignKey("portfolio_assets.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Transaction type: buy, sell, dividend, split, transfer_in, transfer_out
    type = Column(String(20), nullable=False, index=True)

    # Transaction details
    quantity = Column(Numeric(18, 8), nullable=False)  # Number of shares/units
    price_per_unit = Column(Numeric(12, 2), nullable=False)  # Price at transaction
    total_amount = Column(Numeric(18, 2), nullable=False)  # Total value (quantity * price)
    fees = Column(Numeric(12, 2), nullable=False, default=0)  # Transaction fees/commissions
    currency = Column(String(3), nullable=False)

    # For dividends
    dividend_per_share = Column(Numeric(12, 6), nullable=True)

    # For splits (e.g., 2:1 split means split_ratio = 2.0)
    split_ratio = Column(Numeric(10, 4), nullable=True)

    # Transaction date
    transaction_date = Column(DateTime, nullable=False, index=True)

    # Balance tracking (shares held before/after)
    shares_before = Column(Numeric(18, 8), nullable=True)
    shares_after = Column(Numeric(18, 8), nullable=True)

    # Links to other modules
    account_transaction_id = Column(UUID(as_uuid=True), ForeignKey("account_transactions.id", ondelete="SET NULL"), nullable=True)
    income_transaction_id = Column(UUID(as_uuid=True), ForeignKey("income_transactions.id", ondelete="SET NULL"), nullable=True)

    # Status and notes
    status = Column(String(20), nullable=False, default="completed")  # pending, completed, failed, reversed
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Relationships
    asset = relationship("PortfolioAsset", back_populates="transactions")
    user = relationship("User")
    account_transaction = relationship("AccountTransaction", foreign_keys=[account_transaction_id])
    income_transaction = relationship("IncomeTransaction", foreign_keys=[income_transaction_id])
