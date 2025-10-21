"""
Script to create all database tables using SQLAlchemy models.
This bypasses Alembic and directly creates tables from models.
"""
import asyncio
from app.core.database import engine, Base

# Import all models so they're registered with Base.metadata
from app.models.user import User
from app.models.tier import Tier, Feature, TierFeature
from app.modules.income.models import IncomeSource, IncomeTransaction
from app.modules.expenses.models import Expense
from app.modules.subscriptions.models import Subscription
from app.modules.installments.models import Installment
from app.modules.savings.models import SavingsAccount, BalanceHistory
from app.modules.portfolio.models import PortfolioAsset
from app.modules.goals.models import Goal
from app.modules.budgets.models import Budget
from app.modules.ai.models import AIInsight, UploadedFile, CategorizationCorrection
from app.models.user_preferences import UserPreferences
from app.modules.currency.models import Currency, ExchangeRate
from app.models.configuration import AppConfiguration, EmailTemplate
from app.models.billing import PaymentHistory, UserSubscription


async def create_all_tables():
    """Create all tables defined in models."""
    async with engine.begin() as conn:
        # Create all tables
        await conn.run_sync(Base.metadata.create_all)

    print("✅ All tables created successfully!")


if __name__ == "__main__":
    asyncio.run(create_all_tables())
