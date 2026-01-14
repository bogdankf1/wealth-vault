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
    is_active: bool = Field(default=True, description="Whether debt is active (not archived)")
    is_paid: bool = Field(default=False, description="Whether debt is paid")
    due_date: Optional[datetime] = Field(None, description="Due date")
    paid_date: Optional[datetime] = Field(None, description="Date when debt was paid")
    notes: Optional[str] = Field(None, description="Additional notes")
    # Payment integration fields
    deposit_account_id: Optional[UUID] = Field(None, description="Account to deposit payments to")
    auto_deposit: bool = Field(default=False, description="Auto-deposit payments to linked account")
    interest_rate: Optional[Decimal] = Field(None, ge=0, le=100, description="Annual interest rate (%)")
    reminder_days_before: int = Field(default=3, ge=0, description="Days before due date to send reminder")
    next_payment_date: Optional[datetime] = Field(None, description="Next expected payment date")
    payment_frequency: Optional[str] = Field(None, description="Payment frequency (weekly, biweekly, monthly)")
    expected_payment_amount: Optional[Decimal] = Field(None, ge=0, description="Expected payment amount")

    class Config:
        from_attributes = True


class DebtCreate(DebtBase):
    """Schema for creating a debt"""
    sync_historical: bool = Field(default=False, description="Sync historical payments when linking account")


class DebtUpdate(BaseModel):
    """Schema for updating a debt"""
    debtor_name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    amount: Optional[Decimal] = Field(None, gt=0)
    amount_paid: Optional[Decimal] = Field(None, ge=0)
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    is_active: Optional[bool] = None
    is_paid: Optional[bool] = None
    due_date: Optional[datetime] = None
    paid_date: Optional[datetime] = None
    notes: Optional[str] = None
    # Payment integration fields
    deposit_account_id: Optional[UUID] = None
    auto_deposit: Optional[bool] = None
    interest_rate: Optional[Decimal] = Field(None, ge=0, le=100)
    reminder_days_before: Optional[int] = Field(None, ge=0)
    next_payment_date: Optional[datetime] = None
    payment_frequency: Optional[str] = None
    expected_payment_amount: Optional[Decimal] = Field(None, ge=0)
    sync_historical: bool = Field(default=False, description="Sync historical payments when linking account")


class DebtResponse(DebtBase):
    """Schema for debt response"""
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime
    accrued_interest: Decimal = Field(default=Decimal('0'))
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

    @computed_field
    @property
    def total_with_interest(self) -> Decimal:
        """Calculate total amount including accrued interest"""
        return self.amount + self.accrued_interest


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


# Batch delete schemas
class DebtBatchDelete(BaseModel):
    """Schema for batch deleting debts."""
    ids: list[UUID] = Field(..., min_length=1, description="List of IDs to delete")

class DebtBatchDeleteResponse(BaseModel):
    """Schema for batch delete response."""
    deleted_count: int
    failed_ids: list[UUID] = []


# ============================================================================
# Debt Payment Schemas
# ============================================================================

class DebtPaymentBase(BaseModel):
    """Base schema for debt payment"""
    amount: Decimal = Field(..., gt=0, description="Payment amount")
    payment_date: datetime = Field(..., description="Date of payment")
    principal_amount: Optional[Decimal] = Field(None, ge=0, description="Principal portion")
    interest_amount: Optional[Decimal] = Field(None, ge=0, description="Interest portion")
    notes: Optional[str] = Field(None, description="Payment notes")

    class Config:
        from_attributes = True


class DebtPaymentCreate(DebtPaymentBase):
    """Schema for creating a debt payment"""
    pass


class DebtPaymentResponse(DebtPaymentBase):
    """Schema for debt payment response"""
    id: UUID
    debt_id: UUID
    user_id: UUID
    currency: str
    balance_before: Decimal
    balance_after: Decimal
    account_transaction_id: Optional[UUID] = None
    status: str = "completed"
    created_at: datetime

    class Config:
        from_attributes = True


class DebtPaymentListResponse(BaseModel):
    """Schema for paginated list of debt payments"""
    items: List[DebtPaymentResponse]
    total: int


# ============================================================================
# Record Payment Schema (for recording a payment received)
# ============================================================================

class RecordDebtPayment(BaseModel):
    """Schema for recording a debt payment received"""
    amount: Decimal = Field(..., gt=0, description="Payment amount received")
    payment_date: Optional[datetime] = Field(None, description="Date of payment (defaults to now)")
    notes: Optional[str] = Field(None, description="Payment notes")
    deposit_to_account: bool = Field(default=True, description="Whether to deposit to linked account")
