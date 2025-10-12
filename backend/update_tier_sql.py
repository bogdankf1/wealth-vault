#!/usr/bin/env python3
"""
Simple script to update user tier using raw SQL.
"""
import asyncio
import asyncpg
from app.core.config import settings


async def update_tier():
    # Connect to database
    # Remove the +asyncpg from the URL for asyncpg.connect
    db_url = str(settings.DATABASE_URL).replace('postgresql+asyncpg://', 'postgresql://')
    conn = await asyncpg.connect(db_url)

    try:
        # Get growth tier ID
        tier = await conn.fetchrow("SELECT id, name FROM tiers WHERE name = 'growth'")
        if not tier:
            print("Error: Growth tier not found")
            return False

        print(f"Growth tier ID: {tier['id']}")

        # Update user tier
        result = await conn.execute(
            "UPDATE users SET tier_id = $1 WHERE email = $2",
            tier['id'], 'bogdankf1@gmail.com'
        )

        print(f"✅ Successfully updated user tier to 'growth'")
        print(f"   Rows affected: {result.split()[-1]}")

        # Verify update
        user = await conn.fetchrow(
            "SELECT email, tier_id FROM users WHERE email = 'bogdankf1@gmail.com'"
        )
        print(f"   Verified tier_id: {user['tier_id']}")

        return True
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(update_tier())
