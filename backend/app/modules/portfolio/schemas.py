"""
Portfolio Pydantic schemas for request/response validation.
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


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

    @model_validator(mode='after')
    def convert_to_naive_datetimes(self):
        """Convert timezone-aware datetimes to naive datetimes."""
        if self.purchase_date and isinstance(self.purchase_date, datetime) and self.purchase_date.tzinfo is not None:
            self.purchase_date = self.purchase_date.replace(tzinfo=None)
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

    @model_validator(mode='after')
    def convert_to_naive_datetimes(self):
        """Convert timezone-aware datetimes to naive datetimes."""
        if self.purchase_date and isinstance(self.purchase_date, datetime) and self.purchase_date.tzinfo is not None:
            self.purchase_date = self.purchase_date.replace(tzinfo=None)
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
