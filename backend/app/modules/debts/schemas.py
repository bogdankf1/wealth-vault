"""
Debts module Pydantic schemas
"""
from pydantic import BaseModel, Field, computed_field
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from uuid import UUID


# ============================================================================
# Debt Schemas
# ============================================================================

class DebtBase(BaseModel):
    """Base schema for debt"""
    debtor_name: str = Field(..., min_length=1, max_length=100, description="Person/entity who owes money")
    description: Optional[str] = Field(None, description="Debt description")
    amount: Decimal = Field(..., gt=0, description="Total debt amount")
    amount_paid: Decimal = Field(default=Decimal('0'), ge=0, description="Amount paid so far")
    currency: str = Field(default="USD", min_length=3, max_length=3, description="Currency code")
    is_paid: bool = Field(default=False, description="Whether debt is paid")
    due_date: Optional[datetime] = Field(None, description="Due date")
    paid_date: Optional[datetime] = Field(None, description="Date when debt was paid")
    notes: Optional[str] = Field(None, description="Additional notes")

    class Config:
        from_attributes = True


class DebtCreate(DebtBase):
    """Schema for creating a debt"""
    pass


class DebtUpdate(BaseModel):
    """Schema for updating a debt"""
    debtor_name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    amount: Optional[Decimal] = Field(None, gt=0)
    amount_paid: Optional[Decimal] = Field(None, ge=0)
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    is_paid: Optional[bool] = None
    due_date: Optional[datetime] = None
    paid_date: Optional[datetime] = None
    notes: Optional[str] = None


class DebtResponse(DebtBase):
    """Schema for debt response"""
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime
    # Display currency fields
    display_amount: Optional[Decimal] = None
    display_amount_paid: Optional[Decimal] = None
    display_currency: Optional[str] = None

    class Config:
        from_attributes = True

    @computed_field
    @property
    def is_overdue(self) -> bool:
        """Check if debt is overdue"""
        if self.is_paid or not self.due_date:
            return False
        return datetime.utcnow() > self.due_date.replace(tzinfo=None)

    @computed_field
    @property
    def progress_percentage(self) -> Decimal:
        """Calculate payment progress percentage"""
        if self.amount <= 0:
            return Decimal('0')
        percentage = (self.amount_paid / self.amount) * 100
        return min(percentage, Decimal('100'))  # Cap at 100%

    @computed_field
    @property
    def amount_remaining(self) -> Decimal:
        """Calculate remaining amount to be paid"""
        remaining = self.amount - self.amount_paid
        return max(remaining, Decimal('0'))  # Don't go negative


class DebtListResponse(BaseModel):
    """Schema for paginated list of debts"""
    items: List[DebtResponse]
    total: int
    page: int
    page_size: int


# ============================================================================
# Statistics Schemas
# ============================================================================

class DebtStats(BaseModel):
    """Schema for debt statistics"""
    total_debts: int
    active_debts: int  # Unpaid
    paid_debts: int
    total_amount_owed: Decimal  # In display currency
    total_amount_paid: Decimal  # In display currency
    overdue_debts: int
    currency: str = "USD"
