"""
Generate test auth token for API testing
"""
import asyncio
from datetime import timedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# Import main to load all models
import app.main

from app.core.database import AsyncSessionLocal
from app.core.security import create_access_token
from app.models.user import User
from app.core.config import settings

async def generate_token():
    """Generate a test token for the first available user"""
    async with AsyncSessionLocal() as db:
        # Get first user
        result = await db.execute(select(User).limit(1))
        user = result.scalar_one_or_none()

        if not user:
            print("No users found in database")
            return

        # Load tier relationship
        await db.refresh(user, ["tier"])

        # Create token
        token = create_access_token(
            data={
                "sub": str(user.id),
                "email": user.email,
                "role": user.role.value,
                "tier": user.tier.name if user.tier else "starter"
            },
            expires_delta=timedelta(days=30)  # 30 days for testing
        )

        print(f"User: {user.email}")
        print(f"User ID: {user.id}")
        print(f"Role: {user.role.value}")
        print(f"Tier: {user.tier.name if user.tier else 'starter'}")
        print(f"\nToken:\n{token}")

if __name__ == "__main__":
    asyncio.run(generate_token())
