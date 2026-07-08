"""
Dashboard module for aggregating financial data across all modules.
"""
from app.modules.dashboard.service.common import get_user_display_currency
from app.modules.dashboard.service.summary import (
    get_net_worth,
    get_cash_flow,
    get_financial_health_score,
)
from app.modules.dashboard.service.activity import (
    get_recent_activity,
    get_upcoming_payments,
    get_financial_alerts,
    get_failed_payments,
)
from app.modules.dashboard.service.charts import (
    get_income_vs_expenses_chart,
    get_subscriptions_by_category_chart,
    get_installments_by_category_chart,
    get_expenses_by_category_chart,
    get_budgets_by_category_chart,
    get_monthly_spending_chart,
    get_net_worth_trend_chart,
    get_income_breakdown_chart,
    get_net_worth_trend_from_snapshots,
)
from app.modules.dashboard.service.projections import (
    get_financial_projections,
    get_goal_projections,
)

__all__ = [
    "get_user_display_currency",
    "get_net_worth",
    "get_cash_flow",
    "get_financial_health_score",
    "get_recent_activity",
    "get_upcoming_payments",
    "get_financial_alerts",
    "get_failed_payments",
    "get_income_vs_expenses_chart",
    "get_subscriptions_by_category_chart",
    "get_installments_by_category_chart",
    "get_expenses_by_category_chart",
    "get_budgets_by_category_chart",
    "get_monthly_spending_chart",
    "get_net_worth_trend_chart",
    "get_income_breakdown_chart",
    "get_net_worth_trend_from_snapshots",
    "get_financial_projections",
    "get_goal_projections",
]
