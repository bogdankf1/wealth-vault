"""
Installments module Pydantic schemas.
"""
from pydantic import BaseModel, Field, field_validator, model_validator
from uuid import UUID
from typing import Optional, Literal
from datetime import datetime
from decimal import Decimal
import pytz


InstallmentFrequency = Literal["weekly", "biweekly", "monthly"]


class InstallmentCreate(BaseModel):
    """Schema for creating an installment"""
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    category: Optional[str] = Field(None, max_length=50)
    total_amount: Decimal = Field(..., ge=0)
    amount_per_payment: Decimal = Field(..., ge=0)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    interest_rate: Optional[Decimal] = Field(None, ge=0, le=100)  # 0-100%
    frequency: InstallmentFrequency
    number_of_payments: int = Field(..., ge=1)
    payments_made: Optional[int] = Field(None, ge=0)  # Auto-calculated, ignored if provided
    start_date: datetime
    first_payment_date: datetime
    end_date: Optional[datetime] = None
    is_active: bool = True

    @model_validator(mode='after')
    def convert_to_naive_datetimes(self):
        """Convert timezone-aware datetimes to naive datetimes"""
        for field_name in ['start_date', 'first_payment_date', 'end_date']:
            value = getattr(self, field_name, None)
            if value and isinstance(value, datetime) and value.tzinfo is not None:
                setattr(self, field_name, value.replace(tzinfo=None))
        return self


class InstallmentUpdate(BaseModel):
    """Schema for updating an installment"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    category: Optional[str] = Field(None, max_length=50)
    total_amount: Optional[Decimal] = Field(None, ge=0)
    amount_per_payment: Optional[Decimal] = Field(None, ge=0)
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    interest_rate: Optional[Decimal] = Field(None, ge=0, le=100)
    frequency: Optional[InstallmentFrequency] = None
    number_of_payments: Optional[int] = Field(None, ge=1)
    payments_made: Optional[int] = Field(None, ge=0)
    start_date: Optional[datetime] = None
    first_payment_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    is_active: Optional[bool] = None

    @model_validator(mode='after')
    def convert_to_naive_datetimes(self):
        """Convert timezone-aware datetimes to naive datetimes"""
        for field_name in ['start_date', 'first_payment_date', 'end_date']:
            value = getattr(self, field_name, None)
            if value and isinstance(value, datetime) and value.tzinfo is not None:
                setattr(self, field_name, value.replace(tzinfo=None))
        return self


class InstallmentResponse(BaseModel):
    """Schema for installment response"""
    id: str
    user_id: str
    name: str
    description: Optional[str]
    category: Optional[str]
    total_amount: Decimal
    amount_per_payment: Decimal
    currency: str
    interest_rate: Optional[Decimal]
    frequency: str
    number_of_payments: int
    payments_made: int
    start_date: str
    first_payment_date: str
    end_date: Optional[str]
    is_active: bool
    remaining_balance: Optional[Decimal]
    created_at: datetime
    updated_at: datetime

    # Display values (converted to user's preferred currency)
    display_total_amount: Optional[Decimal] = None
    display_amount_per_payment: Optional[Decimal] = None
    display_remaining_balance: Optional[Decimal] = None
    display_currency: Optional[str] = None

    class Config:
        from_attributes = True

    @field_validator('id', 'user_id', mode='before')
    def convert_uuid_to_str(cls, v):
        return str(v) if v else None

    @field_validator('start_date', 'first_payment_date', 'end_date', mode='before')
    def convert_datetime_to_str(cls, v):
        if v and isinstance(v, datetime):
            return v.isoformat()
        return v


class InstallmentListResponse(BaseModel):
    """Schema for paginated installment list"""
    items: list[InstallmentResponse]
    total: int
    page: int
    page_size: int


class InstallmentStats(BaseModel):
    """Schema for installment statistics"""
    total_installments: int
    active_installments: int
    total_debt: Decimal  # Sum of all remaining balances
    monthly_payment: Decimal  # Total monthly payment across all active installments
    total_paid: Decimal  # Total amount paid so far
    currency: str = "USD"
    by_category: dict[str, Decimal]  # Remaining balance by category
    by_frequency: dict[str, int]  # Count by frequency
    average_interest_rate: Optional[Decimal]  # Average interest rate across loans with interest
    debt_free_date: Optional[str]  # Projected date when all loans paid off


# History schemas
class MonthlyInstallmentHistory(BaseModel):
    """Schema for monthly installment history."""
    month: str = Field(..., description="Month in YYYY-MM format")
    total: Decimal = Field(..., description="Total installment payment for the month")
    count: int = Field(..., description="Number of installments in the month")
    currency: str = Field(..., description="Currency code")


class InstallmentHistoryResponse(BaseModel):
    """Schema for installment history response."""
    history: list[MonthlyInstallmentHistory]
    total_months: int
    overall_average: Decimal
    currency: str = "USD"


# Batch delete schemas
class InstallmentBatchDelete(BaseModel):
    """Schema for batch deleting installments."""
    ids: list[UUID] = Field(..., min_length=1, description="List of IDs to delete")

class InstallmentBatchDeleteResponse(BaseModel):
    """Schema for batch delete response."""
    deleted_count: int
    failed_ids: list[UUID] = []
