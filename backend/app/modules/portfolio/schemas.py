"""
Portfolio Pydantic schemas for request/response validation.
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


# ==================== Portfolio Asset Schemas ====================

class PortfolioAssetCreate(BaseModel):
    """Schema for creating a portfolio asset."""

    asset_name: str = Field(..., min_length=1, max_length=100)
    asset_type: Optional[str] = Field(None, max_length=50)
    symbol: Optional[str] = Field(None, max_length=20)
    description: Optional[str] = Field(None, max_length=500)
    quantity: Decimal = Field(..., gt=0)
    purchase_price: Decimal = Field(..., gt=0)
    current_price: Decimal = Field(..., gt=0)
    currency: str = Field(default="USD", max_length=3)
    purchase_date: datetime
    is_active: bool = True

    # Payment account integration
    payment_account_id: Optional[UUID] = None
    auto_transact: bool = False
    sync_historical: bool = False  # Backfill past transactions

    # Dynamic pricing
    ticker: Optional[str] = Field(None, max_length=20)
    use_dynamic_pricing: bool = False

    # Dividend tracking
    is_dividend_paying: bool = False
    dividend_yield: Optional[Decimal] = Field(None, ge=0, le=1)  # 0-100% as decimal
    dividend_per_share: Optional[Decimal] = Field(None, ge=0)
    dividend_frequency: Optional[str] = Field(None, max_length=20)
    next_dividend_date: Optional[datetime] = None

    # Dividend deposit account
    dividend_account_id: Optional[UUID] = None
    auto_deposit_dividends: bool = False

    # Cost basis
    cost_basis_method: Optional[str] = Field(None, max_length=20)

    @model_validator(mode='after')
    def convert_to_naive_datetimes(self):
        """Convert timezone-aware datetimes to naive datetimes."""
        if self.purchase_date and isinstance(self.purchase_date, datetime) and self.purchase_date.tzinfo is not None:
            self.purchase_date = self.purchase_date.replace(tzinfo=None)
        if self.next_dividend_date and isinstance(self.next_dividend_date, datetime) and self.next_dividend_date.tzinfo is not None:
            self.next_dividend_date = self.next_dividend_date.replace(tzinfo=None)
        return self


class PortfolioAssetUpdate(BaseModel):
    """Schema for updating a portfolio asset."""

    asset_name: Optional[str] = Field(None, min_length=1, max_length=100)
    asset_type: Optional[str] = Field(None, max_length=50)
    symbol: Optional[str] = Field(None, max_length=20)
    description: Optional[str] = Field(None, max_length=500)
    quantity: Optional[Decimal] = Field(None, gt=0)
    purchase_price: Optional[Decimal] = Field(None, gt=0)
    current_price: Optional[Decimal] = Field(None, gt=0)
    currency: Optional[str] = Field(None, max_length=3)
    purchase_date: Optional[datetime] = None
    is_active: Optional[bool] = None

    # Payment account integration
    payment_account_id: Optional[UUID] = None
    auto_transact: Optional[bool] = None
    sync_historical: bool = False

    # Dynamic pricing
    ticker: Optional[str] = Field(None, max_length=20)
    use_dynamic_pricing: Optional[bool] = None

    # Dividend tracking
    is_dividend_paying: Optional[bool] = None
    dividend_yield: Optional[Decimal] = Field(None, ge=0, le=1)
    dividend_per_share: Optional[Decimal] = Field(None, ge=0)
    dividend_frequency: Optional[str] = Field(None, max_length=20)
    next_dividend_date: Optional[datetime] = None

    # Dividend deposit account
    dividend_account_id: Optional[UUID] = None
    auto_deposit_dividends: Optional[bool] = None

    # Cost basis
    cost_basis_method: Optional[str] = Field(None, max_length=20)

    @model_validator(mode='after')
    def convert_to_naive_datetimes(self):
        """Convert timezone-aware datetimes to naive datetimes."""
        if self.purchase_date and isinstance(self.purchase_date, datetime) and self.purchase_date.tzinfo is not None:
            self.purchase_date = self.purchase_date.replace(tzinfo=None)
        if self.next_dividend_date and isinstance(self.next_dividend_date, datetime) and self.next_dividend_date.tzinfo is not None:
            self.next_dividend_date = self.next_dividend_date.replace(tzinfo=None)
        return self


class PortfolioAssetResponse(BaseModel):
    """Schema for portfolio asset response."""

    id: UUID
    user_id: UUID
    asset_name: str
    asset_type: Optional[str]
    symbol: Optional[str]
    description: Optional[str]
    quantity: Decimal
    purchase_price: Decimal
    current_price: Decimal
    currency: str
    purchase_date: datetime
    total_invested: Optional[Decimal]
    current_value: Optional[Decimal]
    total_return: Optional[Decimal]
    return_percentage: Optional[Decimal]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    # Payment account integration
    payment_account_id: Optional[UUID] = None
    auto_transact: bool = False

    # Dynamic pricing
    ticker: Optional[str] = None
    use_dynamic_pricing: bool = False
    last_price_update: Optional[datetime] = None
    price_source: Optional[str] = None

    # Dividend tracking
    is_dividend_paying: bool = False
    dividend_yield: Optional[Decimal] = None
    dividend_per_share: Optional[Decimal] = None
    dividend_frequency: Optional[str] = None
    next_dividend_date: Optional[datetime] = None
    last_dividend_date: Optional[datetime] = None
    total_dividends_received: Decimal = Decimal("0")

    # Dividend deposit account
    dividend_account_id: Optional[UUID] = None
    auto_deposit_dividends: bool = False

    # Cost basis
    cost_basis: Optional[Decimal] = None
    cost_basis_method: Optional[str] = None

    # Display currency fields
    display_purchase_price: Optional[Decimal] = None
    display_current_price: Optional[Decimal] = None
    display_total_invested: Optional[Decimal] = None
    display_current_value: Optional[Decimal] = None
    display_total_return: Optional[Decimal] = None
    display_currency: Optional[str] = None

    model_config = {"from_attributes": True}


class PortfolioAssetListResponse(BaseModel):
    """Schema for paginated portfolio asset list response."""

    items: list[PortfolioAssetResponse]
    total: int
    page: int
    page_size: int


class PortfolioStats(BaseModel):
    """Schema for portfolio statistics."""

    total_assets: int
    active_assets: int
    total_invested: Decimal
    current_value: Decimal
    total_return: Decimal
    total_return_percentage: Decimal
    currency: str
    best_performer: Optional[dict]  # Asset with highest return %
    worst_performer: Optional[dict]  # Asset with lowest return %
    by_asset_type: dict[str, Decimal]  # Current value by asset type
    winners: int  # Number of assets with positive returns
    losers: int  # Number of assets with negative returns
    # New dividend stats
    total_dividends_received: Decimal = Decimal("0")
    dividend_paying_assets: int = 0


# ==================== Portfolio Transaction Schemas ====================

class PortfolioTransactionCreate(BaseModel):
    """Schema for creating a portfolio transaction."""

    type: str = Field(..., pattern="^(buy|sell|dividend|split|transfer_in|transfer_out)$")
    quantity: Decimal = Field(..., gt=0)
    price_per_unit: Decimal = Field(..., ge=0)
    fees: Decimal = Field(default=Decimal("0"), ge=0)
    transaction_date: datetime
    notes: Optional[str] = Field(None, max_length=500)

    # For dividends
    dividend_per_share: Optional[Decimal] = None

    # For splits
    split_ratio: Optional[Decimal] = None

    # Whether to record to linked account
    record_to_account: bool = True

    @model_validator(mode='after')
    def convert_to_naive_datetimes(self):
        """Convert timezone-aware datetimes to naive datetimes."""
        if self.transaction_date and isinstance(self.transaction_date, datetime) and self.transaction_date.tzinfo is not None:
            self.transaction_date = self.transaction_date.replace(tzinfo=None)
        return self


class PortfolioTransactionResponse(BaseModel):
    """Schema for portfolio transaction response."""

    id: UUID
    asset_id: UUID
    user_id: UUID
    type: str
    quantity: Decimal
    price_per_unit: Decimal
    total_amount: Decimal
    fees: Decimal
    currency: str
    dividend_per_share: Optional[Decimal] = None
    split_ratio: Optional[Decimal] = None
    transaction_date: datetime
    shares_before: Optional[Decimal] = None
    shares_after: Optional[Decimal] = None
    account_transaction_id: Optional[UUID] = None
    income_transaction_id: Optional[UUID] = None
    status: str
    notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PortfolioTransactionListResponse(BaseModel):
    """Schema for paginated transaction list response."""

    items: list[PortfolioTransactionResponse]
    total: int
    page: int
    page_size: int


# ==================== Dividend Schemas ====================

class RecordDividendRequest(BaseModel):
    """Schema for recording a dividend payment."""

    amount: Decimal = Field(..., gt=0)
    payment_date: datetime
    dividend_per_share: Optional[Decimal] = None
    notes: Optional[str] = Field(None, max_length=500)
    deposit_to_account: bool = True  # Deposit to dividend account if linked

    @model_validator(mode='after')
    def convert_to_naive_datetimes(self):
        if self.payment_date and isinstance(self.payment_date, datetime) and self.payment_date.tzinfo is not None:
            self.payment_date = self.payment_date.replace(tzinfo=None)
        return self


# ==================== Price Update Schemas ====================

class UpdatePriceRequest(BaseModel):
    """Schema for manually updating asset price."""

    current_price: Decimal = Field(..., gt=0)


class PriceUpdateResponse(BaseModel):
    """Schema for price update response."""

    asset_id: UUID
    ticker: Optional[str]
    old_price: Decimal
    new_price: Decimal
    price_source: str
    updated_at: datetime
    current_value: Decimal
    total_return: Decimal
    return_percentage: Decimal


class BulkPriceUpdateResponse(BaseModel):
    """Schema for bulk price update response."""

    updated_count: int
    failed_count: int
    updates: list[PriceUpdateResponse]
    errors: list[dict]


# ==================== Buy/Sell Schemas ====================

class BuyAssetRequest(BaseModel):
    """Schema for buying more of an existing asset."""

    quantity: Decimal = Field(..., gt=0)
    price_per_unit: Decimal = Field(..., gt=0)
    fees: Decimal = Field(default=Decimal("0"), ge=0)
    transaction_date: datetime
    notes: Optional[str] = Field(None, max_length=500)
    withdraw_from_account: bool = True  # Withdraw from payment account if linked

    @model_validator(mode='after')
    def convert_to_naive_datetimes(self):
        if self.transaction_date and isinstance(self.transaction_date, datetime) and self.transaction_date.tzinfo is not None:
            self.transaction_date = self.transaction_date.replace(tzinfo=None)
        return self


class SellAssetRequest(BaseModel):
    """Schema for selling part of an existing asset."""

    quantity: Decimal = Field(..., gt=0)
    price_per_unit: Decimal = Field(..., gt=0)
    fees: Decimal = Field(default=Decimal("0"), ge=0)
    transaction_date: datetime
    notes: Optional[str] = Field(None, max_length=500)
    deposit_to_account: bool = True  # Deposit proceeds to payment account if linked

    @model_validator(mode='after')
    def convert_to_naive_datetimes(self):
        if self.transaction_date and isinstance(self.transaction_date, datetime) and self.transaction_date.tzinfo is not None:
            self.transaction_date = self.transaction_date.replace(tzinfo=None)
        return self


class SellAssetResponse(BaseModel):
    """Schema for sell response with gain/loss info."""

    transaction: PortfolioTransactionResponse
    proceeds: Decimal
    cost_basis_sold: Decimal
    realized_gain_loss: Decimal
    is_gain: bool


# ==================== Performance Schemas ====================

class AssetPerformance(BaseModel):
    """Schema for detailed asset performance."""

    asset_id: UUID
    asset_name: str
    symbol: Optional[str]

    # Investment
    quantity: Decimal
    purchase_price: Decimal
    current_price: Decimal
    total_invested: Decimal
    current_value: Decimal

    # Returns
    total_return: Decimal
    return_percentage: Decimal
    unrealized_gain_loss: Decimal

    # Dividends
    total_dividends: Decimal
    dividend_yield: Optional[Decimal]

    # Total return including dividends
    total_return_with_dividends: Decimal
    return_percentage_with_dividends: Decimal


# ==================== Batch Schemas ====================

class AssetBatchDelete(BaseModel):
    """Schema for batch deleting portfolio."""
    ids: list[UUID] = Field(..., min_length=1, description="List of IDs to delete")


class AssetBatchDeleteResponse(BaseModel):
    """Schema for batch delete response."""
    deleted_count: int
    failed_ids: list[UUID] = []
