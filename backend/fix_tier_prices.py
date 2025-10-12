#!/usr/bin/env python3
"""
Script to fix tier prices in database.
"""
import asyncio
import asyncpg


async def fix_prices():
    # Connect to database
    db_url = "postgresql://postgres:postgres@localhost:5434/wealth_vault_dev"
    conn = await asyncpg.connect(db_url)

    try:
        # Update tier prices
        await conn.execute(
            "UPDATE tiers SET price_monthly = 9.99 WHERE name = 'growth'"
        )
        await conn.execute(
            "UPDATE tiers SET price_monthly = 19.99 WHERE name = 'wealth'"
        )
        await conn.execute(
            "UPDATE tiers SET price_monthly = 0 WHERE name = 'starter'"
        )

        print("✅ Successfully updated tier prices:")

        # Verify
        tiers = await conn.fetch("SELECT name, price_monthly FROM tiers ORDER BY price_monthly")
        for tier in tiers:
            print(f"   {tier['name']}: ${tier['price_monthly']}")

        return True
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(fix_prices())
