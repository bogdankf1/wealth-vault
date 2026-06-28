"""
Billing and subscription API endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import Optional
import stripe

from app.core.database import get_db
from app.core.permissions import get_current_user
from app.core.config import settings
from app.core.logging_config import get_logger

logger = get_logger(__name__)
from app.models.user import User
from app.models.tier import Tier
from app.models.billing import UserSubscription, PaymentHistory
from app.schemas.billing import (
    CreateCheckoutSessionRequest,
    CreateCheckoutSessionResponse,
    CreatePortalSessionRequest,
    CreatePortalSessionResponse,
    CancelSubscriptionRequest,
    UpdateSubscriptionRequest,
    SubscriptionResponse,
    PaymentHistoryListResponse,
    PaymentHistoryResponse,
    SubscriptionStatusResponse,
    PayPalActivateSubscriptionRequest,
    PayPalActivateSubscriptionResponse,
    PayPalCancelSubscriptionRequest,
    PayPalUpdateSubscriptionRequest,
    PaddleActivateSubscriptionRequest,
    PaddleActivateSubscriptionResponse,
    PaddleCancelSubscriptionRequest,
    PaddleUpdateSubscriptionRequest,
)
from app.schemas.admin import TierDetail
from app.services.stripe_service import StripeService
from app.services.paypal_service import PayPalService
from app.services.paddle_service import PaddleService
from app.models.billing import SubscriptionStatus

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/tiers", response_model=list[TierDetail])
async def list_tiers(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List all active tiers for pricing page.
    Accessible to all authenticated users.
    """
    result = await db.execute(
        select(Tier)
        .where(Tier.is_active == True)
        .order_by(Tier.price_monthly)
    )
    tiers = result.scalars().all()
    return [TierDetail.model_validate(tier) for tier in tiers]


@router.post("/create-checkout", response_model=CreateCheckoutSessionResponse)
async def create_checkout_session(
    request: CreateCheckoutSessionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a Stripe checkout session for subscribing to a tier.
    """
    # Create Stripe customer if doesn't exist
    if not current_user.stripe_customer_id:
        customer = await StripeService.create_customer(
            email=current_user.email,
            name=current_user.name,
            metadata={"user_id": str(current_user.id)}
        )
        current_user.stripe_customer_id = customer.id
        await db.commit()

    # Create checkout session
    session = await StripeService.create_checkout_session(
        customer_id=current_user.stripe_customer_id,
        price_id=request.price_id,
        success_url=request.success_url,
        cancel_url=request.cancel_url,
        metadata={"user_id": str(current_user.id)}
    )

    return CreateCheckoutSessionResponse(
        session_id=session.id,
        url=session.url
    )


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: Optional[str] = Header(None, alias="stripe-signature"),
    db: AsyncSession = Depends(get_db),
):
    """
    Handle Stripe webhook events.
    This endpoint is called by Stripe to notify us of events.
    """
    payload = await request.body()

    try:
        event = stripe.Webhook.construct_event(
            payload, stripe_signature, settings.STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Handle the event
    event_type = event["type"]
    data = event["data"]["object"]

    try:
        if event_type == "checkout.session.completed":
            await StripeService.handle_checkout_completed(data, db)

        elif event_type == "customer.subscription.updated":
            await StripeService.handle_subscription_updated(data, db)

        elif event_type == "customer.subscription.deleted":
            # Handle subscription deletion - triggers immediate downgrade
            await StripeService.handle_subscription_deleted(data, db)

        elif event_type == "invoice.paid":
            await StripeService.handle_invoice_paid(data, db)

        elif event_type == "invoice.payment_failed":
            await StripeService.handle_invoice_payment_failed(data, db)
    except Exception as e:
        logger.exception(f"Webhook processing failed for {event_type}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Webhook processing failed: {str(e)}")

    return {"status": "success"}


@router.get("/subscription", response_model=SubscriptionStatusResponse)
async def get_subscription_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get current user's subscription status and tier information.
    """
    from datetime import datetime

    # Get user subscription
    result = await db.execute(
        select(UserSubscription).where(UserSubscription.user_id == current_user.id)
    )
    subscription = result.scalar_one_or_none()

    # If subscription exists but period dates are missing, fetch from Stripe
    if subscription and subscription.stripe_subscription_id and not subscription.current_period_end:
        try:
            logger.info(f"Fetching period dates from Stripe for subscription {subscription.stripe_subscription_id}")
            stripe_sub = await StripeService.get_subscription(subscription.stripe_subscription_id)

            # Try root level first (standard Stripe subscription attributes)
            period_start = stripe_sub.get("current_period_start")
            period_end = stripe_sub.get("current_period_end")

            # If not at root level, try items.data[0] (subscription items have their own periods)
            if not period_end and stripe_sub.get("items") and stripe_sub["items"].get("data"):
                item = stripe_sub["items"]["data"][0]
                period_start = item.get("current_period_start")
                period_end = item.get("current_period_end")
                logger.info(f"Got period dates from items.data[0]: start={period_start}, end={period_end}")

            logger.info(f"Stripe response: period_start={period_start}, period_end={period_end}")
            if period_start:
                subscription.current_period_start = datetime.fromtimestamp(period_start)
            if period_end:
                subscription.current_period_end = datetime.fromtimestamp(period_end)
            await db.commit()
            logger.info("Updated subscription period dates in database")
        except Exception as e:
            logger.error(f"Failed to fetch subscription dates from Stripe: {e}", exc_info=True)

    # Get all tiers for upgrade/downgrade options
    result = await db.execute(select(Tier).order_by(Tier.price_monthly))
    all_tiers = result.scalars().all()

    # Determine available tiers
    current_tier_price = current_user.tier.price_monthly if current_user.tier else 0
    available_tiers = []
    can_upgrade = False
    can_downgrade = False

    for tier in all_tiers:
        if tier.name == "starter":
            continue  # Don't show starter as an option (it's free/default)

        tier_info = {
            "id": str(tier.id),
            "name": tier.name,
            "display_name": tier.display_name,
            "price_monthly": float(tier.price_monthly),
            "stripe_price_id": (
                settings.STRIPE_GROWTH_PRICE_ID if tier.name == "growth"
                else settings.STRIPE_WEALTH_PRICE_ID if tier.name == "wealth"
                else None
            ),
            "paypal_plan_id": (
                settings.PAYPAL_GROWTH_PLAN_ID if tier.name == "growth"
                else settings.PAYPAL_WEALTH_PLAN_ID if tier.name == "wealth"
                else None
            ),
            "paddle_price_id": (
                settings.PADDLE_GROWTH_PRICE_ID if tier.name == "growth"
                else settings.PADDLE_WEALTH_PRICE_ID if tier.name == "wealth"
                else None
            )
        }

        if tier.price_monthly > current_tier_price:
            can_upgrade = True
            tier_info["action"] = "upgrade"
        elif tier.price_monthly < current_tier_price:
            can_downgrade = True
            tier_info["action"] = "downgrade"
        else:
            tier_info["action"] = "current"

        available_tiers.append(tier_info)

    # Determine current payment provider
    payment_provider = None
    if subscription:
        payment_provider = subscription.payment_provider if subscription.payment_provider else "stripe"

    # Check trial status
    is_trial = False
    trial_ends_at = None
    trial_days_remaining = None

    if subscription and subscription.status == SubscriptionStatus.TRIALING:
        is_trial = True
        trial_ends_at = subscription.trial_end
        if subscription.trial_end:
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc)
            # Handle both timezone-aware and naive trial_end
            trial_end = subscription.trial_end
            if trial_end.tzinfo is None:
                trial_end = trial_end.replace(tzinfo=timezone.utc)
            days_remaining = (trial_end - now).days
            trial_days_remaining = max(0, days_remaining)

    response = SubscriptionStatusResponse(
        has_subscription=subscription is not None,
        subscription=SubscriptionResponse.model_validate(subscription) if subscription else None,
        tier_name=current_user.tier.name if current_user.tier else None,
        tier_display_name=current_user.tier.display_name if current_user.tier else None,
        payment_provider=payment_provider,
        can_upgrade=can_upgrade,
        can_downgrade=can_downgrade,
        available_tiers=available_tiers,
        is_trial=is_trial,
        trial_ends_at=trial_ends_at,
        trial_days_remaining=trial_days_remaining,
    )

    return response


@router.post("/cancel-subscription")
async def cancel_subscription(
    request: CancelSubscriptionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Cancel the current user's subscription.
    """
    from datetime import datetime

    if not current_user.stripe_subscription_id:
        raise HTTPException(status_code=404, detail="No active subscription found")

    # Cancel subscription in Stripe
    await StripeService.cancel_subscription(
        subscription_id=current_user.stripe_subscription_id,
        at_period_end=request.at_period_end
    )

    # Fetch updated subscription data from Stripe
    stripe_sub = await StripeService.get_subscription(current_user.stripe_subscription_id)

    # Update local record
    result = await db.execute(
        select(UserSubscription).where(UserSubscription.user_id == current_user.id)
    )
    subscription = result.scalar_one_or_none()

    if subscription:
        subscription.cancel_at_period_end = 1 if request.at_period_end else 0
        subscription.canceled_at = datetime.utcnow()

        # Update period dates from Stripe - try root level first, then items.data[0]
        period_start = stripe_sub.get("current_period_start")
        period_end = stripe_sub.get("current_period_end")

        if not period_end and stripe_sub.get("items") and stripe_sub["items"].get("data"):
            item = stripe_sub["items"]["data"][0]
            period_start = item.get("current_period_start")
            period_end = item.get("current_period_end")

        if period_start:
            subscription.current_period_start = datetime.fromtimestamp(period_start)
        if period_end:
            subscription.current_period_end = datetime.fromtimestamp(period_end)

        await db.commit()

    return {"status": "success", "message": "Subscription cancelled"}


@router.post("/update-subscription")
async def update_subscription(
    request: UpdateSubscriptionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update/change subscription plan (upgrade or downgrade).
    """
    if not current_user.stripe_subscription_id:
        raise HTTPException(status_code=404, detail="No active subscription found")

    # Update subscription in Stripe
    updated_subscription = await StripeService.update_subscription(
        subscription_id=current_user.stripe_subscription_id,
        new_price_id=request.new_price_id
    )

    # Update will be reflected via webhook, but we can return success immediately
    return {
        "status": "success",
        "message": "Subscription updated",
        "subscription_id": updated_subscription.id
    }


@router.post("/create-portal-session", response_model=CreatePortalSessionResponse)
async def create_portal_session(
    request: CreatePortalSessionRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Create a Stripe Customer Portal session for managing subscription.
    """
    if not current_user.stripe_customer_id:
        raise HTTPException(status_code=404, detail="No Stripe customer found")

    session = await StripeService.create_customer_portal_session(
        customer_id=current_user.stripe_customer_id,
        return_url=request.return_url
    )

    return CreatePortalSessionResponse(url=session.url)


@router.get("/payment-history", response_model=PaymentHistoryListResponse)
async def get_payment_history(
    limit: int = 10,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get payment history for the current user.
    """
    # Get total count
    result = await db.execute(
        select(PaymentHistory)
        .where(PaymentHistory.user_id == current_user.id)
    )
    all_payments = result.scalars().all()
    total = len(all_payments)

    # Get paginated payments
    result = await db.execute(
        select(PaymentHistory)
        .where(PaymentHistory.user_id == current_user.id)
        .order_by(desc(PaymentHistory.created_at))
        .limit(limit)
        .offset(offset)
    )
    payments = result.scalars().all()

    return PaymentHistoryListResponse(
        payments=[PaymentHistoryResponse.model_validate(p) for p in payments],
        total=total
    )


# ============================================================================
# PayPal Endpoints
# ============================================================================


@router.post("/paypal/activate", response_model=PayPalActivateSubscriptionResponse)
async def activate_paypal_subscription(
    request: PayPalActivateSubscriptionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Activate a PayPal subscription after user approval.

    This is called after the user approves the subscription in the PayPal popup.
    The frontend passes the subscription_id received from PayPal.
    """
    try:
        result = await PayPalService.activate_subscription(
            subscription_id=request.subscription_id,
            user=current_user,
            db=db,
        )
        return PayPalActivateSubscriptionResponse(**result)
    except Exception as e:
        logger.exception(f"PayPal activation failed: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/paypal/cancel")
async def cancel_paypal_subscription(
    request: PayPalCancelSubscriptionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Cancel a PayPal subscription.

    Note: PayPal subscriptions are cancelled immediately (no "cancel at period end").
    """
    if not current_user.paypal_subscription_id:
        raise HTTPException(status_code=404, detail="No active PayPal subscription found")

    try:
        await PayPalService.cancel_subscription(
            subscription_id=current_user.paypal_subscription_id,
            reason=request.reason,
        )

        # Update local record
        result = await db.execute(
            select(UserSubscription).where(UserSubscription.user_id == current_user.id)
        )
        subscription = result.scalar_one_or_none()

        if subscription:
            from datetime import datetime
            subscription.status = "canceled"
            subscription.canceled_at = datetime.utcnow()
            await db.commit()

        return {"status": "success", "message": "PayPal subscription cancelled"}
    except Exception as e:
        logger.exception(f"PayPal cancellation failed: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/paypal/update")
async def update_paypal_subscription(
    request: PayPalUpdateSubscriptionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update/change PayPal subscription plan (upgrade or downgrade).

    May require user re-approval via PayPal.
    """
    if not current_user.paypal_subscription_id:
        raise HTTPException(status_code=404, detail="No active PayPal subscription found")

    try:
        result = await PayPalService.update_subscription(
            subscription_id=current_user.paypal_subscription_id,
            new_plan_id=request.new_plan_id,
            db=db,
            user=current_user,
        )
        return result
    except Exception as e:
        logger.exception(f"PayPal update failed: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/paypal/webhook")
async def paypal_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Handle PayPal webhook events.

    This endpoint is called by PayPal to notify us of subscription events.
    """
    payload = await request.body()

    # Get headers for signature verification
    headers = {
        "paypal-auth-algo": request.headers.get("paypal-auth-algo", ""),
        "paypal-cert-url": request.headers.get("paypal-cert-url", ""),
        "paypal-transmission-id": request.headers.get("paypal-transmission-id", ""),
        "paypal-transmission-sig": request.headers.get("paypal-transmission-sig", ""),
        "paypal-transmission-time": request.headers.get("paypal-transmission-time", ""),
    }

    # Verify webhook signature (optional but recommended)
    if settings.PAYPAL_WEBHOOK_ID:
        try:
            is_valid = await PayPalService.verify_webhook_signature(
                webhook_id=settings.PAYPAL_WEBHOOK_ID,
                event_body=payload,
                headers=headers,
            )
            if not is_valid:
                logger.warning("PayPal webhook signature verification failed")
                # Continue processing anyway for now (can be made strict later)
        except Exception as e:
            logger.warning(f"PayPal webhook verification error: {e}")

    # Parse event
    import json
    try:
        event = json.loads(payload)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event_type = event.get("event_type")
    resource = event.get("resource", {})

    logger.info(f"Received PayPal webhook: {event_type}")

    try:
        await PayPalService.handle_webhook_event(
            event_type=event_type,
            resource=resource,
            db=db,
        )
    except Exception as e:
        logger.exception(f"PayPal webhook processing failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Webhook processing failed: {str(e)}")

    return {"status": "success"}


# ============================================================================
# Paddle Endpoints
# ============================================================================


@router.post("/paddle/activate", response_model=PaddleActivateSubscriptionResponse)
async def activate_paddle_subscription(
    request: PaddleActivateSubscriptionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Activate a Paddle subscription after checkout.

    This is called after the user completes the Paddle checkout.
    The frontend passes the subscription_id and transaction_id received from Paddle.
    """
    try:
        result = await PaddleService.activate_subscription(
            subscription_id=request.subscription_id,
            transaction_id=request.transaction_id,
            user=current_user,
            db=db,
        )
        return PaddleActivateSubscriptionResponse(**result)
    except Exception as e:
        logger.exception(f"Paddle activation failed: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/paddle/cancel")
async def cancel_paddle_subscription(
    request: PaddleCancelSubscriptionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Cancel a Paddle subscription.

    Can cancel immediately or at the end of the billing period.
    """
    if not current_user.paddle_subscription_id:
        raise HTTPException(status_code=404, detail="No active Paddle subscription found")

    try:
        await PaddleService.cancel_subscription(
            subscription_id=current_user.paddle_subscription_id,
            effective_from=request.effective_from,
        )

        # Update local record
        result = await db.execute(
            select(UserSubscription).where(UserSubscription.user_id == current_user.id)
        )
        subscription = result.scalar_one_or_none()

        if subscription:
            from datetime import datetime
            if request.effective_from == "immediately":
                subscription.status = "canceled"
                subscription.canceled_at = datetime.utcnow()
            else:
                subscription.cancel_at_period_end = 1
                subscription.canceled_at = datetime.utcnow()
            await db.commit()

        return {"status": "success", "message": "Paddle subscription cancelled"}
    except Exception as e:
        logger.exception(f"Paddle cancellation failed: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/paddle/update")
async def update_paddle_subscription(
    request: PaddleUpdateSubscriptionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update/change Paddle subscription plan (upgrade or downgrade).
    """
    if not current_user.paddle_subscription_id:
        raise HTTPException(status_code=404, detail="No active Paddle subscription found")

    try:
        result = await PaddleService.update_subscription(
            subscription_id=current_user.paddle_subscription_id,
            new_price_id=request.new_price_id,
            db=db,
            user=current_user,
        )
        return result
    except Exception as e:
        logger.exception(f"Paddle update failed: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/paddle/webhook")
async def paddle_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Handle Paddle webhook events.

    This endpoint is called by Paddle to notify us of subscription and transaction events.
    """
    payload = await request.body()

    # Get signature header for verification
    signature = request.headers.get("Paddle-Signature", "")

    # Verify webhook signature
    if settings.PADDLE_WEBHOOK_SECRET:
        is_valid = PaddleService.verify_webhook_signature(
            payload=payload,
            signature=signature,
        )
        if not is_valid:
            logger.warning("Paddle webhook signature verification failed")
            raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse event
    import json
    try:
        event = json.loads(payload)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event_type = event.get("event_type")
    data = event.get("data", {})

    logger.info(f"Received Paddle webhook: {event_type}")

    try:
        await PaddleService.handle_webhook_event(
            event_type=event_type,
            data=data,
            db=db,
        )
    except Exception as e:
        logger.exception(f"Paddle webhook processing failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Webhook processing failed: {str(e)}")

    return {"status": "success"}
