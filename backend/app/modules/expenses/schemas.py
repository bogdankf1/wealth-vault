"""
Expenses Pydantic schemas
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from app.modules.expenses.models import ExpenseFrequency


# Base schema with common fields
class ExpenseBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Expense name")
    description: Optional[str] = Field(None, max_length=500, description="Expense description")
    category: Optional[str] = Field(None, max_length=50, description="Expense category")
    amount: Decimal = Field(..., gt=0, description="Expense amount")
    currency: str = Field(default="USD", min_length=3, max_length=3, description="Currency code")
    frequency: ExpenseFrequency = Field(..., description="Expense frequency")
    is_active: bool = Field(default=True, description="Whether expense is active")
    tags: Optional[List[str]] = Field(None, description="Optional tags")

    # Date fields - use date for one-time, start_date/end_date for recurring
    date: Optional[datetime] = Field(None, description="Date of expense (for one-time expenses)")
    start_date: Optional[datetime] = Field(None, description="Start date (for recurring expenses)")
    end_date: Optional[datetime] = Field(None, description="End date (for recurring expenses)")

    @field_validator('currency')
    @classmethod
    def validate_currency(cls, v: str) -> str:
        return v.upper()

    @field_validator('date', 'start_date', 'end_date', mode='before')
    @classmethod
    def validate_dates(cls, v: Optional[datetime]) -> Optional[datetime]:
        """Convert timezone-aware datetimes to naive datetime, preserving the date."""
        if v is None:
            return None
        if isinstance(v, str):
            # Parse string to datetime
            from dateutil import parser
            v = parser.parse(v)
        # If timezone-aware, just strip timezone (don't convert to UTC)
        # This preserves the local date that the user selected
        if hasattr(v, 'tzinfo') and v.tzinfo is not None:
            return v.replace(tzinfo=None)
        return v


# Schema for creating expense
class ExpenseCreate(ExpenseBase):
    pass


# Schema for updating expense
class ExpenseUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    category: Optional[str] = Field(None, max_length=50)
    amount: Optional[Decimal] = Field(None, gt=0)
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    frequency: Optional[ExpenseFrequency] = None
    is_active: Optional[bool] = None
    tags: Optional[List[str]] = None
    date: Optional[datetime] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

    @field_validator('currency')
    @classmethod
    def validate_currency(cls, v: Optional[str]) -> Optional[str]:
        return v.upper() if v else None

    @field_validator('date', 'start_date', 'end_date', mode='before')
    @classmethod
    def validate_dates(cls, v: Optional[datetime]) -> Optional[datetime]:
        """Convert timezone-aware datetimes to naive datetime, preserving the date."""
        if v is None:
            return None
        if isinstance(v, str):
            # Parse string to datetime
            from dateutil import parser
            v = parser.parse(v)
        # If timezone-aware, just strip timezone (don't convert to UTC)
        # This preserves the local date that the user selected
        if hasattr(v, 'tzinfo') and v.tzinfo is not None:
            return v.replace(tzinfo=None)
        return v


# Schema for expense response
class Expense(ExpenseBase):
    id: UUID
    user_id: UUID
    monthly_equivalent: Optional[Decimal] = None
    created_at: datetime
    updated_at: datetime

    # Display values (converted to user's preferred currency)
    display_amount: Optional[Decimal] = None
    display_currency: Optional[str] = None
    display_monthly_equivalent: Optional[Decimal] = None

    class Config:
        from_attributes = True


# Schema for list response
class ExpenseListResponse(BaseModel):
    items: List[Expense]
    total: int
    page: int
    page_size: int


# Schema for expense statistics
class ExpenseStats(BaseModel):
    total_expenses: int
    active_expenses: int
    total_daily_expense: Decimal
    total_weekly_expense: Decimal
    total_monthly_expense: Decimal
    total_annual_expense: Decimal
    expenses_by_category: dict[str, Decimal]
    currency: str = "USD"


# Schema for batch delete
class ExpenseBatchDelete(BaseModel):
    expense_ids: List[UUID] = Field(..., min_length=1, description="List of expense IDs to delete")


# Schema for batch delete response
class ExpenseBatchDeleteResponse(BaseModel):
    deleted_count: int
    failed_ids: List[UUID] = []
