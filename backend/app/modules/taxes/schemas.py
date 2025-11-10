"""
Taxes module Pydantic schemas
"""
from pydantic import BaseModel, Field, computed_field, field_validator
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from uuid import UUID


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

    class Config:
        from_attributes = True


class TaxListResponse(BaseModel):
    """Schema for paginated list of taxes"""
    items: List[TaxResponse]
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
