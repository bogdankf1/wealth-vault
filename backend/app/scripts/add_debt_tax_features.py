"""
Script to add debt_tracking and tax_tracking features to existing database.
This should be run after initial seeding to add these features.
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

async def add_debt_tax_features():
    """Add debt_tracking and tax_tracking features to the database."""
    async with AsyncSessionLocal() as db:
        # Define new features to add
        new_features_data = [
            {
                "key": "debt_tracking",
                "name": "Debt Tracking",
                "description": "Track and manage debts",
                "module": "debts"
            },
            {
                "key": "tax_tracking",
                "name": "Tax Tracking",
                "description": "Track tax obligations and payments",
                "module": "taxes"
            },
        ]

        # Define tier assignments (wealth tier only for these features)
        tier_assignments = {
            "wealth": [
                ("debt_tracking", None),  # Wealth-only feature
                ("tax_tracking", None),   # Wealth-only feature
            ]
        }

        print("Adding debt and tax tracking features to database...")
        print("-" * 50)

        # Check which features already exist
        result = await db.execute(select(Feature))
        existing_features = {f.key: f for f in result.scalars().all()}

        # Add new features
        new_features = {}
        added_count = 0
        for feature_data in new_features_data:
            if feature_data["key"] in existing_features:
                print(f"- Feature already exists: {feature_data['name']}")
                new_features[feature_data["key"]] = existing_features[feature_data["key"]]
            else:
                print(f"✓ Adding feature: {feature_data['name']}")
                feature = Feature(**feature_data)
                db.add(feature)
                new_features[feature_data["key"]] = feature
                added_count += 1

        if added_count > 0:
            await db.commit()
            print(f"\n✓ Added {added_count} new features")
        else:
            print(f"\n- No new features to add")

        # Get all tiers
        result = await db.execute(select(Tier))
        tiers = {t.name: t for t in result.scalars().all()}

        # Get all features (refresh to get IDs)
        result = await db.execute(select(Feature))
        all_features = {f.key: f for f in result.scalars().all()}

        # Get existing tier-feature mappings
        result = await db.execute(select(TierFeature))
        existing_mappings = {
            (tf.tier_id, tf.feature_id): tf
            for tf in result.scalars().all()
        }

        # Create tier-feature mappings
        mappings_added = 0
        for tier_name, features in tier_assignments.items():
            if tier_name not in tiers:
                print(f"⚠ Warning: Tier '{tier_name}' not found, skipping...")
                continue

            tier = tiers[tier_name]
            for feature_key, limit_value in features:
                if feature_key not in all_features:
                    print(f"⚠ Warning: Feature '{feature_key}' not found, skipping...")
                    continue

                feature = all_features[feature_key]
                mapping_key = (tier.id, feature.id)

                if mapping_key not in existing_mappings:
                    print(f"✓ Assigning '{feature.name}' to {tier_name} tier")
                    tier_feature = TierFeature(
                        tier_id=tier.id,
                        feature_id=feature.id,
                        enabled=True,
                        limit_value=limit_value
                    )
                    db.add(tier_feature)
                    mappings_added += 1

        if mappings_added > 0:
            await db.commit()
            print(f"\n✓ Created {mappings_added} tier-feature mappings")
        else:
            print(f"\n- No new tier-feature mappings to create")

        print("-" * 50)
        print("✓ Database update completed successfully!")


if __name__ == "__main__":
    asyncio.run(add_debt_tax_features())
