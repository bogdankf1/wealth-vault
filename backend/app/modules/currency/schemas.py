"""
Currency module Pydantic schemas.
"""
from pydantic import BaseModel, Field
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID


class CurrencyBase(BaseModel):
    """Base currency schema."""
    code: str = Field(..., min_length=3, max_length=3, description="ISO 4217 currency code")
    name: str = Field(..., min_length=1, max_length=100, description="Currency name")
    symbol: str = Field(..., min_length=1, max_length=10, description="Currency symbol")
    decimal_places: int = Field(default=2, ge=0, le=8, description="Number of decimal places")
    is_active: bool = Field(default=True, description="Whether currency is active")


class CurrencyCreate(CurrencyBase):
    """Schema for creating a currency."""
    pass


class CurrencyUpdate(BaseModel):
    """Schema for updating a currency."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    symbol: Optional[str] = Field(None, min_length=1, max_length=10)
    decimal_places: Optional[int] = Field(None, ge=0, le=8)
    is_active: Optional[bool] = None


class CurrencyResponse(CurrencyBase):
    """Schema for currency response."""
    id: UUID
    created_by_admin: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ExchangeRateBase(BaseModel):
    """Base exchange rate schema."""
    from_currency: str = Field(..., min_length=3, max_length=3)
    to_currency: str = Field(..., min_length=3, max_length=3)
    rate: Decimal = Field(..., gt=0, description="Exchange rate")


class ExchangeRateCreate(ExchangeRateBase):
    """Schema for creating an exchange rate (manual override)."""
    pass


class ExchangeRateResponse(ExchangeRateBase):
    """Schema for exchange rate response."""
    id: UUID
    source: str
    fetched_at: datetime
    is_manual_override: bool
    overridden_by: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ConversionRequest(BaseModel):
    """Schema for currency conversion request."""
    amount: Decimal = Field(..., description="Amount to convert")
    from_currency: str = Field(..., min_length=3, max_length=3)
    to_currency: str = Field(..., min_length=3, max_length=3)


class ConversionResponse(BaseModel):
    """Schema for currency conversion response."""
    original_amount: Decimal
    original_currency: str
    converted_amount: Decimal
    target_currency: str
    exchange_rate: Decimal
    fetched_at: datetime


class BatchConversionRequest(BaseModel):
    """Schema for batch conversion request."""
    amounts: list[dict] = Field(..., description="List of {amount, currency} dicts")
    target_currency: str = Field(..., min_length=3, max_length=3)


class RefreshRatesResponse(BaseModel):
    """Schema for refresh rates response."""
    success: int
    failed: int
    message: str
