"""
Taxes module Pydantic schemas
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from uuid import UUID


# ============================================================================
# Linked Info Schemas
# ============================================================================

class LinkedIncomeSourceInfo(BaseModel):
    """Basic income source info for display in tax responses"""
    id: str
    name: str
    amount: Decimal
    currency: str
    frequency: str

    class Config:
        from_attributes = True

    @field_validator('id', mode='before')
    def convert_uuid_to_str(cls, v):
        return str(v) if v else None


class LinkedPaymentAccountInfo(BaseModel):
    """Basic account info for display in tax responses"""
    id: str
    name: str
    current_balance: Decimal
    currency: str

    class Config:
        from_attributes = True

    @field_validator('id', mode='before')
    def convert_uuid_to_str(cls, v):
        return str(v) if v else None


# ============================================================================
# Tax Schemas
# ============================================================================

class TaxBase(BaseModel):
    """Base schema for tax"""
    name: str = Field(..., min_length=1, max_length=100, description="Tax name")
    description: Optional[str] = Field(None, description="Tax description")
    tax_type: str = Field(..., description="Type: 'fixed' or 'percentage'")
    frequency: str = Field(default="annually", description="Payment frequency: 'monthly', 'quarterly', or 'annually'")

    # For fixed amount taxes
    fixed_amount: Optional[Decimal] = Field(None, ge=0, description="Fixed tax amount")
    currency: str = Field(default="USD", min_length=3, max_length=3, description="Currency code")

    # For percentage-based taxes
    percentage: Optional[Decimal] = Field(None, ge=0, le=100, description="Percentage of income (0-100)")

    # Income source linking (NULL = applies to ALL income sources)
    income_source_id: Optional[UUID] = Field(None, description="Specific income source this tax applies to (null = all income)")

    # Payment account (which account to pay from)
    payment_account_id: Optional[UUID] = Field(None, description="Account to pay tax from")

    # Auto-pay settings
    auto_pay: bool = Field(default=False, description="Whether to auto-pay this tax")
    next_payment_date: Optional[datetime] = Field(None, description="Next scheduled payment date")

    is_active: bool = Field(default=True, description="Whether tax is active")
    notes: Optional[str] = Field(None, description="Additional notes")

    @field_validator('tax_type')
    @classmethod
    def validate_tax_type(cls, v):
        if v not in ['fixed', 'percentage']:
            raise ValueError("tax_type must be 'fixed' or 'percentage'")
        return v

    @field_validator('frequency')
    @classmethod
    def validate_frequency(cls, v):
        if v not in ['monthly', 'quarterly', 'annually']:
            raise ValueError("frequency must be 'monthly', 'quarterly', or 'annually'")
        return v

    class Config:
        from_attributes = True


class TaxCreate(TaxBase):
    """Schema for creating a tax"""
    pass


class TaxUpdate(BaseModel):
    """Schema for updating a tax"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    tax_type: Optional[str] = None
    frequency: Optional[str] = None
    fixed_amount: Optional[Decimal] = Field(None, ge=0)
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    percentage: Optional[Decimal] = Field(None, ge=0, le=100)
    income_source_id: Optional[UUID] = None
    payment_account_id: Optional[UUID] = None
    auto_pay: Optional[bool] = None
    next_payment_date: Optional[datetime] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None

    @field_validator('tax_type')
    @classmethod
    def validate_tax_type(cls, v):
        if v is not None and v not in ['fixed', 'percentage']:
            raise ValueError("tax_type must be 'fixed' or 'percentage'")
        return v

    @field_validator('frequency')
    @classmethod
    def validate_frequency(cls, v):
        if v is not None and v not in ['monthly', 'quarterly', 'annually']:
            raise ValueError("frequency must be 'monthly', 'quarterly', or 'annually'")
        return v


class TaxResponse(TaxBase):
    """Schema for tax response"""
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime
    # Display currency fields
    display_fixed_amount: Optional[Decimal] = None
    display_currency: Optional[str] = None
    # Computed field for calculated amount
    calculated_amount: Optional[Decimal] = None
    # Linked income source info
    income_source: Optional[LinkedIncomeSourceInfo] = None
    # Linked payment account info
    payment_account: Optional[LinkedPaymentAccountInfo] = None
    # Payment status for current period
    is_paid_current_period: Optional[bool] = None
    current_period_start: Optional[datetime] = None
    current_period_end: Optional[datetime] = None
    last_payment_date: Optional[datetime] = None
    last_payment_amount: Optional[Decimal] = None

    @field_validator('tax_type', mode='before')
    @classmethod
    def convert_tax_type(cls, v):
        """Convert enum to string if needed"""
        if hasattr(v, 'value'):
            return v.value
        return v

    @field_validator('frequency', mode='before')
    @classmethod
    def convert_frequency(cls, v):
        """Convert enum to string if needed"""
        if hasattr(v, 'value'):
            return v.value
        return v

    class Config:
        from_attributes = True


class TaxListResponse(BaseModel):
    """Schema for paginated list of taxes"""
    items: List[TaxResponse]
    total: int
    page: int
    page_size: int


# ============================================================================
# Tax Payment Schemas
# ============================================================================

class TaxPaymentCreate(BaseModel):
    """Schema for creating a tax payment"""
    tax_id: UUID
    amount: Decimal = Field(..., gt=0, description="Payment amount")
    currency: str = Field(default="USD", min_length=3, max_length=3)
    payment_date: datetime
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None
    notes: Optional[str] = None


class TaxPaymentResponse(BaseModel):
    """Schema for tax payment response"""
    id: UUID
    tax_id: UUID
    user_id: UUID
    amount: Decimal
    currency: str
    payment_date: datetime
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None
    account_transaction_id: Optional[UUID] = None
    status: str
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TaxPaymentListResponse(BaseModel):
    """Schema for paginated list of tax payments"""
    items: List[TaxPaymentResponse]
    total: int
    page: int
    page_size: int


# ============================================================================
# Statistics Schemas
# ============================================================================

class TaxStats(BaseModel):
    """Schema for tax statistics"""
    total_taxes: int
    active_taxes: int
    total_tax_amount: Decimal  # In display currency
    total_fixed_taxes: Decimal
    total_percentage_taxes: Decimal
    currency: str = "USD"


# Batch delete schemas
class TaxRecordBatchDelete(BaseModel):
    """Schema for batch deleting taxes."""
    ids: list[UUID] = Field(..., min_length=1, description="List of IDs to delete")

class TaxRecordBatchDeleteResponse(BaseModel):
    """Schema for batch delete response."""
    deleted_count: int
    failed_ids: list[UUID] = []


# ============================================================================
# Pay Tax Schemas
# ============================================================================

class PayTaxRequest(BaseModel):
    """Schema for manually paying a tax"""
    account_id: Optional[UUID] = Field(None, description="Account to pay from (overrides tax's payment_account_id)")
    amount: Optional[Decimal] = Field(None, gt=0, description="Custom amount (overrides calculated amount)")
    notes: Optional[str] = Field(None, description="Notes for this payment")


class PayTaxResponse(BaseModel):
    """Schema for pay tax response"""
    payment: TaxPaymentResponse
    transaction_id: Optional[UUID] = None
    message: str


# ============================================================================
# Process Due Payments Schemas
# ============================================================================

class FailedTaxPaymentInfo(BaseModel):
    """Schema for failed tax payment information"""
    tax_id: UUID
    tax_name: str
    reason: str
    amount: Decimal
    currency: str


class TaxPaymentError(BaseModel):
    """Schema for tax payment error"""
    tax_id: UUID
    tax_name: str
    error: str


class ProcessDuePaymentsResponse(BaseModel):
    """Schema for process due payments response"""
    status: str
    due_count: int
    processed: int
    auto_paid: int
    failed_payments: List[FailedTaxPaymentInfo] = []
    errors: List[TaxPaymentError] = []
    timestamp: datetime
