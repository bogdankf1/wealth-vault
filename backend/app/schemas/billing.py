"""
Pydantic schemas for billing and subscription endpoints.
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID


class CreateCheckoutSessionRequest(BaseModel):
    """Request to create a Stripe checkout session."""
    price_id: str = Field(..., description="Stripe price ID (growth or wealth tier)")
    success_url: str = Field(..., description="URL to redirect on success")
    cancel_url: str = Field(..., description="URL to redirect on cancel")


class CreateCheckoutSessionResponse(BaseModel):
    """Response with checkout session details."""
    session_id: str = Field(..., description="Stripe checkout session ID")
    url: str = Field(..., description="Checkout session URL")


class CreatePortalSessionRequest(BaseModel):
    """Request to create a customer portal session."""
    return_url: str = Field(..., description="URL to return to after portal session")


class CreatePortalSessionResponse(BaseModel):
    """Response with portal session details."""
    url: str = Field(..., description="Customer portal URL")


class CancelSubscriptionRequest(BaseModel):
    """Request to cancel a subscription."""
    at_period_end: bool = Field(
        default=True,
        description="If true, cancel at end of billing period"
    )


class UpdateSubscriptionRequest(BaseModel):
    """Request to update/change subscription plan."""
    new_price_id: str = Field(..., description="New Stripe price ID")


class SubscriptionResponse(BaseModel):
    """Subscription details response."""
    id: UUID
    stripe_subscription_id: str
    stripe_customer_id: str
    stripe_price_id: str
    status: str
    current_period_start: Optional[datetime] = None
    current_period_end: Optional[datetime] = None
    cancel_at_period_end: bool
    canceled_at: Optional[datetime] = None
    trial_start: Optional[datetime] = None
    trial_end: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PaymentHistoryResponse(BaseModel):
    """Payment history item response."""
    id: UUID
    stripe_invoice_id: Optional[str] = None
    stripe_payment_intent_id: Optional[str] = None
    amount: int  # Amount in cents
    currency: str
    status: str
    description: Optional[str] = None
    payment_method: Optional[str] = None
    paid_at: Optional[datetime] = None
    failed_at: Optional[datetime] = None
    refunded_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PaymentHistoryListResponse(BaseModel):
    """List of payment history."""
    payments: List[PaymentHistoryResponse]
    total: int


class SubscriptionStatusResponse(BaseModel):
    """Current subscription status with tier info."""
    has_subscription: bool
    subscription: Optional[SubscriptionResponse] = None
    tier_name: Optional[str] = None
    tier_display_name: Optional[str] = None
    can_upgrade: bool = Field(..., description="Whether user can upgrade to a higher tier")
    can_downgrade: bool = Field(..., description="Whether user can downgrade to a lower tier")
    available_tiers: List[dict] = Field(..., description="List of available tiers to upgrade/downgrade to")
