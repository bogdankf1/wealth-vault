"""
Budget module Pydantic schemas.
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional
from decimal import Decimal
from datetime import datetime
from uuid import UUID

from app.modules.budgets.models import BudgetPeriod


# Budget Create/Update Schemas
class BudgetCreate(BaseModel):
    """Schema for creating a budget."""
    name: str = Field(..., min_length=1, max_length=100)
    category: str = Field(..., min_length=1, max_length=50)
    description: Optional[str] = Field(None, max_length=500)
    amount: Decimal = Field(..., gt=0, decimal_places=2)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    period: BudgetPeriod = Field(default=BudgetPeriod.MONTHLY)
    start_date: datetime
    end_date: Optional[datetime] = None
    is_active: bool = Field(default=True)
    rollover_unused: bool = Field(default=False)
    alert_threshold: int = Field(default=80, ge=0, le=100)

    @field_validator('end_date')
    @classmethod
    def validate_end_date(cls, v: Optional[datetime], info) -> Optional[datetime]:
        """Validate that end_date is after start_date if provided."""
        if v is not None and 'start_date' in info.data:
            if v <= info.data['start_date']:
                raise ValueError('end_date must be after start_date')
        return v


class BudgetUpdate(BaseModel):
    """Schema for updating a budget."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    category: Optional[str] = Field(None, min_length=1, max_length=50)
    description: Optional[str] = Field(None, max_length=500)
    amount: Optional[Decimal] = Field(None, gt=0, decimal_places=2)
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    period: Optional[BudgetPeriod] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    is_active: Optional[bool] = None
    rollover_unused: Optional[bool] = None
    alert_threshold: Optional[int] = Field(None, ge=0, le=100)


# Budget Response Schemas
class BudgetResponse(BaseModel):
    """Schema for budget response."""
    id: UUID
    user_id: UUID
    name: str
    category: str
    description: Optional[str]
    amount: Decimal
    currency: str
    period: BudgetPeriod
    start_date: datetime
    end_date: Optional[datetime]
    is_active: bool
    rollover_unused: bool
    alert_threshold: int
    created_at: datetime
    updated_at: datetime

    # Calculated fields (populated by service layer)
    spent: Optional[Decimal] = None
    remaining: Optional[Decimal] = None
    percentage_used: Optional[float] = None
    is_overspent: Optional[bool] = None
    should_alert: Optional[bool] = None

    # Display currency fields
    display_amount: Optional[Decimal] = None
    display_spent: Optional[Decimal] = None
    display_remaining: Optional[Decimal] = None
    display_currency: Optional[str] = None

    class Config:
        from_attributes = True


class BudgetWithProgress(BaseModel):
    """Schema for budget with progress details."""
    budget: BudgetResponse
    spent: Decimal
    remaining: Decimal
    percentage_used: float
    is_overspent: bool
    should_alert: bool
    days_remaining: Optional[int] = None


# Budget Statistics
class BudgetStats(BaseModel):
    """Budget statistics."""
    total_budgets: int
    active_budgets: int
    total_budgeted: Decimal
    total_spent: Decimal
    total_remaining: Decimal
    overall_percentage_used: float
    budgets_overspent: int
    budgets_near_limit: int  # Within alert threshold
    currency: str


class BudgetSummaryByCategory(BaseModel):
    """Budget summary grouped by category."""
    category: str
    budgeted: Decimal
    spent: Decimal
    remaining: Decimal
    percentage_used: float
    is_overspent: bool


class BudgetOverviewResponse(BaseModel):
    """Complete budget overview response."""
    stats: BudgetStats
    by_category: list[BudgetSummaryByCategory]
    alerts: list[str]  # Alert messages for overspent/near-limit budgets
