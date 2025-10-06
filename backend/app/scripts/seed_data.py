"""
Script to seed initial data (tiers, features, tier_features).
"""
import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.tier import Tier, Feature, TierFeature


async def seed_tiers():
    """Seed initial subscription tiers."""
    async with AsyncSessionLocal() as db:
        # Check if tiers already exist
        result = await db.execute(select(Tier))
        if result.scalars().first():
            print("Tiers already exist, skipping...")
            return

        # Create tiers
        starter = Tier(
            name="starter",
            display_name="Starter",
            description="Perfect for getting started with personal finance tracking",
            price_monthly=0,  # Free
            price_annual=0,
            is_active=True
        )

        growth = Tier(
            name="growth",
            display_name="Growth",
            description="Advanced features for serious finance management",
            price_monthly=1000,  # $10.00
            price_annual=10000,  # $100.00 (2 months free)
            is_active=True
        )

        wealth = Tier(
            name="wealth",
            display_name="Wealth",
            description="Premium features for comprehensive wealth management",
            price_monthly=2000,  # $20.00
            price_annual=20000,  # $200.00 (2 months free)
            is_active=True
        )

        db.add_all([starter, growth, wealth])
        await db.commit()

        print("✓ Tiers created successfully")


async def seed_features():
    """Seed initial features."""
    async with AsyncSessionLocal() as db:
        # Check if features already exist
        result = await db.execute(select(Feature))
        if result.scalars().first():
            print("Features already exist, skipping...")
            return

        # Define features
        features_data = [
            # Income module
            {
                "key": "income_tracking",
                "name": "Income Tracking",
                "description": "Track multiple income sources",
                "module": "income"
            },
            # Expenses module
            {
                "key": "expense_tracking",
                "name": "Expense Tracking",
                "description": "Track expenses and spending",
                "module": "expenses"
            },
            {
                "key": "ai_categorization",
                "name": "AI Categorization",
                "description": "AI-powered automatic expense categorization",
                "module": "expenses"
            },
            {
                "key": "bank_statement_upload",
                "name": "Bank Statement Upload",
                "description": "Upload and parse bank statements",
                "module": "expenses"
            },
            # Savings module
            {
                "key": "savings_tracking",
                "name": "Savings Tracking",
                "description": "Track savings accounts",
                "module": "savings"
            },
            {
                "key": "multi_currency",
                "name": "Multi-Currency Support",
                "description": "Track accounts in multiple currencies",
                "module": "savings"
            },
            # Portfolio module
            {
                "key": "portfolio_tracking",
                "name": "Portfolio Tracking",
                "description": "Track investment portfolios",
                "module": "portfolio"
            },
            {
                "key": "realtime_prices",
                "name": "Real-time Stock Prices",
                "description": "Real-time stock price updates",
                "module": "portfolio"
            },
            # Goals module
            {
                "key": "financial_goals",
                "name": "Financial Goals",
                "description": "Set and track financial goals",
                "module": "goals"
            },
            # Subscriptions module
            {
                "key": "subscription_tracking",
                "name": "Subscription Tracking",
                "description": "Track recurring subscriptions",
                "module": "subscriptions"
            },
            # Installments module
            {
                "key": "installment_tracking",
                "name": "Installment Tracking",
                "description": "Track loans and payment plans",
                "module": "installments"
            },
        ]

        features = [Feature(**data) for data in features_data]
        db.add_all(features)
        await db.commit()

        print("✓ Features created successfully")


async def seed_tier_features():
    """Seed tier-feature mappings."""
    async with AsyncSessionLocal() as db:
        # Check if tier_features already exist
        result = await db.execute(select(TierFeature))
        if result.scalars().first():
            print("Tier features already exist, skipping...")
            return

        # Get tiers
        tiers_result = await db.execute(select(Tier))
        tiers = {tier.name: tier for tier in tiers_result.scalars().all()}

        # Get features
        features_result = await db.execute(select(Feature))
        features = {feature.key: feature for feature in features_result.scalars().all()}

        tier_feature_mappings = []

        # STARTER TIER
        starter_features = [
            ("income_tracking", 3),  # Max 3 income sources
            ("expense_tracking", None),  # Unlimited
            ("bank_statement_upload", None),
            ("savings_tracking", 3),  # Max 3 accounts
            ("subscription_tracking", 5),  # Max 5 subscriptions
            ("installment_tracking", 2),  # Max 2 installments
        ]

        for feature_key, limit in starter_features:
            tier_feature_mappings.append(
                TierFeature(
                    tier_id=tiers["starter"].id,
                    feature_id=features[feature_key].id,
                    enabled=True,
                    limit_value=limit
                )
            )

        # GROWTH TIER
        growth_features = [
            ("income_tracking", 10),  # Max 10 income sources
            ("expense_tracking", None),  # Unlimited
            ("ai_categorization", None),  # Unlimited
            ("bank_statement_upload", None),
            ("savings_tracking", 10),  # Max 10 accounts
            ("multi_currency", None),  # Enabled
            ("portfolio_tracking", 20),  # Max 20 positions
            ("financial_goals", None),  # Unlimited
            ("subscription_tracking", 20),  # Max 20 subscriptions
            ("installment_tracking", 10),  # Max 10 installments
        ]

        for feature_key, limit in growth_features:
            tier_feature_mappings.append(
                TierFeature(
                    tier_id=tiers["growth"].id,
                    feature_id=features[feature_key].id,
                    enabled=True,
                    limit_value=limit
                )
            )

        # WEALTH TIER
        wealth_features = [
            ("income_tracking", None),  # Unlimited
            ("expense_tracking", None),  # Unlimited
            ("ai_categorization", None),  # Unlimited
            ("bank_statement_upload", None),
            ("savings_tracking", None),  # Unlimited
            ("multi_currency", None),  # Enabled
            ("portfolio_tracking", None),  # Unlimited
            ("realtime_prices", None),  # Enabled
            ("financial_goals", None),  # Unlimited
            ("subscription_tracking", None),  # Unlimited
            ("installment_tracking", None),  # Unlimited
        ]

        for feature_key, limit in wealth_features:
            tier_feature_mappings.append(
                TierFeature(
                    tier_id=tiers["wealth"].id,
                    feature_id=features[feature_key].id,
                    enabled=True,
                    limit_value=limit
                )
            )

        db.add_all(tier_feature_mappings)
        await db.commit()

        print("✓ Tier-feature mappings created successfully")


async def main():
    """Run all seed functions."""
    print("Starting database seeding...")
    print("-" * 50)

    await seed_tiers()
    await seed_features()
    await seed_tier_features()

    print("-" * 50)
    print("✓ Database seeding completed successfully!")


if __name__ == "__main__":
    asyncio.run(main())
