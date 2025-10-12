#!/usr/bin/env python3
"""
Script to manually update user tier.
Usage: python fix_tier.py <user_email> <tier_name>
"""
import asyncio
import sys
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select

from app.models.user import User
from app.models.tier import Tier
from app.core.config import settings


async def update_user_tier(user_email: str, tier_name: str):
    """Update user tier."""
    # Create async engine
    engine = create_async_engine(str(settings.DATABASE_URL), echo=True)
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with async_session() as session:
        # Get user
        result = await session.execute(
            select(User).where(User.email == user_email)
        )
        user = result.scalar_one_or_none()

        if not user:
            print(f"Error: User with email '{user_email}' not found")
            return False

        # Get tier
        result = await session.execute(
            select(Tier).where(Tier.name == tier_name)
        )
        tier = result.scalar_one_or_none()

        if not tier:
            print(f"Error: Tier '{tier_name}' not found")
            return False

        # Update user tier
        old_tier_name = user.tier.name if user.tier else "None"
        user.tier_id = tier.id

        await session.commit()

        print(f"✅ Successfully updated user tier:")
        print(f"   User: {user.email}")
        print(f"   Old Tier: {old_tier_name}")
        print(f"   New Tier: {tier.name}")

        return True


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python fix_tier.py <user_email> <tier_name>")
        print("Example: python fix_tier.py user@example.com growth")
        sys.exit(1)

    user_email = sys.argv[1]
    tier_name = sys.argv[2]

    success = asyncio.run(update_user_tier(user_email, tier_name))
    sys.exit(0 if success else 1)
