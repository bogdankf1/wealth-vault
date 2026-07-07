"""
PayPal Wealth Plan Update Script

Creates a new Wealth plan at $19.99/month (since PayPal plans cannot be updated).

Usage:
    cd backend
    python scripts/update_paypal_wealth_plan.py
"""

import os
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

PAYPAL_CLIENT_ID = os.getenv("PAYPAL_CLIENT_ID")
PAYPAL_CLIENT_SECRET = os.getenv("PAYPAL_CLIENT_SECRET")
PAYPAL_MODE = os.getenv("PAYPAL_MODE", "sandbox")

# PayPal API URLs
PAYPAL_API_BASE = (
    "https://api-m.sandbox.paypal.com"
    if PAYPAL_MODE == "sandbox"
    else "https://api-m.paypal.com"
)

# Existing product ID (from previous setup)
PRODUCT_ID = "PROD-2D465709BA180413T"


def get_access_token() -> str:
    """Get PayPal OAuth access token."""
    url = f"{PAYPAL_API_BASE}/v1/oauth2/token"

    response = requests.post(
        url,
        auth=(PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={"grant_type": "client_credentials"},
    )

    if response.status_code != 200:
        print(f"Error getting access token: {response.text}")
        raise Exception("Failed to get PayPal access token")

    return response.json()["access_token"]


def create_wealth_plan(access_token: str) -> str:
    """Create a new Wealth plan at $19.99/month."""
    url = f"{PAYPAL_API_BASE}/v1/billing/plans"

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "PayPal-Request-Id": "wealth-vault-wealth-plan-v2-1999",
    }

    plan_data = {
        "product_id": PRODUCT_ID,
        "name": "Wealth",
        "description": "Wealth tier - Unlimited features, AI insights, tax tracking, priority support",
        "status": "ACTIVE",
        "billing_cycles": [
            {
                "frequency": {
                    "interval_unit": "MONTH",
                    "interval_count": 1,
                },
                "tenure_type": "REGULAR",
                "sequence": 1,
                "total_cycles": 0,  # Infinite
                "pricing_scheme": {
                    "fixed_price": {
                        "value": "19.99",
                        "currency_code": "USD",
                    }
                },
            }
        ],
        "payment_preferences": {
            "auto_bill_outstanding": True,
            "setup_fee": {
                "value": "0",
                "currency_code": "USD",
            },
            "setup_fee_failure_action": "CONTINUE",
            "payment_failure_threshold": 3,
        },
        "taxes": {
            "percentage": "0",
            "inclusive": False,
        },
    }

    response = requests.post(url, headers=headers, json=plan_data)

    if response.status_code == 201:
        plan_id = response.json()["id"]
        return plan_id

    print(f"Error creating plan: {response.status_code} - {response.text}")
    raise Exception("Failed to create PayPal plan")


def deactivate_old_plan(access_token: str, plan_id: str):
    """Deactivate the old Wealth plan."""
    url = f"{PAYPAL_API_BASE}/v1/billing/plans/{plan_id}/deactivate"

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    response = requests.post(url, headers=headers)

    if response.status_code == 204:
        print(f"   Old plan {plan_id} deactivated successfully.")
    else:
        print(f"   Warning: Could not deactivate old plan: {response.status_code}")


def main():
    """Main function."""
    print("=" * 60)
    print("PayPal Wealth Plan Update - $19.99/month")
    print("=" * 60)
    print(f"\nMode: {PAYPAL_MODE.upper()}")
    print(f"Product ID: {PRODUCT_ID}\n")

    if not PAYPAL_CLIENT_ID or not PAYPAL_CLIENT_SECRET:
        print("ERROR: PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set in .env")
        return

    try:
        # Step 1: Get access token
        print("1. Getting access token...")
        access_token = get_access_token()
        print("   Access token obtained.\n")

        # Step 2: Deactivate old plan (optional)
        old_plan_id = "P-2YF92308W6761730WNFY75ZQ"
        print(f"2. Deactivating old Wealth plan ({old_plan_id})...")
        deactivate_old_plan(access_token, old_plan_id)
        print()

        # Step 3: Create new Wealth plan at $19.99
        print("3. Creating new Wealth plan ($19.99/month)...")
        new_plan_id = create_wealth_plan(access_token)
        print(f"   New Wealth Plan ID: {new_plan_id}\n")

        # Summary
        print("=" * 60)
        print("UPDATE COMPLETE!")
        print("=" * 60)
        print("\nUpdate these in your .env files:\n")
        print("# Backend .env")
        print(f"PAYPAL_WEALTH_PLAN_ID={new_plan_id}")
        print()
        print("# Frontend .env.local")
        print(f"NEXT_PUBLIC_PAYPAL_WEALTH_PLAN_ID={new_plan_id}")
        print()
        print("# Also update in Railway environment variables!")
        print("=" * 60)

    except Exception as e:
        print(f"\nERROR: {e}")
        return


if __name__ == "__main__":
    main()
