"""
Subscriptions module Pydantic schemas
"""
from pydantic import BaseModel, Field, field_validator
from uuid import UUID
from typing import Optional, Literal
from datetime import datetime
from decimal import Decimal


SubscriptionFrequency = Literal["monthly", "quarterly", "annually", "biannually"]
SubscriptionStatus = Literal["active", "paused", "cancelled", "expired"]


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
    # Payment integration fields
    payment_account_id: Optional[UUID] = None
    auto_pay: bool = False
    reminder_days_before: int = Field(default=3, ge=0, le=30)
    # For historical sync when linking account
    sync_historical: bool = False


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
    # Payment integration fields
    payment_account_id: Optional[UUID] = None
    auto_pay: Optional[bool] = None
    reminder_days_before: Optional[int] = Field(None, ge=0, le=30)
    # For historical sync when updating account link
    sync_historical: bool = False


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
    status: str = "active"
    created_at: datetime
    updated_at: datetime

    # Payment integration fields
    payment_account_id: Optional[str] = None
    auto_pay: bool = False
    next_payment_date: Optional[str] = None
    last_payment_date: Optional[str] = None
    reminder_days_before: int = 3
    paused_at: Optional[str] = None
    resume_date: Optional[str] = None

    # Display values (converted to user's preferred currency)
    display_amount: Optional[Decimal] = None
    display_currency: Optional[str] = None
    display_monthly_equivalent: Optional[Decimal] = None

    class Config:
        from_attributes = True

    @field_validator('id', 'user_id', 'payment_account_id', mode='before')
    def convert_uuid_to_str(cls, v):
        return str(v) if v else None

    @field_validator('start_date', 'end_date', 'next_payment_date', 'last_payment_date', 'paused_at', 'resume_date', mode='before')
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


# Payment integration schemas
class SubscriptionPaymentCreate(BaseModel):
    """Schema for recording a subscription payment"""
    amount: Optional[Decimal] = None  # If None, uses subscription amount
    payment_date: Optional[datetime] = None  # If None, uses current date
    notes: Optional[str] = None


class SubscriptionPaymentResponse(BaseModel):
    """Schema for subscription payment response"""
    id: str
    subscription_id: str
    user_id: str
    amount: Decimal
    currency: str
    payment_date: str
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    expense_id: Optional[str] = None
    account_transaction_id: Optional[str] = None
    status: str
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

    @field_validator('id', 'subscription_id', 'user_id', 'expense_id', 'account_transaction_id', mode='before')
    def convert_uuid_to_str(cls, v):
        return str(v) if v else None

    @field_validator('payment_date', 'period_start', 'period_end', mode='before')
    def convert_datetime_to_str(cls, v):
        if v and isinstance(v, datetime):
            return v.isoformat()
        return v


class SubscriptionPaymentListResponse(BaseModel):
    """Schema for paginated payment history"""
    items: list[SubscriptionPaymentResponse]
    total: int


class SubscriptionPauseRequest(BaseModel):
    """Schema for pausing a subscription"""
    resume_date: Optional[datetime] = None  # Optional date to auto-resume


class SubscriptionPaymentSummary(BaseModel):
    """Summary of subscription payments"""
    total_paid: Decimal
    payment_count: int
    last_payment_date: Optional[str] = None
    next_payment_date: Optional[str] = None
    currency: str
