"""
Upgrade user to Wealth tier
"""
import asyncio
from sqlalchemy import select, update
from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.models.tier import Tier

async def upgrade_user():
    async with AsyncSessionLocal() as db:
        # Get Wealth tier ID
        result = await db.execute(select(Tier).where(Tier.name == "wealth"))
        wealth_tier = result.scalar_one_or_none()

        if not wealth_tier:
            print("❌ Error: Wealth tier not found")
            return

        print(f"Found Wealth tier: {wealth_tier.display_name} (ID: {wealth_tier.id})")

        # Get current user info
        result = await db.execute(
            select(User).where(User.email == "bogdankf1@gmail.com")
        )
        user = result.scalar_one_or_none()

        if not user:
            print("❌ User not found")
            return

        print(f"Current user tier_id: {user.tier_id}")

        # Update user
        result = await db.execute(
            update(User)
            .where(User.email == "bogdankf1@gmail.com")
            .values(tier_id=wealth_tier.id)
            .returning(User.email, User.tier_id)
        )
        await db.commit()

        updated_user = result.first()
        if updated_user:
            print(f"✅ Successfully upgraded user {updated_user[0]} to Wealth tier")
            print(f"   New tier_id: {updated_user[1]}")
        else:
            print("❌ Update failed")

if __name__ == "__main__":
    asyncio.run(upgrade_user())
