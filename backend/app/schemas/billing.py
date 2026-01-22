"""
Pydantic schemas for billing and subscription endpoints.
"""
from pydantic import BaseModel, Field, field_validator
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


# PayPal-specific schemas
class PayPalActivateSubscriptionRequest(BaseModel):
    """Request to activate a PayPal subscription after user approval."""
    subscription_id: str = Field(..., description="PayPal subscription ID from frontend")


class PayPalActivateSubscriptionResponse(BaseModel):
    """Response after activating PayPal subscription."""
    success: bool
    subscription_id: str
    tier: str
    status: str


class PayPalCancelSubscriptionRequest(BaseModel):
    """Request to cancel a PayPal subscription."""
    reason: str = Field(default="User requested cancellation", description="Cancellation reason")


class PayPalUpdateSubscriptionRequest(BaseModel):
    """Request to update/change PayPal subscription plan."""
    new_plan_id: str = Field(..., description="New PayPal plan ID")


class SubscriptionResponse(BaseModel):
    """Subscription details response."""
    id: UUID
    payment_provider: str = "stripe"
    # Stripe fields (optional for PayPal subscriptions)
    stripe_subscription_id: Optional[str] = None
    stripe_customer_id: Optional[str] = None
    stripe_price_id: Optional[str] = None
    # PayPal fields (optional for Stripe subscriptions)
    paypal_subscription_id: Optional[str] = None
    paypal_plan_id: Optional[str] = None
    # Common fields
    status: str
    current_period_start: Optional[datetime] = None
    current_period_end: Optional[datetime] = None
    cancel_at_period_end: bool
    canceled_at: Optional[datetime] = None
    trial_start: Optional[datetime] = None
    trial_end: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    @field_validator('cancel_at_period_end', mode='before')
    @classmethod
    def convert_int_to_bool(cls, v):
        """Convert integer 0/1 to boolean."""
        if isinstance(v, int):
            return bool(v)
        return v

    @field_validator('payment_provider', mode='before')
    @classmethod
    def convert_payment_provider(cls, v):
        """Convert PaymentProvider enum to string."""
        if hasattr(v, 'value'):
            return v.value
        return v or "stripe"

    class Config:
        from_attributes = True


class PaymentHistoryResponse(BaseModel):
    """Payment history item response."""
    id: UUID
    payment_provider: str = "stripe"
    # Stripe fields
    stripe_invoice_id: Optional[str] = None
    stripe_payment_intent_id: Optional[str] = None
    # PayPal fields
    paypal_transaction_id: Optional[str] = None
    paypal_subscription_id: Optional[str] = None
    # Common fields
    amount: int  # Amount in cents
    currency: str
    status: str
    description: Optional[str] = None
    payment_method: Optional[str] = None
    paid_at: Optional[datetime] = None
    failed_at: Optional[datetime] = None
    refunded_at: Optional[datetime] = None
    created_at: datetime

    @field_validator('payment_provider', mode='before')
    @classmethod
    def convert_payment_provider(cls, v):
        """Convert PaymentProvider enum to string."""
        if hasattr(v, 'value'):
            return v.value
        return v or "stripe"

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
    payment_provider: Optional[str] = None  # "stripe" or "paypal"
    can_upgrade: bool = Field(..., description="Whether user can upgrade to a higher tier")
    can_downgrade: bool = Field(..., description="Whether user can downgrade to a lower tier")
    available_tiers: List[dict] = Field(..., description="List of available tiers to upgrade/downgrade to")
