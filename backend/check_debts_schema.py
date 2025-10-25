"""
Script to check debts table schema.
"""
import asyncio
from app.core.database import engine
from sqlalchemy import text


async def check_debts_schema():
    """Check debts table schema."""
    async with engine.begin() as conn:
        # Get all columns
        result = await conn.execute(text("""
            SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_name='debts'
            ORDER BY ordinal_position
        """))

        print("Debts table columns:")
        print("-" * 80)
        for row in result:
            print(f"{row[0]:20} {row[1]:20} {row[2] or ''}")
        print("-" * 80)


if __name__ == "__main__":
    asyncio.run(check_debts_schema())
