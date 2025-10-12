#!/usr/bin/env python3
"""
Check user subscription and tier data.
"""
import asyncio
import asyncpg


async def check_data():
    db_url = "postgresql://postgres:postgres@localhost:5434/wealth_vault_dev"
    conn = await asyncpg.connect(db_url)

    try:
        # Get user data
        user = await conn.fetchrow("""
            SELECT u.email, u.tier_id, u.stripe_customer_id, u.stripe_subscription_id, t.name as tier_name
            FROM users u
            LEFT JOIN tiers t ON u.tier_id = t.id
            WHERE u.email = 'bogdankf1@gmail.com'
        """)

        print("User Data:")
        print(f"  Email: {user['email']}")
        print(f"  Tier: {user['tier_name']}")
        print(f"  Stripe Customer ID: {user['stripe_customer_id']}")
        print(f"  Stripe Subscription ID: {user['stripe_subscription_id']}")
        print()

        # Get subscription data
        subs = await conn.fetch("""
            SELECT stripe_subscription_id, stripe_price_id, status, current_period_start, current_period_end
            FROM user_subscriptions
            WHERE user_id = (SELECT id FROM users WHERE email = 'bogdankf1@gmail.com')
        """)

        print(f"Subscriptions ({len(subs)}):")
        for sub in subs:
            print(f"  - Sub ID: {sub['stripe_subscription_id']}")
            print(f"    Price ID: {sub['stripe_price_id']}")
            print(f"    Status: {sub['status']}")
            print(f"    Period: {sub['current_period_start']} to {sub['current_period_end']}")
        print()

        # Get payment history
        payments = await conn.fetch("""
            SELECT amount, currency, status, paid_at, stripe_invoice_id
            FROM payment_history
            WHERE user_id = (SELECT id FROM users WHERE email = 'bogdankf1@gmail.com')
            ORDER BY created_at DESC
            LIMIT 5
        """)

        print(f"Recent Payments ({len(payments)}):")
        for p in payments:
            print(f"  - ${p['amount']/100:.2f} {p['currency']} - {p['status']} - {p['paid_at']}")

        # Get tier info
        print("\nTier Info:")
        tiers = await conn.fetch("SELECT name, price_monthly FROM tiers ORDER BY price_monthly")
        for t in tiers:
            print(f"  {t['name']}: ${t['price_monthly']}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(check_data())
