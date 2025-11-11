"""
Script to restore ADMIN role for a user
"""
import asyncio
from sqlalchemy import select, update
from app.core.database import AsyncSessionLocal
from app.models.user import User, UserRole

# Import all models for SQLAlchemy relationships
from app.modules.income.models import IncomeSource  # noqa: F401
from app.modules.expenses.models import Expense  # noqa: F401
from app.modules.subscriptions.models import Subscription  # noqa: F401
from app.modules.installments.models import Installment  # noqa: F401
from app.modules.savings.models import SavingsAccount, BalanceHistory  # noqa: F401
from app.modules.portfolio.models import PortfolioAsset  # noqa: F401
from app.modules.goals.models import Goal  # noqa: F401
from app.modules.budgets.models import Budget  # noqa: F401
from app.modules.debts.models import Debt  # noqa: F401
from app.modules.taxes.models import Tax  # noqa: F401
from app.modules.support.models import SupportTopic, SupportMessage  # noqa: F401
from app.modules.dashboard_layouts.models import DashboardLayout  # noqa: F401
from app.modules.backups.models import Backup  # noqa: F401


async def fix_admin_role():
    """Update user role to ADMIN"""
    async with AsyncSessionLocal() as db:
        # Get user by email
        result = await db.execute(
            select(User).where(User.email == "bogdankf1@gmail.com")
        )
        user = result.scalar_one_or_none()

        if not user:
            print("User not found!")
            return

        print(f"Current user role: {user.role}")

        if user.role == UserRole.ADMIN:
            print("User already has ADMIN role!")
            return

        # Update role to ADMIN
        user.role = UserRole.ADMIN
        await db.commit()
        await db.refresh(user)

        print(f"✅ User role updated to: {user.role}")


if __name__ == "__main__":
    asyncio.run(fix_admin_role())
