#!/usr/bin/env python3
"""
Update user to wealth tier.
"""
import asyncio
import asyncpg


async def update_to_wealth():
    db_url = "postgresql://postgres:postgres@localhost:5434/wealth_vault_dev"
    conn = await asyncpg.connect(db_url)

    try:
        # Get wealth tier ID
        tier = await conn.fetchrow("SELECT id FROM tiers WHERE name = 'wealth'")

        # Update user to wealth tier
        await conn.execute(
            "UPDATE users SET tier_id = $1 WHERE email = 'bogdankf1@gmail.com'",
            tier['id']
        )

        print("✅ Updated user to Wealth tier")

        # Verify
        user = await conn.fetchrow("""
            SELECT u.email, t.name as tier_name
            FROM users u
            LEFT JOIN tiers t ON u.tier_id = t.id
            WHERE u.email = 'bogdankf1@gmail.com'
        """)
        print(f"  Current tier: {user['tier_name']}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(update_to_wealth())
