"""
Test script to debug the webhook handler locally
"""
import asyncio
import sys
from app.services.stripe_service import StripeService
from app.core.database import get_db
from app.core.config import settings

async def test_checkout_completed():
    """Test the checkout.session.completed handler"""

    # Sample checkout session data structure from Stripe
    sample_session = {
        "id": "cs_test_123",
        "customer": "cus_R9hIKjwFUC2xNr",  # Your actual customer ID
        "subscription": "sub_test_123",
        "mode": "subscription",
        "payment_status": "paid",
        "status": "complete"
    }

    print(f"Testing with customer_id: {sample_session['customer']}")
    print(f"Testing with subscription_id: {sample_session['subscription']}")

    try:
        async for db in get_db():
            await StripeService.handle_checkout_completed(sample_session, db)
            print("✅ Success!")
    except Exception as e:
        import traceback
        print(f"❌ Error: {str(e)}")
        print(f"\nFull traceback:")
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_checkout_completed())
