"""
Database models package.

IMPORTANT: Import order matters for SQLAlchemy relationships.
Models referenced in relationships must be imported before the model that references them.
"""
# Import models that are referenced by User relationships FIRST
from app.modules.income.models import IncomeSource
from app.modules.expenses.models import Expense
from app.modules.savings.models import SavingsAccount
from app.modules.subscriptions.models import Subscription
from app.modules.installments.models import Installment
from app.modules.goals.models import Goal
from app.modules.portfolio.models import PortfolioAsset
from app.modules.debts.models import Debt
from app.modules.taxes.models import Tax
from app.modules.dashboard_layouts.models import DashboardLayout
from app.modules.backups.models import Backup
from app.modules.support.models import SupportTopic, SupportMessage
from app.modules.dashboard.models import NetWorthSnapshot, CashFlowSnapshot
from app.modules.agent.models import AgentActionLog

# Now import User (which has relationships to the above models)
from app.models.user import User
from app.models.tier import Tier, Feature, TierFeature
from app.models.billing import UserSubscription, PaymentHistory
from app.models.configuration import AppConfiguration, EmailTemplate

__all__ = [
    "User",
    "Tier",
    "Feature",
    "TierFeature",
    "UserSubscription",
    "PaymentHistory",
    "AppConfiguration",
    "EmailTemplate",
    "IncomeSource",
    "Expense",
    "SavingsAccount",
    "Subscription",
    "Installment",
    "Goal",
    "PortfolioAsset",
    "Debt",
    "Tax",
    "DashboardLayout",
    "Backup",
    "SupportTopic",
    "SupportMessage",
    "NetWorthSnapshot",
    "CashFlowSnapshot",
    "AgentActionLog",
]
