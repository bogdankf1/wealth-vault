"""
Income module Pydantic schemas.
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, Field, field_validator
from app.modules.income.models import IncomeFrequency, IncomeTransactionStatus, DistributionType


# ============================================================================
# Income Source Schemas
# ============================================================================

class IncomeSourceBase(BaseModel):
    """Base schema for income source."""
    name: str = Field(..., min_length=1, max_length=100, description="Income source name")
    description: Optional[str] = Field(None, max_length=500, description="Description of income source")
    category: Optional[str] = Field(None, max_length=50, description="Income category")
    amount: Decimal = Field(..., ge=0, decimal_places=2, description="Income amount")
    currency: str = Field(default="USD", min_length=3, max_length=3, description="Currency code")
    frequency: IncomeFrequency = Field(default=IncomeFrequency.MONTHLY, description="Income frequency")
    is_active: bool = Field(default=True, description="Whether income source is active")
    date: Optional[datetime] = Field(None, description="Date of income source (for one-time payments)")
    start_date: Optional[datetime] = Field(None, description="Start date (for recurring income)")
    end_date: Optional[datetime] = Field(None, description="End date (for recurring income)")

    # Account integration (Phase 2)
    target_account_id: Optional[UUID] = Field(None, description="Target savings account for auto-deposit")
    auto_deposit: bool = Field(default=False, description="Automatically deposit income to target account")

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: str) -> str:
        """Ensure currency is uppercase."""
        return v.upper()

    @field_validator("date", "start_date", "end_date", mode="before")
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

    model_config = {
        "json_schema_extra": {
            "example": {
                "name": "Full-time Salary",
                "description": "Primary job salary",
                "category": "Salary",
                "amount": 5000.00,
                "currency": "USD",
                "frequency": "monthly",
                "is_active": True,
                "start_date": "2024-01-01T00:00:00Z"
            }
        }
    }


class IncomeSourceCreate(IncomeSourceBase):
    """Schema for creating an income source."""
    pass


class IncomeSourceUpdate(BaseModel):
    """Schema for updating an income source."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    category: Optional[str] = Field(None, max_length=50)
    amount: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    frequency: Optional[IncomeFrequency] = None
    is_active: Optional[bool] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

    # Account integration (Phase 2)
    target_account_id: Optional[UUID] = None
    auto_deposit: Optional[bool] = None

    # Sync historical transactions - when True, deletes existing transactions
    # and their account deposits, then recreates them with new values
    sync_historical: Optional[bool] = Field(
        None,
        description="If True, delete existing income transactions and deposits, then recreate with new values"
    )

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: Optional[str]) -> Optional[str]:
        """Ensure currency is uppercase if provided."""
        return v.upper() if v else None


class IncomeSourceResponse(IncomeSourceBase):
    """Schema for income source response."""
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime
    monthly_equivalent: Optional[Decimal] = Field(None, description="Monthly equivalent amount")

    # Display values (converted to user's preferred currency)
    display_amount: Optional[Decimal] = None
    display_currency: Optional[str] = None
    display_monthly_equivalent: Optional[Decimal] = None

    # Target account info (Phase 2)
    target_account_name: Optional[str] = None

    model_config = {
        "from_attributes": True
    }


# ============================================================================
# Income Transaction Schemas
# ============================================================================

class IncomeTransactionBase(BaseModel):
    """Base schema for income transaction."""
    source_id: Optional[UUID] = Field(None, description="Related income source ID")
    description: Optional[str] = Field(None, max_length=500, description="Transaction description")
    amount: Decimal = Field(..., ge=0, decimal_places=2, description="Transaction amount")
    currency: str = Field(default="USD", min_length=3, max_length=3, description="Currency code")
    date: datetime = Field(..., description="Transaction date")
    category: Optional[str] = Field(None, max_length=50, description="Transaction category")
    notes: Optional[str] = Field(None, max_length=1000, description="Additional notes")

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: str) -> str:
        """Ensure currency is uppercase."""
        return v.upper()

    @field_validator("date", mode="before")
    @classmethod
    def validate_date(cls, v: datetime) -> datetime:
        """Convert timezone-aware datetime to naive UTC."""
        if v is None:
            return v
        if isinstance(v, str):
            # Parse string to datetime
            from dateutil import parser
            v = parser.parse(v)
        if hasattr(v, 'tzinfo') and v.tzinfo is not None:
            # Convert to UTC and remove timezone
            return v.replace(tzinfo=None)
        return v

    model_config = {
        "json_schema_extra": {
            "example": {
                "source_id": "123e4567-e89b-12d3-a456-426614174000",
                "description": "January salary payment",
                "amount": 5000.00,
                "currency": "USD",
                "date": "2024-01-31T00:00:00Z",
                "category": "Salary"
            }
        }
    }


class IncomeTransactionCreate(IncomeTransactionBase):
    """Schema for creating an income transaction."""
    # Optional: deposit to account immediately
    deposit_to_account_id: Optional[UUID] = Field(None, description="Account to deposit income to")


class IncomeTransactionResponse(IncomeTransactionBase):
    """Schema for income transaction response."""
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

    # Account integration (Phase 2)
    deposited_to_account_id: Optional[UUID] = None
    account_transaction_id: Optional[UUID] = None
    status: IncomeTransactionStatus = IncomeTransactionStatus.RECEIVED

    # Include account name for display
    deposited_to_account_name: Optional[str] = None

    model_config = {
        "from_attributes": True
    }


# ============================================================================
# Income Deposit Schemas
# ============================================================================

class IncomeDepositRequest(BaseModel):
    """Schema for depositing income to an account."""
    account_id: UUID = Field(..., description="Target savings account ID")
    description: Optional[str] = Field(None, max_length=500, description="Optional deposit description")


class IncomeDepositResponse(BaseModel):
    """Response after depositing income."""
    income_transaction_id: UUID
    account_transaction_id: UUID
    deposited_to_account_id: UUID
    amount: Decimal
    currency: str
    message: str


# ============================================================================
# Statistics Schemas
# ============================================================================

class IncomeStatsResponse(BaseModel):
    """Schema for income statistics."""
    total_sources: int = Field(..., description="Total number of income sources")
    active_sources: int = Field(..., description="Number of active income sources")
    total_monthly_income: Decimal = Field(..., description="Total monthly income from all active sources")
    total_annual_income: Decimal = Field(..., description="Total annual income projection")
    total_transactions: int = Field(..., description="Total number of income transactions")
    total_transactions_amount: Decimal = Field(..., description="Total amount from all transactions")
    transactions_current_month: int = Field(..., description="Number of transactions this month")
    transactions_current_month_amount: Decimal = Field(..., description="Total amount this month")
    transactions_last_month: int = Field(..., description="Number of transactions last month")
    transactions_last_month_amount: Decimal = Field(..., description="Total amount last month")
    currency: str = Field(default="USD", description="Currency for all amounts")

    model_config = {
        "json_schema_extra": {
            "example": {
                "total_sources": 3,
                "active_sources": 2,
                "total_monthly_income": 6500.00,
                "total_annual_income": 78000.00,
                "total_transactions": 12,
                "total_transactions_amount": 75000.00,
                "transactions_current_month": 2,
                "transactions_current_month_amount": 6500.00,
                "transactions_last_month": 2,
                "transactions_last_month_amount": 6000.00,
                "currency": "USD"
            }
        }
    }


# ============================================================================
# History Schemas
# ============================================================================

class MonthlyIncomeHistory(BaseModel):
    """Schema for monthly income history."""
    month: str = Field(..., description="Month in YYYY-MM format")
    total: Decimal = Field(..., description="Total income for the month")
    count: int = Field(..., description="Number of income sources in the month")
    currency: str = Field(..., description="Currency code")


class IncomeHistoryResponse(BaseModel):
    """Schema for income history response."""
    history: list[MonthlyIncomeHistory]
    total_months: int
    overall_average: Decimal
    currency: str = "USD"


# ============================================================================
# List Response Schemas
# ============================================================================

class IncomeSourceListResponse(BaseModel):
    """Schema for list of income sources."""
    items: list[IncomeSourceResponse]
    total: int
    page: int = 1
    page_size: int = 50


class IncomeTransactionListResponse(BaseModel):
    """Schema for list of income transactions."""
    items: list[IncomeTransactionResponse]
    total: int
    page: int = 1
    page_size: int = 50


# ============================================================================
# Batch Delete Schemas
# ============================================================================

class IncomeSourceBatchDelete(BaseModel):
    """Schema for batch deleting income sources."""
    source_ids: list[UUID] = Field(..., min_length=1, description="List of income source IDs to delete")


class IncomeSourceBatchDeleteResponse(BaseModel):
    """Schema for batch delete response."""
    deleted_count: int
    failed_ids: list[UUID] = []


# ============================================================================
# Distribution Rule Schemas
# ============================================================================

class IncomeDistributionRuleBase(BaseModel):
    """Base schema for income distribution rule."""
    income_source_id: Optional[UUID] = Field(None, description="Link to specific income source (null = all income)")
    target_account_id: Optional[UUID] = Field(None, description="Target savings account")
    target_goal_id: Optional[UUID] = Field(None, description="Target goal")
    distribution_type: DistributionType = Field(..., description="How to calculate distribution amount")
    amount: Optional[Decimal] = Field(None, ge=0, description="Fixed amount (for fixed_amount type)")
    percentage: Optional[Decimal] = Field(None, ge=0, le=100, description="Percentage (for percentage type)")
    priority: int = Field(default=0, description="Rule priority (lower = higher priority)")
    name: Optional[str] = Field(None, max_length=100, description="Rule name/description")
    is_active: bool = Field(default=True, description="Whether rule is active")


class IncomeDistributionRuleCreate(IncomeDistributionRuleBase):
    """Schema for creating a distribution rule."""
    pass


class IncomeDistributionRuleUpdate(BaseModel):
    """Schema for updating a distribution rule."""
    income_source_id: Optional[UUID] = None
    target_account_id: Optional[UUID] = None
    target_goal_id: Optional[UUID] = None
    distribution_type: Optional[DistributionType] = None
    amount: Optional[Decimal] = Field(None, ge=0)
    percentage: Optional[Decimal] = Field(None, ge=0, le=100)
    priority: Optional[int] = None
    name: Optional[str] = Field(None, max_length=100)
    is_active: Optional[bool] = None


class IncomeDistributionRuleResponse(IncomeDistributionRuleBase):
    """Schema for distribution rule response."""
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

    # Related entity names for display
    income_source_name: Optional[str] = None
    target_account_name: Optional[str] = None
    target_goal_name: Optional[str] = None

    model_config = {
        "from_attributes": True
    }


class IncomeDistributionRuleListResponse(BaseModel):
    """Schema for list of distribution rules."""
    items: List[IncomeDistributionRuleResponse]
    total: int


class DistributionPreview(BaseModel):
    """Preview of how income would be distributed."""
    rule_id: UUID
    rule_name: Optional[str]
    target_type: str  # "account" or "goal"
    target_id: UUID
    target_name: str
    amount: Decimal
    currency: str


class IncomeDistributionPreviewResponse(BaseModel):
    """Preview of income distribution before applying."""
    income_amount: Decimal
    currency: str
    distributions: List[DistributionPreview]
    remaining_amount: Decimal
    total_distributed: Decimal
