"""
Savings module Pydantic schemas
"""
from pydantic import BaseModel, Field, computed_field
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from app.modules.savings.models import AccountType


# ============================================================================
# Savings Account Schemas
# ============================================================================

class SavingsAccountBase(BaseModel):
    """Base schema for savings account"""
    name: str = Field(..., min_length=1, max_length=100, description="Account name")
    account_type: AccountType = Field(default=AccountType.PERSONAL, description="Account type")
    institution: Optional[str] = Field(None, max_length=100, description="Bank/institution name")
    account_number_last4: Optional[str] = Field(None, min_length=4, max_length=4, description="Last 4 digits")
    current_balance: Decimal = Field(..., ge=0, description="Current balance")
    currency: str = Field(default="USD", min_length=3, max_length=3, description="Currency code")
    is_active: bool = Field(default=True, description="Whether account is active")
    notes: Optional[str] = Field(None, max_length=500, description="Optional notes")

    class Config:
        from_attributes = True


class SavingsAccountCreate(SavingsAccountBase):
    """Schema for creating a savings account"""
    pass


class SavingsAccountUpdate(BaseModel):
    """Schema for updating a savings account"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    account_type: Optional[AccountType] = None
    institution: Optional[str] = Field(None, max_length=100)
    account_number_last4: Optional[str] = Field(None, min_length=4, max_length=4)
    current_balance: Optional[Decimal] = Field(None, ge=0)
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    is_active: Optional[bool] = None
    notes: Optional[str] = Field(None, max_length=500)


class SavingsAccountResponse(SavingsAccountBase):
    """Schema for savings account response"""
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime
    # Display currency fields
    display_current_balance: Optional[Decimal] = None
    display_currency: Optional[str] = None

    class Config:
        from_attributes = True

    @computed_field
    @property
    def account_type_label(self) -> str:
        """Get display label for account type"""
        account_type_labels = {
            "crypto": "Cryptocurrency",
            "cash": "Cash",
            "business": "Business Account",
            "personal": "Personal Account",
            "fixed_deposit": "Fixed Deposits",
            "other": "Other"
        }
        return account_type_labels.get(self.account_type, self.account_type.title())


class SavingsAccountListResponse(BaseModel):
    """Schema for paginated list of savings accounts"""
    items: List[SavingsAccountResponse]
    total: int
    page: int
    page_size: int


# ============================================================================
# Balance History Schemas
# ============================================================================

class BalanceHistoryBase(BaseModel):
    """Base schema for balance history"""
    balance: Decimal = Field(..., ge=0, description="Balance at this point")
    date: datetime = Field(..., description="Date of this balance snapshot")
    change_amount: Optional[Decimal] = Field(None, description="Amount changed from previous")
    change_reason: Optional[str] = Field(None, max_length=200, description="Reason for change")

    class Config:
        from_attributes = True


class BalanceHistoryCreate(BalanceHistoryBase):
    """Schema for creating a balance history entry"""
    pass


class BalanceHistoryResponse(BalanceHistoryBase):
    """Schema for balance history response"""
    id: UUID
    account_id: UUID
    created_at: datetime

    class Config:
        from_attributes = True


class BalanceHistoryListResponse(BaseModel):
    """Schema for list of balance history entries"""
    items: List[BalanceHistoryResponse]
    total: int


# ============================================================================
# Statistics Schemas
# ============================================================================

class SavingsStats(BaseModel):
    """Schema for savings statistics"""
    total_accounts: int
    active_accounts: int
    total_balance_usd: Decimal  # Converted to USD
    total_balance_by_currency: dict[str, Decimal]  # Original currencies
    total_balance_by_type: dict[str, Decimal]  # By account type (in USD)
    net_worth: Decimal  # Total in USD
    currency: str = "USD"


class AccountGrowth(BaseModel):
    """Schema for account growth over time"""
    account_id: UUID
    account_name: str
    growth_percent: Decimal
    growth_amount: Decimal
    period_days: int
