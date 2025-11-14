"""
Subscriptions module Pydantic schemas
"""
from pydantic import BaseModel, Field, field_validator
from uuid import UUID
from typing import Optional, Literal
from datetime import datetime
from decimal import Decimal


SubscriptionFrequency = Literal["monthly", "quarterly", "annually", "biannually"]


class SubscriptionCreate(BaseModel):
    """Schema for creating a subscription"""
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    category: Optional[str] = Field(None, max_length=50)
    amount: Decimal = Field(..., ge=0)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    frequency: SubscriptionFrequency
    start_date: datetime
    end_date: Optional[datetime] = None
    is_active: bool = True


class SubscriptionUpdate(BaseModel):
    """Schema for updating a subscription"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    category: Optional[str] = Field(None, max_length=50)
    amount: Optional[Decimal] = Field(None, ge=0)
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    frequency: Optional[SubscriptionFrequency] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    is_active: Optional[bool] = None


class SubscriptionResponse(BaseModel):
    """Schema for subscription response"""
    id: str
    user_id: str
    name: str
    description: Optional[str]
    category: Optional[str]
    amount: Decimal
    currency: str
    frequency: str
    start_date: str
    end_date: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    # Display values (converted to user's preferred currency)
    display_amount: Optional[Decimal] = None
    display_currency: Optional[str] = None
    display_monthly_equivalent: Optional[Decimal] = None

    class Config:
        from_attributes = True

    @field_validator('id', 'user_id', mode='before')
    def convert_uuid_to_str(cls, v):
        return str(v) if v else None

    @field_validator('start_date', 'end_date', mode='before')
    def convert_datetime_to_str(cls, v):
        if v and isinstance(v, datetime):
            return v.isoformat()
        return v


class SubscriptionListResponse(BaseModel):
    """Schema for paginated subscription list"""
    items: list[SubscriptionResponse]
    total: int
    page: int
    page_size: int


class SubscriptionStats(BaseModel):
    """Schema for subscription statistics"""
    total_subscriptions: int
    active_subscriptions: int
    monthly_cost: Decimal  # Total cost normalized to monthly
    total_annual_cost: Decimal  # Total yearly cost
    currency: str = "USD"
    by_category: dict[str, Decimal]  # Cost by category
    by_frequency: dict[str, int]  # Count by frequency


# History schemas
class MonthlySubscriptionHistory(BaseModel):
    """Schema for monthly subscription history."""
    month: str = Field(..., description="Month in YYYY-MM format")
    total: Decimal = Field(..., description="Total subscription cost for the month")
    count: int = Field(..., description="Number of subscriptions in the month")
    currency: str = Field(..., description="Currency code")


class SubscriptionHistoryResponse(BaseModel):
    """Schema for subscription history response."""
    history: list[MonthlySubscriptionHistory]
    total_months: int
    overall_average: Decimal
    currency: str = "USD"


# Batch delete schemas
class SubscriptionBatchDelete(BaseModel):
    """Schema for batch deleting subscriptions."""
    ids: list[UUID] = Field(..., min_length=1, description="List of IDs to delete")

class SubscriptionBatchDeleteResponse(BaseModel):
    """Schema for batch delete response."""
    deleted_count: int
    failed_ids: list[UUID] = []
