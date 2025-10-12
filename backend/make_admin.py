"""
Script to make a user an admin
"""
import asyncio
from sqlalchemy import select, text
from app.core.database import AsyncSessionLocal

async def make_admin(email: str):
    async with AsyncSessionLocal() as db:
        # Use raw SQL to avoid model loading issues
        result = await db.execute(
            text("UPDATE users SET role = 'ADMIN' WHERE email = :email RETURNING email, role"),
            {"email": email}
        )
        user = result.fetchone()

        if user:
            print(f'✅ User {user[0]} is now an ADMIN')
            await db.commit()
        else:
            print(f'❌ User {email} not found')

if __name__ == "__main__":
    asyncio.run(make_admin("bogdankf1@gmail.com"))
