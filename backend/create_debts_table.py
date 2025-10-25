"""
Script to create the debts table with amount_paid column.
"""
import asyncio
from app.core.database import engine
from sqlalchemy import text


async def create_debts_table():
    """Create debts table with all columns including amount_paid."""
    async with engine.begin() as conn:
        # Check if table exists
        result = await conn.execute(text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'debts'
            )
        """))

        exists = result.scalar()
        if exists:
            print("✅ Debts table already exists!")
            return

        # Create the table
        await conn.execute(text("""
            CREATE TABLE debts (
                id UUID PRIMARY KEY,
                user_id UUID NOT NULL,
                debtor_name VARCHAR(100) NOT NULL,
                description TEXT,
                amount NUMERIC(12, 2) NOT NULL,
                amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
                currency VARCHAR(3) NOT NULL DEFAULT 'USD',
                is_paid BOOLEAN NOT NULL DEFAULT FALSE,
                due_date TIMESTAMP,
                paid_date TIMESTAMP,
                notes TEXT,
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL,
                deleted_at TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """))

        # Create index
        await conn.execute(text("""
            CREATE INDEX ix_debts_user_id ON debts (user_id)
        """))

        print("✅ Debts table created successfully with amount_paid column!")


if __name__ == "__main__":
    asyncio.run(create_debts_table())
