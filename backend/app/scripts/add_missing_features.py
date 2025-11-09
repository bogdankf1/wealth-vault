"""
Script to add missing features to an existing database.
This should be run after initial seeding to add newly implemented features.
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


async def add_missing_features():
    """Add any missing features to the database."""
    async with AsyncSessionLocal() as db:
        # Define new features to add
        new_features_data = [
            # Budgets module
            {
                "key": "budget_tracking",
                "name": "Budget Tracking",
                "description": "Create and monitor budgets by category",
                "module": "budgets"
            },
            # Dashboard customization
            {
                "key": "custom_layouts",
                "name": "Custom Dashboard Layouts",
                "description": "Create and customize dashboard layouts",
                "module": "dashboard"
            },
        ]

        # Get existing features
        existing_result = await db.execute(select(Feature))
        existing_features = {f.key: f for f in existing_result.scalars().all()}

        # Add only new features that don't exist
        features_added = []
        for feature_data in new_features_data:
            if feature_data["key"] not in existing_features:
                feature = Feature(**feature_data)
                db.add(feature)
                features_added.append(feature_data["key"])
                print(f"✓ Adding feature: {feature_data['name']}")
            else:
                print(f"- Feature already exists: {feature_data['name']}")

        if features_added:
            await db.commit()
            print(f"\n✓ Added {len(features_added)} new features")
        else:
            print("\n- No new features to add")

        return features_added


async def assign_features_to_tiers():
    """Assign the new features to appropriate tiers."""
    async with AsyncSessionLocal() as db:
        # Get tiers
        tiers_result = await db.execute(select(Tier))
        tiers = {tier.name: tier for tier in tiers_result.scalars().all()}

        # Get features
        features_result = await db.execute(select(Feature))
        features = {feature.key: feature for feature in features_result.scalars().all()}

        # Get existing tier features
        existing_tf_result = await db.execute(select(TierFeature))
        existing_tier_features = existing_tf_result.scalars().all()
        existing_mappings = {
            (tf.tier_id, tf.feature_id) for tf in existing_tier_features
        }

        tier_feature_mappings = []

        # Budget tracking - available for all tiers
        if "budget_tracking" in features:
            for tier_name in ["starter", "growth", "wealth"]:
                if tier_name in tiers:
                    tier_id = tiers[tier_name].id
                    feature_id = features["budget_tracking"].id

                    if (tier_id, feature_id) not in existing_mappings:
                        tier_feature_mappings.append(
                            TierFeature(
                                tier_id=tier_id,
                                feature_id=feature_id,
                                enabled=True,
                                limit_value=None  # Unlimited for all tiers
                            )
                        )
                        print(f"✓ Assigning 'Budget Tracking' to {tier_name} tier")

        # Custom layouts - Wealth tier only
        if "custom_layouts" in features and "wealth" in tiers:
            tier_id = tiers["wealth"].id
            feature_id = features["custom_layouts"].id

            if (tier_id, feature_id) not in existing_mappings:
                tier_feature_mappings.append(
                    TierFeature(
                        tier_id=tier_id,
                        feature_id=feature_id,
                        enabled=True,
                        limit_value=None
                    )
                )
                print(f"✓ Assigning 'Custom Dashboard Layouts' to wealth tier")

        if tier_feature_mappings:
            db.add_all(tier_feature_mappings)
            await db.commit()
            print(f"\n✓ Created {len(tier_feature_mappings)} tier-feature mappings")
        else:
            print("\n- No new tier-feature mappings to create")


async def main():
    """Run all update functions."""
    print("Adding missing features to database...")
    print("-" * 50)

    await add_missing_features()
    print()
    await assign_features_to_tiers()

    print("-" * 50)
    print("✓ Database update completed successfully!")


if __name__ == "__main__":
    asyncio.run(main())
