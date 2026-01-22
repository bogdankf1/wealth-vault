"""
PayPal Subscription Plans Setup Script

This script creates a Product and Subscription Plans in PayPal.
Run this once to set up your PayPal billing configuration.

Usage:
    python setup_paypal_plans.py
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


def create_product(access_token: str) -> str:
    """Create a PayPal Product for subscriptions."""
    url = f"{PAYPAL_API_BASE}/v1/catalogs/products"

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "PayPal-Request-Id": "wealth-vault-product-001",
    }

    product_data = {
        "name": "Wealth Vault Subscription",
        "description": "Premium subscription for Wealth Vault financial management platform",
        "type": "SERVICE",
        "category": "SOFTWARE",
        "home_url": "https://wealth-vault.app",
    }

    response = requests.post(url, headers=headers, json=product_data)

    if response.status_code == 201:
        product_id = response.json()["id"]
        print(f"Created Product: {product_id}")
        return product_id
    elif response.status_code == 200:
        # Product might already exist
        product_id = response.json().get("id")
        if product_id:
            print(f"Product already exists: {product_id}")
            return product_id

    # Check if product already exists with same request ID
    if "DUPLICATE_RESOURCE_IDENTIFIER" in response.text:
        print("Product already exists, fetching...")
        return get_existing_product(access_token)

    print(f"Error creating product: {response.status_code} - {response.text}")
    raise Exception("Failed to create PayPal product")


def get_existing_product(access_token: str) -> str:
    """Get existing product ID."""
    url = f"{PAYPAL_API_BASE}/v1/catalogs/products"

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    response = requests.get(url, headers=headers)

    if response.status_code == 200:
        products = response.json().get("products", [])
        for product in products:
            if "Wealth Vault" in product.get("name", ""):
                return product["id"]

    raise Exception("Could not find existing product")


def create_plan(
    access_token: str,
    product_id: str,
    name: str,
    description: str,
    price: str,
    request_id: str,
) -> str:
    """Create a PayPal Subscription Plan."""
    url = f"{PAYPAL_API_BASE}/v1/billing/plans"

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "PayPal-Request-Id": request_id,
    }

    plan_data = {
        "product_id": product_id,
        "name": name,
        "description": description,
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
                        "value": price,
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
        print(f"Created Plan '{name}': {plan_id}")
        return plan_id

    # Check if plan already exists
    if "DUPLICATE_RESOURCE_IDENTIFIER" in response.text:
        print(f"Plan '{name}' already exists, fetching...")
        return get_existing_plan(access_token, product_id, name)

    print(f"Error creating plan '{name}': {response.status_code} - {response.text}")
    raise Exception(f"Failed to create PayPal plan: {name}")


def get_existing_plan(access_token: str, product_id: str, name: str) -> str:
    """Get existing plan ID by name."""
    url = f"{PAYPAL_API_BASE}/v1/billing/plans"

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    params = {"product_id": product_id, "page_size": 20}

    response = requests.get(url, headers=headers, params=params)

    if response.status_code == 200:
        plans = response.json().get("plans", [])
        for plan in plans:
            if plan.get("name") == name:
                return plan["id"]

    raise Exception(f"Could not find existing plan: {name}")


def main():
    """Main setup function."""
    print("=" * 60)
    print("PayPal Subscription Plans Setup")
    print("=" * 60)
    print(f"\nMode: {PAYPAL_MODE.upper()}")
    print(f"API Base: {PAYPAL_API_BASE}\n")

    if not PAYPAL_CLIENT_ID or not PAYPAL_CLIENT_SECRET:
        print("ERROR: PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set in .env")
        return

    try:
        # Step 1: Get access token
        print("1. Getting access token...")
        access_token = get_access_token()
        print("   Access token obtained.\n")

        # Step 2: Create product
        print("2. Creating/fetching product...")
        product_id = create_product(access_token)
        print(f"   Product ID: {product_id}\n")

        # Step 3: Create Growth plan ($9.99/month)
        print("3. Creating Growth plan ($9.99/month)...")
        growth_plan_id = create_plan(
            access_token=access_token,
            product_id=product_id,
            name="Growth",
            description="Growth tier - AI categorization, multi-currency support, portfolio tracking",
            price="9.99",
            request_id="wealth-vault-growth-plan-001",
        )
        print(f"   Growth Plan ID: {growth_plan_id}\n")

        # Step 4: Create Wealth plan ($29.99/month)
        print("4. Creating Wealth plan ($29.99/month)...")
        wealth_plan_id = create_plan(
            access_token=access_token,
            product_id=product_id,
            name="Wealth",
            description="Wealth tier - Unlimited features, AI insights, tax tracking, priority support",
            price="29.99",
            request_id="wealth-vault-wealth-plan-001",
        )
        print(f"   Wealth Plan ID: {wealth_plan_id}\n")

        # Summary
        print("=" * 60)
        print("SETUP COMPLETE!")
        print("=" * 60)
        print("\nAdd these to your .env files:\n")
        print("# Backend .env")
        print(f"PAYPAL_GROWTH_PLAN_ID={growth_plan_id}")
        print(f"PAYPAL_WEALTH_PLAN_ID={wealth_plan_id}")
        print()
        print("# Frontend .env.local")
        print(f"NEXT_PUBLIC_PAYPAL_GROWTH_PLAN_ID={growth_plan_id}")
        print(f"NEXT_PUBLIC_PAYPAL_WEALTH_PLAN_ID={wealth_plan_id}")
        print()
        print("=" * 60)

    except Exception as e:
        print(f"\nERROR: {e}")
        return


if __name__ == "__main__":
    main()
