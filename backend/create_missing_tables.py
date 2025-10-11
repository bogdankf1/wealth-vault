"""
Script to check and create missing database tables
"""
import asyncio
from sqlalchemy import text, inspect
from app.core.database import engine, Base

# Import all models to register them with Base.metadata
from app.models.user import User
from app.models.tier import Tier, Feature, TierFeature
from app.modules.income.models import IncomeSource, IncomeTransaction
from app.modules.expenses.models import Expense
from app.modules.savings.models import SavingsAccount, BalanceHistory
from app.modules.subscriptions.models import Subscription
from app.modules.portfolio.models import PortfolioAsset
from app.modules.goals.models import Goal
from app.modules.installments.models import Installment
from app.modules.ai.models import UploadedFile, CategorizationCorrection, AIInsight


async def check_tables():
    """Check which tables exist in the database"""
    async with engine.begin() as conn:
        result = await conn.execute(text("""
            SELECT tablename
            FROM pg_tables
            WHERE schemaname = 'public'
            ORDER BY tablename
        """))
        existing_tables = [row[0] for row in result]

    print("\n=== Existing Tables ===")
    for table in existing_tables:
        print(f"  ✓ {table}")

    print("\n=== Expected Tables (from models) ===")
    expected_tables = list(Base.metadata.tables.keys())
    for table in sorted(expected_tables):
        exists = table in existing_tables
        symbol = "✓" if exists else "✗"
        print(f"  {symbol} {table}")

    missing_tables = set(expected_tables) - set(existing_tables)
    return missing_tables


async def create_missing_tables():
    """Create all missing tables"""
    print("\n=== Creating Missing Tables ===")

    async with engine.begin() as conn:
        # Create all tables defined in Base.metadata
        await conn.run_sync(Base.metadata.create_all)

    print("✓ All tables created successfully")


async def main():
    print("Checking database schema...")

    missing_tables = await check_tables()

    if missing_tables:
        print(f"\n=== Found {len(missing_tables)} missing tables ===")
        for table in sorted(missing_tables):
            print(f"  - {table}")

        print("\nCreating missing tables...")
        await create_missing_tables()

        print("\n=== Verification ===")
        await check_tables()
    else:
        print("\n✓ All tables exist!")


if __name__ == "__main__":
    asyncio.run(main())
