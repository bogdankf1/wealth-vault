"""
Goals module Pydantic schemas.
"""
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional
from datetime import datetime
from decimal import Decimal
import pytz


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
    created_at: datetime
    updated_at: datetime

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
