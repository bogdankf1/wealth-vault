"""
Add debt_tracking and tax_tracking features to existing database.
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


async def add_features():
    """Add debt_tracking and tax_tracking features."""
    async with AsyncSessionLocal() as db:
        # Check if features already exist
        result = await db.execute(
            select(Feature).where(Feature.key.in_(["debt_tracking", "tax_tracking"]))
        )
        existing = result.scalars().all()

        if len(existing) >= 2:
            print("✓ Features already exist, skipping feature creation...")
        else:
            # Add missing features
            features_to_add = []
            existing_keys = {f.key for f in existing}

            if "debt_tracking" not in existing_keys:
                features_to_add.append(Feature(
                    key="debt_tracking",
                    name="Debt Tracking",
                    description="Track and manage debts",
                    module="debts"
                ))

            if "tax_tracking" not in existing_keys:
                features_to_add.append(Feature(
                    key="tax_tracking",
                    name="Tax Tracking",
                    description="Track tax obligations and payments",
                    module="taxes"
                ))

            if features_to_add:
                db.add_all(features_to_add)
                await db.commit()
                print(f"✓ Added {len(features_to_add)} new features")

        # Get wealth tier
        result = await db.execute(select(Tier).where(Tier.name == "wealth"))
        wealth_tier = result.scalar_one_or_none()

        if not wealth_tier:
            print("❌ Wealth tier not found!")
            return

        # Get debt_tracking and tax_tracking features
        result = await db.execute(
            select(Feature).where(Feature.key.in_(["debt_tracking", "tax_tracking"]))
        )
        features = {f.key: f for f in result.scalars().all()}

        # Check if tier_features already exist
        result = await db.execute(
            select(TierFeature).where(
                TierFeature.tier_id == wealth_tier.id,
                TierFeature.feature_id.in_([features["debt_tracking"].id, features["tax_tracking"].id])
            )
        )
        existing_tf = result.scalars().all()

        if len(existing_tf) >= 2:
            print("✓ Tier-feature mappings already exist, skipping...")
            return

        # Add tier-feature mappings for wealth tier
        existing_tf_feature_ids = {tf.feature_id for tf in existing_tf}

        tier_features_to_add = []
        for feature_key in ["debt_tracking", "tax_tracking"]:
            if features[feature_key].id not in existing_tf_feature_ids:
                tier_features_to_add.append(TierFeature(
                    tier_id=wealth_tier.id,
                    feature_id=features[feature_key].id,
                    enabled=True,
                    limit_value=None
                ))

        if tier_features_to_add:
            db.add_all(tier_features_to_add)
            await db.commit()
            print(f"✓ Added {len(tier_features_to_add)} tier-feature mappings for Wealth tier")

        print("✓ Debt and Tax tracking features configured successfully!")


if __name__ == "__main__":
    asyncio.run(add_features())
