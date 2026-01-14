"""
Goals module Pydantic schemas.
"""
from pydantic import BaseModel, Field, field_validator, model_validator
from uuid import UUID
from typing import Optional, Any
from datetime import datetime
from decimal import Decimal
import pytz

from app.modules.goals.models import AllocationType, ProgressTriggerType


# ============================================
# Account Link Schemas
# ============================================

class GoalAccountLinkCreate(BaseModel):
    """Schema for linking an account to a goal"""
    account_id: UUID
    allocation_type: str = Field(default="full", pattern="^(full|percentage|fixed)$")
    allocation_percentage: Optional[Decimal] = Field(None, ge=0, le=100)
    allocation_amount: Optional[Decimal] = Field(None, ge=0)

    @model_validator(mode='after')
    def validate_allocation(self):
        """Validate that percentage or fixed amount is provided when needed"""
        if self.allocation_type == "percentage" and self.allocation_percentage is None:
            raise ValueError("allocation_percentage is required when allocation_type is 'percentage'")
        if self.allocation_type == "fixed" and self.allocation_amount is None:
            raise ValueError("allocation_amount is required when allocation_type is 'fixed'")
        return self


class GoalAccountLinkUpdate(BaseModel):
    """Schema for updating an account link"""
    allocation_type: Optional[str] = Field(None, pattern="^(full|percentage|fixed)$")
    allocation_percentage: Optional[Decimal] = Field(None, ge=0, le=100)
    allocation_amount: Optional[Decimal] = Field(None, ge=0)


class LinkedAccountInfo(BaseModel):
    """Basic account info for display in goal responses"""
    id: str
    name: str
    current_balance: Decimal
    currency: str
    account_type: str

    class Config:
        from_attributes = True

    @field_validator('id', mode='before')
    def convert_uuid_to_str(cls, v):
        return str(v) if v else None


class GoalAccountLinkResponse(BaseModel):
    """Schema for goal account link response"""
    id: str
    goal_id: str
    account_id: str
    allocation_type: str
    allocation_percentage: Optional[Decimal] = None
    allocation_amount: Optional[Decimal] = None
    allocated_amount: Optional[Decimal] = None  # Calculated from account balance
    account: Optional[LinkedAccountInfo] = None
    created_at: datetime

    class Config:
        from_attributes = True

    @field_validator('id', 'goal_id', 'account_id', mode='before')
    def convert_uuid_to_str(cls, v):
        return str(v) if v else None


# ============================================
# Progress History Schemas
# ============================================

class GoalProgressHistoryResponse(BaseModel):
    """Schema for goal progress history response"""
    id: str
    goal_id: str
    recorded_date: str
    current_amount: Decimal
    target_amount: Decimal
    progress_percentage: Decimal
    linked_accounts_snapshot: Optional[dict] = None
    trigger_type: str
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

    @field_validator('id', 'goal_id', mode='before')
    def convert_uuid_to_str(cls, v):
        return str(v) if v else None

    @field_validator('recorded_date', mode='before')
    def convert_datetime_to_str(cls, v):
        if v and isinstance(v, datetime):
            return v.isoformat()
        return v


class GoalProgressHistoryListResponse(BaseModel):
    """Schema for paginated progress history list"""
    items: list[GoalProgressHistoryResponse]
    total: int
    page: int
    page_size: int


class RecordProgressRequest(BaseModel):
    """Schema for manually recording progress"""
    current_amount: Decimal = Field(..., ge=0)
    notes: Optional[str] = Field(None, max_length=500)


# ============================================
# Goal Schemas
# ============================================

class GoalCreate(BaseModel):
    """Schema for creating a goal"""
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    category: Optional[str] = Field(None, max_length=50)
    target_amount: Decimal = Field(..., gt=0)
    current_amount: Decimal = Field(default=Decimal('0'), ge=0)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    monthly_contribution: Optional[Decimal] = Field(None, ge=0)
    start_date: datetime
    target_date: Optional[datetime] = None
    is_active: bool = True
    auto_track_progress: bool = False  # Enable auto-tracking from linked accounts

    @model_validator(mode='after')
    def convert_to_naive_datetimes(self):
        """Convert timezone-aware datetimes to naive datetimes"""
        for field_name in ['start_date', 'target_date']:
            value = getattr(self, field_name, None)
            if value and isinstance(value, datetime) and value.tzinfo is not None:
                setattr(self, field_name, value.replace(tzinfo=None))
        return self


class GoalUpdate(BaseModel):
    """Schema for updating a goal"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    category: Optional[str] = Field(None, max_length=50)
    target_amount: Optional[Decimal] = Field(None, gt=0)
    current_amount: Optional[Decimal] = Field(None, ge=0)
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    monthly_contribution: Optional[Decimal] = Field(None, ge=0)
    start_date: Optional[datetime] = None
    target_date: Optional[datetime] = None
    is_active: Optional[bool] = None
    is_completed: Optional[bool] = None
    auto_track_progress: Optional[bool] = None

    @model_validator(mode='after')
    def convert_to_naive_datetimes(self):
        """Convert timezone-aware datetimes to naive datetimes"""
        for field_name in ['start_date', 'target_date']:
            value = getattr(self, field_name, None)
            if value and isinstance(value, datetime) and value.tzinfo is not None:
                setattr(self, field_name, value.replace(tzinfo=None))
        return self


class GoalResponse(BaseModel):
    """Schema for goal response"""
    id: str
    user_id: str
    name: str
    description: Optional[str]
    category: Optional[str]
    target_amount: Decimal
    current_amount: Decimal
    currency: str
    monthly_contribution: Optional[Decimal]
    start_date: str
    target_date: Optional[str]
    is_active: bool
    is_completed: bool
    completed_at: Optional[str]
    progress_percentage: Optional[Decimal]
    auto_track_progress: bool = False
    created_at: datetime
    updated_at: datetime
    # Display currency fields
    display_target_amount: Optional[Decimal] = None
    display_current_amount: Optional[Decimal] = None
    display_monthly_contribution: Optional[Decimal] = None
    display_currency: Optional[str] = None
    # Linked accounts info
    linked_accounts: list[GoalAccountLinkResponse] = []
    linked_accounts_total: Optional[Decimal] = None  # Total from linked accounts

    class Config:
        from_attributes = True

    @field_validator('id', 'user_id', mode='before')
    def convert_uuid_to_str(cls, v):
        return str(v) if v else None

    @field_validator('start_date', 'target_date', 'completed_at', mode='before')
    def convert_datetime_to_str(cls, v):
        if v and isinstance(v, datetime):
            return v.isoformat()
        return v


class GoalListResponse(BaseModel):
    """Schema for paginated goal list"""
    items: list[GoalResponse]
    total: int
    page: int
    page_size: int


class GoalStats(BaseModel):
    """Schema for goal statistics"""
    total_goals: int
    active_goals: int
    completed_goals: int
    total_target_amount: Decimal  # Sum of all target amounts
    total_saved: Decimal  # Sum of all current amounts
    total_remaining: Decimal  # Amount still needed across all goals
    average_progress: Decimal  # Average progress percentage
    currency: str = "USD"
    by_category: dict[str, Decimal]  # Target amounts by category
    goals_on_track: int  # Goals projected to meet target date
    goals_behind: int  # Goals not on track


# Batch delete schemas
class GoalBatchDelete(BaseModel):
    """Schema for batch deleting goals."""
    ids: list[UUID] = Field(..., min_length=1, description="List of IDs to delete")

class GoalBatchDeleteResponse(BaseModel):
    """Schema for batch delete response."""
    deleted_count: int
    failed_ids: list[UUID] = []
