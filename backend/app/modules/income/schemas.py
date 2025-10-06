"""
Income module Pydantic schemas.
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field, EmailStr, field_validator
from app.modules.income.models import IncomeFrequency


# ============================================================================
# Income Source Schemas
# ============================================================================

class IncomeSourceBase(BaseModel):
    """Base schema for income source."""
    name: str = Field(..., min_length=1, max_length=100, description="Income source name")
    description: Optional[str] = Field(None, max_length=500, description="Description of income source")
    category: Optional[str] = Field(None, max_length=50, description="Income category")
    amount: Decimal = Field(..., ge=0, decimal_places=2, description="Income amount")
    currency: str = Field(default="USD", min_length=3, max_length=3, description="Currency code")
    frequency: IncomeFrequency = Field(default=IncomeFrequency.MONTHLY, description="Income frequency")
    is_active: bool = Field(default=True, description="Whether income source is active")
    date: Optional[datetime] = Field(None, description="Date of income source (for one-time payments)")
    start_date: Optional[datetime] = Field(None, description="Start date (for recurring income)")
    end_date: Optional[datetime] = Field(None, description="End date (for recurring income)")

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: str) -> str:
        """Ensure currency is uppercase."""
        return v.upper()

    @field_validator("date", "start_date", "end_date", mode="before")
    @classmethod
    def validate_dates(cls, v: Optional[datetime]) -> Optional[datetime]:
        """Convert timezone-aware datetimes to naive UTC."""
        if v is None:
            return None
        if isinstance(v, str):
            # Parse string to datetime
            from dateutil import parser
            v = parser.parse(v)
        if hasattr(v, 'tzinfo') and v.tzinfo is not None:
            # Convert to UTC and remove timezone
            return v.replace(tzinfo=None)
        return v

    model_config = {
        "json_schema_extra": {
            "example": {
                "name": "Full-time Salary",
                "description": "Primary job salary",
                "category": "Salary",
                "amount": 5000.00,
                "currency": "USD",
                "frequency": "monthly",
                "is_active": True,
                "start_date": "2024-01-01T00:00:00Z"
            }
        }
    }


class IncomeSourceCreate(IncomeSourceBase):
    """Schema for creating an income source."""
    pass


class IncomeSourceUpdate(BaseModel):
    """Schema for updating an income source."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    category: Optional[str] = Field(None, max_length=50)
    amount: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    frequency: Optional[IncomeFrequency] = None
    is_active: Optional[bool] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: Optional[str]) -> Optional[str]:
        """Ensure currency is uppercase if provided."""
        return v.upper() if v else None


class IncomeSourceResponse(IncomeSourceBase):
    """Schema for income source response."""
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime
    monthly_equivalent: Optional[Decimal] = Field(None, description="Monthly equivalent amount")

    model_config = {
        "from_attributes": True
    }


# ============================================================================
# Income Transaction Schemas
# ============================================================================

class IncomeTransactionBase(BaseModel):
    """Base schema for income transaction."""
    source_id: Optional[UUID] = Field(None, description="Related income source ID")
    description: Optional[str] = Field(None, max_length=500, description="Transaction description")
    amount: Decimal = Field(..., ge=0, decimal_places=2, description="Transaction amount")
    currency: str = Field(default="USD", min_length=3, max_length=3, description="Currency code")
    date: datetime = Field(..., description="Transaction date")
    category: Optional[str] = Field(None, max_length=50, description="Transaction category")
    notes: Optional[str] = Field(None, max_length=1000, description="Additional notes")

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: str) -> str:
        """Ensure currency is uppercase."""
        return v.upper()

    @field_validator("date", mode="before")
    @classmethod
    def validate_date(cls, v: datetime) -> datetime:
        """Convert timezone-aware datetime to naive UTC."""
        if v is None:
            return v
        if isinstance(v, str):
            # Parse string to datetime
            from dateutil import parser
            v = parser.parse(v)
        if hasattr(v, 'tzinfo') and v.tzinfo is not None:
            # Convert to UTC and remove timezone
            return v.replace(tzinfo=None)
        return v

    model_config = {
        "json_schema_extra": {
            "example": {
                "source_id": "123e4567-e89b-12d3-a456-426614174000",
                "description": "January salary payment",
                "amount": 5000.00,
                "currency": "USD",
                "date": "2024-01-31T00:00:00Z",
                "category": "Salary"
            }
        }
    }


class IncomeTransactionCreate(IncomeTransactionBase):
    """Schema for creating an income transaction."""
    pass


class IncomeTransactionResponse(IncomeTransactionBase):
    """Schema for income transaction response."""
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True
    }


# ============================================================================
# Statistics Schemas
# ============================================================================

class IncomeStatsResponse(BaseModel):
    """Schema for income statistics."""
    total_sources: int = Field(..., description="Total number of income sources")
    active_sources: int = Field(..., description="Number of active income sources")
    total_monthly_income: Decimal = Field(..., description="Total monthly income from all active sources")
    total_annual_income: Decimal = Field(..., description="Total annual income projection")
    total_transactions: int = Field(..., description="Total number of income transactions")
    total_transactions_amount: Decimal = Field(..., description="Total amount from all transactions")
    transactions_current_month: int = Field(..., description="Number of transactions this month")
    transactions_current_month_amount: Decimal = Field(..., description="Total amount this month")
    transactions_last_month: int = Field(..., description="Number of transactions last month")
    transactions_last_month_amount: Decimal = Field(..., description="Total amount last month")
    currency: str = Field(default="USD", description="Currency for all amounts")

    model_config = {
        "json_schema_extra": {
            "example": {
                "total_sources": 3,
                "active_sources": 2,
                "total_monthly_income": 6500.00,
                "total_annual_income": 78000.00,
                "total_transactions": 12,
                "total_transactions_amount": 75000.00,
                "transactions_current_month": 2,
                "transactions_current_month_amount": 6500.00,
                "transactions_last_month": 2,
                "transactions_last_month_amount": 6000.00,
                "currency": "USD"
            }
        }
    }


# ============================================================================
# List Response Schemas
# ============================================================================

class IncomeSourceListResponse(BaseModel):
    """Schema for list of income sources."""
    items: list[IncomeSourceResponse]
    total: int
    page: int = 1
    page_size: int = 50


class IncomeTransactionListResponse(BaseModel):
    """Schema for list of income transactions."""
    items: list[IncomeTransactionResponse]
    total: int
    page: int = 1
    page_size: int = 50
