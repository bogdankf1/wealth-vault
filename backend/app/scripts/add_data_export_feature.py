"""
Script to add the data_export feature to the database.
"""
import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.tier import Tier, Feature, TierFeature

# Import all module models to avoid circular import issues
from app.modules.income.models import IncomeSource  # noqa
from app.modules.expenses.models import Expense  # noqa
from app.modules.subscriptions.models import Subscription  # noqa
from app.modules.installments.models import Installment  # noqa
from app.modules.savings.models import SavingsAccount  # noqa
from app.modules.portfolio.models import PortfolioAsset  # noqa
from app.modules.goals.models import Goal  # noqa
from app.modules.budgets.models import Budget  # noqa
from app.modules.debts.models import Debt  # noqa
from app.modules.taxes.models import Tax  # noqa
from app.modules.dashboard_layouts.models import DashboardLayout  # noqa


async def add_data_export_feature():
    """Add data_export feature to the database."""
    async with AsyncSessionLocal() as db:
        # Check if data_export feature already exists
        result = await db.execute(
            select(Feature).where(Feature.key == "data_export")
        )
        existing_feature = result.scalar_one_or_none()

        if existing_feature:
            print("data_export feature already exists!")
            return

        # Create the feature
        feature = Feature(
            key="data_export",
            name="Data Export",
            description="Export financial data to CSV format",
            module="exports"
        )
        db.add(feature)
        await db.flush()  # Flush to get the feature ID

        print(f"✓ Created data_export feature with ID: {feature.id}")

        # Get the Wealth tier
        wealth_result = await db.execute(
            select(Tier).where(Tier.name == "wealth")
        )
        wealth_tier = wealth_result.scalar_one()

        # Add feature to Wealth tier
        tier_feature = TierFeature(
            tier_id=wealth_tier.id,
            feature_id=feature.id,
            enabled=True,
            limit_value=None  # Unlimited
        )
        db.add(tier_feature)

        await db.commit()
        print(f"✓ Added data_export feature to Wealth tier")


async def main():
    """Run the script."""
    print("Adding data_export feature...")
    print("-" * 50)

    await add_data_export_feature()

    print("-" * 50)
    print("✓ Completed successfully!")


if __name__ == "__main__":
    asyncio.run(main())
