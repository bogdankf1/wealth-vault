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
    # Interest settings
    interest_rate: Optional[Decimal] = Field(None, ge=0, le=1, description="APY as decimal (0.045 = 4.5%)")
    interest_frequency: str = Field(default="monthly", description="Interest calculation frequency")
    interest_accrual_method: str = Field(default="compound", description="Interest accrual method")
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
    # Interest settings
    interest_rate: Optional[Decimal] = Field(None, ge=0, le=1)
    interest_frequency: Optional[str] = None
    interest_accrual_method: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = Field(None, max_length=500)


class SavingsAccountResponse(SavingsAccountBase):
    """Schema for savings account response"""
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime
    # Interest tracking
    last_interest_accrual: Optional[datetime] = None
    accrued_interest: Decimal = Field(default=Decimal("0"))
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

    @computed_field
    @property
    def interest_rate_percent(self) -> Optional[float]:
        """Get interest rate as percentage"""
        if self.interest_rate:
            return float(self.interest_rate * 100)
        return None


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


# Batch delete schemas
class SavingsAccountBatchDelete(BaseModel):
    """Schema for batch deleting savings."""
    ids: list[UUID] = Field(..., min_length=1, description="List of IDs to delete")

class SavingsAccountBatchDeleteResponse(BaseModel):
    """Schema for batch delete response."""
    deleted_count: int
    failed_ids: list[UUID] = []


# ============================================================================
# Transaction Schemas
# ============================================================================

class TransactionCreate(BaseModel):
    """Schema for creating a transaction (deposit/withdrawal)"""
    amount: Decimal = Field(..., gt=0, description="Transaction amount (positive)")
    description: Optional[str] = Field(None, max_length=500, description="Transaction description")
    category: Optional[str] = Field(None, max_length=50, description="Transaction category")
    reference_number: Optional[str] = Field(None, max_length=100, description="Reference number")
    transaction_date: Optional[datetime] = Field(None, description="Transaction date (defaults to now)")


class DepositCreate(TransactionCreate):
    """Schema for creating a deposit"""
    source_type: str = Field(default="manual", description="Source type (manual, income, etc.)")
    source_id: Optional[UUID] = Field(None, description="Source record ID")
    # Currency conversion support
    source_currency: Optional[str] = Field(None, min_length=3, max_length=3, description="Currency of the amount (if different from account)")
    exchange_rate: Optional[Decimal] = Field(None, gt=0, description="Exchange rate if source currency differs from account currency")


class WithdrawalCreate(TransactionCreate):
    """Schema for creating a withdrawal"""
    source_type: str = Field(default="manual", description="Source type (manual, expense, etc.)")
    source_id: Optional[UUID] = Field(None, description="Source record ID")
    # Currency conversion support
    source_currency: Optional[str] = Field(None, min_length=3, max_length=3, description="Currency of the amount (if different from account)")
    exchange_rate: Optional[Decimal] = Field(None, gt=0, description="Exchange rate if source currency differs from account currency")


class TransactionResponse(BaseModel):
    """Schema for transaction response"""
    id: UUID
    account_id: UUID
    user_id: UUID
    transaction_type: str
    amount: Decimal
    currency: str
    balance_before: Decimal
    balance_after: Decimal
    source_type: Optional[str] = None
    source_id: Optional[UUID] = None
    description: Optional[str] = None
    category: Optional[str] = None
    reference_number: Optional[str] = None
    transaction_date: datetime
    posted_date: Optional[datetime] = None
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TransactionListResponse(BaseModel):
    """Schema for paginated list of transactions"""
    items: List[TransactionResponse]
    total: int
    page: int
    page_size: int


# ============================================================================
# Transfer Schemas
# ============================================================================

class TransferCreate(BaseModel):
    """Schema for creating a transfer between accounts"""
    from_account_id: UUID = Field(..., description="Source account ID")
    to_account_id: UUID = Field(..., description="Destination account ID")
    amount: Decimal = Field(..., gt=0, description="Transfer amount")
    description: Optional[str] = Field(None, max_length=500, description="Transfer description")
    exchange_rate: Optional[Decimal] = Field(None, gt=0, description="Exchange rate for cross-currency")
    transfer_date: Optional[datetime] = Field(None, description="Transfer date (defaults to now)")


class TransferResponse(BaseModel):
    """Schema for transfer response"""
    id: UUID
    user_id: UUID
    from_account_id: UUID
    to_account_id: UUID
    amount: Decimal
    from_currency: str
    to_currency: Optional[str] = None
    exchange_rate: Optional[Decimal] = None
    converted_amount: Optional[Decimal] = None
    from_transaction_id: Optional[UUID] = None
    to_transaction_id: Optional[UUID] = None
    description: Optional[str] = None
    transfer_date: datetime
    status: str
    created_at: datetime
    updated_at: datetime
    # Include account names for display
    from_account_name: Optional[str] = None
    to_account_name: Optional[str] = None

    class Config:
        from_attributes = True


class TransferListResponse(BaseModel):
    """Schema for paginated list of transfers"""
    items: List[TransferResponse]
    total: int
    page: int
    page_size: int


# ============================================================================
# Interest Schemas
# ============================================================================

class InterestCalculation(BaseModel):
    """Schema for interest calculation result"""
    account_id: str
    has_interest: bool
    balance: Optional[float] = None
    interest_rate: Optional[float] = None
    accrual_method: Optional[str] = None
    days_elapsed: Optional[int] = None
    accrued_interest: float
    pending_interest: float
    total_after_posting: Optional[float] = None
    last_accrual_date: Optional[str] = None
    message: Optional[str] = None


class PostInterestResponse(BaseModel):
    """Schema for posting interest response"""
    success: bool
    transaction: Optional[TransactionResponse] = None
    message: str
