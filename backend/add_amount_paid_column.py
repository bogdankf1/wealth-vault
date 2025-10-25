"""
Script to add amount_paid column to debts table.
"""
import asyncio
from app.core.database import engine
from sqlalchemy import text


async def add_amount_paid_column():
    """Add amount_paid column to debts table."""
    async with engine.begin() as conn:
        # Check if column exists
        result = await conn.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name='debts' AND column_name='amount_paid'
        """))

        if result.fetchone():
            print("✅ Column 'amount_paid' already exists!")
            return

        # Add the column
        await conn.execute(text("""
            ALTER TABLE debts
            ADD COLUMN amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0
        """))

        print("✅ Column 'amount_paid' added successfully!")


if __name__ == "__main__":
    asyncio.run(add_amount_paid_column())
