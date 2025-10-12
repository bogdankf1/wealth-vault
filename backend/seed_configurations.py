"""
Seed sample configurations for the admin panel.
"""
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.models.configuration import AppConfiguration
import uuid

async def seed_configurations():
    """Add sample configurations to the database."""
    # Create async engine
    engine = create_async_engine(str(settings.DATABASE_URL), echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    configurations = [
        {
            "key": "feature_flags",
            "value": {
                "enable_crypto_tracking": True,
                "enable_ai_insights": False,
                "enable_tax_reports": True,
                "enable_budgets": True,
                "enable_goal_tracking": True
            },
            "description": "Control which features are visible to users",
            "is_system": False
        },
        {
            "key": "notification_thresholds",
            "value": {
                "high_expense_amount": 1000,
                "budget_warning_percentage": 80,
                "budget_exceeded_percentage": 100,
                "low_balance_amount": 500,
                "large_income_amount": 5000
            },
            "description": "Trigger levels for user notifications and alerts",
            "is_system": False
        },
        {
            "key": "ui_settings",
            "value": {
                "default_currency": "USD",
                "supported_currencies": ["USD", "EUR", "GBP", "CAD", "AUD"],
                "items_per_page": 20,
                "chart_default_period": "30d",
                "date_format": "MMM dd, yyyy",
                "theme": "system"
            },
            "description": "Default UI behavior and display options",
            "is_system": False
        },
        {
            "key": "platform_status",
            "value": {
                "maintenance_mode": False,
                "maintenance_message": "We are performing scheduled maintenance. We will be back soon!",
                "read_only_mode": False,
                "new_registrations_enabled": True,
                "api_enabled": True
            },
            "description": "Platform operational status and restrictions",
            "is_system": True
        },
        {
            "key": "rate_limits",
            "value": {
                "api_requests_per_minute": 60,
                "api_requests_per_hour": 1000,
                "transactions_per_day_starter": 100,
                "transactions_per_day_growth": 1000,
                "transactions_per_day_wealth": -1,
                "login_attempts_per_hour": 5
            },
            "description": "Rate limiting configuration by tier and action type (-1 = unlimited)",
            "is_system": True
        }
    ]

    async with async_session() as session:
        for config_data in configurations:
            # Check if configuration already exists
            from sqlalchemy import select
            result = await session.execute(
                select(AppConfiguration).where(AppConfiguration.key == config_data["key"])
            )
            existing = result.scalars().first()

            if existing:
                print(f"Configuration '{config_data['key']}' already exists, skipping...")
                continue

            # Create new configuration
            config = AppConfiguration(
                id=uuid.uuid4(),
                key=config_data["key"],
                value=config_data["value"],
                description=config_data["description"],
                is_system=config_data["is_system"]
            )
            session.add(config)
            print(f"Created configuration: {config_data['key']}")

        await session.commit()
        print("\n✅ Sample configurations seeded successfully!")

if __name__ == "__main__":
    asyncio.run(seed_configurations())
